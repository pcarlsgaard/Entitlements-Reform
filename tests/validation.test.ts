import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import { validateModelAssumptions } from '../src/model/validation'

describe('model assumption validation', () => {
  it('accepts the documented defaults', () => {
    expect(validateModelAssumptions(withAssumptions({}))).toEqual([])
  })

  it('rejects a zero-year Social Security phase-in before it reaches the model', () => {
    expect(
      validateModelAssumptions(withAssumptions({ benefitPhaseInYears: 0 })),
    ).toContainEqual({
      key: 'benefitPhaseInYears',
      message: 'The phase-in must be at least one year.',
    })
  })

  it('rejects non-finite numeric input', () => {
    expect(
      validateModelAssumptions(withAssumptions({ premiumSupport2026: Number.NaN })),
    ).toContainEqual({
      key: 'premiumSupport2026',
      message: 'Enter a finite number.',
    })
  })

  it('requires Medicare Year B to be no earlier than Year A', () => {
    expect(
      validateModelAssumptions(
        withAssumptions({ medicareYearA: 2040, medicareYearB: 2035 }),
      ),
    ).toContainEqual({
      key: 'medicareYearB',
      message: 'Year B must be the same as or later than Year A.',
    })
  })

  it('rejects an impossible NDD real growth rate', () => {
    expect(
      validateModelAssumptions(
        withAssumptions({ nonDefenseDiscretionaryRealGrowth: -1 }),
      ),
    ).toContainEqual({
      key: 'nonDefenseDiscretionaryRealGrowth',
      message:
        'Real nondefense discretionary growth must be greater than -100%.',
    })
  })
})
