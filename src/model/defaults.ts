import ssaProjections from '../data/ssaProjections.json'
import type { ModelAssumptions } from './types'
// Reference age for the simplified current-law benefit formula.
export const currentLawRetirementAge = 67
import {
  cboCalibrationOtherOASDIGDP,
  cboCalibrationUnder65MedicareGDP,
  cbo2026DebtHeldByPublicGDP,
  cbo2026NominalGDPBillions,
  cbo2026NetInterestGDP,
} from '../data/cboBaseline'

export const defaultAssumptions: ModelAssumptions = {
  reformYear: 2026,
  // Keep the actuarial extension visible while scoring the fiscal objective
  // at a separate, clearly marked policy horizon.
  endYear: 2160,
  maxModeledAge: 110,
  flatBenefitTransitionEnabled: true,
  benefitPhaseInYears: 20,
  flatBenefitFPLMultiple: 1.25,
  individualFPL2026: 15_960,
  realFPLGrowth: 0,
  socialSecurityRetirementAgeReformEnabled: true,
  fullRetirementAge: 70,
  socialSecurityCOLAIndex: 'cpiW',
  socialSecurityCOLAStartYear: 2027,
  socialSecurityCOLACapProtectedBenefit2026: null,
  socialSecurityCOLACapIndexing: 'wage',
  socialSecurityBenefitCap2026: null,
  socialSecurityBenefitCapIndexing: 'cpi',
  vestingYears: 35,
  socialSecurityClaimAge: 70,
  qualifyingEarnings2026: 7_560,
  averageWorkingYears: 35,
  averageAnnualEarnings2026: 50_000,
  actuarialDiscountRate: 0.023,
  medicareFundingMode: 'gdpShare',
  medicareSupportGDPShare: 19_000 * (ssaProjections.population[0]!.slice(65).reduce((sum, n) => sum + n, 0) / 1e6) /
    (1000 * cbo2026NominalGDPBillions),
  nonDefenseDiscretionaryMode: 'cbo',
  currentLawSSBenefit2026: 24_500,
  // 2026 OASDI Trustees intermediate long-run real covered-wage growth.
  currentLawSSBenefitRealGrowth: 0.0114,
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
  startingNominalGDPBillions: cbo2026NominalGDPBillions,
  realGDPGrowth: 0.018,
  // Additive annual deviation from the pinned 2026 Trustees real-wage path.
  realWageGrowthDeviation: 0,
  inflation: 0.02,
  startingDebtGDP: cbo2026DebtHeldByPublicGDP,
  baselineRealMarketRate: 0.023,
  startingEffectiveNominalRate:
    cbo2026NetInterestGDP / cbo2026DebtHeldByPublicGDP,
  debtSensitivity: 0.02,
  debtRatePassThrough: 0.15,
  otherOASDIGDP: cboCalibrationOtherOASDIGDP,
  under65MedicareGDP: cboCalibrationUnder65MedicareGDP,
  nonDefenseDiscretionaryGDP2026: 0.03121,
  // The central path uses CBO's published NDD shares. This value is used when
  // the user deliberately substitutes an independent NDD growth path.
  nonDefenseDiscretionaryRealGrowth: 0.018,
  otherMandatoryGDP2026: 0.02994,
  policyHorizonYears: 70,
  policyHorizonDebtTargetGDP: 1.01,
  debtPaydownTargetGDP: 0.40,
  // Default: balance the total budget once reached and let GDP growth reduce debt/GDP.
  debtPaydownSurplusCapGDP: 0,
  peakDebtCeilingGDP: 1.5,
}

export function withAssumptions(
  overrides: Partial<ModelAssumptions>,
): ModelAssumptions {
  return { ...defaultAssumptions, ...overrides }
}
