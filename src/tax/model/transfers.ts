import transferDataJson from '../data/transfers_2025.json';
import { childCreditPopulationSummary } from './childCredits';
import { calculateHousehold } from './household';
import type {
  ReformSettings,
  ResourceScenario,
  TransferAnalysisResult,
  TransferHouseholdInput,
  TransferPreset,
  TransferProgramDefinition,
  TransferProgramId,
  TransferProgramResult,
  TransferReplacementSettings,
} from './types';

interface TransferData {
  schemaVersion: number;
  baselineLabel: string;
  geography: string;
  povertyGuidelines: {
    year: number;
    contiguous: number[];
    additionalPerson: number;
    sourceUrl: string;
    note: string;
  };
  snapRules: {
    period: string;
    grossMonthlyIncomeLimits: number[];
    netMonthlyIncomeLimits: number[];
    grossAdditionalPerson: number;
    netAdditionalPerson: number;
    maximumMonthlyAllotments: number[];
    allotmentAdditionalPerson: number;
    standardDeductions: number[];
    earnedIncomeDeductionRate: number;
    maximumShelterDeduction: number;
    minimumAllotmentOneOrTwoPeople: number;
    sourceUrl: string;
    limitations: string;
  };
  schoolMealRules: {
    period: string;
    schoolDays: number;
    freeIncomeFplShare: number;
    reducedIncomeFplShare: number;
    freeLunchRate: number;
    freeBreakfastRate: number;
    reducedLunchRate: number;
    reducedBreakfastRate: number;
    sourceUrl: string;
    limitations: string;
  };
  summerEbtRules: {
    period: string;
    annualBenefitPerChild: number;
    incomeFplShare: number;
    sourceUrl: string;
    limitations: string;
  };
  programs: TransferProgramDefinition[];
}

export const transferData = transferDataJson as TransferData;
export const transferPrograms = transferData.programs;
export const transferProgramIds = transferPrograms.map((program) => program.id);

function allProgramFlags(value: boolean): Record<TransferProgramId, boolean> {
  return Object.fromEntries(transferProgramIds.map((id) => [id, value])) as Record<TransferProgramId, boolean>;
}

export const defaultTransferReplacementSettings: TransferReplacementSettings = {
  replacedPrograms: allProgramFlags(false),
};

export function povertyGuideline(householdSize: number): number {
  const size = Math.max(1, Math.trunc(householdSize));
  const table = transferData.povertyGuidelines.contiguous;
  return size <= table.length
    ? table[size - 1]!
    : table[table.length - 1]! + (size - table.length) * transferData.povertyGuidelines.additionalPerson;
}

function tableValue(table: number[], householdSize: number, additional: number): number {
  const size = Math.max(1, Math.trunc(householdSize));
  return size <= table.length ? table[size - 1]! : table[table.length - 1]! + (size - table.length) * additional;
}

export interface SnapCalculation {
  eligible: boolean;
  grossMonthlyIncome: number;
  grossIncomeLimit: number;
  adjustedMonthlyIncome: number;
  excessShelterDeduction: number;
  netMonthlyIncome: number;
  netIncomeLimit: number;
  monthlyBenefit: number;
  annualBenefit: number;
}

export function calculateSnap(input: TransferHouseholdInput): SnapCalculation {
  const rules = transferData.snapRules;
  const adults = input.household.filingStatus === 'married' ? 2 : 1;
  const size = adults + Math.max(0, Math.trunc(input.household.children));
  const grossMonthlyIncome = (Math.max(0, input.household.cashWage) + Math.max(0, input.household.secondaryCashWage ?? 0)) / 12;
  const grossIncomeLimit = tableValue(rules.grossMonthlyIncomeLimits, size, rules.grossAdditionalPerson);
  const netIncomeLimit = tableValue(rules.netMonthlyIncomeLimits, size, rules.netAdditionalPerson);
  const standardDeduction = tableValue(rules.standardDeductions, size, 0);
  const earnedIncomeDeduction = grossMonthlyIncome * rules.earnedIncomeDeductionRate;
  const adjustedMonthlyIncome = Math.max(
    0,
    grossMonthlyIncome - earnedIncomeDeduction - standardDeduction - Math.max(0, input.monthlyDependentCareExpense),
  );
  const excessShelterCost = Math.max(0, Math.max(0, input.monthlyShelterCost) - adjustedMonthlyIncome * 0.5);
  const excessShelterDeduction = Math.min(rules.maximumShelterDeduction, excessShelterCost);
  const netMonthlyIncome = Math.max(0, adjustedMonthlyIncome - excessShelterDeduction);
  const eligible = grossMonthlyIncome <= grossIncomeLimit && netMonthlyIncome <= netIncomeLimit;
  const maximumAllotment = tableValue(rules.maximumMonthlyAllotments, size, rules.allotmentAdditionalPerson);
  const computedBenefit = Math.max(0, maximumAllotment - Math.ceil(netMonthlyIncome * 0.30));
  const minimum = size <= 2 ? rules.minimumAllotmentOneOrTwoPeople : 0;
  const monthlyBenefit = eligible && computedBenefit > 0 ? Math.max(minimum, computedBenefit) : 0;
  return {
    eligible,
    grossMonthlyIncome,
    grossIncomeLimit,
    adjustedMonthlyIncome,
    excessShelterDeduction,
    netMonthlyIncome,
    netIncomeLimit,
    monthlyBenefit,
    annualBenefit: monthlyBenefit * 12,
  };
}

