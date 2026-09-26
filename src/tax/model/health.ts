import healthData from '../data/health_esi_2025.json';
import nongroupHealthData from '../data/health_nongroup_2025.json';
import { calculateAdultCredit, calculateCurrentLaw, calculateReformWageTax } from './household';
import { calculateMacro } from './macro';
import type { FilingStatus, HouseholdInput, ReformSettings, TaxBreakdown } from './types';

export type HealthRedistributionRule = 'nationalEqual' | 'employerCellEqual' | 'ownContribution';
export type HealthRecipientScope = 'policyholders' | 'coveredWorkers';

export interface HealthPolicySettings {
  adultHealthCredit: number;
  childHealthCredit: number;
  uninsuredTakeUpRate: number;
  employerHealthPassThroughRate: number;
  employerFicaPassThroughRate: number;
  employeePremiumPreTaxShare: number;
  benchmarkPremiumScale: number;
  /** Replace the observed ACA premium tax credit with the flat purchase credit. */
  replaceAcaAptc?: boolean;
  redistributionRule: HealthRedistributionRule;
  recipientScope: HealthRecipientScope;
}

export interface HealthSourceLink {
  url: string;
  year?: number;
  dictionaryUrl?: string;
}

export interface HealthSnapshot {
  schemaVersion: number;
  snapshot: string;
  source: {
    asec: HealthSourceLink & {
      sha256: string;
      personFile: string;
      planTierCrosswalk: {
        asecFamily1: string;
        asecSelfPlusOne2: string;
        asecSelfOnly3: string;
      };
    };
    hipm: HealthSourceLink & { sha256: string; dictionaryUrl: string };
    mepsPrivate: HealthSourceLink & { year: number };
    mepsPublic: HealthSourceLink & { year: number };
    bea: HealthSourceLink & { year: number };
    cmsBenchmarkTrend: HealthSourceLink & { year: number };
    incomeYear: number;
    projectionYear: number;
  };
  method: Record<string, string>;
  sample: {
    samplePersons: number;
    hipmMatchedPersons: number;
    hipmMatchRate: number;
    sampleTaxUnits: number;
    healthTaxUnits: number;
    sampleEsiPolicyholders: number;
    rawAllPolicyholderEmployerPoolBillions: number;
    rawTransitionEmployerPoolBillions: number;
  };
  calibration: {
    cashWageScaleToBea2025: number;
    beaGroupHealth2024Billions: number;
    beaPensionInsurance2024Billions: number;
    beaPensionInsurance2025Billions: number;
    projectedBeaGroupHealth2025Billions: number;
    employerContributionScaleToBea: number;
    employeePremiumScaleToMeps2025: number;
    targetEmployeePremium2025Billions: number;
    nonelderlyTransitionEmployerPoolBillions: number;
    weightedPolicyholderWorkersMillions: number;
    weightedCoveredWorkersMillions: number;
    nationalEqualWagePerPolicyholderWorker: number;
    nationalEqualWagePerCoveredWorker: number;
  };
  browserReconciliation: {
    analyticalCells: number;
    weightedHealthTaxUnitsMillions: number;
    weightedEsiCoveredPeopleMillions: number;
    employeePremiumBillions: number;
    employerContributionPoolBillions: number;
    benchmarkPremium2024Billions: number;
    nationalPolicyholderAllocationBillions: number;
    nationalCoveredWorkerAllocationBillions: number;
    cellPolicyholderAllocationBillions: number;
    cellCoveredWorkerAllocationBillions: number;
  };
  distributionColumns: string[];
  distribution: number[][];
}

interface NongroupHealthSnapshot {
  statusCodes: Record<string, string>;
  statusWeightScales: Record<string, number>;
  distribution: number[][];
}

interface HealthCell {
  primaryCashWage: number;
  secondaryCashWage: number;
  scheduleAdults: number;
  creditAdults: number;
  children: number;
  coveredPeople: number;
  coveredAdults: number;
  employeePremium: number;
  employerContribution: number;
  benchmarkPremium2024: number;
  nationalPolicyholderWage: number;
  nationalCoveredWorkerWage: number;
  cellPolicyholderWage: number;
  cellCoveredWorkerWage: number;
  policyholderWorkers: number;
  coveredWorkers: number;
  planTier: number;
  ageBand: number;
  sector: number;
  employerSize: number;
  incomeDecile: number;
  weight: number;
}

