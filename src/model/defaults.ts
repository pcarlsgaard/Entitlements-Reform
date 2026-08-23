import type { ModelAssumptions } from './types'

export const defaultAssumptions: ModelAssumptions = {
  reformYear: 2026,
  // Keep the actuarial extension visible while scoring the fiscal objective
  // at a separate, clearly marked policy horizon.
  endYear: 2160,
  maxModeledAge: 110,
  benefitPhaseInYears: 20,
  flatBenefitFPLMultiple: 1.25,
  individualFPL2026: 15_960,
  realFPLGrowth: 0,
  fullRetirementAge: 70,
  vestingYears: 35,
  currentLawSSBenefit2026: 24_500,
  currentLawSSBenefitRealGrowth: 0.005,
  fundingStrategy: 'both',
  prefundingStartAge: 18,
  realEndowmentYield: 0.025,
  medicareEligibilityAge: 65,
  premiumSupport2026: 19_000,
  premiumSupportRealGrowth: 0.01,
  legacyMedicareCost2026: 19_000,
  legacyMedicareRealGrowth: 0.015,
  // 2026 Medicare Trustees Report's 2025 per-enrollee Part A benefit divided
  // by the sum of Parts A, B, and D benefits: $6,344 / $18,650.
  legacyMedicareHIShare2026: 6_344 / 18_650,
  medicareYearA: 2030,
  medicareYearB: 2035,
  cohortSizeMillions2026: 4.2,
  cohortSizeGrowth: 0.002,
  startingNominalGDPBillions: 31_800,
  realGDPGrowth: 0.018,
  inflation: 0.02,
  startingDebtGDP: 1.01,
  baselineRealMarketRate: 0.023,
  startingEffectiveNominalRate: 0.033 / 1.01,
  debtSensitivity: 0.02,
  debtRatePassThrough: 0.15,
  otherOASDIGDP: 0.01,
  under65MedicareGDP: 0.006,
  nonDefenseDiscretionaryGDP2026: 0.031,
  // Matching NDD real growth to GDP holds its baseline share constant until
  // the user deliberately applies a different discretionary-growth path.
  nonDefenseDiscretionaryRealGrowth: 0.018,
  // Residual calibrated after the explicit 2026 components so scheduled
  // current-law primary spending is approximately CBO's 20.0% of GDP.
  otherPrimaryGDP: 0.07235,
  policyHorizonYears: 70,
  policyHorizonDebtTargetGDP: 1.01,
  peakDebtCeilingGDP: 1.5,
}

export function withAssumptions(
  overrides: Partial<ModelAssumptions>,
): ModelAssumptions {
  return { ...defaultAssumptions, ...overrides }
}
