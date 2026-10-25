import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'

describe('CPS-weighted labor response', () => {
  it('uses the pinned CPS tax-unit snapshot', () => {
    const response = calculateLaborResponse(defaultCombinedPolicy.tax, 1)
    expect(response.sourceTaxUnits).toBe(76_652)
    expect(response.compressedCells).toBe(18_761)
    expect(response.positiveEarnerObservations).toBeGreaterThan(10_000)
    expect(Number.isFinite(response.weightedCurrentMarginalRate)).toBe(true)
    expect(Number.isFinite(response.weightedReformMarginalRate)).toBe(true)
    expect(Number.isFinite(response.netWageLogChange)).toBe(true)
    expect(response.boundedLaborWeightShare).toBeGreaterThanOrEqual(0)
    expect(response.boundedLaborWeightShare).toBeLessThanOrEqual(1)
  })

  it('responds to active configurable wage bands rather than a fixed MTR assumption', () => {
    const baseBands = defaultCombinedPolicy.tax.progressiveWageBrackets!
    const low = calculateLaborResponse({
      ...defaultCombinedPolicy.tax,
      progressiveWageBrackets: baseBands.map((band, i) => ({
        ...band, rate: [.10, .15, .20, .25][i]!,
      })),
    }, 1)
    const high = calculateLaborResponse({
      ...defaultCombinedPolicy.tax,
      progressiveWageBrackets: baseBands.map((band, i) => ({
        ...band, rate: [.25, .35, .40, .45][i]!,
      })),
    }, 1)
    expect(low.weightedCurrentMarginalRate).toBeCloseTo(high.weightedCurrentMarginalRate, 12)
    expect(high.weightedReformMarginalRate).toBeGreaterThan(low.weightedReformMarginalRate)
    expect(high.netWageLogChange).toBeLessThan(low.netWageLogChange)
    expect(high.weightedReformPersonalMarginalRate).toBeGreaterThan(low.weightedReformPersonalMarginalRate)
  })

  it('also responds to the legacy wage schedule in older saved policies', () => {
    const low = calculateLaborResponse({
      ...defaultCombinedPolicy.tax,
      progressiveWageBrackets: null,
      rate: .25, progressiveMiddleRate: .15, progressiveIntermediateRate: .20,
    }, 1)
    const high = calculateLaborResponse({
      ...defaultCombinedPolicy.tax,
      progressiveWageBrackets: null,
      rate: .45, progressiveMiddleRate: .35, progressiveIntermediateRate: .40,
    }, 1)
    expect(high.weightedReformMarginalRate).toBeGreaterThan(low.weightedReformMarginalRate)
    expect(high.netWageLogChange).toBeLessThan(low.netWageLogChange)
  })

  it('captures marginal incentives from earned-credit phase-ins', () => {
    const noPhaseIn = calculateLaborResponse({
      ...defaultCombinedPolicy.tax,
      adultCredit: 2_000,
      adultCreditMode: 'earned',
      adultCreditPhaseInRate: 0,
    }, 1)
    const phaseIn = calculateLaborResponse({
      ...defaultCombinedPolicy.tax,
      adultCredit: 2_000,
      adultCreditMode: 'earned',
      adultCreditPhaseInRate: 0.20,
    }, 1)
    expect(phaseIn.weightedReformMarginalRate).toBeLessThan(noPhaseIn.weightedReformMarginalRate)
    expect(phaseIn.netWageLogChange).toBeGreaterThan(noPhaseIn.netWageLogChange)
  })

  it('feeds the CPS response directly into the dynamic GDP calculation', () => {
    const policy = {
      ...defaultCombinedPolicy,
      dynamic: {
        ...defaultCombinedPolicy.dynamic,
        enabled: true,
        laborElasticity: 0.10,
        laborShareGDP: 0.60,
        capitalGDPLevelAtReference: 0,
      },
    }
    const result = scoreCombined(policy)
    expect(result.laborResponse).not.toBeNull()
    expect(result.netWageLogChange).toBeCloseTo(result.laborResponse!.netWageLogChange, 12)
    const uncapped = result.netWageLogChange * policy.dynamic.laborElasticity * policy.dynamic.laborShareGDP
    expect(Math.abs(uncapped)).toBeLessThan(0.05)
    expect(result.steadyGDPLevelChange).toBeCloseTo(uncapped, 12)
    expect(result.steadyCapitalGDPLevelChange).toBe(0)
  }, 20_000)
})
