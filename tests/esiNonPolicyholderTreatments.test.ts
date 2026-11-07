import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import {
  calculateHealthAnalysis, defaultHealthPolicySettings,
} from '../src/tax/model/health'
import { makeConfiguration, parseConfiguration } from '../src/model/savedConfigurations'
import { exampleHouseholds } from '../src/model/householdScenario'

describe('non-policyholder ESI treatment and family continuation', () => {
  const settings = defaultCombinedPolicy.tax
  const base = defaultCombinedPolicy.health
  it('defaults to family continuation', () => {
    expect(defaultHealthPolicySettings.nonPolicyholderTreatment).toBe('continueFamilyPolicy')
    expect(defaultCombinedPolicy.health.nonPolicyholderTreatment).toBe('continueFamilyPolicy')
  })

  it('runs all three modes while retaining the unlinked family credit pool in the federal ledger', () => {
    const continuation = calculateHealthAnalysis(settings, {
      ...base, nonPolicyholderTreatment: 'continueFamilyPolicy',
    })
    const legacy = calculateHealthAnalysis(settings, {
      ...base, nonPolicyholderTreatment: 'asModeled',
    })
    const excluded = calculateHealthAnalysis(settings, {
      ...base, nonPolicyholderTreatment: 'exclude',
    })
    expect(continuation.noPolicyholderTaxUnitsMillions).toBeGreaterThan(16)
    expect(continuation.noPolicyholderWageTaxUnitsMillions).toBeGreaterThan(10)
    expect(continuation.affectedTaxUnitsMillions).toBeCloseTo(legacy.affectedTaxUnitsMillions, 5)
    expect(excluded.affectedTaxUnitsMillions).toBeLessThan(legacy.affectedTaxUnitsMillions)
    expect(excluded.excludedTaxUnitsMillions).toBeCloseTo(continuation.noPolicyholderTaxUnitsMillions, 6)
    expect(legacy.unlinkedFamilyCreditPoolBillions).toBeGreaterThan(40)
    expect(legacy.creditsHeldForFamilyPolicyReconciliationBillions).toBe(0)
    expect(continuation.creditsHeldForFamilyPolicyReconciliationBillions)
      .toBeCloseTo(legacy.unlinkedFamilyCreditPoolBillions, 6)
    expect(excluded.creditsHeldForFamilyPolicyReconciliationBillions)
      .toBeCloseTo(legacy.unlinkedFamilyCreditPoolBillions, 6)
    expect(continuation.benchmarkPremiumBillions).toBeLessThan(legacy.benchmarkPremiumBillions)
    expect(continuation.employeePremiumBillions).toBeLessThan(legacy.employeePremiumBillions)
    // No fictitious federal saving when outside-family dependent credit records disappear.
    expect(continuation.healthCreditCostBillions).toBeCloseTo(legacy.healthCreditCostBillions, 5)
    expect(excluded.healthCreditCostBillions).toBeCloseTo(legacy.healthCreditCostBillions, 5)
    expect(continuation.totalHealthCreditCostBillions).toBeCloseTo(legacy.totalHealthCreditCostBillions, 5)
    expect(excluded.totalHealthCreditCostBillions).toBeCloseTo(legacy.totalHealthCreditCostBillions, 5)
  }, 120000)

  it('does not allow the diagnostic exclusion mode to change 70-year federal receipts and debt', () => {
    const continuation = scoreCombined({
      ...defaultCombinedPolicy,
      health: { ...base, nonPolicyholderTreatment: 'continueFamilyPolicy' },
    })
    const legacy = scoreCombined({
      ...defaultCombinedPolicy,
      health: { ...base, nonPolicyholderTreatment: 'asModeled' },
    })
    const excluded = scoreCombined({
      ...defaultCombinedPolicy,
      health: { ...base, nonPolicyholderTreatment: 'exclude' },
    })
    expect(continuation.tax.netRevenue).toBeCloseTo(legacy.tax.netRevenue, 6)
    expect(excluded.tax.netRevenue).toBeCloseTo(legacy.tax.netRevenue, 6)
    for (const year of [2026, 2050, 2095]) {
      const d = (row: ReturnType<typeof scoreCombined>) =>
        row.combined.years.find(x => x.year === year)!.endingDebtGDP
      expect(d(continuation)).toBeCloseTo(d(legacy), 8)
      expect(d(excluded)).toBeCloseTo(d(legacy), 8)
    }
  }, 360000)

  it('migrates previously saved configurations to continuation and preserves explicit legacy choices', () => {
    const state = {
      policy: structuredClone(defaultCombinedPolicy),
      householdProfiles: structuredClone(exampleHouseholds),
      householdYear: 2035,
      householdSelectedId: exampleHouseholds[0]!.id,
    }
    const config = makeConfiguration('ESI migration', state, 'esi-migration')
    delete (config.scenario.policy.health as unknown as Record<string, unknown>).nonPolicyholderTreatment
    const migrated = parseConfiguration(JSON.stringify(config))
    expect(migrated.scenario.policy.health.nonPolicyholderTreatment).toBe('continueFamilyPolicy')
    config.scenario.policy.health.nonPolicyholderTreatment = 'asModeled'
    expect(parseConfiguration(JSON.stringify(config)).scenario.policy.health.nonPolicyholderTreatment)
      .toBe('asModeled')
    config.scenario.policy.health.nonPolicyholderTreatment = 'invalid' as never
    expect(() => parseConfiguration(JSON.stringify(config))).toThrow('ESI non-policyholder treatment')
  })
})
