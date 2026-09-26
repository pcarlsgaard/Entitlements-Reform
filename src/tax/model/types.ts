export type FilingStatus = 'single' | 'married';
export type ReplacedTax = 'individualIncome' | 'payroll' | 'corporateIncome' | 'customs';
export type AdultCreditMode = 'universal' | 'earned';
export type WageTaxMode = 'flat' | 'progressive';

export type AdultCreditAuditBucketId =
  | 'noEligibleAdult'
  | 'zeroCompensation'
  | 'phaseIn'
  | 'fullCredit'
  | 'phaseInPhaseOutOverlap'
  | 'phaseOut'
  | 'fullyPhasedOut'
  | 'noCreditUnderSchedule'
  | 'universalCredit';

export interface AdultCreditAuditBucket {
  id: AdultCreditAuditBucketId;
  taxUnitsMillions: number;
  adultsMillions: number;
  adultPopulationShare: number;
  statutoryCostBillions: number;
  budgetCostBillions: number;
  averageStatutoryCreditPerAdult: number;
  statutoryCostShare: number;
}

export interface AdultCreditAudit {
  buckets: AdultCreditAuditBucket[];
  totalTaxUnitsMillions: number;
  totalAdultsMillions: number;
  positiveCreditTaxUnitsMillions: number;
  adultsInPositiveCreditUnitsMillions: number;
  adultsInPositiveCreditUnitsShare: number;
  universalMaximumCostBillions: number;
  statutoryCostShareOfUniversalMaximum: number;
  averageStatutoryCreditPerAdult: number;
  fullPhaseInCompensationPerAdult: number | null;
  phaseOutStartCompensationPerAdult: number;
  zeroCreditCompensationPerAdult: number | null;
  phaseInPhaseOutOverlap: boolean;
}

export interface ReformSettings {
  rate: number;
  wageTaxMode: WageTaxMode;
  progressiveZeroBracketPerAdult: number;
  progressiveTopBracketPerAdult: number;
  /** Statutory middle wage rate; constrained to the headline rate in calculations. */
  progressiveMiddleRate: number;
  /** Null disables the optional bracket between the middle and top rates. */
  progressiveIntermediateStartPerAdult: number | null;
  progressiveIntermediateRate: number;
  adultCredit: number;
  adultCreditMode: AdultCreditMode;
  /** The earned credit's earnings test; cash includes passed-through employer FICA but excludes retained benefits. */
  adultCreditEarningsBase?: 'cash' | 'compensation';
  adultCreditPhaseInRate: number;
  adultCreditPhaseOutStartPerAdult: number;
  adultCreditPhaseOutRate: number;
  adultCreditTakeUpRate: number;
  childCredit: number;
  noncomplianceRate: number;
  exemptionShare: number;
  cashWageExemptionShare: number;
  employerSocialInsuranceExemptionShare: number;
  employerHealthInsuranceExemptionShare: number;
  employerPensionOtherInsuranceExemptionShare: number;
  replacedTaxes: Record<ReplacedTax, boolean>;
}

export interface MacroResult {
  gdp: number;
  theoreticalBase: number;
  noncomplianceLoss: number;
  baseAfterCompliance: number;
  broadPolicyExemptionLoss: number;
  compensationExemptionLoss: number;
  exemptionLoss: number;
  taxableBase: number;
  basePercentGdp: number;
  wageTaxableBase: number;
  businessTaxableBase: number;
  rateAdjustedWageBase: number;
  microdataAverageWageRateShare: number;
  rateAdjustedBase: number;
  grossRevenue: number;
  grossRevenuePercentGdp: number;
  adultCreditStatutoryCost: number;
  adultCreditCost: number;
  adultCreditTakeUpRate: number;
  adultCreditAudit: AdultCreditAudit;
  childCreditCost: number;
  insuranceCreditCost: number;
  creditCostPercentGdp: number;
  netRevenue: number;
  netRevenuePercentGdp: number;
  targetRevenue: number;
  targetRevenuePercentGdp: number;
  refundableTaxCreditOutlaySavings: number;
  refundableTaxCreditOutlaySavingsPercentGdp: number;
  federalTransferSavings: number;
  totalFederalSavings: number;
  totalFederalSavingsPercentGdp: number;
  adjustedTargetRevenue: number;
  adjustedTargetRevenuePercentGdp: number;
  /** Static change in the federal deficit versus current law, holding all other receipts and outlays fixed. */
  deficitReduction: number;
  deficitReductionPercentGdp: number;
  revenueNeutralRate: number;
  adjustedRevenueNeutralRate: number;
  revenueNeutralRateReduction: number;
}

