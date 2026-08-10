import { medicarePremiumSupportShare } from './medicare'
import { survivalProbability } from './mortality'
import {
  cohortSizeMillions,
  flatBenefitReal,
  socialSecurityBenefitShares,
} from './socialSecurity'
import type { EndowmentPerPerson, ModelAssumptions } from './types'

export function calculateEndowmentPerPerson(
  assumptions: ModelAssumptions,
  fundingYear = assumptions.reformYear,
): EndowmentPerPerson {
  const fundingAge = assumptions.prefundingStartAge
  const ssRetirementYear =
    fundingYear + assumptions.fullRetirementAge - fundingAge
  const medicareEligibilityYear =
    fundingYear + assumptions.medicareEligibilityAge - fundingAge
  const ssFlatShare = socialSecurityBenefitShares(
    ssRetirementYear,
    assumptions,
  ).flatShare
  let socialSecurityPV = 0
  let medicarePV = 0

  for (
    let age = assumptions.fullRetirementAge;
    age <= assumptions.maxModeledAge;
    age += 1
  ) {
    const paymentYear = fundingYear + age - fundingAge
    const survival = survivalProbability(fundingAge, age)
    const discount =
      (1 + assumptions.realEndowmentYield) ** (age - fundingAge)
    socialSecurityPV +=
      (survival * flatBenefitReal(paymentYear, assumptions) * ssFlatShare) /
      discount
  }

  for (
    let age = assumptions.medicareEligibilityAge;
    age <= assumptions.maxModeledAge;
    age += 1
  ) {
    const paymentYear = fundingYear + age - fundingAge
    const survival = survivalProbability(fundingAge, age)
    const discount =
      (1 + assumptions.realEndowmentYield) ** (age - fundingAge)
    const supportShare = medicarePremiumSupportShare(
      medicareEligibilityYear,
      paymentYear,
      assumptions,
    )
    const realPremiumSupport =
      assumptions.premiumSupport2026 *
      (1 + assumptions.premiumSupportRealGrowth) **
        (paymentYear - assumptions.reformYear)
    medicarePV +=
      (survival * realPremiumSupport * supportShare) / discount
  }

  return {
    socialSecurityPV,
    medicarePV,
    totalPV: socialSecurityPV + medicarePV,
  }
}

export function annualPrefundingBillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  if (!assumptions.prefundingEnabled) return 0
  const endowment = calculateEndowmentPerPerson(assumptions, year)
  const cohortMillions = cohortSizeMillions(year, assumptions)
  const inflationFactor =
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  return (endowment.totalPV * cohortMillions * inflationFactor) / 1_000
}