function manualBenefit(input: TransferHouseholdInput, id: TransferProgramId): number {
  return Math.max(0, input.manualAnnualBenefits[id] ?? 0);
}

export function calculateTransferPrograms(input: TransferHouseholdInput): TransferProgramResult[] {
  const adults = input.household.filingStatus === 'married' ? 2 : 1;
  const householdSize = adults + Math.max(0, Math.trunc(input.household.children));
  const annualWages = Math.max(0, input.household.cashWage) + Math.max(0, input.household.secondaryCashWage ?? 0);
  const fpl = povertyGuideline(householdSize);
  const snap = calculateSnap(input);
  const valuation = Math.max(0, Math.min(1, input.inKindValuationFactor));

  return transferPrograms.map((program): TransferProgramResult => {
    const receives = Boolean(input.receives[program.id]);
    let eligible: boolean | null = null;
    let potentialAnnualBenefit = manualBenefit(input, program.id);
    let calculationStatus: TransferProgramResult['calculationStatus'] = 'user_entered';
    let calculationNote = 'Annual household amount is user-entered; no eligibility is inferred.';

    if (program.id === 'snap') {
      eligible = snap.eligible;
      potentialAnnualBenefit = snap.annualBenefit;
      calculationStatus = 'approximate_rule';
      calculationNote = `FY2025 simplified SNAP rule: $${snap.grossMonthlyIncome.toFixed(0)} gross and $${snap.netMonthlyIncome.toFixed(0)} net monthly income; limits $${snap.grossIncomeLimit} / $${snap.netIncomeLimit}.`;
    } else if (program.id === 'schoolMeals') {
      const rules = transferData.schoolMealRules;
      const fplShare = fpl > 0 ? annualWages / fpl : Number.POSITIVE_INFINITY;
      const schoolChildren = Math.max(0, Math.min(input.schoolAgeChildren, input.household.children));
      eligible = schoolChildren > 0 && fplShare <= rules.reducedIncomeFplShare;
      const isFree = fplShare <= rules.freeIncomeFplShare;
      const dailyRate = isFree
        ? rules.freeLunchRate + rules.freeBreakfastRate
        : rules.reducedLunchRate + rules.reducedBreakfastRate;
      potentialAnnualBenefit = eligible ? schoolChildren * rules.schoolDays * dailyRate : 0;
      calculationStatus = 'illustrative';
      calculationNote = `${schoolChildren} school-age child(ren) × ${rules.schoolDays} days × $${dailyRate.toFixed(2)} federal breakfast/lunch reimbursement.`;
    } else if (program.id === 'summerEbt') {
      const rules = transferData.summerEbtRules;
      const schoolChildren = Math.max(0, Math.min(input.schoolAgeChildren, input.household.children));
      eligible = schoolChildren > 0 && annualWages <= fpl * rules.incomeFplShare;
      potentialAnnualBenefit = eligible ? schoolChildren * rules.annualBenefitPerChild : 0;
      calculationStatus = 'exact_rule';
      calculationNote = `${schoolChildren} school-age child(ren) × $${rules.annualBenefitPerChild}; receipt still requires a participating jurisdiction or qualifying program pathway.`;
    }

    const annualGovernmentBenefit = receives ? potentialAnnualBenefit : 0;
    const valuationFactor = program.kind === 'in_kind' ? valuation : 1;
    return {
      program,
      eligible,
      receives,
      potentialAnnualBenefit,
      annualGovernmentBenefit,
      resourceEquivalentValue: annualGovernmentBenefit * valuationFactor,
      valuationFactor,
      calculationStatus,
      calculationNote,
    };
  });
}

export function calculateFederalProgramSavings(settings: TransferReplacementSettings): number {
  return transferPrograms.reduce(
    (sum, program) => sum + (settings.replacedPrograms[program.id] ? program.federalFiscalAmountBillions : 0),
    0,
  );
}