export interface MacroAdjustment {
  /** FY2025 federal program spending removed outside the individual-income-tax system, in billions. */
  federalTransferSavings?: number;
  /** Refundable health-insurance credits, including ESI and nongroup coverage, in billions. */
  insuranceCreditCost?: number;
}

export interface RefundableTaxCreditOutlayItem {
  id: 'eitcRefundableOutlay' | 'refundableChildTaxCreditOutlay';
  label: string;
  account: string;
  line: string;
  actualOutlaysDollars: number;
  actualOutlaysBillions: number;
  budgetTreatment: string;
}

export interface RefundableTaxCreditOutlayData {
  schemaVersion: number;
  baselineLabel: string;
  fiscalYear: string;
  policyTiming: string;
  agency: string;
  sourceTitle: string;
  sourceUrl: string;
  items: RefundableTaxCreditOutlayItem[];
  accountingNote: string;
}

export interface HouseholdInput {
  filingStatus: FilingStatus;
  children: number;
  /** Primary earner's annual cash wage. */
  cashWage: number;
  /** Second earner's wage; used only for married-joint examples. */
  secondaryCashWage?: number;
}

export interface TaxBreakdown {
  incomeTaxBeforeCredits: number;
  nonrefundableCtc: number;
  refundableCtc: number;
  eitc: number;
  individualIncomeTax: number;
  employeeSocialSecurity: number;
  employerSocialSecurity: number;
  employeeMedicare: number;
  employerMedicare: number;
  additionalMedicare: number;
  employeePayrollTax: number;
  employerPayrollTax: number;
  totalFederalTax: number;
}

export interface HouseholdResult {
  input: HouseholdInput;
  current: TaxBreakdown;
  totalCashWage: number;
  employerCompensation: number;
  employerFicaPassThroughRate: number;
  employerFicaPassThrough: number;
  reformGrossResources: number;
  /** Cash wages and modeled employer FICA remaining after named compensation exemptions. */
  taxableReformWageBase: number;
  /** Gross compensation used to test statutory adult-credit eligibility. */
  reformWageBase: number;
  currentPreCreditTaxLiability: number;
  currentTaxCredits: number;
  reformTaxBeforeCredits: number;
  adultCreditMaximum: number;
  adultCredit: number;
  childCredit: number;
  totalReformCredit: number;
  retainedCurrentTaxBeforeCredits: number;
  retainedCurrentTaxCredits: number;
  retainedCurrentTaxes: number;
  reformPreCreditTaxLiability: number;
  reformTotalCredits: number;
  reformTaxAfterCredits: number;
  currentDisposableResources: number;
  reformDisposableResources: number;
  dollarChange: number;
  percentChange: number | null;
  currentAverageRate: number;
  reformAverageRate: number;
  currentMarginalRate: number;
  reformMarginalRate: number;
}

export type TransferProgramId = 'snap' | 'wic' | 'schoolMeals' | 'summerEbt' | 'tanf' | 'liheap' | 'housing';
export type TransferKind = 'cash' | 'near_cash' | 'in_kind';
export type TransferMethod = 'rule_based' | 'preset_assumption' | 'manual_receipt';
export type TransferReceiptMode = 'assumed' | 'user_entered';

