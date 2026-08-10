export type FundingStartAge = 0 | 18

export type FiscalObjective =
  | 'stableTerminalDebt'
  | 'returnToStartingDebt'
  | 'peakDebtCeiling'
  | 'combinedStableAndPeak'

export interface ModelAssumptions {
  reformYear: number
  endYear: number
  maxModeledAge: number
  benefitPhaseInYears: number
  flatBenefitFPLMultiple: number
  individualFPL2026: number
  realFPLGrowth: number
  fullRetirementAge: number
  vestingYears: number
  currentLawSSBenefit2026: number
  currentLawSSBenefitRealGrowth: number
  prefundingEnabled: boolean
  prefundingStartAge: FundingStartAge
  realEndowmentYield: number
  medicareEligibilityAge: number
  premiumSupport2026: number
  premiumSupportRealGrowth: number
  legacyMedicareCost2026: number
  legacyMedicareRealGrowth: number
  medicareYearA: number
  medicareYearB: number
  cohortSizeMillions2026: number
  cohortSizeGrowth: number
  startingNominalGDPBillions: number
  realGDPGrowth: number
  inflation: number
  startingDebtGDP: number
  baselineRealMarketRate: number
  startingEffectiveNominalRate: number
  debtSensitivity: number
  debtRatePassThrough: number
  otherOASDIGDP: number
  under65MedicareGDP: number
  otherPrimaryGDP: number
  fiscalObjective: FiscalObjective
  peakDebtCeilingGDP: number
  matureDebtTargetGDP: number
}

export interface BenefitShares {
  legacyShare: number
  flatShare: number
}

export interface SSCohortAudit extends BenefitShares {
  retirementYear: number
  initialCohortMillions: number
  survivingBeneficiariesMillions: number
  survivalFraction: number
  prefunded: boolean
  legacyPaygoBillions: number
  flatPaygoBillions: number
  totalCohortSSSpendingBillions: number
}

export interface SocialSecurityYearResult {
  legacyBillions: number
  flatPaygoBillions: number
  cohorts: SSCohortAudit[]
}

export interface MedicareCohortAudit {
  eligibilityYear: number
  premiumSupportShare: number
  legacyShare: number
  initialCohortMillions: number
  survivingBeneficiariesMillions: number
  prefunded: boolean
  legacyBillions: number
  premiumSupportPaygoBillions: number
}

export interface MedicareYearResult {
  legacyBillions: number
  premiumSupportPaygoBillions: number
  cohorts: MedicareCohortAudit[]
}

export interface EndowmentPerPerson {
  socialSecurityPV: number
  medicarePV: number
  totalPV: number
}

export interface PrimaryComponents {
  legacySocialSecurity: number
  flatSocialSecurityPaygo: number
  otherOASDI: number
  legacySeniorMedicare: number
  premiumSupportPaygo: number
  under65Medicare: number
  newCohortPrefunding: number
  otherPrimarySpending: number
}

export interface SimulationYear extends PrimaryComponents {
  year: number
  nominalGDP: number
  totalPrimarySpending: number
  revenue: number
  revenueRate: number
  primaryBalance: number
  primaryDeficit: number
  realTargetInterestRate: number
  nominalTargetInterestRate: number
  effectiveNominalInterestRate: number
  netInterest: number
  totalFederalSpending: number
  overallDeficit: number
  beginningDebt: number
  endingDebt: number
  beginningDebtGDP: number
  endingDebtGDP: number
  debtGDP: number
}

export interface SimulationResult {
  assumptions: ModelAssumptions
  years: SimulationYear[]
  socialSecurityByYear: Map<number, SocialSecurityYearResult>
  medicareByYear: Map<number, MedicareYearResult>
  endowment2026: EndowmentPerPerson
  cumulativePrefundingBillions: number
}

export interface SolverDiagnostics {
  converged: boolean
  iterations: number
  rate: number
  peakDebtGDP: number
  peakYear: number
  terminalDebtGDP: number
  terminalAnnualDebtChange: number
  terminalNetInterestGDP: number
  effectiveInterestRateAtPeak: number
  terminalEffectiveInterestRate: number
}

export interface PermanentRateSolution extends SolverDiagnostics {
  simulation: SimulationResult
}

export interface TwoRateSolution {
  converged: boolean
  transitionConverged: boolean
  matureConverged: boolean
  transitionRate: number
  matureRate: number
  matureSystemYear: number
  handoffDebtTargetGDP: number
  handoffDebtGDP: number
  simulation: SimulationResult
}

export interface ScenarioResult {
  label: 'PAYGO benefit reform' | 'Prefunded benefit reform'
  assumptions: ModelAssumptions
  permanent: PermanentRateSolution
  twoRate: TwoRateSolution
  matureSystemYear: number
  maturePrimarySpendingGDP: number
  matureNetInterestGDP: number
  matureTotalSpendingGDP: number
  endowment: EndowmentPerPerson
}

export interface ScenarioComparison {
  paygo: ScenarioResult
  prefunded: ScenarioResult
  prefundingTransitionFinancingEffect: {
    permanentRateDifference: number
    transitionRateDifference: number
    matureRateDifference: number
  }
}
