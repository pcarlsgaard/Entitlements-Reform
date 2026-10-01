import { populationMillions, eligiblePopulationMillions, projectedSurvival } from './demographics'
import { actuarialClaimFactor, currentLawClaimFactor, representativeWorkCredits, workCreditFraction } from './claiming'
import { cboBaselineEndYear, cboCalibrationNominalGDPBillions, cboCalibrationOtherOASDIGDP, cboSocialSecurityGDP } from '../data/cboBaseline'
import { ssaOasdiCostGDP, ssaRetiredWorkerMillions } from '../data/trustees2026'
import { piaMultiplierAtPercentile, socialSecurityPIAQuantiles, ssaAverageMonthlyPIA2025, ssaMaximumMonthlyBenefitFRA2025 } from '../data/socialSecurityDistribution'
import { currentLawRetirementAge, defaultAssumptions } from './defaults'
import {
  fullyPrefundsSocialSecurity,
  usesSavingsFundedSequence,
} from './fundingStrategy'
import type {
  BenefitShares,
  EntitlementDesign,
  ModelAssumptions,
  SSCohortAudit,
  SocialSecurityYearResult,
} from './types'

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function socialSecurityBenefitShares(
  retirementYear: number,
  assumptions: ModelAssumptions,
): BenefitShares {
  if (assumptions.socialSecurityInitialBenefitMode !== 'flatTransition') {
    return { legacyShare: 1, flatShare: 0 }
  }
  const flatShare = clamp(
    (retirementYear - assumptions.reformYear) /
      assumptions.benefitPhaseInYears,
  )
  return { legacyShare: 1 - flatShare, flatShare }
}

export function flatBenefitReal(
  year: number,
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.individualFPL2026 *
    assumptions.flatBenefitFPLMultiple *
    (1 + assumptions.realFPLGrowth) ** (year - assumptions.reformYear)
  )
}

export function socialSecurityCOLARate(
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
): number {
  const current = Math.max(0, assumptions.inflation)
  if (entitlementDesign === 'currentLaw') return current
  switch (assumptions.socialSecurityCOLAMode) {
    case 'chainedCpi':
      return Math.max(0, current - 0.003)
    case 'cap':
      return Math.min(current, Math.max(0, assumptions.socialSecurityCOLACap))
    case 'custom':
      return Math.max(0, current + assumptions.socialSecurityCOLAAdjustment)
    default:
      return current
  }
}

function postAwardCOLAFactor(
  awardYear: number,
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign,
): number {
  const colaStartYear = Math.max(assumptions.reformYear, awardYear)
  if (year <= colaStartYear) return 1
  return (1 + socialSecurityCOLARate(assumptions, entitlementDesign)) ** (year - colaStartYear)
}

/** Real FPL growth affects new flat awards only; the selected COLA compounds after claiming. */
export function flatBenefitNominal(
  claimYear: number,
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
): number {
  const awardYear = Math.max(assumptions.reformYear, claimYear)
  const preAwardInflationYears = Math.max(0, Math.min(year, awardYear) - assumptions.reformYear)
  return flatBenefitReal(awardYear, assumptions) *
    (1 + assumptions.inflation) ** preAwardInflationYears *
    postAwardCOLAFactor(awardYear, year, assumptions, entitlementDesign)
}

const maximumPIAMultiplier =
  ssaMaximumMonthlyBenefitFRA2025 / ssaAverageMonthlyPIA2025

function ppiAdjustedPIAMultiplier(
  benefitMultiplier: number,
  percentile: number,
  eligibilityYear: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign,
): number {
  if (
    entitlementDesign === 'currentLaw' ||
    assumptions.socialSecurityInitialBenefitMode !== 'progressivePriceIndexing' ||
    eligibilityYear < assumptions.socialSecurityPPIStartYear
  ) return benefitMultiplier

  const threshold = clamp(assumptions.socialSecurityPPIThresholdPercentile, 0.01, 0.99)
  if (percentile <= threshold) return benefitMultiplier

  const thresholdMultiplier = piaMultiplierAtPercentile(threshold)
  const years = Math.max(0, eligibilityYear - assumptions.socialSecurityPPIStartYear + 1)
  const realAwardGrowth = Math.max(-0.99, assumptions.currentLawSSBenefitRealGrowth)
  const topPriceIndexedMultiplier =
    maximumPIAMultiplier / ((1 + realAwardGrowth) ** years)
  const upperSlope = maximumPIAMultiplier > thresholdMultiplier
    ? clamp(
        (topPriceIndexedMultiplier - thresholdMultiplier) /
          (maximumPIAMultiplier - thresholdMultiplier),
        0,
        1,
      )
    : 1
  return thresholdMultiplier +
    (benefitMultiplier - thresholdMultiplier) * upperSlope
}

