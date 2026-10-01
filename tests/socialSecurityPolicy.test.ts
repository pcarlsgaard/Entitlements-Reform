import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import {
  flatBenefitNominal,
  legacySocialSecurityBenefitNominal,
  socialSecurityCOLARate,
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
