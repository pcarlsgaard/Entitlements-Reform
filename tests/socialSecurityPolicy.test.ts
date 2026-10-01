import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import {
  flatBenefitNominal,
  legacySocialSecurityBenefitNominal,
  socialSecurityCOLARate,
  socialSecurityForYear,
} from '../src/model/socialSecurity'
import { calculateEndowmentPerPerson } from '../src/model/endowment'

describe('Social Security COLA reform modules', () => {
  it('uses current inflation for the baseline COLA rule', () => {
    const a = withAssumptions({ inflation: 0.025, socialSecurityCOLAMode: 'current' })
    expect(socialSecurityCOLARate(a)).toBeCloseTo(0.025, 12)
    expect(socialSecurityCOLARate(a, 'currentLaw')).toBeCloseTo(0.025, 12)
  })

  it('implements the SSA chained-CPI approximation as 0.3 percentage point below CPI', () => {
    const a = withAssumptions({ inflation: 0.025, socialSecurityCOLAMode: 'chainedCpi' })
    expect(socialSecurityCOLARate(a)).toBeCloseTo(0.022, 12)
    expect(socialSecurityCOLARate(a, 'currentLaw')).toBeCloseTo(0.025, 12)
  })

  it('caps the annual post-award COLA without changing the initial award', () => {
    const current = withAssumptions({ inflation: 0.04, socialSecurityCOLAMode: 'current' })
    const capped = withAssumptions({ inflation: 0.04, socialSecurityCOLAMode: 'cap', socialSecurityCOLACap: 0.02 })
    expect(flatBenefitNominal(2030, 2030, capped)).toBeCloseTo(flatBenefitNominal(2030, 2030, current), 10)
    expect(flatBenefitNominal(2030, 2040, capped)).toBeLessThan(flatBenefitNominal(2030, 2040, current))
    expect(legacySocialSecurityBenefitNominal(2030, 2040, capped))
      .toBeLessThan(legacySocialSecurityBenefitNominal(2030, 2040, current))
  })

  it('lowers the prefunded Social Security PV when post-award COLAs are capped', () => {
    const current = withAssumptions({ inflation: 0.04, socialSecurityCOLAMode: 'current' })
    const capped = withAssumptions({ inflation: 0.04, socialSecurityCOLAMode: 'cap', socialSecurityCOLACap: 0.02 })
    expect(calculateEndowmentPerPerson(capped).socialSecurityPV)
      .toBeLessThan(calculateEndowmentPerPerson(current).socialSecurityPV)
  })
})


describe('Social Security initial-benefit modules', () => {
  it('can run COLA/FRA modules with the current-law initial formula and no flat transition', () => {
    const a = withAssumptions({
      socialSecurityInitialBenefitMode: 'currentLaw',
      fullRetirementAge: 67,
      socialSecurityClaimAge: 67,
      socialSecurityCOLAMode: 'current',
      socialSecurityCOLADollarCapPercentile: null,
      socialSecurityBenefitCap2026: null,
      fundingStrategy: 'paygo',
    })
    const reform = socialSecurityForYear(2050, a, 'reform')
    const currentLaw = socialSecurityForYear(2050, a, 'currentLaw')
    expect(reform.flatBenefitBillions).toBeCloseTo(0, 12)
    expect(reform.legacyBillions).toBeCloseTo(currentLaw.legacyBillions, 8)
  })

  it('starts PPI with the selected eligibility year and makes a 50th-percentile threshold stronger than 75th', () => {
    const current = withAssumptions({
      socialSecurityInitialBenefitMode: 'currentLaw',
      fullRetirementAge: 67,
      socialSecurityClaimAge: 67,
      socialSecurityCOLAMode: 'current',
      fundingStrategy: 'paygo',
    })
    const ppi50 = withAssumptions({
      socialSecurityInitialBenefitMode: 'progressivePriceIndexing',
      socialSecurityPPIThresholdPercentile: 0.50,
      socialSecurityPPIStartYear: 2033,
      fullRetirementAge: 67,
      socialSecurityClaimAge: 67,
      socialSecurityCOLAMode: 'current',
      fundingStrategy: 'paygo',
    })
    const ppi75 = withAssumptions({
      ...ppi50,
      socialSecurityPPIThresholdPercentile: 0.75,
    })

    // Age-67 reference year 2037 corresponds to first eligibility in 2032.
    expect(legacySocialSecurityBenefitNominal(2037, 2037, ppi50))
      .toBeCloseTo(legacySocialSecurityBenefitNominal(2037, 2037, current), 8)
    // Reference year 2038 corresponds to first eligibility in 2033.
    expect(legacySocialSecurityBenefitNominal(2038, 2038, ppi50))
      .toBeLessThan(legacySocialSecurityBenefitNominal(2038, 2038, current))

    const spending50 = socialSecurityForYear(2095, ppi50).legacyBillions
    const spending75 = socialSecurityForYear(2095, ppi75).legacyBillions
    const spendingCurrent = socialSecurityForYear(2095, current, 'currentLaw').legacyBillions
    expect(spending50).toBeLessThan(spending75)
    expect(spending75).toBeLessThan(spendingCurrent)
  })

  it('combines chained CPI with a 75th-percentile dollar COLA cap', () => {
    const base = withAssumptions({
      socialSecurityInitialBenefitMode: 'currentLaw',
      socialSecurityCOLAMode: 'current',
      socialSecurityCOLADollarCapPercentile: null,
      fundingStrategy: 'paygo',
    })
    const dollarCap = withAssumptions({
      ...base,
      socialSecurityCOLADollarCapPercentile: 0.75,
    })
    const combined = withAssumptions({
      ...dollarCap,
      socialSecurityCOLAMode: 'chainedCpi',
    })
    const retirementYear = 2035
    const claimYear = 2035
    expect(legacySocialSecurityBenefitNominal(retirementYear, 2060, dollarCap, 'reform', claimYear))
      .toBeLessThan(legacySocialSecurityBenefitNominal(retirementYear, 2060, base, 'reform', claimYear))
    expect(legacySocialSecurityBenefitNominal(retirementYear, 2060, combined, 'reform', claimYear))
      .toBeLessThan(legacySocialSecurityBenefitNominal(retirementYear, 2060, dollarCap, 'reform', claimYear))
  })
})
