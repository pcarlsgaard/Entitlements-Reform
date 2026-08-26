import { survivalProbability } from './mortality'
import {
  cboCalibrationNominalGDPBillions,
  cboCalibrationOtherOASDIGDP,
  cboSocialSecurityGDP,
} from '../data/cboBaseline'
import { defaultAssumptions } from './defaults'
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
  const firstRetirementYear =
    year - (assumptions.maxModeledAge - assumptions.fullRetirementAge)
  const inflationFactor =
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  const currentLawBenefit =
    assumptions.currentLawSSBenefit2026 *
    (1 + assumptions.currentLawSSBenefitRealGrowth) **
      (year - assumptions.reformYear) *
    inflationFactor
  const flatBenefit = flatBenefitReal(year, assumptions) * inflationFactor

  for (
    let retirementYear = firstRetirementYear;
    retirementYear <= year;
    retirementYear += 1
  ) {
    const age = assumptions.fullRetirementAge + year - retirementYear
    const survivalFraction = survivalProbability(
      assumptions.fullRetirementAge,
      age,
    )
    const initialCohortMillions = cohortSizeAtAgeMillions(
      retirementYear,
      assumptions.fullRetirementAge,
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
 * annual factor applies to every legacy cohort, preserving cohort shares and
 * mortality. The flat benefit remains the unscaled policy promise.
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
  const targetLegacyBillions =
    Math.max(
      0,
      cboSocialSecurityGDP(year) - cboCalibrationOtherOASDIGDP,
    ) * cboCalibrationNominalGDPBillions(year)
  const legacyScale =
    centralCurrentLaw.legacyBillions > 0
      ? targetLegacyBillions / centralCurrentLaw.legacyBillions
      : 1

  const cohorts = result.cohorts.map((cohort) => {
    const legacyPaygoBillions = cohort.legacyPaygoBillions * legacyScale
    return {
      ...cohort,
      legacyPaygoBillions,
      totalCohortSSSpendingBillions:
        legacyPaygoBillions + cohort.flatPaygoBillions,
    }
  })

  return {
    ...result,
    legacyBillions: result.legacyBillions * legacyScale,
    cohorts,
  }
}
