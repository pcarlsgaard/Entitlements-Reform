import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'

const enabled = { ...defaultCombinedPolicy.dynamic, enabled: true }

describe('fast illustrative dynamic scoring', () => {
  it('leaves the static model unchanged when disabled or elasticity is zero', () => {
    const staticScore = scoreCombined(defaultCombinedPolicy)
    const zero = scoreCombined({ ...defaultCombinedPolicy,
      dynamic: { ...enabled, laborElasticity: 0, capitalGDPLevelAtReference: 0 } })
    for (let i = 0; i < staticScore.combined.years.length; i += 1) {
      expect(zero.combined.years[i]!.nominalGDP).toBeCloseTo(staticScore.combined.years[i]!.nominalGDP, 8)
      expect(zero.combined.years[i]!.overallDeficit).toBeCloseTo(staticScore.combined.years[i]!.overallDeficit, 8)
    }
    expect(zero.steadyGDPLevelChange).toBe(0)
  })

  it('phases a labor response into GDP, receipts, and debt without re-scaling pinned spending', () => {
    const score = scoreCombined({ ...defaultCombinedPolicy,
      dynamic: enabled, tax: { ...defaultCombinedPolicy.tax, rate: 0.10 } })
    expect(score.netWageLogChange).toBeGreaterThan(0)
    expect(score.steadyGDPLevelChange).toBeGreaterThan(0)
    expect(score.steadyGDPLevelChange).toBeLessThanOrEqual(0.05)
    expect(score.combined.years[0]!.nominalGDP).toBeCloseTo(score.staticCombined.years[0]!.nominalGDP, 8)
    const ten = score.combined.years[10]!, staticTen = score.staticCombined.years[10]!
    expect(ten.nominalGDP / staticTen.nominalGDP).toBeCloseTo(
      1 + score.steadyGDPLevelChange + score.steadyCapitalGDPLevelChange * 10 / 15, 8)
    expect(ten.revenue - staticTen.revenue).toBeCloseTo(
      (ten.nominalGDP - staticTen.nominalGDP) * ten.revenueRate, 6)
    expect(ten.totalPrimarySpending).toBeCloseTo(staticTen.totalPrimarySpending, 6)
    expect(ten.endingDebtGDP).toBeLessThan(staticTen.endingDebtGDP)
  })

  it('does not create a growth response when the tax policy is turned off', () => {
    const score = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false, dynamic: enabled })
    expect(score.steadyGDPLevelChange).toBe(0)
    expect(score.combined).toBe(score.staticCombined)
  })

  it('ties capital formation to cash-flow tax-base replacement with mild rate sensitivity', () => {
    const at21 = scoreCombined({ ...defaultCombinedPolicy, tax: { ...defaultCombinedPolicy.tax, rate: 0.21 },
      dynamic: { ...enabled, laborElasticity: 0 } })
    expect(at21.steadyCapitalGDPLevelChange).toBeCloseTo(0.014, 8)
    expect(at21.steadyCapitalStockChange).toBeCloseTo(0.026, 8)
    expect(at21.steadyCapitalWageChange).toBeCloseTo(0.013, 8)
    const at35 = scoreCombined({ ...defaultCombinedPolicy, dynamic: { ...enabled, laborElasticity: 0 } })
    expect(at35.steadyCapitalGDPLevelChange).toBeGreaterThan(at21.steadyCapitalGDPLevelChange)
    expect(at35.steadyCapitalGDPLevelChange).toBeLessThan(0.017)
    const noCorporateReplacement = scoreCombined({ ...defaultCombinedPolicy,
      tax: { ...defaultCombinedPolicy.tax, replacedTaxes: { ...defaultCombinedPolicy.tax.replacedTaxes,
        corporateIncome: false } }, dynamic: enabled })
    expect(noCorporateReplacement.steadyCapitalGDPLevelChange).toBe(0)
  })
})
