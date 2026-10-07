import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { defaultOtherSpendingPolicy } from '../src/model/otherSpending'

function primarySavingsThrough2036(result: ReturnType<typeof scoreCombined>): number {
  return result.baseline.years
    .filter(row => row.year <= 2036)
    .reduce((sum, row, index) =>
      sum + row.totalPrimarySpending - result.spendingOnly.years[index]!.totalPrimarySpending, 0)
}

describe('other spending policy module', () => {
  it('is neutral when the spending module is disabled', () => {
    const result = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false, spendingEnabled: false })
    for (let i = 0; i < result.baseline.years.length; i += 1) {
      expect(result.spendingOnly.years[i]!.totalPrimarySpending).toBeCloseTo(
        result.baseline.years[i]!.totalPrimarySpending,
        10,
      )
      expect(result.spendingOnly.years[i]!.endingDebtGDP).toBeCloseTo(
        result.baseline.years[i]!.endingDebtGDP,
        10,
      )
    }
  })

  it('reproduces the CRFB 1-percent defense and NDD scores through 2036', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      taxEnabled: false,
      spendingEnabled: true,
      otherSpending: {
        ...defaultOtherSpendingPolicy,
        defenseMode: 'onePercentNominal',
        nonDefenseMode: 'onePercentNominal',
      },
    })
    expect(result.totalOtherSpendingReferenceScoreBillions).toBe(1_220)
    expect(primarySavingsThrough2036(result)).toBeCloseTo(1_220, 6)
  })

  it('reproduces the CRFB nominal-freeze defense and NDD scores through 2036', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      taxEnabled: false,
      spendingEnabled: true,
      otherSpending: {
        ...defaultOtherSpendingPolicy,
        defenseMode: 'nominalFreeze',
        nonDefenseMode: 'nominalFreeze',
      },
    })
    expect(result.totalOtherSpendingReferenceScoreBillions).toBe(2_090)
    expect(primarySavingsThrough2036(result)).toBeCloseTo(2_090, 6)
  })

  it('keeps custom nominal outlay growth as a direct model primitive', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      taxEnabled: false,
      spendingEnabled: true,
      otherSpending: {
        ...defaultOtherSpendingPolicy,
        nonDefenseMode: 'customNominal',
        nonDefenseCustomNominalGrowth: 0.01,
      },
    })
    const base2026 = result.baseline.years[0]!
    const policy2036 = result.spendingOnly.years.find(row => row.year === 2036)!
    expect(policy2036.nonDefenseDiscretionary).toBeCloseTo(
      base2026.nonDefenseDiscretionary * 1.01 ** 10,
      8,
    )
  })

  it('reproduces selected CRFB targeted scores through 2036 on the default GDP path', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      taxEnabled: false,
      spendingEnabled: true,
      otherSpending: {
        ...defaultOtherSpendingPolicy,
        farmSubsidyPolicy: 'eliminateAll',
        federalRetirementReform: true,
      },
    })
    expect(result.targetedOtherSpendingReferenceScoreBillions).toBe(600)
    expect(result.totalOtherSpendingReferenceScoreBillions).toBe(600)
    expect(primarySavingsThrough2036(result)).toBeCloseTo(600, 6)
  })

  it('keeps spending-only effects separate from tax-only and benefit-only paths', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      spendingEnabled: true,
      otherSpending: {
        ...defaultOtherSpendingPolicy,
        nonDefenseMode: 'nominalFreeze',
      },
    })
    const index = 2036 - 2026
    expect(result.spendingOnly.years[index]!.nonDefenseDiscretionary).toBeLessThan(
      result.baseline.years[index]!.nonDefenseDiscretionary,
    )
    expect(result.taxOnly.years[index]!.nonDefenseDiscretionary).toBeCloseTo(
      result.baseline.years[index]!.nonDefenseDiscretionary,
      8,
    )
    expect(result.benefitsOnly.years[index]!.nonDefenseDiscretionary).toBeCloseTo(
      result.baseline.years[index]!.nonDefenseDiscretionary,
      8,
    )
  })
})