export interface HealthDistributionSummary {
  id: string;
  label: string;
  taxUnitsMillions: number;
  coveredPeopleMillions: number;
  winnerShare: number;
  averageHealthWage: number;
  averageEmployeePremium: number;
  averageBenchmarkPremium: number;
  averageDollarChange: number;
}

export interface HealthAnalysis {
  affectedTaxUnitsMillions: number;
  coveredPeopleMillions: number;
  policyholderWorkersMillions: number;
  coveredWorkersMillions: number;
  employerContributionPoolBillions: number;
  employerPremiumShare: number;
  employeePremiumShare: number;
  allocatedHealthWagesBillions: number;
  employerWageAllocationGapBillions: number;
  averageHealthWagePerRecipient: number;
  employeePremiumBillions: number;
  benchmarkPremiumBillions: number;
  /** Refundable credits for people transitioning from ESI. */
  healthCreditCostBillions: number;
  nongroupNoAptcCostBillions: number;
  nongroupAptcFloorTopUpCostBillions: number;
  estimatedExistingAptcSavingsBillions: number;
  uninsuredFullTakeUpCostBillions: number;
  uninsuredInducedEnrollmentCostBillions: number;
  nongroupExtensionCostBillions: number;
  totalHealthCreditCostBillions: number;
  healthCreditFinancingRateIncrease: number;
  healthTransferWageTaxBillions: number;
  currentDisposableResourcesBillions: number;
  reformDisposableResourcesBillions: number;
  aggregateResourceChangeBillions: number;
  winnerTaxUnitShare: number;
  winnerCoveredPeopleShare: number;
  loserCoveredPeopleShare: number;
  medianDollarChange: number;
  p10DollarChange: number;
  p90DollarChange: number;
  meanCurrentMtr: number;
  meanReformMtr: number;
  meanMtrMovement: number;
  meanAbsoluteMtrChange: number;
  mtrWithinTwoPointsShare: number;
  byIncomeDecile: HealthDistributionSummary[];
  byPlanTier: HealthDistributionSummary[];
  byAgeBand: HealthDistributionSummary[];
}

interface CellResult {
  cell: HealthCell;
  currentDisposable: number;
  reformDisposable: number;
  dollarChange: number;
  baseChangeBeforeHealthCredit: number;
  healthCredit: number;
  benchmarkPremium: number;
  healthWage: number;
  healthTransferWageTax: number;
  requiredCreditPerPerson: number;
  currentTaxWedge: number;
  reformTaxWedge: number;
  employerCompensation: number;
}

export const healthSnapshot = healthData as unknown as HealthSnapshot;
export const nongroupHealthSnapshot = nongroupHealthData as unknown as NongroupHealthSnapshot;

export const defaultHealthPolicySettings: HealthPolicySettings = {
  adultHealthCredit: 3250,
  childHealthCredit: 750,
  uninsuredTakeUpRate: 0.15,
  employerHealthPassThroughRate: 1,
  employerFicaPassThroughRate: 1,
  employeePremiumPreTaxShare: 1,
  benchmarkPremiumScale: 1.03,
  replaceAcaAptc: false,
  redistributionRule: 'nationalEqual',
  recipientScope: 'policyholders',
};

const cells: HealthCell[] = healthSnapshot.distribution.map((row) => ({
  primaryCashWage: row[0]!,
  secondaryCashWage: row[1]!,
  scheduleAdults: row[2]!,
  creditAdults: row[3]!,
  children: row[4]!,
  coveredPeople: row[5]!,
  coveredAdults: row[6]!,
  employeePremium: row[7]!,
  employerContribution: row[8]!,
  benchmarkPremium2024: row[9]!,
  nationalPolicyholderWage: row[10]!,
  nationalCoveredWorkerWage: row[11]!,
  cellPolicyholderWage: row[12]!,
  cellCoveredWorkerWage: row[13]!,
  policyholderWorkers: row[14]!,
  coveredWorkers: row[15]!,
  planTier: row[16]!,
  ageBand: row[17]!,
  sector: row[18]!,
  employerSize: row[19]!,
  incomeDecile: row[20]!,
  weight: row[21]!,
}));

