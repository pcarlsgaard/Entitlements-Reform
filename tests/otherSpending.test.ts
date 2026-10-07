import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { defaultOtherSpendingPolicy } from '../src/model/otherSpending'

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

  it('applies one-percent nominal defense and NDD caps from the 2026 baseline levels', () => {
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
    const base2026 = result.baseline.years[0]!
    const policy2036 = result.spendingOnly.years.find(row => row.year === 2036)!
    expect(policy2036.defenseDiscretionary).toBeCloseTo(
      base2026.defenseDiscretionary * 1.01 ** 10,
      8,
    )
    expect(policy2036.nonDefenseDiscretionary).toBeCloseTo(
      base2026.nonDefenseDiscretionary * 1.01 ** 10,
      8,
    )
  })

  it('keeps nominal appropriations flat under the freeze option', () => {
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
    const base2026 = result.baseline.years[0]!
    const policy2036 = result.spendingOnly.years.find(row => row.year === 2036)!
    expect(policy2036.defenseDiscretionary).toBeCloseTo(base2026.defenseDiscretionary, 8)
    expect(policy2036.nonDefenseDiscretionary).toBeCloseTo(base2026.nonDefenseDiscretionary, 8)
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
    const through2036 = result.baseline.years
      .filter(row => row.year <= 2036)
      .reduce((sum, row, index) => {
        const policyRow = result.spendingOnly.years[index]!
        return sum + row.totalPrimarySpending - policyRow.totalPrimarySpending
      }, 0)
    expect(result.targetedOtherSpendingReferenceScoreBillions).toBe(600)
    expect(through2036).toBeCloseTo(600, 6)
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
