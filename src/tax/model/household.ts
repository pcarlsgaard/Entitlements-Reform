import parameters from '../data/current_law_2025.json';
import { calculateChildCredit } from './childCredits';
import type {
  FilingStatus,
  HouseholdInput,
  HouseholdResult,
  ReformSettings,
  TaxBreakdown,
  TaxWedgeRow,
  TaxWedgeScenario,
} from './types';

type Bracket = [number | null, number];

function bracketTax(taxableIncome: number, status: FilingStatus): number {
  const brackets = parameters.brackets[status] as Bracket[];
  let tax = 0;
  let lower = 0;
  for (const [upperRaw, rate] of brackets) {
    const upper = upperRaw ?? Number.POSITIVE_INFINITY;
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

function earnedIncomeCredit(wage: number, status: FilingStatus, children: number): number {
  const key = String(Math.min(children, 3)) as '0' | '1' | '2' | '3';
  const rule = parameters.eitc[key];
  const phaseIn = Math.min(rule.maximum, wage * rule.phaseInRate);
  const phaseOut = Math.max(0, wage - rule.phaseOutStart[status]) * rule.phaseOutRate;
  return Math.max(0, phaseIn - phaseOut);
}

function normalizedWages(input: HouseholdInput): [number, number] {
  const primary = Math.max(0, input.cashWage);
  const secondary = input.filingStatus === 'married' ? Math.max(0, input.secondaryCashWage ?? 0) : 0;
  return [primary, secondary];
}

export function calculateCurrentLaw(input: HouseholdInput): TaxBreakdown {
  const [primaryWage, secondaryWage] = normalizedWages(input);
  const wage = primaryWage + secondaryWage;
  const children = Math.max(0, Math.min(4, Math.trunc(input.children)));
  const status = input.filingStatus;
  const payroll = parameters.payroll;

  const taxableIncome = Math.max(0, wage - parameters.standardDeduction[status]);
  const incomeTaxBeforeCredits = bracketTax(taxableIncome, status);

  const ctc = parameters.childTaxCredit;
  const phaseoutExcess = Math.max(0, wage - ctc.phaseoutThreshold[status]);
  const phaseout = phaseoutExcess > 0
    ? Math.ceil(phaseoutExcess / 1000) * ctc.phaseoutPerThousand
    : 0;
  const availableCtc = Math.max(0, children * ctc.perChild - phaseout);
  const nonrefundableCtc = Math.min(incomeTaxBeforeCredits, availableCtc);
  const unusedCtc = availableCtc - nonrefundableCtc;
  const earnedIncomeRefundLimit = Math.max(0, wage - ctc.refundEarnedIncomeFloor) * ctc.refundRate;
  const refundableCtc = Math.min(unusedCtc, children * ctc.refundablePerChild, earnedIncomeRefundLimit);
  const eitc = earnedIncomeCredit(wage, status, children);
  const individualIncomeTax = incomeTaxBeforeCredits - nonrefundableCtc - refundableCtc - eitc;

  const socialSecurityBase = (earnerWage: number) => Math.min(earnerWage, payroll.socialSecurityWageCap);
  const employeeSocialSecurity = (socialSecurityBase(primaryWage) + socialSecurityBase(secondaryWage))
    * payroll.socialSecurityRateEach;
  const employerSocialSecurity = employeeSocialSecurity;
  const employeeMedicare = wage * payroll.medicareRateEach;
  const employerMedicare = employeeMedicare;
  const additionalMedicare = Math.max(0, wage - payroll.additionalMedicareThreshold[status])
    * payroll.additionalMedicareRate;
  const employeePayrollTax = employeeSocialSecurity + employeeMedicare + additionalMedicare;
  const employerPayrollTax = employerSocialSecurity + employerMedicare;

  return {
    incomeTaxBeforeCredits,
    nonrefundableCtc,
    refundableCtc,
    eitc,
    individualIncomeTax,
    employeeSocialSecurity,
    employerSocialSecurity,
    employeeMedicare,
    employerMedicare,
    additionalMedicare,
    employeePayrollTax,
    employerPayrollTax,
    totalFederalTax: individualIncomeTax + employeePayrollTax + employerPayrollTax,
  };
}

export function calculateAdultCredit(wageBase: number, adults: number, settings: ReformSettings): number {
  const maximum = adults * settings.adultCredit;
  if (settings.adultCreditMode === 'universal') return maximum;
  const phaseIn = Math.min(maximum, wageBase * settings.adultCreditPhaseInRate);
  const phaseOutStart = adults * settings.adultCreditPhaseOutStartPerAdult;
  const phaseOut = Math.max(0, wageBase - phaseOutStart) * settings.adultCreditPhaseOutRate;
  return Math.max(0, phaseIn - phaseOut);
}

export function calculateReformWageTax(wageBase: number, filingStatus: FilingStatus, settings: ReformSettings): number {
  if (settings.wageTaxMode === 'flat') return wageBase * settings.rate;
  const adults = filingStatus === 'married' ? 2 : 1;
  const zeroCeiling = adults * settings.progressiveZeroBracketPerAdult;
  const topThreshold = Math.max(zeroCeiling, adults * settings.progressiveTopBracketPerAdult);
  const intermediateStart = settings.progressiveIntermediateStartPerAdult === null
    ? topThreshold
    : Math.max(zeroCeiling, Math.min(topThreshold,
      adults * settings.progressiveIntermediateStartPerAdult));
  const middleBase = Math.max(0, Math.min(wageBase, intermediateStart) - zeroCeiling);
  const intermediateBase = Math.max(0, Math.min(wageBase, topThreshold) - intermediateStart);
  const topBase = Math.max(0, wageBase - topThreshold);
  const middleRate = Math.min(settings.rate, Math.max(0, settings.progressiveMiddleRate));
  const intermediateRate = Math.min(settings.rate,
    Math.max(middleRate, settings.progressiveIntermediateRate));
  return middleBase * middleRate + intermediateBase * intermediateRate + topBase * settings.rate;
}

function normalizedPassThroughRate(rate: number): number {
  return Math.max(0, Math.min(1, rate));
}

function taxableReformWageBase(cashWage: number, employerFicaPassThrough: number, settings: ReformSettings): number {
  return cashWage * (1 - normalizedPassThroughRate(settings.cashWageExemptionShare))
    + employerFicaPassThrough * (1 - normalizedPassThroughRate(settings.employerSocialInsuranceExemptionShare));
}

function taxCredits(current: TaxBreakdown): number {
  return current.nonrefundableCtc + current.refundableCtc + current.eitc;
}

function preCreditTaxLiability(current: TaxBreakdown): number {
  return current.incomeTaxBeforeCredits + current.employeePayrollTax + current.employerPayrollTax;
}

function totalTaxAtWage(input: HouseholdInput, settings: ReformSettings, passThroughRate: number): { current: number; reform: number; employerComp: number } {
  const current = calculateCurrentLaw(input);
  const [primaryWage, secondaryWage] = normalizedWages(input);
  const totalCashWage = primaryWage + secondaryWage;
  const employerComp = totalCashWage + current.employerPayrollTax;
  const payrollIsReplaced = settings.replacedTaxes.payroll;
  const employerFicaPassThrough = payrollIsReplaced
    ? current.employerPayrollTax * normalizedPassThroughRate(passThroughRate)
    : 0;
  const reformWageBase = totalCashWage + employerFicaPassThrough;
  const taxableWageBase = taxableReformWageBase(totalCashWage, employerFicaPassThrough, settings);
  const adults = input.filingStatus === 'married' ? 2 : 1;
  // Repealed employer FICA is actual cash pay when passed through.
  const earnedCreditBase = reformWageBase;
  const reformCredits = calculateAdultCredit(earnedCreditBase, adults, settings)
    + calculateChildCredit(reformWageBase, input.children, input.childrenUnder6 ?? 0, settings);
  const retainedTaxBeforeCredits = (settings.replacedTaxes.individualIncome ? 0 : current.incomeTaxBeforeCredits)
    + (payrollIsReplaced ? 0 : current.employeePayrollTax + current.employerPayrollTax);
  const retainedTaxCredits = settings.replacedTaxes.individualIncome ? 0 : taxCredits(current);
  const reform = calculateReformWageTax(taxableWageBase, input.filingStatus, settings)
    + retainedTaxBeforeCredits - reformCredits - retainedTaxCredits;
  return { current: current.totalFederalTax, reform, employerComp };
}

export function calculateHousehold(input: HouseholdInput, settings: ReformSettings, employerFicaPassThroughRate = 1): HouseholdResult {
  const children = Math.max(0, Math.min(4, Math.trunc(input.children)));
  const normalized: HouseholdInput = {
    filingStatus: input.filingStatus,
    children,
    childrenUnder6: Math.max(0, Math.min(children, Math.trunc(input.childrenUnder6 ?? 0))),
    cashWage: Math.max(0, input.cashWage),
    secondaryCashWage: input.filingStatus === 'married' ? Math.max(0, input.secondaryCashWage ?? 0) : 0,
  };
  const [primaryWage, secondaryWage] = normalizedWages(normalized);
  const totalCashWage = primaryWage + secondaryWage;
  const current = calculateCurrentLaw(normalized);
  const employerCompensation = totalCashWage + current.employerPayrollTax;
  const payrollIsReplaced = settings.replacedTaxes.payroll;
  const normalizedEmployerFicaPassThroughRate = normalizedPassThroughRate(employerFicaPassThroughRate);
  const employerFicaPassThrough = payrollIsReplaced
    ? current.employerPayrollTax * normalizedEmployerFicaPassThroughRate
    : 0;
  const reformGrossResources = payrollIsReplaced
    ? totalCashWage + employerFicaPassThrough
    : employerCompensation;
  const reformWageBase = totalCashWage + employerFicaPassThrough;
  const taxableWageBase = taxableReformWageBase(totalCashWage, employerFicaPassThrough, settings);
  const adults = normalized.filingStatus === 'married' ? 2 : 1;
  const adultCreditMaximum = adults * settings.adultCredit;
  const adultCredit = calculateAdultCredit(reformWageBase, adults, settings);
  const childCredit = calculateChildCredit(
    reformWageBase,
    normalized.children,
    normalized.childrenUnder6 ?? 0,
    settings,
  );
  const totalReformCredit = adultCredit + childCredit;
  const currentPreCreditTaxLiability = preCreditTaxLiability(current);
  const currentTaxCredits = taxCredits(current);
  const reformTaxBeforeCredits = calculateReformWageTax(taxableWageBase, normalized.filingStatus, settings);
  const retainedCurrentTaxBeforeCredits = (settings.replacedTaxes.individualIncome ? 0 : current.incomeTaxBeforeCredits)
    + (payrollIsReplaced ? 0 : current.employeePayrollTax + current.employerPayrollTax);
  const retainedCurrentTaxCredits = settings.replacedTaxes.individualIncome ? 0 : currentTaxCredits;
  const retainedCurrentTaxes = retainedCurrentTaxBeforeCredits - retainedCurrentTaxCredits;
  const reformPreCreditTaxLiability = reformTaxBeforeCredits + retainedCurrentTaxBeforeCredits;
  const reformTotalCredits = totalReformCredit + retainedCurrentTaxCredits;
  const reformTaxAfterCredits = reformPreCreditTaxLiability - reformTotalCredits;

  const currentDisposableResources = employerCompensation - currentPreCreditTaxLiability + currentTaxCredits;
  const reformDisposableResources = reformGrossResources - reformPreCreditTaxLiability + reformTotalCredits;
  const dollarChange = reformDisposableResources - currentDisposableResources;

  // A centered $1,000 local difference represents stepped provisions such as
  // the CTC's $50-per-$1,000 phaseout without displaying a one-dollar spike.
  const halfWindow = 500;
  const downInput = { ...normalized, cashWage: Math.max(0, normalized.cashWage - halfWindow) };
  const upInput = { ...normalized, cashWage: normalized.cashWage + halfWindow };
  const baseTaxes = totalTaxAtWage(downInput, settings, normalizedEmployerFicaPassThroughRate);
  const upTaxes = totalTaxAtWage(upInput, settings, normalizedEmployerFicaPassThroughRate);
  const deltaComp = upTaxes.employerComp - baseTaxes.employerComp;

  return {
    input: normalized,
    current,
    totalCashWage,
    employerCompensation,
    employerFicaPassThroughRate: normalizedEmployerFicaPassThroughRate,
    employerFicaPassThrough,
    reformGrossResources,
    taxableReformWageBase: taxableWageBase,
    reformWageBase,
    currentPreCreditTaxLiability,
    currentTaxCredits,
    reformTaxBeforeCredits,
    adultCreditMaximum,
    adultCredit,
    childCredit,
    totalReformCredit,
    retainedCurrentTaxBeforeCredits,
    retainedCurrentTaxCredits,
    retainedCurrentTaxes,
    reformPreCreditTaxLiability,
    reformTotalCredits,
    reformTaxAfterCredits,
    currentDisposableResources,
    reformDisposableResources,
    dollarChange,
    percentChange: currentDisposableResources !== 0 ? dollarChange / currentDisposableResources : null,
    currentAverageRate: employerCompensation > 0 ? current.totalFederalTax / employerCompensation : 0,
    reformAverageRate: employerCompensation > 0 ? reformTaxAfterCredits / employerCompensation : 0,
    currentMarginalRate: deltaComp > 0 ? (upTaxes.current - baseTaxes.current) / deltaComp : 0,
    reformMarginalRate: deltaComp > 0 ? (upTaxes.reform - baseTaxes.reform) / deltaComp : 0,
  };
}

export const OECD_US_AVERAGE_WAGE_2025 = 73520;

export const taxWedgeScenarios: TaxWedgeScenario[] = [
  { id: 'single-67', label: 'Single, no children · 67% AW', filingStatus: 'single', children: 0, primaryWageShare: 0.67, secondaryWageShare: 0 },
  { id: 'single-100', label: 'Single, no children · 100% AW', filingStatus: 'single', children: 0, primaryWageShare: 1, secondaryWageShare: 0 },
  { id: 'single-167', label: 'Single, no children · 167% AW', filingStatus: 'single', children: 0, primaryWageShare: 1.67, secondaryWageShare: 0 },
  { id: 'single-kids-67', label: 'Single, 2 children · 67% AW', filingStatus: 'single', children: 2, primaryWageShare: 0.67, secondaryWageShare: 0 },
  { id: 'married-kids-100-0', label: 'Married, 2 children · 100% + 0% AW', filingStatus: 'married', children: 2, primaryWageShare: 1, secondaryWageShare: 0 },
  { id: 'married-kids-100-33', label: 'Married, 2 children · 100% + 33% AW', filingStatus: 'married', children: 2, primaryWageShare: 1, secondaryWageShare: 0.33 },
  { id: 'married-100-33', label: 'Married, no children · 100% + 33% AW', filingStatus: 'married', children: 0, primaryWageShare: 1, secondaryWageShare: 0.33 },
  { id: 'married-kids-100-67', label: 'Married, 2 children · 100% + 67% AW', filingStatus: 'married', children: 2, primaryWageShare: 1, secondaryWageShare: 0.67 },
];

export function calculateTaxWedgeTable(
  settings: ReformSettings,
  averageWage = OECD_US_AVERAGE_WAGE_2025,
): TaxWedgeRow[] {
  return taxWedgeScenarios.map((scenario) => {
    const primaryWage = averageWage * scenario.primaryWageShare;
    const secondaryWage = averageWage * scenario.secondaryWageShare;
    const result = calculateHousehold({
      filingStatus: scenario.filingStatus,
      children: scenario.children,
      cashWage: primaryWage,
      secondaryCashWage: secondaryWage,
    }, settings);
    const currentWedge = result.employerCompensation > 0
      ? result.current.totalFederalTax / result.employerCompensation : 0;
    const reformWedge = result.employerCompensation > 0
      ? result.reformTaxAfterCredits / result.employerCompensation : 0;
    return {
      ...scenario,
      primaryWage,
      secondaryWage,
      employerCompensation: result.employerCompensation,
      currentTax: result.current.totalFederalTax,
      reformTax: result.reformTaxAfterCredits,
      currentAfterTaxIncome: result.currentDisposableResources,
      reformAfterTaxIncome: result.reformDisposableResources,
      afterTaxIncomeChange: result.dollarChange,
      currentWedge,
      reformWedge,
      changePercentagePoints: (reformWedge - currentWedge) * 100,
    };
  });
}

export { parameters as currentLaw2025 };
