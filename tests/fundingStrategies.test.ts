import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import {
  annualFundingPlan,
  fundingPlanForAssumptions,
  medicarePrefundedShareForEligibilityYear,
} from '../src/model/endowment'
import { fundingStrategies } from '../src/model/fundingStrategy'
import { medicareForYear } from '../src/model/medicare'
import { simulateConstantRevenue } from '../src/model/simulate'
import { socialSecurityForYear } from '../src/model/socialSecurity'

describe('independent program financing', () => {
  it('supports PAYGO, either individual sleeve, and both sleeves', () => {
    const paygo = annualFundingPlan(
      2026,
      withAssumptions({ fundingStrategy: 'paygo' }),
    )
    const socialSecurityOnly = annualFundingPlan(
      2026,
      withAssumptions({ fundingStrategy: 'socialSecurityOnly' }),
    )
    const medicareOnly = annualFundingPlan(
      2026,
      withAssumptions({ fundingStrategy: 'medicareOnly' }),
    )
    const both = annualFundingPlan(
      2026,
      withAssumptions({ fundingStrategy: 'both' }),
    )

    expect(paygo.totalPrefunding).toBe(0)
    expect(socialSecurityOnly.socialSecurityPrefunding).toBeGreaterThan(0)
    expect(socialSecurityOnly.medicarePrefunding).toBe(0)
    expect(medicareOnly.socialSecurityPrefunding).toBe(0)
    expect(medicareOnly.medicarePrefunding).toBeGreaterThan(0)
    expect(both.socialSecurityPrefunding).toBeGreaterThan(0)
    expect(both.medicarePrefunding).toBeGreaterThan(0)
  })

  it('removes only the selected program from later PAYGO financing', () => {
    const ssOnly = withAssumptions({ fundingStrategy: 'socialSecurityOnly' })
    const medicareOnly = withAssumptions({ fundingStrategy: 'medicareOnly' })

    const ssOnlyRetiree = socialSecurityForYear(2078, ssOnly).cohorts.find(
      (cohort) => cohort.retirementYear === 2078,
    )!
    const medicareOnlyRetiree = socialSecurityForYear(
      2078,
      medicareOnly,
    ).cohorts.find((cohort) => cohort.retirementYear === 2078)!
    expect(ssOnlyRetiree.flatPaygoBillions).toBe(0)
    expect(medicareOnlyRetiree.flatPaygoBillions).toBeGreaterThan(0)

    const ssOnlyMedicare = medicareForYear(2073, ssOnly).cohorts.find(
      (cohort) => cohort.eligibilityYear === 2073,
    )!
    const medicareOnlyMedicare = medicareForYear(
      2073,
      medicareOnly,
    ).cohorts.find((cohort) => cohort.eligibilityYear === 2073)!
    expect(ssOnlyMedicare.prefundedShare).toBe(0)
    expect(ssOnlyMedicare.premiumSupportPaygoBillions).toBeGreaterThan(0)
    expect(medicareOnlyMedicare.prefundedShare).toBe(1)
    expect(medicareOnlyMedicare.premiumSupportPaygoBillions).toBe(0)
  })
})

describe('Social Security first sequencing', () => {
  const assumptions = withAssumptions({
    fundingStrategy: 'socialSecurityFirst',
    endYear: 2160,
  })
  const plan = fundingPlanForAssumptions(assumptions)

  it('funds no Medicare sleeve while the SS dividend is negative', () => {
    const first = plan.get(assumptions.reformYear)!
    expect(first.socialSecurityPrefundingDividend).toBeLessThan(0)
    expect(first.medicarePrefunding).toBe(0)
    expect(first.medicarePrefundedShare).toBe(0)
  })

  it('caps the Medicare deposit at the positive SS dividend and full sleeve', () => {
    const positive = [...plan.values()].find(
      (row) => row.socialSecurityPrefundingDividend > 0,
    )!
    expect(positive).toBeDefined()
    expect(positive.medicarePrefunding).toBeCloseTo(
      Math.min(
        positive.socialSecurityPrefundingDividend,
        positive.fullMedicarePrefundingCost,
      ),
      10,
    )
    expect(positive.medicarePrefundedShare).toBeGreaterThan(0)
    expect(positive.medicarePrefundedShare).toBeLessThanOrEqual(1)
  })

  it('carries the funded fraction into the cohort future Medicare benefit', () => {
    const funded = [...plan.values()].find(
      (row) =>
        row.medicarePrefundedShare > 0 &&
        row.year +
          assumptions.medicareEligibilityAge -
          assumptions.prefundingStartAge <=
          assumptions.endYear,
    )!
    const eligibilityYear =
      funded.year +
      assumptions.medicareEligibilityAge -
      assumptions.prefundingStartAge
    const simulation = simulateConstantRevenue(assumptions, 0.25)
    const cohort = simulation.medicareByYear
      .get(eligibilityYear)!
      .cohorts.find((item) => item.eligibilityYear === eligibilityYear)!

    expect(cohort.prefundedShare).toBeCloseTo(
      funded.medicarePrefundedShare,
      12,
    )
    const paygoCohort = medicareForYear(
      eligibilityYear,
      withAssumptions({ fundingStrategy: 'paygo', endYear: 2160 }),
    ).cohorts.find((item) => item.eligibilityYear === eligibilityYear)!
    expect(cohort.premiumSupportPaygoBillions).toBeCloseTo(
      paygoCohort.premiumSupportPaygoBillions *
        (1 - funded.medicarePrefundedShare),
      10,
    )
    expect(
      medicarePrefundedShareForEligibilityYear(
        eligibilityYear,
        assumptions,
      ),
    ).toBeCloseTo(funded.medicarePrefundedShare, 12)
  })

  it('keeps sleeve subtotals equal to total prefunding in every strategy', () => {
    for (const fundingStrategy of fundingStrategies) {
      const row = annualFundingPlan(
        2100,
        withAssumptions({ fundingStrategy }),
      )
      expect(row.totalPrefunding).toBe(
        row.socialSecurityPrefunding + row.medicarePrefunding,
      )
    }
  })
})
