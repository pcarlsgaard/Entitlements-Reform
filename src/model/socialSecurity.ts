import { survivalProbability } from './mortality'
import { prefundsSocialSecurity } from './fundingStrategy'
import type {
  BenefitShares,
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
    prefundsSocialSecurity(assumptions.fundingStrategy) &&
    retirementYear >= firstPrefundedSSRetirementYear(assumptions)
  )
}

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

export function socialSecurityForYear(
  year: number,
  assumptions: ModelAssumptions,
): SocialSecurityYearResult {
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
    const initialCohortMillions = cohortSizeMillions(
      retirementYear,
      assumptions,
    )
    const survivingBeneficiariesMillions =
      initialCohortMillions * survivalFraction
    const { legacyShare, flatShare } = socialSecurityBenefitShares(
      retirementYear,
      assumptions,
    )
    const prefunded = isSSFlatComponentPrefunded(
      retirementYear,
      assumptions,
    )
    const legacyPaygoBillions =
      (survivingBeneficiariesMillions * legacyShare * currentLawBenefit) /
      1_000
    const flatBenefitBillions =
      (survivingBeneficiariesMillions * flatShare * flatBenefit) / 1_000
    const flatPaygoBillions = prefunded
      ? 0
      : flatBenefitBillions

    cohorts.push({
      retirementYear,
      initialCohortMillions,
      survivingBeneficiariesMillions,
      survivalFraction,
      legacyShare,
      flatShare,
      prefunded,
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