function legacyBenefitAtQuantileNominal(
  retirementYear: number,
  claimYear: number,
  year: number,
  assumptions: ModelAssumptions,
  percentile: number,
  benefitMultiplier: number,
  entitlementDesign: EntitlementDesign,
): number {
  const policyStartYear = Math.max(assumptions.reformYear, claimYear)
  const prePolicyInflationYears = Math.max(0, policyStartYear - assumptions.reformYear)
  const averageAtPolicyStart = assumptions.currentLawSSBenefit2026 *
    (1 + assumptions.currentLawSSBenefitRealGrowth) **
      Math.max(0, retirementYear - assumptions.reformYear) *
    (1 + assumptions.inflation) ** prePolicyInflationYears

  // OASI eligibility starts at 62; retirementYear here is the age-67
  // current-law reference year used by the legacy award formula.
  const eligibilityYear = retirementYear - (currentLawRetirementAge - 62)
  const adjustedMultiplier = ppiAdjustedPIAMultiplier(
    benefitMultiplier,
    percentile,
    eligibilityYear,
    assumptions,
    entitlementDesign,
  )
  const benefitAtPolicyStart = averageAtPolicyStart * adjustedMultiplier
  if (year <= policyStartYear) return benefitAtPolicyStart

  const cola = socialSecurityCOLARate(assumptions, entitlementDesign)
  const colaYears = year - policyStartYear
  const fullCOLA = benefitAtPolicyStart * (1 + cola) ** colaYears

  const capPercentile = entitlementDesign === 'reform'
    ? assumptions.socialSecurityCOLADollarCapPercentile
    : null
  if (capPercentile === null) return fullCOLA

  const capP = clamp(capPercentile, 0.01, 0.99)
  const capMultiplier = ppiAdjustedPIAMultiplier(
    piaMultiplierAtPercentile(capP),
    capP,
    eligibilityYear,
    assumptions,
    entitlementDesign,
  )
  const capBenefitAtPolicyStart = averageAtPolicyStart * capMultiplier
  if (benefitAtPolicyStart <= capBenefitAtPolicyStart) return fullCOLA

  // CRFB-style dollar cap: the annual increase for a higher-benefit worker
  // cannot exceed the dollar COLA received at the selected PIA percentile.
  // The aggregate engine applies the percentile within each eligibility cohort.
  return benefitAtPolicyStart +
    capBenefitAtPolicyStart * ((1 + cola) ** colaYears - 1)
}

/**
 * Average annual legacy retired-worker benefit. The distributional calculation
 * uses SSA's 2025 retired-worker PIA award distribution so PPI and dollar-COLA
 * caps act on benefit ranks rather than on a single representative benefit.
 */
export function legacySocialSecurityBenefitNominal(
  retirementYear: number,
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
  claimYear: number = retirementYear,
): number {
  const needsDistribution =
    entitlementDesign === 'reform' &&
    (assumptions.socialSecurityInitialBenefitMode === 'progressivePriceIndexing' ||
      assumptions.socialSecurityCOLADollarCapPercentile !== null)

  if (!needsDistribution) {
    const policyStartYear = Math.max(assumptions.reformYear, claimYear)
    const prePolicyInflationYears = Math.max(
      0,
      Math.min(year, policyStartYear) - assumptions.reformYear,
    )
    const benefitAtPolicyStart = assumptions.currentLawSSBenefit2026 *
      (1 + assumptions.currentLawSSBenefitRealGrowth) **
        Math.max(0, retirementYear - assumptions.reformYear) *
      (1 + assumptions.inflation) ** prePolicyInflationYears
    if (year <= policyStartYear) return benefitAtPolicyStart
    return benefitAtPolicyStart *
      (1 + socialSecurityCOLARate(assumptions, entitlementDesign)) **
        (year - policyStartYear)
  }

  return socialSecurityPIAQuantiles.reduce(
    (sum, quantile) => sum + quantile.share * legacyBenefitAtQuantileNominal(
      retirementYear,
      claimYear,
      year,
      assumptions,
      quantile.percentileMidpoint,
      quantile.benefitMultiplier,
      entitlementDesign,
    ),
    0,
  )
}

export function firstPrefundedSSRetirementYear(
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.reformYear +
    assumptions.fullRetirementAge -
    assumptions.prefundingStartAge
  )
}

