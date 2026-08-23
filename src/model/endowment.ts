import { medicareForYear, medicarePremiumSupportShare } from './medicare'
import { survivalProbability } from './mortality'
import {
  fullyPrefundsMedicare,
  fullyPrefundsSocialSecurity,
  prefundsSocialSecurity,
  usesSavingsFundedSequence,
  usesSocialSecurityDividend,
} from './fundingStrategy'
import {
  cohortSizeAtAgeMillions,
  flatBenefitReal,
  socialSecurityBenefitShares,
  socialSecurityForYear,
} from './socialSecurity'
import type {
  AnnualFundingPlan,
  EndowmentPerPerson,
  ModelAssumptions,
} from './types'

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
  return annualFundingPlan(year, assumptions).totalPrefunding
}

const fundingPlanCache = new WeakMap<
  ModelAssumptions,
  ReadonlyMap<number, AnnualFundingPlan>
>()

function fullSleevePrefundingBillions(
  year: number,
  assumptions: ModelAssumptions,
): { socialSecurity: number; medicare: number } {
  const endowment = calculateEndowmentPerPerson(assumptions, year)
  const cohortMillions = cohortSizeAtAgeMillions(
    year,
    assumptions.prefundingStartAge,
    assumptions,
  )
  const inflationFactor =
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  return {
    socialSecurity:
      (endowment.socialSecurityPV * cohortMillions * inflationFactor) /
      1_000,
    medicare:
      (endowment.medicarePV * cohortMillions * inflationFactor) / 1_000,
  }
}

function scheduledCurrentLawBenefitSpending(
  year: number,
  assumptions: ModelAssumptions,
): number {
  const socialSecurity = socialSecurityForYear(
    year,
    assumptions,
    'currentLaw',
  )
  const medicare = medicareForYear(
    year,
    assumptions,
    undefined,
    'currentLaw',
  )
  return socialSecurity.legacyBillions + medicare.legacyBillions
}

function reformPaygoBenefitSpending(
  year: number,
  assumptions: ModelAssumptions,
): number {
  const paygoAssumptions: ModelAssumptions = {
    ...assumptions,
    fundingStrategy: 'paygo',
  }
  const socialSecurity = socialSecurityForYear(year, paygoAssumptions)
  const medicare = medicareForYear(year, paygoAssumptions)
  return (
    socialSecurity.legacyBillions +
    socialSecurity.flatPaygoBillions +
    medicare.legacyBillions +
    medicare.premiumSupportPaygoBillions
  )
}

export function benefitDesignSavingsBillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  return Math.max(
    0,
    scheduledCurrentLawBenefitSpending(year, assumptions) -
      reformPaygoBenefitSpending(year, assumptions),
  )
}

function socialSecurityPrefundedShareForRetirementYear(
  retirementYear: number,
  assumptions: ModelAssumptions,
  plan: ReadonlyMap<number, AnnualFundingPlan>,
): number {
  const fundingYear =
    retirementYear -
    (assumptions.fullRetirementAge - assumptions.prefundingStartAge)
  return plan.get(fundingYear)?.socialSecurityPrefundedShare ?? 0
}

function buildFundingPlan(
  assumptions: ModelAssumptions,
): ReadonlyMap<number, AnnualFundingPlan> {
  const plan = new Map<number, AnnualFundingPlan>()

  for (
    let year = assumptions.reformYear;
    year <= assumptions.endYear;
    year += 1
  ) {
    const full = fullSleevePrefundingBillions(year, assumptions)
    const availableReformSavings = usesSavingsFundedSequence(
      assumptions.fundingStrategy,
    )
      ? benefitDesignSavingsBillions(year, assumptions)
      : 0
    const socialSecurityPrefunding = usesSavingsFundedSequence(
      assumptions.fundingStrategy,
    )
      ? Math.min(availableReformSavings, full.socialSecurity)
      : fullyPrefundsSocialSecurity(assumptions.fundingStrategy)
        ? full.socialSecurity
        : 0
    const socialSecurityPrefundedShare =
      full.socialSecurity > 0
        ? socialSecurityPrefunding / full.socialSecurity
        : 0
    const socialSecurity = socialSecurityForYear(
      year,
      assumptions,
      'reform',
      usesSavingsFundedSequence(assumptions.fundingStrategy)
        ? (retirementYear) =>
            socialSecurityPrefundedShareForRetirementYear(
              retirementYear,
              assumptions,
              plan,
            )
        : undefined,
    )
    const avoidedSocialSecurityPaygo = prefundsSocialSecurity(
      assumptions.fundingStrategy,
    )
      ? socialSecurity.flatBenefitBillions -
        socialSecurity.flatPaygoBillions
      : 0
    const socialSecurityPrefundingDividend = prefundsSocialSecurity(
      assumptions.fundingStrategy,
    )
      ? avoidedSocialSecurityPaygo - socialSecurityPrefunding
      : 0
    const savingsRemainingAfterSocialSecurity = Math.max(
      0,
      availableReformSavings - socialSecurityPrefunding,
    )
    const medicarePrefunding = usesSavingsFundedSequence(
      assumptions.fundingStrategy,
    )
      ? Math.min(full.medicare, savingsRemainingAfterSocialSecurity)
      : fullyPrefundsMedicare(assumptions.fundingStrategy)
        ? full.medicare
        : usesSocialSecurityDividend(assumptions.fundingStrategy)
          ? Math.min(
              full.medicare,
              Math.max(0, socialSecurityPrefundingDividend),
            )
          : 0
    const medicarePrefundedShare =
      full.medicare > 0 ? medicarePrefunding / full.medicare : 0

    plan.set(year, {
      year,
      fullSocialSecurityPrefundingCost: full.socialSecurity,
      socialSecurityPrefunding,
      socialSecurityPrefundedShare,
      fullMedicarePrefundingCost: full.medicare,
      medicarePrefunding,
      totalPrefunding:
        socialSecurityPrefunding + medicarePrefunding,
      avoidedSocialSecurityPaygo,
      socialSecurityPrefundingDividend,
      medicarePrefundedShare,
      availableReformSavings,
      unusedReformSavings: Math.max(
        0,
        availableReformSavings -
          socialSecurityPrefunding -
          medicarePrefunding,
      ),
    })
  }

  return plan
}

export function fundingPlanForAssumptions(
  assumptions: ModelAssumptions,
): ReadonlyMap<number, AnnualFundingPlan> {
  const cached = fundingPlanCache.get(assumptions)
  if (cached) return cached
  const plan = buildFundingPlan(assumptions)
  fundingPlanCache.set(assumptions, plan)
  return plan
}

export function annualFundingPlan(
  year: number,
  assumptions: ModelAssumptions,
): AnnualFundingPlan {
  return (
    fundingPlanForAssumptions(assumptions).get(year) ?? {
      year,
      fullSocialSecurityPrefundingCost: 0,
      socialSecurityPrefunding: 0,
      socialSecurityPrefundedShare: 0,
      fullMedicarePrefundingCost: 0,
      medicarePrefunding: 0,
      totalPrefunding: 0,
      avoidedSocialSecurityPaygo: 0,
      socialSecurityPrefundingDividend: 0,
      medicarePrefundedShare: 0,
      availableReformSavings: 0,
      unusedReformSavings: 0,
    }
  )
}

export function medicarePrefundedShareForEligibilityYear(
  eligibilityYear: number,
  assumptions: ModelAssumptions,
): number {
  const fundingYear =
    eligibilityYear -
    (assumptions.medicareEligibilityAge - assumptions.prefundingStartAge)
  return annualFundingPlan(fundingYear, assumptions).medicarePrefundedShare
}
