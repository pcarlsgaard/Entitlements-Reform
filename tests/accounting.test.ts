import { describe, expect, it } from 'vitest'
import { reconciliationErrors } from '../src/model/audit'
import { defaultAssumptions, withAssumptions } from '../src/model/defaults'
import {
  nominalRateFromReal,
  updateEffectiveRate,
} from '../src/model/debt'
import { simulateConstantRevenue } from '../src/model/simulate'
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