export function isSSFlatComponentPrefunded(
  retirementYear: number,
  assumptions: ModelAssumptions,
): boolean {
  return (
    fullyPrefundsSocialSecurity(assumptions.fundingStrategy) &&
    retirementYear >= firstPrefundedSSRetirementYear(assumptions)
  )
}

export type SocialSecurityPrefundedShareResolver = (
  retirementYear: number,
) => number

export function cohortSizeMillions(
  cohortEntryYear: number,
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.cohortSizeMillions2026 *
    (1 + assumptions.cohortSizeGrowth) **
      (cohortEntryYear - assumptions.reformYear)
  )
}

/** SSA population reaching the selected age in this year, with explicit scenario scaling. */
export function cohortSizeAtAgeMillions(
  cohortEntryYear: number,
  age: number,
  assumptions: ModelAssumptions,
): number {
  return populationMillions(cohortEntryYear, age, assumptions)
}

function rawSocialSecurityForYear(
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
  resolvePrefundedShare?: SocialSecurityPrefundedShareResolver,
): SocialSecurityYearResult {
  if (
    entitlementDesign === 'reform' &&
    usesSavingsFundedSequence(assumptions.fundingStrategy) &&
    !resolvePrefundedShare
  ) {
    throw new Error(
      'Savings-funded Social Security financing requires its cohort funding schedule.',
    )
  }
  const cohorts: SSCohortAudit[] = []
  const beneficiaryGrowthAdjustment = retiredWorkerGrowthAdjustment(year)

  for (
    let age = assumptions.maxModeledAge;
    age >= 62;
    age -= 1
  ) {
    const birthYear = year - age
    const alreadyRetired = assumptions.reformYear - birthYear >= currentLawRetirementAge
    const retirementAge = entitlementDesign === 'currentLaw' || alreadyRetired
      ? currentLawRetirementAge : assumptions.socialSecurityClaimAge
    if (age < retirementAge) continue
    // Reference cohort date locks the transition blend independently of claiming.
    const retirementYear = birthYear + (entitlementDesign === 'currentLaw' || alreadyRetired
      ? currentLawRetirementAge : assumptions.fullRetirementAge)
    const claimYear = birthYear + retirementAge
    const legacyFra = entitlementDesign === 'currentLaw' ||
      assumptions.socialSecurityInitialBenefitMode === 'flatTransition'
      ? currentLawRetirementAge
      : assumptions.fullRetirementAge
    const currentLawBenefit = legacySocialSecurityBenefitNominal(
      birthYear + currentLawRetirementAge,
      year,
      assumptions,
      entitlementDesign,
      claimYear,
    ) * currentLawClaimFactor(retirementAge, legacyFra)
    const survivalFraction = projectedSurvival(retirementAge, age, birthYear)
    const survivingBeneficiariesMillions =
      populationMillions(year, age, assumptions) * ssParticipation * beneficiaryGrowthAdjustment
    const initialCohortMillions = survivalFraction > 0 ? survivingBeneficiariesMillions / survivalFraction : 0
    const individualFlatBenefit = flatBenefitNominal(
      claimYear,
      year,
      assumptions,
      entitlementDesign,
    ) * actuarialClaimFactor(birthYear, retirementAge, assumptions) *
      workCreditFraction(representativeWorkCredits(assumptions), assumptions)
    const { legacyShare, flatShare } =
      entitlementDesign === 'currentLaw'
        ? { legacyShare: 1, flatShare: 0 }
        : socialSecurityBenefitShares(retirementYear, assumptions)
    const prefundedShare = clamp(
      entitlementDesign === 'currentLaw'
        ? 0
        : resolvePrefundedShare
          ? resolvePrefundedShare(retirementYear)
          : isSSFlatComponentPrefunded(retirementYear, assumptions)
            ? 1
            : 0,
    )
    const prefunded = prefundedShare > 0
    const legacyPaygoBillions =
      (survivingBeneficiariesMillions * legacyShare * currentLawBenefit) /
      1_000
    const flatBenefitBillions =
      (survivingBeneficiariesMillions * flatShare * individualFlatBenefit) / 1_000
    const flatPaygoBillions = flatBenefitBillions * (1 - prefundedShare)

    cohorts.push({
      birthYear,
      legacyBenefitPerPerson: currentLawBenefit,
      flatBenefitPerPerson: individualFlatBenefit,
      claimAge: retirementAge,
      claimYear,
      retirementYear,
      initialCohortMillions,
      survivingBeneficiariesMillions,
      survivalFraction,
      legacyShare,
      flatShare,
      prefunded,
      prefundedShare,
      legacyPaygoBillions,
      flatBenefitBillions,
      flatPaygoBillions,
      totalCohortSSSpendingBillions:
        legacyPaygoBillions + flatPaygoBillions,
    })
  }

  return {
    legacyBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.legacyPaygoBillions,
      0,
    ),
    flatBenefitBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.flatBenefitBillions,
      0,
    ),
    flatPaygoBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.flatPaygoBillions,
      0,
    ),
    cohorts,
  }
}

