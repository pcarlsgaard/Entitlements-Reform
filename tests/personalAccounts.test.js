import { describe, it, expect } from 'vitest'
import { simulatePrivateAccounts } from '../scripts/personal-accounts.mjs'

const approx = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-10)

describe('scheduled-benefit personal accounts prototype', () => {
  it('leaves pre-reform payroll and retirement benefits unchanged', () => {
    const s = simulatePrivateAccounts({ endYear: 2030 })
    const row = s.years.find(r => r.year === 2026)
    expect(row.diversionFraction).toBe(0)
    expect(row.divertedPayrollGDP).toBe(0)
    expect(row.privatelyFinancedGDP).toBe(0)
  })

  it('phases payroll diversion over the specified calendar years', () => {
    const one = simulatePrivateAccounts({ rampYears: 1, endYear: 2035 })
    const five = simulatePrivateAccounts({ rampYears: 5, endYear: 2035 })
    const ten = simulatePrivateAccounts({ rampYears: 10, endYear: 2035 })
    expect(one.years.find(r => r.year === 2027).diversionFraction).toBe(1)
    expect(five.years.find(r => r.year === 2027).diversionFraction).toBeCloseTo(.2)
    expect(five.years.find(r => r.year === 2031).diversionFraction).toBe(1)
    expect(ten.years.find(r => r.year === 2035).diversionFraction).toBeCloseTo(.9)
  })

  it('preserves double-entry fiscal conservation and all scheduled benefits', () => {
    const s = simulatePrivateAccounts({ realReturn: .04 })
    for (const row of s.years) {
      approx(row.residualFederalOASIOutlayGDP + row.privatelyFinancedGDP, row.scheduledOASICostGDP)
      approx(row.incrementalFinancingNeedGDP, row.divertedPayrollGDP - row.privatelyFinancedGDP)
      expect(row.residualFederalOASIOutlayGDP).toBeGreaterThanOrEqual(0)
    }
    for (const cohort of s.cohortExamples)
      for (const group of cohort.groups) {
        expect(group.publicAnnualTopUp).toBeGreaterThanOrEqual(0)
        expect(group.accountAnnualAnnuity + group.publicAnnualTopUp)
          .toBeGreaterThanOrEqual(group.scheduledAnnualBenefit - 1e-6)
      }
  })

  it('higher returns lower public top-ups without increasing benefit guarantees', () => {
    const low = simulatePrivateAccounts({ realReturn: .02 })
    const high = simulatePrivateAccounts({ realReturn: .06 })
    for (const year of [2050, 2070, 2090, 2100]) {
      const l=low.years.find(r=>r.year===year)
      const h=high.years.find(r=>r.year===year)
      expect(h.retireeCoveredShare).toBeGreaterThanOrEqual(l.retireeCoveredShare)
      expect(h.incrementalFinancingNeedGDP).toBeLessThanOrEqual(l.incrementalFinancingNeedGDP)
    }
  })

  it('excludes the separate disability payroll tax from diverted revenue', () => {
    const s = simulatePrivateAccounts({ rampYears: 1, endYear: 2027 })
    const row = s.years.at(-1)
    expect(row.divertedPayrollGDP).toBeCloseTo(row.taxablePayrollGDP * .106, 10)
    expect(s.assumptions.accountContributionRate).toBe(.106)
  })

  it('uses the specified annually rebalanced diversified asset mix', () => {
    const equity = simulatePrivateAccounts({
      endYear: 2070, equityWeight: 1,
      equityRealReturns: [.08], bondRealReturns: [.01]
    })
    const diversified = simulatePrivateAccounts({
      endYear: 2070, equityWeight: .65,
      equityRealReturns: [.08], bondRealReturns: [.01]
    })
    const bonds = simulatePrivateAccounts({
      endYear: 2070, equityWeight: 0,
      equityRealReturns: [.08], bondRealReturns: [.01]
    })
    const a = equity.years.at(-1).privatelyFinancedGDP
    const b = diversified.years.at(-1).privatelyFinancedGDP
    const d = bonds.years.at(-1).privatelyFinancedGDP
    expect(a).toBeGreaterThanOrEqual(b)
    expect(b).toBeGreaterThan(d)
  })

  it('accepts an externally supplied annual return series', () => {
    const a = simulatePrivateAccounts({ endYear: 2070, annualRealReturns: [.02,.06] })
    const b = simulatePrivateAccounts({ endYear: 2070, realReturn: .04 })
    expect(a.years.at(-1).privatelyFinancedGDP).not.toBe(b.years.at(-1).privatelyFinancedGDP)
  })
})
