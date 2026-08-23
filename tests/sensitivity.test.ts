import { describe, expect, it } from 'vitest'
import { nonDefenseDiscretionaryBillions } from '../src/model/budget'
import { defaultAssumptions, withAssumptions } from '../src/model/defaults'
import {
  centralMacroBudgetReference,
  hasNoncentralMacroBudgetAssumptions,
} from '../src/model/sensitivity'
import {
  simulateConstantRevenue,
  simulateCurrentLawConstantRevenue,
} from '../src/model/simulate'
import { solvePermanentRevenueRate } from '../src/model/solveTax'

describe('nondefense discretionary path', () => {
  it('calibrates 2026 NDD to 3.1% of GDP', () => {
    expect(
      nonDefenseDiscretionaryBillions(2026, defaultAssumptions),
    ).toBe(0.031 * defaultAssumptions.startingNominalGDPBillions)
  })

  it('calibrates scheduled-current-law 2026 primary spending to CBO', () => {
    const row = simulateCurrentLawConstantRevenue(
      defaultAssumptions,
      'scheduled',
      0.22,
    ).years[0]!
    expect(row.totalPrimarySpending / row.nominalGDP).toBeCloseTo(0.2, 3)
  })

  it('holds its GDP share constant when NDD and real GDP growth match', () => {
    const simulation = simulateConstantRevenue(defaultAssumptions, 0.22)
    const row = simulation.years.find((item) => item.year === 2050)!
    expect(row.nonDefenseDiscretionary / row.nominalGDP).toBeCloseTo(
      defaultAssumptions.nonDefenseDiscretionaryGDP2026,
      12,
    )
  })

  it('declines as a GDP share when its real growth is below GDP growth', () => {
    const assumptions = withAssumptions({
      realGDPGrowth: 0.018,
      nonDefenseDiscretionaryRealGrowth: 0.01,
    })
    const simulation = simulateConstantRevenue(assumptions, 0.22)
    const row = simulation.years.find((item) => item.year === 2050)!
    expect(row.nonDefenseDiscretionary / row.nominalGDP).toBeLessThan(
      assumptions.nonDefenseDiscretionaryGDP2026,
    )
  })
})

describe('ceteris-paribus macro and budget comparison', () => {
  it('restores macro inputs without changing benefit design', () => {
    const custom = withAssumptions({
      realGDPGrowth: 0.023,
      nonDefenseDiscretionaryRealGrowth: 0.005,
      flatBenefitFPLMultiple: 1.4,
      premiumSupport2026: 21_000,
      prefundingStartAge: 0,
    })
    const reference = centralMacroBudgetReference(custom)
    expect(reference.realGDPGrowth).toBe(defaultAssumptions.realGDPGrowth)
    expect(reference.nonDefenseDiscretionaryRealGrowth).toBe(
      defaultAssumptions.nonDefenseDiscretionaryRealGrowth,
    )
    expect(reference.flatBenefitFPLMultiple).toBe(1.4)
    expect(reference.premiumSupport2026).toBe(21_000)
    expect(reference.prefundingStartAge).toBe(0)
    expect(hasNoncentralMacroBudgetAssumptions(custom)).toBe(true)
    expect(hasNoncentralMacroBudgetAssumptions(reference)).toBe(false)
  })

  it('requires less permanent revenue with 0.1 point faster real GDP growth', () => {
    const baseline = solvePermanentRevenueRate(defaultAssumptions)
    const fasterGrowth = solvePermanentRevenueRate(
      withAssumptions({ realGDPGrowth: 0.019 }),
    )
    expect(fasterGrowth.rate).toBeLessThan(baseline.rate)
  })

  it('requires less permanent revenue when NDD real growth is capped at 1%', () => {
    const baseline = solvePermanentRevenueRate(defaultAssumptions)
    const capped = solvePermanentRevenueRate(
      withAssumptions({ nonDefenseDiscretionaryRealGrowth: 0.01 }),
    )
    expect(capped.rate).toBeLessThan(baseline.rate)
  })
})