// One opening beneficiary calibration, shared by legacy and flat benefits. Never
// recalibrate one benefit formula to future CBO totals independently of the other.
export const ssParticipation = ((cboSocialSecurityGDP(2026) - cboCalibrationOtherOASDIGDP) *
  cboCalibrationNominalGDPBillions(2026)) /
  (eligiblePopulationMillions(2026, 67, defaultAssumptions) * defaultAssumptions.currentLawSSBenefit2026 / 1000)

function retiredWorkerGrowthAdjustment(year: number): number {
  const trusteesIndex = ssaRetiredWorkerMillions(year) / ssaRetiredWorkerMillions(2026)
  const populationIndex = eligiblePopulationMillions(year, 67, defaultAssumptions) /
    eligiblePopulationMillions(2026, 67, defaultAssumptions)
  return trusteesIndex / populationIndex
}

function scheduledSocialSecurityGDP(year: number): number {
  if (year <= cboBaselineEndYear) return cboSocialSecurityGDP(year)
  // CBO and SSA use different economic baselines. Bridge smoothly from CBO's
  // final published year to the Trustees level, then use Trustees directly.
  if (year < 2060) {
    const t = (year - cboBaselineEndYear) / (2060 - cboBaselineEndYear)
    return cboSocialSecurityGDP(cboBaselineEndYear) +
      t * (ssaOasdiCostGDP(2060) - cboSocialSecurityGDP(cboBaselineEndYear))
  }
  return ssaOasdiCostGDP(year)
}

const centralCurrentLawLegacyCache = new Map<number, number>()
function centralCurrentLawLegacyBillions(year: number): number {
  const cached = centralCurrentLawLegacyCache.get(year)
  if (cached !== undefined) return cached
  const value = rawSocialSecurityForYear(year, defaultAssumptions, 'currentLaw').legacyBillions
  centralCurrentLawLegacyCache.set(year, value)
  return value
}

export function socialSecurityForYear(
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
  resolvePrefundedShare?: SocialSecurityPrefundedShareResolver,
): SocialSecurityYearResult {
  const result = rawSocialSecurityForYear(
    year,
    assumptions,
    entitlementDesign,
    resolvePrefundedShare,
  )
  const centralLegacyBillions = centralCurrentLawLegacyBillions(year)
  const targetLegacyBillions = Math.max(
    0,
    scheduledSocialSecurityGDP(year) - cboCalibrationOtherOASDIGDP,
  ) * cboCalibrationNominalGDPBillions(year)
  const legacyScale = centralLegacyBillions > 0
    ? targetLegacyBillions / centralLegacyBillions
    : 1

  const cohorts = result.cohorts.map((cohort) => {
    const uncappedLegacy = cohort.legacyPaygoBillions * legacyScale
    const uncappedTotal = uncappedLegacy + cohort.flatBenefitBillions
    const capBillions = entitlementDesign === 'reform' && assumptions.socialSecurityBenefitCap2026 !== null
      ? assumptions.socialSecurityBenefitCap2026 *
        (1 + assumptions.inflation) ** (year - assumptions.reformYear) *
        cohort.survivingBeneficiariesMillions / 1_000
      : Number.POSITIVE_INFINITY
    const capScale = uncappedTotal > 0 ? Math.min(1, capBillions / uncappedTotal) : 1
    const legacyPaygoBillions = uncappedLegacy * capScale
    const flatBenefitBillions = cohort.flatBenefitBillions * capScale
    const flatPaygoBillions = cohort.flatPaygoBillions * capScale
    return {
      ...cohort,
      legacyPaygoBillions,
      flatBenefitBillions,
      flatPaygoBillions,
      totalCohortSSSpendingBillions:
        legacyPaygoBillions + flatPaygoBillions,
    }
  })

  return {
    ...result,
    legacyBillions: cohorts.reduce((sum, cohort) => sum + cohort.legacyPaygoBillions, 0),
    flatBenefitBillions: cohorts.reduce((sum, cohort) => sum + cohort.flatBenefitBillions, 0),
    flatPaygoBillions: cohorts.reduce((sum, cohort) => sum + cohort.flatPaygoBillions, 0),
    cohorts,
  }
}
