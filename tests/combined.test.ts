import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'

describe('combined fiscal bridge', () => {
  it('reproduces the current-law debt path with both reforms disabled', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      taxEnabled: false,
      benefits: { socialSecurityReform: false, medicareReform: false },
    })
    for (let i = 0; i < result.combined.years.length; i += 1) {
      expect(result.combined.years[i]!.endingDebtGDP).toBeCloseTo(result.baseline.years[i]!.endingDebtGDP, 10)
    }
    expect(result.periods[0]!.fiscalImprovementBillions).toBeCloseTo(0, 6)
  })

  it('books tax replacement as receipts and refundable outlay savings as lower spending', () => {
    const result = scoreCombined(defaultCombinedPolicy)
    const year = result.combined.years[0]!
    const baseline = result.baseline.years[0]!
    expect(year.revenueRate - baseline.revenueRate).toBeCloseTo(
      (result.tax.netRevenue - result.tax.targetRevenue) / result.tax.gdp, 10,
    )
    expect(baseline.otherMandatory - year.otherMandatory).toBeCloseTo(
      result.tax.totalFederalSavings / result.tax.gdp * year.nominalGDP, 6,
    )
    expect(year.overallDeficit - baseline.overallDeficit).toBeCloseTo(
      -result.tax.deficitReductionPercentGdp * year.nominalGDP, 6,
    )
    expect(result.additionalFiscalAdjustmentGDP).toBeGreaterThan(0)
    const gdpYears = result.combined.years.reduce((sum, row) => sum + row.nominalGDP, 0)
    expect(result.periods[1]!.fiscalImprovementGDP).toBeCloseTo(
      result.periods[1]!.fiscalImprovementBillions / gdpYears, 10,
    )
  })

  it('switches Social Security and Medicare independently while retaining the other baseline', () => {
    const ss = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: false } })
    const med = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: false, medicareReform: true } })
    const index = 2035 - 2026
    expect(ss.combined.years[index]!.legacySeniorMedicare).toBeCloseTo(
      ss.baseline.years[index]!.legacySeniorMedicare, 8,
    )
    expect(med.combined.years[index]!.legacySocialSecurity).toBeCloseTo(
      med.baseline.years[index]!.legacySocialSecurity, 8,
    )
    expect(ss.combined.years[index]!.legacySocialSecurity).not.toBeCloseTo(
      ss.baseline.years[index]!.legacySocialSecurity, 4,
    )
    expect(med.combined.years[index]!.legacySeniorMedicare).not.toBeCloseTo(
      med.baseline.years[index]!.legacySeniorMedicare, 4,
    )
    expect(Number.isFinite(ss.periods[1]!.terminalDebtGDP)).toBe(true)
  })
})
