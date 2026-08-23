import { survivalProbability } from './mortality'
import {
  fullyPrefundsMedicare,
  usesCohortFundingSchedule,
} from './fundingStrategy'
import { clamp, cohortSizeAtAgeMillions } from './socialSecurity'
import type {
  EntitlementDesign,
  MedicareYearResult,
  ModelAssumptions,
} from './types'

export type MedicarePrefundedShareResolver = (
  eligibilityYear: number,
) => number

export function firstPrefundedMedicareEligibilityYear(
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.reformYear +
    assumptions.medicareEligibilityAge -
    assumptions.prefundingStartAge
  )
}

export function newEntrantPremiumSupportShare(
  eligibilityYear: number,
  assumptions: ModelAssumptions,
): number {
  if (eligibilityYear >= assumptions.medicareYearA) return 1
  if (eligibilityYear <= assumptions.reformYear) return 0
  return clamp(
    (eligibilityYear - assumptions.reformYear) /
      (assumptions.medicareYearA - assumptions.reformYear),
  )
}

export function medicarePremiumSupportShare(
  eligibilityYear: number,
  auditYear: number,
  assumptions: ModelAssumptions,
): number {
  if (auditYear >= assumptions.medicareYearB) return 1
  const entrantShare = newEntrantPremiumSupportShare(
    eligibilityYear,
    assumptions,
  )
  if (auditYear <= assumptions.medicareYearA) return entrantShare
  const existingBeneficiaryConversion = clamp(
    (auditYear - assumptions.medicareYearA) /
      (assumptions.medicareYearB - assumptions.medicareYearA),
  )
  return Math.max(entrantShare, existingBeneficiaryConversion)
}

export function isMedicareComponentPrefunded(
  eligibilityYear: number,
  assumptions: ModelAssumptions,
): boolean {
  return (
    fullyPrefundsMedicare(assumptions.fundingStrategy) &&
    eligibilityYear >= firstPrefundedMedicareEligibilityYear(assumptions)
  )
}

export function medicareForYear(
  year: number,
  assumptions: ModelAssumptions,
  resolvePrefundedShare?: MedicarePrefundedShareResolver,
  entitlementDesign: EntitlementDesign = 'reform',
): MedicareYearResult {
  if (
    entitlementDesign === 'reform' &&
    usesCohortFundingSchedule(assumptions.fundingStrategy) &&
    !resolvePrefundedShare
  ) {
    throw new Error(
      'Sequential Medicare financing requires its cohort funding schedule.',
    )
  }
  const cohorts: MedicareYearResult['cohorts'] = []
  const firstEligibilityYear =
    year - (assumptions.maxModeledAge - assumptions.medicareEligibilityAge)
  const inflationFactor =
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  const legacyCost =
    assumptions.legacyMedicareCost2026 *
    (1 + assumptions.legacyMedicareRealGrowth) **
      (year - assumptions.reformYear) *
    inflationFactor
  const premiumSupport =
    assumptions.premiumSupport2026 *
    (1 + assumptions.premiumSupportRealGrowth) **
      (year - assumptions.reformYear) *
    inflationFactor

  for (
    let eligibilityYear = firstEligibilityYear;
    eligibilityYear <= year;
    eligibilityYear += 1
  ) {
    const age = assumptions.medicareEligibilityAge + year - eligibilityYear
    const survivalFraction = survivalProbability(
      assumptions.medicareEligibilityAge,
      age,
    )
    const initialCohortMillions = cohortSizeAtAgeMillions(
      eligibilityYear,
      assumptions.medicareEligibilityAge,
      assumptions,
    )
    const survivingBeneficiariesMillions =
      initialCohortMillions * survivalFraction
    const premiumSupportShare =
      entitlementDesign === 'currentLaw'
        ? 0
        : medicarePremiumSupportShare(eligibilityYear, year, assumptions)
    const legacyShare = 1 - premiumSupportShare
    const prefundedShare = clamp(
      entitlementDesign === 'currentLaw'
        ? 0
        : resolvePrefundedShare
          ? resolvePrefundedShare(eligibilityYear)
          : isMedicareComponentPrefunded(eligibilityYear, assumptions)
            ? 1
            : 0,
    )

    cohorts.push({
      eligibilityYear,
      premiumSupportShare,
      legacyShare,
      initialCohortMillions,
      survivingBeneficiariesMillions,
      prefundedShare,
      legacyBillions:
        (survivingBeneficiariesMillions * legacyShare * legacyCost) / 1_000,
      premiumSupportPaygoBillions:
        (survivingBeneficiariesMillions *
          premiumSupportShare *
          premiumSupport *
          (1 - prefundedShare)) /
        1_000,
    })
  }

  return {
    legacyBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.legacyBillions,
      0,
    ),
    premiumSupportPaygoBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.premiumSupportPaygoBillions,
      0,
    ),
    cohorts,
  }
}