/** Federal outlays spread over every child, with no income or program-receipt test. */
export function universalChildCreditSwap(baseChildCredit = 7200): {
  replacements: TransferReplacementSettings;
  federalSavingsBillions: number;
  supplementPerChild: number;
  totalChildCredit: number;
} {
  const replacements = { replacedPrograms: allProgramFlags(true) };
  const federalSavingsBillions = calculateFederalProgramSavings(replacements);
  const childrenMillions = childCreditPopulationSummary().childrenMillions;
  const supplementPerChild = childrenMillions > 0 ? federalSavingsBillions * 1000 / childrenMillions : 0;
  return { replacements, federalSavingsBillions, supplementPerChild,
    totalChildCredit: baseChildCredit + supplementPerChild };
}

function resourceScenario(annual: number, fpl: number, currentAnnual: number): ResourceScenario {
  const changeFromCurrent = annual - currentAnnual;
  return {
    annual,
    monthly: annual / 12,
    fplShare: fpl > 0 ? annual / fpl : 0,
    changeFromCurrent,
    percentChangeFromCurrent: currentAnnual !== 0 ? changeFromCurrent / currentAnnual : null,
  };
}

export function calculateTransferAnalysis(
  input: TransferHouseholdInput,
  reform: ReformSettings,
  replacements: TransferReplacementSettings = defaultTransferReplacementSettings,
): TransferAnalysisResult {
  const tax = calculateHousehold(input.household, reform, input.employerFicaPassThroughRate);
  const programs = calculateTransferPrograms(input);
  const adults = tax.input.filingStatus === 'married' ? 2 : 1;
  const fpl = povertyGuideline(adults + tax.input.children);
  const totalCurrentExternalTransfers = programs.reduce((sum, row) => sum + row.resourceEquivalentValue, 0);
  const eliminatedHouseholdBenefits = programs.reduce(
    (sum, row) => sum + (replacements.replacedPrograms[row.program.id] ? row.resourceEquivalentValue : 0),
    0,
  );
  // The transfer view uses cash household resources. Employer FICA is neither
  // added nor subtracted under current law; only the selected reform pass-through
  // converts repealed employer contributions into household cash resources.
  const currentGrossResources = tax.totalCashWage;
  const currentPreCreditTaxLiability = tax.currentPreCreditTaxLiability - tax.current.employerPayrollTax;
  const currentTaxCredits = tax.currentTaxCredits;
  const reformGrossResources = tax.reformGrossResources;
  const retainedEmployerPayrollTax = reform.replacedTaxes.payroll ? 0 : tax.current.employerPayrollTax;
  const reformPreCreditTaxLiability = tax.reformPreCreditTaxLiability - retainedEmployerPayrollTax;
  const reformTaxCredits = tax.reformTotalCredits;
  const currentAfterTaxResources = currentGrossResources
    - currentPreCreditTaxLiability
    + currentTaxCredits;
  const reformAfterTaxResources = reformGrossResources
    - reformPreCreditTaxLiability
    + reformTaxCredits;
  const currentAnnual = currentAfterTaxResources + totalCurrentExternalTransfers;
  const reformRetainedAnnual = reformAfterTaxResources + totalCurrentExternalTransfers;
  const reformAfterAnnual = reformAfterTaxResources
    + totalCurrentExternalTransfers
    - eliminatedHouseholdBenefits;
  const taxReformResourceGain = reformAfterTaxResources - currentAfterTaxResources;

  return {
    tax,
    programs,
    povertyGuideline: fpl,
    currentGrossResources,
    currentPreCreditTaxLiability,
    currentTaxCredits,
    reformGrossResources,
    reformPreCreditTaxLiability,
    reformTaxCredits,
    totalCurrentExternalTransfers,
    eliminatedHouseholdBenefits,
    federalProgramSavingsBillions: calculateFederalProgramSavings(replacements),
    currentLaw: resourceScenario(currentAnnual, fpl, currentAnnual),
    reformRetained: resourceScenario(reformRetainedAnnual, fpl, currentAnnual),
    reformAfterReplacement: resourceScenario(reformAfterAnnual, fpl, currentAnnual),
    householdReplacementRatio: eliminatedHouseholdBenefits > 0 ? taxReformResourceGain / eliminatedHouseholdBenefits : null,
    heldHarmless: reformAfterAnnual >= currentAnnual,
  };
}

export type ResourceScenarioId = 'current' | 'retained' | 'replaced';

export function calculateMarginalResourceWithdrawalRate(
  input: TransferHouseholdInput,
  reform: ReformSettings,
  replacements: TransferReplacementSettings,
  scenario: ResourceScenarioId,
  window = 1000,
): number {
  const half = window / 2;
  const down = calculateTransferAnalysis({
    ...input,
    household: { ...input.household, cashWage: Math.max(0, input.household.cashWage - half) },
  }, reform, replacements);
  const up = calculateTransferAnalysis({
    ...input,
    household: { ...input.household, cashWage: input.household.cashWage + half },
  }, reform, replacements);
  const downResources = scenario === 'current' ? down.currentLaw.annual : scenario === 'retained' ? down.reformRetained.annual : down.reformAfterReplacement.annual;
  const upResources = scenario === 'current' ? up.currentLaw.annual : scenario === 'retained' ? up.reformRetained.annual : up.reformAfterReplacement.annual;
  const deltaCompensation = up.tax.employerCompensation - down.tax.employerCompensation;
  return deltaCompensation > 0 ? 1 - (upResources - downResources) / deltaCompensation : 0;
}

