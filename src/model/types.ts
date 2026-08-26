export type FundingStartAge = 0 | 18

export type EntitlementDesign = 'reform' | 'currentLaw'

export type CurrentLawBaselineMode = 'scheduled' | 'payable'

export type FundingStrategy =
  | 'paygo'
  | 'socialSecurityOnly'
  | 'medicareOnly'
  | 'both'
  | 'socialSecurityFirst'
  | 'savingsFundedSequential'

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
  fundingStrategy: FundingStrategy
  prefundingStartAge: FundingStartAge
  realEndowmentYield: number
  medicareEligibilityAge: number
  premiumSupport2026: number
  premiumSupportRealGrowth: number
  legacyMedicareCost2026: number
  legacyMedicareRealGrowth: number
  legacyMedicareHIShare2026: number
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
  nonDefenseDiscretionaryGDP2026: number
  nonDefenseDiscretionaryRealGrowth: number
  otherMandatoryGDP2026: number
  policyHorizonYears: number
  policyHorizonDebtTargetGDP: number
  peakDebtCeilingGDP: number
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
  prefundedShare: number
  legacyPaygoBillions: number
  flatBenefitBillions: number
  flatPaygoBillions: number
  totalCohortSSSpendingBillions: number
}

export interface SocialSecurityYearResult {
  legacyBillions: number
  flatBenefitBillions: number
  flatPaygoBillions: number
  cohorts: SSCohortAudit[]
}

export interface MedicareCohortAudit {
  eligibilityYear: number
  premiumSupportShare: number
  legacyShare: number
  initialCohortMillions: number
  survivingBeneficiariesMillions: number
  prefundedShare: number
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

export interface AnnualFundingPlan {
  year: number
  fullSocialSecurityPrefundingCost: number
  socialSecurityPrefunding: number
  socialSecurityPrefundedShare: number
  fullMedicarePrefundingCost: number
  medicarePrefunding: number
  totalPrefunding: number
  avoidedSocialSecurityPaygo: number
  socialSecurityPrefundingDividend: number
  medicarePrefundedShare: number
  availableReformSavings: number
  unusedReformSavings: number
}

export interface PrimaryComponents {
  legacySocialSecurity: number
  flatSocialSecurityPaygo: number
  otherOASDI: number
  legacySeniorMedicare: number
  premiumSupportPaygo: number
  under65Medicare: number
  medicaidChipMarketplace: number
  otherMandatory: number
  defenseDiscretionary: number
  nonDefenseDiscretionary: number
  newCohortPrefunding: number
}

export interface SimulationYear extends PrimaryComponents {
  year: number
  nominalGDP: number
  socialSecurityPrefunding: number
  fullSocialSecurityPrefundingCost: number
  socialSecurityPrefundedShare: number
  medicarePrefunding: number
  fullMedicarePrefundingCost: number
  avoidedSocialSecurityPaygo: number
  socialSecurityPrefundingDividend: number
  medicarePrefundedShare: number
  availableReformSavings: number
  unusedReformSavings: number
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
  cumulativeSocialSecurityPrefundingBillions: number
  cumulativeMedicarePrefundingBillions: number
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

export interface AnnualRevenuePathSolution {
  converged: boolean
  policyHorizonEndYear: number
  endpointDebtTargetGDP: number
  endpointDebtGDP: number
  startingRevenueRate: number
  openingFiscalAdjustmentGDP: number
  revenueDeclineYear: number | null
  nonIncreasing: boolean
  peakRevenueRate: number
  peakRevenueYear: number
  minimumRevenueRate: number
  minimumRevenueYear: number
  endpointRevenueRate: number
  peakDebtGDP: number
  peakDebtYear: number
  simulation: SimulationResult
}

export interface ScenarioResult {
  label: string
  assumptions: ModelAssumptions
  permanent: PermanentRateSolution
  revenuePath: AnnualRevenuePathSolution
  matureSystemYear: number
  transitionRunoffYears: {
    ninetyPercent: number
    ninetyFivePercent: number
    ninetyNinePercent: number
  }
  maturePrimarySpendingGDP: number
  matureNetInterestGDP: number
  matureTotalSpendingGDP: number
  endowment: EndowmentPerPerson
  firstPositiveSocialSecurityDividendYear: number | null
  firstMedicarePrefundingYear: number | null
  firstMedicarePrefundedEligibilityYear: number | null
  firstFullMedicarePrefundingYear: number | null
}

export interface PolicyHorizonResult {
  years: 30 | 50 | 70
  endYear: number
  baselines: Record<CurrentLawBaselineMode, PermanentRateSolution>
  scenarios: Record<FundingStrategy, PermanentRateSolution>
}

export interface CurrentLawBaselineResult {
  mode: CurrentLawBaselineMode
  label: string
  assumptions: ModelAssumptions
  permanent: PermanentRateSolution
  revenuePath: AnnualRevenuePathSolution
}

export interface ScenarioComparison {
  scenarios: Record<FundingStrategy, ScenarioResult>
  baselines: Record<CurrentLawBaselineMode, CurrentLawBaselineResult>
  paygo: ScenarioResult
  prefunded: ScenarioResult
  prefundingTransitionFinancingEffect: {
    permanentRateDifference: number
    peakRevenueRateDifference: number
    minimumRevenueRateDifference: number
  }
}
