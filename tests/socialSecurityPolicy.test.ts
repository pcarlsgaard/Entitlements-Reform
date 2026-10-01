import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import {
  flatBenefitNominal,
  legacySocialSecurityBenefitNominal,
  socialSecurityCOLARate,
} from '../src/model/socialSecurity'
import { calculateEndowmentPerPerson } from '../src/model/endowment'
import { weightedRelativeBenefitMean } from '../src/model/socialSecurityDistribution'

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
    expect(legacySocialSecurityBenefitNominal(2030, 2030, 2040, capped))
      .toBeLessThan(legacySocialSecurityBenefitNominal(2030, 2030, 2040, current))
  })

  it('keeps the SSA benefit distribution normalized to the aggregate baseline', () => {
    expect(weightedRelativeBenefitMean()).toBeCloseTo(1, 10)
  })

  it('applies progressive price indexing only to future award growth above the protected percentile', () => {
    const current = withAssumptions({ socialSecurityInitialBenefitMode: 'current' })
    const ppi50 = withAssumptions({
      socialSecurityInitialBenefitMode: 'progressivePriceIndexing',
      socialSecurityPPIProtectedPercentile: 0.50,
    })
    const ppi75 = withAssumptions({
      socialSecurityInitialBenefitMode: 'progressivePriceIndexing',
      socialSecurityPPIProtectedPercentile: 0.75,
    })
    const baseline = legacySocialSecurityBenefitNominal(2060, 2060, 2060, current)
    const benefit50 = legacySocialSecurityBenefitNominal(2060, 2060, 2060, ppi50)
    const benefit75 = legacySocialSecurityBenefitNominal(2060, 2060, 2060, ppi75)
    expect(benefit50).toBeLessThan(benefit75)
    expect(benefit75).toBeLessThan(baseline)
  })

  it('implements the percentile COLA as a dollar cap and allows it to stack with chained CPI', () => {
    const uncapped = withAssumptions({
      socialSecurityInitialBenefitMode: 'current',
      socialSecurityCOLAMode: 'current',
      socialSecurityDollarCOLACapPercentile: null,
    })
    const dollarCap = withAssumptions({
      socialSecurityInitialBenefitMode: 'current',
      socialSecurityCOLAMode: 'current',
      socialSecurityDollarCOLACapPercentile: 0.75,
    })
    const combined = withAssumptions({
      socialSecurityInitialBenefitMode: 'current',
      socialSecurityCOLAMode: 'chainedCpi',
      socialSecurityDollarCOLACapPercentile: 0.75,
    })
    expect(legacySocialSecurityBenefitNominal(2030, 2030, 2030, dollarCap))
      .toBeCloseTo(legacySocialSecurityBenefitNominal(2030, 2030, 2030, uncapped), 10)
    expect(legacySocialSecurityBenefitNominal(2030, 2030, 2045, dollarCap))
      .toBeLessThan(legacySocialSecurityBenefitNominal(2030, 2030, 2045, uncapped))
    expect(legacySocialSecurityBenefitNominal(2030, 2030, 2045, combined))
      .toBeLessThan(legacySocialSecurityBenefitNominal(2030, 2030, 2045, dollarCap))
  })

  it('lowers the prefunded Social Security PV when post-award COLAs are capped', () => {
    const current = withAssumptions({ inflation: 0.04, socialSecurityCOLAMode: 'current' })
    const capped = withAssumptions({ inflation: 0.04, socialSecurityCOLAMode: 'cap', socialSecurityCOLACap: 0.02 })
    expect(calculateEndowmentPerPerson(capped).socialSecurityPV)
      .toBeLessThan(calculateEndowmentPerPerson(current).socialSecurityPV)
  })
})