function clampShare(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function currentCredits(tax: TaxBreakdown): number {
  return tax.nonrefundableCtc + tax.refundableCtc + tax.eitc;
}

function filingStatus(cell: HealthCell): FilingStatus {
  return cell.scheduleAdults === 2 ? 'married' : 'single';
}

function inputAtWages(cell: HealthCell, primaryWage: number, secondaryWage: number): HouseholdInput {
  const status = filingStatus(cell);
  return {
    filingStatus: status,
    children: cell.children,
    cashWage: Math.max(0, primaryWage),
    secondaryCashWage: status === 'married' ? Math.max(0, secondaryWage) : 0,
  };
}

function splitWagesAfterReduction(primary: number, secondary: number, reduction: number): [number, number] {
  const total = primary + secondary;
  if (total <= 0) return [0, 0];
  const remainingShare = Math.max(0, total - reduction) / total;
  return [primary * remainingShare, secondary * remainingShare];
}

function selectedHealthWage(cell: HealthCell, policy: HealthPolicySettings): number {
  if (policy.redistributionRule === 'ownContribution') return cell.employerContribution;
  if (policy.redistributionRule === 'employerCellEqual') {
    return policy.recipientScope === 'policyholders'
      ? cell.cellPolicyholderWage : cell.cellCoveredWorkerWage;
  }
  return policy.recipientScope === 'policyholders'
    ? cell.nationalPolicyholderWage : cell.nationalCoveredWorkerWage;
}

function taxableReformWage(
  cashWage: number,
  employerFicaPassThrough: number,
  employerHealthWage: number,
  settings: ReformSettings,
): number {
  return cashWage * (1 - clampShare(settings.cashWageExemptionShare))
    + employerFicaPassThrough * (1 - clampShare(settings.employerSocialInsuranceExemptionShare))
    + employerHealthWage * (1 - clampShare(settings.employerHealthInsuranceExemptionShare));
}

function calculateCell(
  cell: HealthCell,
  settings: ReformSettings,
  policy: HealthPolicySettings,
  primaryWageDelta = 0,
): CellResult {
  const wageScale = healthSnapshot.calibration.cashWageScaleToBea2025;
  const primaryWage = Math.max(0, cell.primaryCashWage * wageScale + primaryWageDelta);
  const secondaryWage = cell.secondaryCashWage * wageScale;
  const cashWage = primaryWage + secondaryWage;
  const employeePremium = cell.employeePremium;
  const pretaxPremium = Math.min(cashWage, employeePremium * clampShare(policy.employeePremiumPreTaxShare));
  const [currentPrimaryWage, currentSecondaryWage] = splitWagesAfterReduction(
    primaryWage, secondaryWage, pretaxPremium,
  );
  const currentTax = calculateCurrentLaw(inputAtWages(cell, currentPrimaryWage, currentSecondaryWage));
  const currentDisposable = cashWage
    - currentTax.incomeTaxBeforeCredits
    - currentTax.employeePayrollTax
    + currentCredits(currentTax)
    - employeePremium;

  const payrollIsReplaced = settings.replacedTaxes.payroll;
  const employerFicaPassThrough = payrollIsReplaced
    ? currentTax.employerPayrollTax * clampShare(policy.employerFicaPassThroughRate)
    : 0;
  const healthWage = selectedHealthWage(cell, policy) * clampShare(policy.employerHealthPassThroughRate);
  // Employer-paid coverage remains compensation when the employer keeps paying the insurer.
  // It is counted once, whether delivered as ESI or converted into cash wages.
  const retainedEmployerCoverage = cell.employerContribution
    * (1 - clampShare(policy.employerHealthPassThroughRate));
  const taxableHealthCompensation = healthWage + retainedEmployerCoverage;
  const reformPrimaryWage = primaryWage + employerFicaPassThrough + healthWage;
  const reformCurrentTax = calculateCurrentLaw(inputAtWages(cell, reformPrimaryWage, secondaryWage));
  const reformGrossResources = cashWage + employerFicaPassThrough + taxableHealthCompensation;
  const taxableWage = taxableReformWage(cashWage, employerFicaPassThrough, taxableHealthCompensation, settings);
  const taxableWageWithoutHealth = taxableReformWage(cashWage, employerFicaPassThrough, 0, settings);
  const reformWageTax = calculateReformWageTax(taxableWage, filingStatus(cell), settings);
  const reformWageTaxWithoutHealth = calculateReformWageTax(
    taxableWageWithoutHealth, filingStatus(cell), settings,
  );
  const retainedPreCreditTax = (settings.replacedTaxes.individualIncome ? 0 : reformCurrentTax.incomeTaxBeforeCredits)
    + (payrollIsReplaced ? 0 : reformCurrentTax.employeePayrollTax);
  const retainedCredits = settings.replacedTaxes.individualIncome ? 0 : currentCredits(reformCurrentTax);
  const adultCredit = calculateAdultCredit(
    settings.adultCreditEarningsBase === 'cash'
      ? cashWage + employerFicaPassThrough + healthWage : reformGrossResources,
    cell.creditAdults, settings,
  );
  const childCredit = cell.children * settings.childCredit;
  const benchmarkPremium = cell.benchmarkPremium2024 * Math.max(0, policy.benchmarkPremiumScale);
  const healthCredit = Math.min(
    benchmarkPremium,
    Math.max(0, policy.adultHealthCredit) * cell.coveredAdults
      + Math.max(0, policy.childHealthCredit) * Math.max(0, cell.coveredPeople - cell.coveredAdults),
  );
  const reformDisposableBeforeHealthCredit = reformGrossResources
    - reformWageTax
    - retainedPreCreditTax
    + retainedCredits
    + adultCredit
    + childCredit
    - benchmarkPremium;
  const reformDisposable = reformDisposableBeforeHealthCredit + healthCredit;
  const baseChangeBeforeHealthCredit = reformDisposableBeforeHealthCredit - currentDisposable;
  const requiredHealthCredit = Math.max(0, -baseChangeBeforeHealthCredit);
  const requiredCreditPerPerson = cell.coveredPeople <= 0 || requiredHealthCredit > benchmarkPremium
    ? Number.POSITIVE_INFINITY
    : requiredHealthCredit / cell.coveredPeople;
  const currentTaxWedge = currentTax.incomeTaxBeforeCredits
    + currentTax.employeePayrollTax + currentTax.employerPayrollTax - currentCredits(currentTax);
  const retainedTaxWedge = (settings.replacedTaxes.individualIncome ? 0 : reformCurrentTax.incomeTaxBeforeCredits)
    + (payrollIsReplaced ? 0 : reformCurrentTax.employeePayrollTax + reformCurrentTax.employerPayrollTax)
    - retainedCredits;
  const reformTaxWedge = reformWageTax + retainedTaxWedge - adultCredit - childCredit - healthCredit;

  return {
    cell,
    currentDisposable,
    reformDisposable,
    dollarChange: reformDisposable - currentDisposable,
    baseChangeBeforeHealthCredit,
    healthCredit,
    benchmarkPremium,
    healthWage,
    healthTransferWageTax: reformWageTax - reformWageTaxWithoutHealth,
    requiredCreditPerPerson,
    currentTaxWedge,
    reformTaxWedge,
    employerCompensation: cashWage + currentTax.employerPayrollTax,
  };
}

interface NongroupCreditCosts {
  noAptc: number;
  aptcFloorTopUp: number;
  existingAptc: number;
  uninsuredFullTakeUp: number;
  uninsuredInducedEnrollment: number;
}

function calculateNongroupCreditCosts(policy: HealthPolicySettings): NongroupCreditCosts {
  let noAptc = 0;
  let aptcFloorTopUp = 0;
  let existingAptc = 0;
  let uninsuredFullTakeUp = 0;
  for (const row of nongroupHealthSnapshot.distribution) {
    const [status, adults, children, benchmark2024, currentAptc2024, weight] = row as [number, number, number, number, number, number];
    const benchmark = benchmark2024 * Math.max(0, policy.benchmarkPremiumScale);
    const proposed = Math.min(
      benchmark,
      adults * Math.max(0, policy.adultHealthCredit)
        + children * Math.max(0, policy.childHealthCredit),
    );
    const statusScale = nongroupHealthSnapshot.statusWeightScales[String(status)] ?? 1;
    if (status === 1) noAptc += proposed * weight * statusScale;
    if (status === 2) {
      const baselineCredit = currentAptc2024 * Math.max(0, policy.benchmarkPremiumScale);
      existingAptc += baselineCredit * weight * statusScale;
      aptcFloorTopUp += (policy.replaceAcaAptc ? proposed : Math.max(0, proposed - baselineCredit))
        * weight * statusScale;
    }
    if (status === 3) uninsuredFullTakeUp += proposed * weight;
  }
  const uninsuredInducedEnrollment = uninsuredFullTakeUp * clampShare(policy.uninsuredTakeUpRate);
  return {
    noAptc: noAptc / 1e9,
    aptcFloorTopUp: aptcFloorTopUp / 1e9,
    existingAptc: existingAptc / 1e9,
    uninsuredFullTakeUp: uninsuredFullTakeUp / 1e9,
    uninsuredInducedEnrollment: uninsuredInducedEnrollment / 1e9,
  };
}

function weightedQuantile(
  rows: CellResult[],
  value: (row: CellResult) => number,
  weight: (row: CellResult) => number,
  quantile: number,
): number {
  const ordered = rows
    .map((row) => ({ value: value(row), weight: Math.max(0, weight(row)) }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => a.value - b.value);
  const total = ordered.reduce((sum, row) => sum + row.weight, 0);
  const target = total * Math.max(0, Math.min(1, quantile));
  let cumulative = 0;
  for (const row of ordered) {
    cumulative += row.weight;
    if (cumulative >= target) return row.value;
  }
  return ordered.at(-1)?.value ?? 0;
}

interface GroupAccumulator {
  id: string;
  label: string;
  taxUnits: number;
  coveredPeople: number;
  winningCoveredPeople: number;
  healthWages: number;
  employeePremiums: number;
  benchmarkPremiums: number;
  dollarChange: number;
}

function grouped(
  rows: CellResult[],
  selector: (cell: HealthCell) => [string, string],
): HealthDistributionSummary[] {
  const groups = new Map<string, GroupAccumulator>();
  for (const row of rows) {
    const [id, label] = selector(row.cell);
    const current = groups.get(id) ?? {
      id, label, taxUnits: 0, coveredPeople: 0, winningCoveredPeople: 0,
      healthWages: 0, employeePremiums: 0, benchmarkPremiums: 0, dollarChange: 0,
    };
    const weight = row.cell.weight;
    const coveredWeight = weight * row.cell.coveredPeople;
    current.taxUnits += weight;
    current.coveredPeople += coveredWeight;
    current.winningCoveredPeople += row.dollarChange >= 0 ? coveredWeight : 0;
    current.healthWages += weight * row.healthWage;
    current.employeePremiums += weight * row.cell.employeePremium;
    current.benchmarkPremiums += weight * row.benchmarkPremium;
    current.dollarChange += weight * row.dollarChange;
    groups.set(id, current);
  }
  return [...groups.values()].map((group) => ({
    id: group.id,
    label: group.label,
    taxUnitsMillions: group.taxUnits / 1e6,
    coveredPeopleMillions: group.coveredPeople / 1e6,
    winnerShare: group.coveredPeople > 0 ? group.winningCoveredPeople / group.coveredPeople : 0,
    averageHealthWage: group.taxUnits > 0 ? group.healthWages / group.taxUnits : 0,
    averageEmployeePremium: group.taxUnits > 0 ? group.employeePremiums / group.taxUnits : 0,
    averageBenchmarkPremium: group.taxUnits > 0 ? group.benchmarkPremiums / group.taxUnits : 0,
    averageDollarChange: group.taxUnits > 0 ? group.dollarChange / group.taxUnits : 0,
  }));
}

const planTierLabels: Record<number, string> = {
  0: 'Outside-household ESI / no in-unit policyholder',
  1: 'Self-only ESI',
  2: 'Employee plus one',
  3: 'Family ESI',
};

const ageBandLabels: Record<number, string> = {
  0: 'No in-unit policyholder',
  1: 'Policyholder under 30',
  2: 'Policyholder age 30–39',
  3: 'Policyholder age 40–49',
  4: 'Policyholder age 50–59',
  5: 'Policyholder age 60–64',
};

export function calculateHealthAnalysis(
  settings: ReformSettings,
  policy: HealthPolicySettings,
): HealthAnalysis {
  const rows = cells.map((cell) => calculateCell(cell, settings, policy));
  const downRows = cells.map((cell) => calculateCell(cell, settings, policy, -500));
  const upRows = cells.map((cell) => calculateCell(cell, settings, policy, 500));
  const macro = calculateMacro(settings);
  let taxUnits = 0;
  let coveredPeople = 0;
  let winningTaxUnits = 0;
  let winningCoveredPeople = 0;
  let healthWages = 0;
  let employeePremiums = 0;
  let benchmarkPremiums = 0;
  let healthCredits = 0;
  let healthTransferWageTax = 0;
  let currentResources = 0;
  let reformResources = 0;
  let currentMtrWeighted = 0;
  let reformMtrWeighted = 0;
  let mtrMovementWeighted = 0;
  let absoluteMtrMovementWeighted = 0;
  let mtrPreservedCoveredPeople = 0;
  for (const [index, row] of rows.entries()) {
    const weight = row.cell.weight;
    const coveredWeight = weight * row.cell.coveredPeople;
    taxUnits += weight;
    coveredPeople += coveredWeight;
    winningTaxUnits += row.dollarChange >= 0 ? weight : 0;
    winningCoveredPeople += row.dollarChange >= 0 ? coveredWeight : 0;
    healthWages += weight * row.healthWage;
    employeePremiums += weight * row.cell.employeePremium;
    benchmarkPremiums += weight * row.benchmarkPremium;
    healthCredits += weight * row.healthCredit;
    healthTransferWageTax += weight * row.healthTransferWageTax;
    currentResources += weight * row.currentDisposable;
    reformResources += weight * row.reformDisposable;
    const down = downRows[index]!;
    const up = upRows[index]!;
    const denominator = up.employerCompensation - down.employerCompensation;
    const currentMtr = denominator > 0 ? (up.currentTaxWedge - down.currentTaxWedge) / denominator : 0;
    const reformMtr = denominator > 0 ? (up.reformTaxWedge - down.reformTaxWedge) / denominator : 0;
    const movement = reformMtr - currentMtr;
    currentMtrWeighted += currentMtr * coveredWeight;
    reformMtrWeighted += reformMtr * coveredWeight;
    mtrMovementWeighted += movement * coveredWeight;
    absoluteMtrMovementWeighted += Math.abs(movement) * coveredWeight;
    mtrPreservedCoveredPeople += Math.abs(movement) <= 0.02 ? coveredWeight : 0;
  }
  const recipientCountMillions = policy.redistributionRule === 'ownContribution'
    ? healthSnapshot.calibration.weightedPolicyholderWorkersMillions
    : policy.recipientScope === 'policyholders'
    ? healthSnapshot.calibration.weightedPolicyholderWorkersMillions
    : healthSnapshot.calibration.weightedCoveredWorkersMillions;
  const employerContributionPoolBillions =
    healthSnapshot.browserReconciliation.employerContributionPoolBillions;
  const employeePremiumBillions = employeePremiums / 1e9;
  const totalCurrentPremiumBillions = employerContributionPoolBillions + employeePremiumBillions;
  const healthCreditCostBillions = healthCredits / 1e9;
  const nongroup = calculateNongroupCreditCosts(policy);
  const nongroupExtensionCostBillions = nongroup.noAptc
    + nongroup.aptcFloorTopUp + nongroup.uninsuredInducedEnrollment;
  const totalHealthCreditCostBillions = healthCreditCostBillions + nongroupExtensionCostBillions;

  return {
    affectedTaxUnitsMillions: taxUnits / 1e6,
    coveredPeopleMillions: coveredPeople / 1e6,
    policyholderWorkersMillions: healthSnapshot.calibration.weightedPolicyholderWorkersMillions,
    coveredWorkersMillions: healthSnapshot.calibration.weightedCoveredWorkersMillions,
    employerContributionPoolBillions,
    employerPremiumShare: totalCurrentPremiumBillions > 0
      ? employerContributionPoolBillions / totalCurrentPremiumBillions : 0,
    employeePremiumShare: totalCurrentPremiumBillions > 0
      ? employeePremiumBillions / totalCurrentPremiumBillions : 0,
    allocatedHealthWagesBillions: healthWages / 1e9,
    employerWageAllocationGapBillions:
      (healthWages / 1e9) - healthSnapshot.browserReconciliation.employerContributionPoolBillions
        * clampShare(policy.employerHealthPassThroughRate),
    averageHealthWagePerRecipient: recipientCountMillions > 0
      ? healthWages / (recipientCountMillions * 1e6) : 0,
    employeePremiumBillions,
    benchmarkPremiumBillions: benchmarkPremiums / 1e9,
    healthCreditCostBillions,
    nongroupNoAptcCostBillions: nongroup.noAptc,
    nongroupAptcFloorTopUpCostBillions: nongroup.aptcFloorTopUp,
    estimatedExistingAptcSavingsBillions: policy.replaceAcaAptc ? nongroup.existingAptc : 0,
    uninsuredFullTakeUpCostBillions: nongroup.uninsuredFullTakeUp,
    uninsuredInducedEnrollmentCostBillions: nongroup.uninsuredInducedEnrollment,
    nongroupExtensionCostBillions,
    totalHealthCreditCostBillions,
    healthCreditFinancingRateIncrease: macro.rateAdjustedBase > 0
      ? totalHealthCreditCostBillions / macro.rateAdjustedBase : 0,
    healthTransferWageTaxBillions: healthTransferWageTax / 1e9,
    currentDisposableResourcesBillions: currentResources / 1e9,
    reformDisposableResourcesBillions: reformResources / 1e9,
    aggregateResourceChangeBillions: (reformResources - currentResources) / 1e9,
    winnerTaxUnitShare: taxUnits > 0 ? winningTaxUnits / taxUnits : 0,
    winnerCoveredPeopleShare: coveredPeople > 0 ? winningCoveredPeople / coveredPeople : 0,
    loserCoveredPeopleShare: coveredPeople > 0 ? 1 - winningCoveredPeople / coveredPeople : 0,
    medianDollarChange: weightedQuantile(rows, (row) => row.dollarChange, (row) => row.cell.weight * row.cell.coveredPeople, 0.5),
    p10DollarChange: weightedQuantile(rows, (row) => row.dollarChange, (row) => row.cell.weight * row.cell.coveredPeople, 0.1),
    p90DollarChange: weightedQuantile(rows, (row) => row.dollarChange, (row) => row.cell.weight * row.cell.coveredPeople, 0.9),
    meanCurrentMtr: coveredPeople > 0 ? currentMtrWeighted / coveredPeople : 0,
    meanReformMtr: coveredPeople > 0 ? reformMtrWeighted / coveredPeople : 0,
    meanMtrMovement: coveredPeople > 0 ? mtrMovementWeighted / coveredPeople : 0,
    meanAbsoluteMtrChange: coveredPeople > 0 ? absoluteMtrMovementWeighted / coveredPeople : 0,
    mtrWithinTwoPointsShare: coveredPeople > 0 ? mtrPreservedCoveredPeople / coveredPeople : 0,
    byIncomeDecile: grouped(rows, (cell) => [String(cell.incomeDecile), `ESI cash-wage decile ${cell.incomeDecile}`])
      .sort((a, b) => Number(a.id) - Number(b.id)),
    byPlanTier: grouped(rows, (cell) => [String(cell.planTier), planTierLabels[cell.planTier] ?? 'Other ESI'])
      .sort((a, b) => Number(a.id) - Number(b.id)),
    byAgeBand: grouped(rows, (cell) => [String(cell.ageBand), ageBandLabels[cell.ageBand] ?? 'Other age'])
      .sort((a, b) => Number(a.id) - Number(b.id)),
  };
}
