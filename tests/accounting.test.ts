import { describe, expect, it } from 'vitest'
import { reconciliationErrors } from '../src/model/audit'
import { defaultAssumptions, withAssumptions } from '../src/model/defaults'
import {
  nominalRateFromReal,
  updateEffectiveRate,
} from '../src/model/debt'
import { simulate, simulateConstantRevenue } from '../src/model/simulate'
import { fundingStrategies } from '../src/model/fundingStrategy'

describe('interest-rate mechanics', () => {
  it('lambda 1 reprices immediately', () => {
    expect(updateEffectiveRate(0.03, 0.06, 1)).toBe(0.06)
  })

  it('lambda 0.15 closes exactly 15% of the remaining gap', () => {
    expect(updateEffectiveRate(0.03, 0.07, 0.15)).toBeCloseTo(0.036, 14)
  })

  it('converts a real target to nominal using Fisher multiplication', () => {
    expect(nominalRateFromReal(0.023, 0.02)).toBeCloseTo(0.04346, 12)
  })
})

describe('annual federal accounting', () => {
  for (const fundingStrategy of fundingStrategies) {
    it(`reconciles every annual identity with ${fundingStrategy} financing`, () => {
      const simulation = simulateConstantRevenue(
        withAssumptions({ fundingStrategy, endYear: 2130 }),
        0.22,
      )
      for (const row of simulation.years) {
        const errors = reconciliationErrors(row)
        for (const error of Object.values(errors)) {
          expect(error).toBeCloseTo(0, 8)
        }
        expect(row.netInterest).toBe(
          row.effectiveNominalInterestRate * row.beginningDebt,
        )
      }
    })
  }

  it('with a zero surplus cap, balances the budget and lets GDP growth reduce debt/GDP', () => {
    const assumptions = withAssumptions({
      fundingStrategy: 'paygo',
      endYear: 2095,
      debtPaydownTargetGDP: 0.40,
      debtPaydownSurplusCapGDP: 0,
    })
    const simulation = simulateConstantRevenue(assumptions, 0.50)
    const balanceIndex = simulation.years.findIndex(row => row.overallDeficit <= 1e-9)
    expect(balanceIndex).toBeGreaterThanOrEqual(0)
    const debtAtBalance = simulation.years[balanceIndex]!.endingDebt
    for (const row of simulation.years.slice(balanceIndex)) {
      expect(row.endingDebt).toBeCloseTo(debtAtBalance, 9)
      expect(row.revenue).toBeCloseTo(row.totalFederalSpending, 10)
      expect(row.primaryBalance).toBeCloseTo(row.netInterest, 10)
      expect(row.overallDeficit).toBeCloseTo(0, 10)
    }
    expect(simulation.years.at(-1)!.endingDebtGDP)
      .toBeLessThan(simulation.years[balanceIndex]!.endingDebtGDP)
  })

  it('caps debt-reduction surpluses and stops them at the selected debt target', () => {
    const assumptions = withAssumptions({
      fundingStrategy: 'paygo',
      endYear: 2095,
      debtPaydownTargetGDP: 0.40,
      debtPaydownSurplusCapGDP: 0.01,
    })
    const simulation = simulateConstantRevenue(assumptions, 0.50)
    const balanceIndex = simulation.years.findIndex(row => row.overallDeficit <= 1e-9)
    expect(balanceIndex).toBeGreaterThanOrEqual(0)
    const targetIndex = simulation.years.findIndex(
      row => row.endingDebtGDP <= assumptions.debtPaydownTargetGDP + 1e-12,
    )
    expect(targetIndex).toBeGreaterThan(balanceIndex)
    for (const row of simulation.years.slice(balanceIndex, targetIndex)) {
      expect(-row.overallDeficit / row.nominalGDP)
        .toBeLessThanOrEqual(assumptions.debtPaydownSurplusCapGDP + 1e-12)
    }
    for (const row of simulation.years.slice(targetIndex + 1)) {
      expect(row.endingDebt).toBeCloseTo(row.beginningDebt, 9)
      expect(row.revenue).toBeCloseTo(row.totalFederalSpending, 10)
    }
  })

  it('never floors receipts when the tax schedule later falls below the cap', () => {
    const assumptions = withAssumptions({
      fundingStrategy: 'paygo',
      endYear: 2060,
      debtPaydownSurplusCapGDP: 0,
    })
    const simulation = simulate(assumptions, (year) => year < 2040 ? 0.50 : 0.05)
    const balanceIndex = simulation.years.findIndex(row => row.overallDeficit <= 1e-9)
    expect(balanceIndex).toBeGreaterThanOrEqual(0)
    for (const row of simulation.years.filter(row => row.year >= 2040)) {
      expect(row.revenueRate).toBeCloseTo(0.05, 12)
      expect(row.scheduledRevenueRate).toBeCloseTo(0.05, 12)
      expect(row.overallDeficit).toBeGreaterThan(0)
    }
  })

  it('primary-balance reference caps excess receipts but never mandates them', () => {
    const assumptions = withAssumptions({
      endYear: 2030, fundingStrategy: 'paygo', debtSensitivity: 0,
      revenueCapBasis: 'primaryBalance', debtPaydownSurplusCapGDP: 0,
    })
    const high = simulate(assumptions, () => 0.60)
    for (const row of high.years) {
      expect(row.revenue).toBeCloseTo(row.totalPrimarySpending, 8)
      expect(row.primaryDeficit).toBeCloseTo(0, 8)
      expect(row.overallDeficit).toBeCloseTo(row.netInterest, 8)
      expect(row.scheduledRevenueRate).toBe(0.60)
    }
    const low = simulate(assumptions, () => 0.05)
    for (const row of low.years) {
      expect(row.revenueRate).toBeCloseTo(0.05, 12)
      expect(row.revenue).toBeLessThan(row.totalPrimarySpending)
    }
  })

  it('uses the same cap allowance on primary balance and a custom overall target', () => {
    const assumptions = withAssumptions({
      endYear: 2028, fundingStrategy: 'paygo', debtSensitivity: 0,
      revenueCapBasis: 'primaryBalance', debtPaydownSurplusCapGDP: 0.01,
      debtPaydownTargetGDP: 0,
    })
    const primary = simulate(assumptions, () => 0.60)
    for (const row of primary.years) {
      expect(row.revenue).toBeCloseTo(row.totalPrimarySpending + 0.01 * row.nominalGDP, 8)
      expect(row.overallDeficit).toBeCloseTo(row.netInterest - 0.01 * row.nominalGDP, 8)
    }
    const custom = simulate({ ...assumptions,
      revenueCapBasis: 'customOverallBalance', customRevenueCapBalanceGDP: -0.02 }, () => 0.60)
    for (const row of custom.years) {
      expect(row.revenue).toBeCloseTo(row.totalFederalSpending - 0.01 * row.nominalGDP, 8)
      expect(row.overallDeficit).toBeCloseTo(0.01 * row.nominalGDP, 8)
    }
  })

  it('primary components reconcile exactly to total primary spending', () => {
    const row = simulateConstantRevenue(defaultAssumptions, 0.22).years[0]
    expect(row).toBeDefined()
    expect(reconciliationErrors(row!).primaryComponents).toBe(0)
  })

  it('primary spending plus interest equals total spending', () => {
    const row = simulateConstantRevenue(defaultAssumptions, 0.22).years[0]!
    expect(row.totalPrimarySpending + row.netInterest).toBe(
      row.totalFederalSpending,
    )
  })

  it('primary deficit plus interest equals overall deficit', () => {
    const row = simulateConstantRevenue(defaultAssumptions, 0.22).years[0]!
    expect(row.primaryDeficit + row.netInterest).toBe(row.overallDeficit)
  })

  it('beginning debt plus overall deficit equals ending debt', () => {
    const row = simulateConstantRevenue(defaultAssumptions, 0.22).years[0]!
    expect(row.beginningDebt + row.overallDeficit).toBe(row.endingDebt)
  })
})
