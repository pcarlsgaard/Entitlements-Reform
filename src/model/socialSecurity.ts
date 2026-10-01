import { populationMillions, eligiblePopulationMillions, projectedSurvival } from './demographics'
import { actuarialClaimFactor, currentLawClaimFactor, representativeWorkCredits, workCreditFraction } from './claiming'
import { cboBaselineEndYear, cboCalibrationNominalGDPBillions, cboCalibrationOtherOASDIGDP, cboSocialSecurityGDP } from '../data/cboBaseline'
import { ssaOasdiCostGDP, ssaRetiredWorkerMillions } from '../data/trustees2026'
import { currentLawRetirementAge, defaultAssumptions } from './defaults'
import { relativeBenefitAtPercentile, socialSecurityBenefitBins } from './socialSecurityDistribution'
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

function ppiGrowthMultiplier(
  percentile: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign,
): number {
  if (
    entitlementDesign === 'currentLaw' ||
    assumptions.socialSecurityInitialBenefitMode !== 'progressivePriceIndexing'
  ) return 1
  const protectedPercentile = clamp(assumptions.socialSecurityPPIProtectedPercentile, 0, 0.95)
  if (percentile <= protectedPercentile) return 1
  return clamp((1 - percentile) / Math.max(1e-9, 1 - protectedPercentile))
}

function legacyBenefitAtCOLAStart(
  retirementYear: number,
  claimYear: number,
  percentile: number,
  relativeBenefit: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign,
): number {
  const colaStartYear = Math.max(assumptions.reformYear, claimYear)
  const preAwardInflationYears = Math.max(0, colaStartYear - assumptions.reformYear)
  const realGrowth = assumptions.currentLawSSBenefitRealGrowth *
    ppiGrowthMultiplier(percentile, assumptions, entitlementDesign)
  return assumptions.currentLawSSBenefit2026 *
    relativeBenefit *
    (1 + realGrowth) ** Math.max(0, retirementYear - assumptions.reformYear) *
    (1 + assumptions.inflation) ** preAwardInflationYears
}

/**
 * Earnings-related retired-worker benefit. Progressive price indexing changes
 * growth of new awards above the protected percentile. A CRFB-style percentile
 * COLA cap limits the annual dollar increase, not the percentage COLA.
 */
export function legacySocialSecurityBenefitNominal(
  retirementYear: number,
  claimYear: number,
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
): number {
  const colaStartYear = Math.max(assumptions.reformYear, claimYear)
  const yearsAfterCOLAStart = Math.max(0, year - colaStartYear)
  const colaFactor = (1 + socialSecurityCOLARate(assumptions, entitlementDesign)) ** yearsAfterCOLAStart
  const dollarCapPercentile = entitlementDesign === 'reform'
    ? assumptions.socialSecurityDollarCOLACapPercentile
    : null
  const usesDistribution =
    entitlementDesign === 'reform' &&
    (assumptions.socialSecurityInitialBenefitMode === 'progressivePriceIndexing' ||
      dollarCapPercentile !== null)

  // Keep the common current-law/flat-transition path scalar. The distribution
  // is needed only for rank-targeted PPI or dollar-COLA caps.
  if (!usesDistribution) {
    return legacyBenefitAtCOLAStart(
      retirementYear,
      claimYear,
      0.5,
      1,
      assumptions,
      entitlementDesign,
    ) * colaFactor
  }

  const referenceInitial = dollarCapPercentile === null
    ? Number.POSITIVE_INFINITY
    : legacyBenefitAtCOLAStart(
        retirementYear,
        claimYear,
        dollarCapPercentile,
        relativeBenefitAtPercentile(dollarCapPercentile),
        assumptions,
        entitlementDesign,
      )

  return socialSecurityBenefitBins.reduce((sum, bin) => {
    const initial = legacyBenefitAtCOLAStart(
      retirementYear,
      claimYear,
      bin.percentileMidpoint,
      bin.relativeBenefit,
      assumptions,
      entitlementDesign,
    )
    const indexed = dollarCapPercentile === null || initial <= referenceInitial
      ? initial * colaFactor
      : initial + referenceInitial * (colaFactor - 1)
    return sum + bin.share * indexed
  }, 0)
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
    assumptions.socialSecurityInitialBenefitMode === 'flatTransition' &&
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
    // Flat-transition cohorts lock their blend at the flat-benefit reference age.
    // Other earnings-related reforms use the selected reform FRA as their reference.
    const reformReferenceAge = assumptions.socialSecurityInitialBenefitMode === 'flatTransition'
      ? assumptions.fullRetirementAge
      : assumptions.socialSecurityReformFRA
    const retirementYear = birthYear + (entitlementDesign === 'currentLaw' || alreadyRetired
      ? currentLawRetirementAge : reformReferenceAge)
    const claimYear = birthYear + retirementAge
    const claimAgeForAdjustment = entitlementDesign === 'currentLaw' || alreadyRetired
      ? retirementAge
      : retirementAge - (assumptions.socialSecurityReformFRA - currentLawRetirementAge)
    const currentLawBenefit = legacySocialSecurityBenefitNominal(
      birthYear + currentLawRetirementAge,
      claimYear,
      year,
      assumptions,
      entitlementDesign,
    ) * currentLawClaimFactor(claimAgeForAdjustment)
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