export interface TransferReplacementSettings {
  replacedPrograms: Record<TransferProgramId, boolean>;
}

export interface TransferHouseholdInput {
  household: HouseholdInput;
  /** Share of repealed employer FICA converted into reform wages; defaults to 100%. */
  employerFicaPassThroughRate: number;
  preschoolChildren: number;
  schoolAgeChildren: number;
  monthlyShelterCost: number;
  monthlyDependentCareExpense: number;
  inKindValuationFactor: number;
  receives: Record<TransferProgramId, boolean>;
  manualAnnualBenefits: Partial<Record<TransferProgramId, number>>;
}

export interface TransferProgramDefinition {
  id: TransferProgramId;
  name: string;
  shortName: string;
  kind: TransferKind;
  method: TransferMethod;
  financing: string;
  receiptAccess: string;
  federalFiscalAmountBillions: number;
  federalFiscalMeasure: string;
  stateFinancingIncludedBillions: number;
  policyYear: string;
  fiscalYear: string;
  agency: string;
  sourceUrl: string;
  ruleSourceUrl: string;
  householdMethod: string;
  limitations: string[];
}

export interface TransferProgramResult {
  program: TransferProgramDefinition;
  eligible: boolean | null;
  receives: boolean;
  potentialAnnualBenefit: number;
  annualGovernmentBenefit: number;
  resourceEquivalentValue: number;
  valuationFactor: number;
  calculationStatus: 'exact_rule' | 'approximate_rule' | 'illustrative' | 'user_entered';
  calculationNote: string;
}

export interface ResourceScenario {
  annual: number;
  monthly: number;
  fplShare: number;
  changeFromCurrent: number;
  percentChangeFromCurrent: number | null;
}

export interface TransferAnalysisResult {
  tax: HouseholdResult;
  programs: TransferProgramResult[];
  povertyGuideline: number;
  /** Current-law cash wages; employer FICA is not household cash. */
  currentGrossResources: number;
  /** Current income tax before credits plus employee-side payroll tax. */
  currentPreCreditTaxLiability: number;
  currentTaxCredits: number;
  /** Cash wages plus the selected reform-side employer-FICA pass-through. */
  reformGrossResources: number;
  /** Reform and retained household-side taxes, excluding statutory employer FICA. */
  reformPreCreditTaxLiability: number;
  reformTaxCredits: number;
  totalCurrentExternalTransfers: number;
  eliminatedHouseholdBenefits: number;
  federalProgramSavingsBillions: number;
  currentLaw: ResourceScenario;
  reformRetained: ResourceScenario;
  reformAfterReplacement: ResourceScenario;
  householdReplacementRatio: number | null;
  heldHarmless: boolean;
}

export interface TransferPreset {
  id: string;
  label: string;
  input: TransferHouseholdInput;
}

export interface TaxWedgeScenario {
  id: string;
  label: string;
  filingStatus: FilingStatus;
  children: number;
  primaryWageShare: number;
  secondaryWageShare: number;
}

export interface TaxWedgeRow extends TaxWedgeScenario {
  primaryWage: number;
  secondaryWage: number;
  employerCompensation: number;
  currentTax: number;
  reformTax: number;
  currentAfterTaxIncome: number;
  reformAfterTaxIncome: number;
  afterTaxIncomeChange: number;
  currentWedge: number;
  reformWedge: number;
  changePercentagePoints: number;
}

export interface BusinessInput {
  name: string;
  totalSales: number;
  domesticInputs: number;
  wages: number;
  newInvestment: number;
  imports: number;
  exports: number;
}

export interface BusinessResult extends BusinessInput {
  operatingCashFlow: number;
  borderImportAdjustment: number;
  borderExportAdjustment: number;
  businessTaxBase: number;
  businessTax: number;
  wageSideTaxBeforeCredits: number;
  combinedTaxBeforeHouseholdCredits: number;
}
