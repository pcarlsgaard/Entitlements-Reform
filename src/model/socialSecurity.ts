import { survivalProbability } from './mortality'
import {
  cboBaselineEndYear,
  cboCalibrationNominalGDPBillions,
  cboCalibrationOtherOASDIGDP,
  cboSocialSecurityGDP,
} from '../data/cboBaseline'
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

/** Real growth affects new awards only. Existing awards receive inflation COLAs. */
export function legacySocialSecurityBenefitNominal(retirementYear: number, year: number,
  assumptions: ModelAssumptions): number {
  return assumptions.currentLawSSBenefit2026 *
    (1 + assumptions.currentLawSSBenefitRealGrowth) ** Math.max(0, retirementYear - assumptions.reformYear) *
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
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

/**
 * The cohort-size primitive is a birth-cohort calibration. Convert it to the
 * population reaching a later age with the same life table used everywhere
 * else in the model. The year index remains the year the cohort reaches the
 * modeled age, which keeps the first-pass cohort-growth assumption explicit
 * without pretending to have a historical birth series.
 */
export function cohortSizeAtAgeMillions(
  cohortEntryYear: number,
  age: number,
  assumptions: ModelAssumptions,
): number {
  return (
    cohortSizeMillions(cohortEntryYear, assumptions) *
    survivalProbability(0, age)
  )
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
  const inflationFactor =
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  const flatBenefit = flatBenefitReal(year, assumptions) * inflationFactor

  for (
    let age = assumptions.maxModeledAge;
    age >= Math.min(currentLawRetirementAge, assumptions.fullRetirementAge);
    age -= 1
  ) {
    const birthYear = year - age
    const alreadyRetired = assumptions.reformYear - birthYear >= currentLawRetirementAge
    const retirementAge = entitlementDesign === 'currentLaw' || alreadyRetired
      ? currentLawRetirementAge : assumptions.fullRetirementAge
    if (age < retirementAge) continue
    const retirementYear = birthYear + retirementAge
    const currentLawBenefit = legacySocialSecurityBenefitNominal(retirementYear, year, assumptions)
    const survivalFraction = survivalProbability(
      retirementAge,
      age,
    )
    const initialCohortMillions = cohortSizeAtAgeMillions(
      retirementYear,
      retirementAge,
      assumptions,
    )
    const survivingBeneficiariesMillions =
      initialCohortMillions * survivalFraction
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
      (survivingBeneficiariesMillions * flatShare * flatBenefit) / 1_000
    const flatPaygoBillions = flatBenefitBillions * (1 - prefundedShare)

    cohorts.push({
      birthYear,
      legacyBenefitPerPerson: currentLawBenefit,
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

/**
 * Calibrate the current-law-formula retirement slice to CBO's total Social
 * Security baseline less the separately shown other-OASDI component. The same
 * annual factor applies to the aggregate legacy ledger, preserving cohort shares
 * and mortality. It is not an individual benefit index: household checks use
 * legacyBenefitPerPerson before this fiscal allocation factor. The flat benefit
 * remains the unscaled policy promise.
 */
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
  const centralCurrentLaw = rawSocialSecurityForYear(
    year,
    defaultAssumptions,
    'currentLaw',
  )
  const calibrationYear = Math.min(year, cboBaselineEndYear)
  const targetLegacyBillions =
    Math.max(
      0,
      cboSocialSecurityGDP(calibrationYear) - cboCalibrationOtherOASDIGDP,
    ) * cboCalibrationNominalGDPBillions(calibrationYear)
  // Beyond CBO's published window, retain its last formula calibration and
  // let modeled cohort counts and the stated real benefit growth govern costs.
  const calibrationCurrentLaw = calibrationYear === year ? centralCurrentLaw :
    rawSocialSecurityForYear(calibrationYear, defaultAssumptions, 'currentLaw')
  const legacyScale =
    calibrationCurrentLaw.legacyBillions > 0
      ? targetLegacyBillions / calibrationCurrentLaw.legacyBillions
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
