import { describe, expect, it } from 'vitest'
import { defaultAssumptions, withAssumptions } from '../src/model/defaults'
import {
  annualPrefundingBillions,
  calculateEndowmentPerPerson,
} from '../src/model/endowment'
import {
  firstPrefundedMedicareEligibilityYear,
  medicareForYear,
  medicarePremiumSupportShare,
  newEntrantPremiumSupportShare,
} from '../src/model/medicare'
import { survivalProbability } from '../src/model/mortality'
import {
  cohortSizeAtAgeMillions,
  firstPrefundedSSRetirementYear,
  flatBenefitReal,
  socialSecurityBenefitShares,
  socialSecurityForYear,
} from '../src/model/socialSecurity'

describe('SSA mortality', () => {
  it('uses l_x ratios for conditional survival', () => {
    expect(survivalProbability(70, 80)).toBeCloseTo(57_695.5 / 77_145, 12)
  })

  it('applies survival from birth before counting benefit entrants', () => {
    expect(
      cohortSizeAtAgeMillions(2026, 65, defaultAssumptions),
    ).toBeCloseTo(
      defaultAssumptions.cohortSizeMillions2026 *
        survivalProbability(0, 65),
      12,
    )
  })
})

describe('Social Security retirement cohort transition', () => {
  const assumptions = withAssumptions({ benefitPhaseInYears: 20 })

  it('assigns the 2036 retirement cohort exactly 50/50', () => {
    expect(socialSecurityBenefitShares(2036, assumptions)).toEqual({
      legacyShare: 0.5,
      flatShare: 0.5,
    })
  })

  it('keeps the 2036 cohort exactly 50/50 in 2050', () => {
    const cohort = socialSecurityForYear(2050, assumptions).cohorts.find(
      (item) => item.retirementYear === 2036,
    )
    expect(cohort?.legacyShare).toBe(0.5)
    expect(cohort?.flatShare).toBe(0.5)
  })

  it('assigns the 2046 retirement cohort 100% flat', () => {
    expect(socialSecurityBenefitShares(2046, assumptions)).toEqual({
      legacyShare: 0,
      flatShare: 1,
    })
  })

  it('keeps the real FPL benefit constant', () => {
    expect(flatBenefitReal(2026, assumptions)).toBe(19_950)
    expect(flatBenefitReal(2100, assumptions)).toBe(19_950)
  })
})

describe('Prefunding cohort dates and financing strategy', () => {
  it('age-18 funding produces first Medicare cohort in 2073', () => {
    expect(
      firstPrefundedMedicareEligibilityYear(
        withAssumptions({ prefundingStartAge: 18 }),
      ),
    ).toBe(2073)
  })

  it('age-18 funding produces first SS cohort in 2078', () => {
    expect(
      firstPrefundedSSRetirementYear(
        withAssumptions({ prefundingStartAge: 18 }),
      ),
    ).toBe(2078)
  })

  it('birth funding produces Medicare 2091 and SS 2096', () => {
    const assumptions = withAssumptions({ prefundingStartAge: 0 })
    expect(firstPrefundedMedicareEligibilityYear(assumptions)).toBe(2091)
    expect(firstPrefundedSSRetirementYear(assumptions)).toBe(2096)
  })

  it('both benefits PAYGO produces zero annual prefunding', () => {
    expect(
      annualPrefundingBillions(
        2026,
        withAssumptions({ fundingStrategy: 'paygo' }),
      ),
    ).toBe(0)
  })

  it('financing strategy does not change benefit shares', () => {
    const on = withAssumptions({ fundingStrategy: 'both' })
    const off = withAssumptions({ fundingStrategy: 'paygo' })
    expect(socialSecurityBenefitShares(2036, on)).toEqual(
      socialSecurityBenefitShares(2036, off),
    )
    expect(medicarePremiumSupportShare(2029, 2033, on)).toBe(
      medicarePremiumSupportShare(2029, 2033, off),
    )
  })

  it('prefunding changes financing but not the promised cohort benefit', () => {
    const base = withAssumptions({ endYear: 2100 })
    const on = socialSecurityForYear(2080, {
      ...base,
      fundingStrategy: 'both',
    }).cohorts.find((cohort) => cohort.retirementYear === 2078)
    const off = socialSecurityForYear(2080, {
      ...base,
      fundingStrategy: 'paygo',
    }).cohorts.find((cohort) => cohort.retirementYear === 2078)
    expect(on?.flatShare).toBe(off?.flatShare)
    expect(on?.flatPaygoBillions).toBe(0)
    expect(off?.flatPaygoBillions).toBeGreaterThan(0)
  })
})

describe('Endowment PV', () => {
  it('higher flat SS benefit increases SS PV', () => {
    const low = calculateEndowmentPerPerson(
      withAssumptions({ flatBenefitFPLMultiple: 1 }),
    )
    const high = calculateEndowmentPerPerson(
      withAssumptions({ flatBenefitFPLMultiple: 1.5 }),
    )
    expect(high.socialSecurityPV).toBeGreaterThan(low.socialSecurityPV)
  })

  it('higher premium support increases Medicare PV', () => {
    const low = calculateEndowmentPerPerson(
      withAssumptions({ premiumSupport2026: 15_000 }),
    )
    const high = calculateEndowmentPerPerson(
      withAssumptions({ premiumSupport2026: 25_000 }),
    )
    expect(high.medicarePV).toBeGreaterThan(low.medicarePV)
  })

  it('higher real endowment yield lowers total PV', () => {
    const low = calculateEndowmentPerPerson(
      withAssumptions({ realEndowmentYield: 0.015 }),
    )
    const high = calculateEndowmentPerPerson(
      withAssumptions({ realEndowmentYield: 0.04 }),
    )
    expect(high.totalPV).toBeLessThan(low.totalPV)
  })

  it('combined endowment exactly equals its two sleeves', () => {
    const result = calculateEndowmentPerPerson(defaultAssumptions)
    expect(result.totalPV).toBe(result.socialSecurityPV + result.medicarePV)
  })
})

describe('Medicare transition', () => {
  it('Year A 2030 gives new entrants 100% premium support', () => {
    expect(newEntrantPremiumSupportShare(2030, defaultAssumptions)).toBe(1)
  })

  it('Year B 2035 completes conversion for all modeled seniors', () => {
    const result = medicareForYear(2035, defaultAssumptions)
    expect(result.cohorts.every((cohort) => cohort.premiumSupportShare === 1)).toBe(
      true,
    )
    expect(result.legacyBillions).toBe(0)
  })

  it('transitions pre-Year-A new entrants linearly', () => {
    expect(newEntrantPremiumSupportShare(2028, defaultAssumptions)).toBe(0.5)
  })
})