const baseReceives = (): Record<TransferProgramId, boolean> => allProgramFlags(false);
const preset = (
  id: string,
  label: string,
  household: TransferHouseholdInput['household'],
  extras: Partial<Omit<TransferHouseholdInput, 'household'>> = {},
): TransferPreset => ({
  id,
  label,
  input: {
    household,
    employerFicaPassThroughRate: 1,
    preschoolChildren: 0,
    schoolAgeChildren: 0,
    monthlyShelterCost: 900,
    monthlyDependentCareExpense: 0,
    inKindValuationFactor: 0.75,
    receives: baseReceives(),
    manualAnnualBenefits: {},
    ...extras,
  },
});

export const transferPresets: TransferPreset[] = [
  preset('single-zero', 'Single adult, no earnings', { filingStatus: 'single', children: 0, cashWage: 0 }, {
    receives: { ...baseReceives(), snap: true, liheap: true },
    manualAnnualBenefits: { liheap: 600 },
  }),
  preset('single-20', 'Single adult, $20,000 earnings', { filingStatus: 'single', children: 0, cashWage: 20000 }, {
    receives: { ...baseReceives(), liheap: true },
    manualAnnualBenefits: { liheap: 600 },
  }),
  preset('single-40', 'Single adult, $40,000 earnings', { filingStatus: 'single', children: 0, cashWage: 40000 }),
  preset('parent-one', 'Single parent + one preschool child', { filingStatus: 'single', children: 1, cashWage: 20000 }, {
    preschoolChildren: 1,
    monthlyShelterCost: 1100,
    monthlyDependentCareExpense: 300,
    receives: { ...baseReceives(), snap: true, wic: true, tanf: true, liheap: true },
    manualAnnualBenefits: { wic: 900, tanf: 2400, liheap: 600 },
  }),
  preset('parent-two', 'Single parent + two children', { filingStatus: 'single', children: 2, cashWage: 25000 }, {
    preschoolChildren: 1,
    schoolAgeChildren: 1,
    monthlyShelterCost: 1250,
    monthlyDependentCareExpense: 350,
    receives: { ...baseReceives(), snap: true, wic: true, schoolMeals: true, summerEbt: true, tanf: true, liheap: true },
    manualAnnualBenefits: { wic: 900, tanf: 2400, liheap: 600 },
  }),
  preset('parent-housing', 'Single parent + two children, $12k housing aid', { filingStatus: 'single', children: 2, cashWage: 25000 }, {
    preschoolChildren: 1,
    schoolAgeChildren: 1,
    monthlyShelterCost: 1250,
    monthlyDependentCareExpense: 350,
    receives: { ...baseReceives(), snap: true, wic: true, schoolMeals: true,
      summerEbt: true, tanf: true, liheap: true, housing: true },
    manualAnnualBenefits: { wic: 900, tanf: 2400, liheap: 600, housing: 12000 },
  }),
  preset('married-one', 'Married + two children, one earner', { filingStatus: 'married', children: 2, cashWage: 35000, secondaryCashWage: 0 }, {
    preschoolChildren: 1,
    schoolAgeChildren: 1,
    monthlyShelterCost: 1400,
    monthlyDependentCareExpense: 200,
    receives: { ...baseReceives(), snap: true, wic: true, schoolMeals: true, summerEbt: true, liheap: true },
    manualAnnualBenefits: { wic: 900, liheap: 600 },
  }),
  preset('married-two', 'Married + two children, two earners', { filingStatus: 'married', children: 2, cashWage: 30000, secondaryCashWage: 25000 }, {
    preschoolChildren: 1,
    schoolAgeChildren: 1,
    monthlyShelterCost: 1600,
    monthlyDependentCareExpense: 600,
    receives: { ...baseReceives(), schoolMeals: true, summerEbt: true },
  }),
];

export function cloneTransferPreset(presetValue: TransferPreset): TransferHouseholdInput {
  return {
    ...presetValue.input,
    household: { ...presetValue.input.household },
    receives: { ...presetValue.input.receives },
    manualAnnualBenefits: { ...presetValue.input.manualAnnualBenefits },
  };
}

export const illustrativeCoreReplacement: TransferReplacementSettings = {
  replacedPrograms: {
    snap: true,
    wic: true,
    schoolMeals: true,
    summerEbt: true,
    tanf: true,
    liheap: true,
    housing: false,
  },
};
