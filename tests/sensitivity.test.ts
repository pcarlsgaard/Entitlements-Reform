import { describe, expect, it } from 'vitest'
import { nonDefenseDiscretionaryBillions } from '../src/model/budget'
import {
  cbo2026PrimarySpendingGDP,
  cbo2026RevenueGDP,
  cboNondefenseDiscretionaryGDP,
  cboPrimarySpendingGDP,
} from '../src/data/cboBaseline'
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
  it('records CBO 2026 current-law revenue at 17.541% of GDP', () => {
    expect(cbo2026RevenueGDP).toBe(0.17541)
  })

  it('calibrates 2026 NDD to 3.121% of GDP', () => {
    expect(
      nonDefenseDiscretionaryBillions(2026, defaultAssumptions),
    ).toBe(0.03121 * defaultAssumptions.startingNominalGDPBillions)
  })

  it('calibrates scheduled-current-law 2026 primary spending to CBO', () => {
    const row = simulateCurrentLawConstantRevenue(
      defaultAssumptions,
      'scheduled',
      0.22,
    ).years[0]!
    expect(row.totalPrimarySpending / row.nominalGDP).toBeCloseTo(
      cboPrimarySpendingGDP(2026),
      10,
    )
    expect(row.totalPrimarySpending / row.nominalGDP).toBeCloseTo(
      cbo2026PrimarySpendingGDP,
      5,
    )
  })

  it('follows CBO\'s central NDD path under central assumptions', () => {
    const simulation = simulateConstantRevenue(defaultAssumptions, 0.22)
    const row = simulation.years.find((item) => item.year === 2050)!
    expect(row.nonDefenseDiscretionary / row.nominalGDP).toBeCloseTo(
      cboNondefenseDiscretionaryGDP(2050),
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

  it('requires less permanent revenue when real NDD spending is frozen', () => {
    const baseline = solvePermanentRevenueRate(defaultAssumptions)
    const frozen = solvePermanentRevenueRate(
      withAssumptions({ nonDefenseDiscretionaryRealGrowth: 0 }),
    )
    expect(frozen.rate).toBeLessThan(baseline.rate)
  })
})
