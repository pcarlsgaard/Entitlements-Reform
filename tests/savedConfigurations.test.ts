import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { exampleHouseholds } from '../src/model/householdScenario'
import { makeConfiguration, parseConfiguration, parseConfigurationLibrary } from '../src/model/savedConfigurations'

const scenario = () => ({
  policy: { ...defaultCombinedPolicy,
    tax: { ...defaultCombinedPolicy.tax, rate: 0.32, progressiveIntermediateStartPerAdult: null },
    benefits: { ...defaultCombinedPolicy.benefits, medicareReform: true },
    assumptions: { ...defaultCombinedPolicy.assumptions, premiumSupport2026: 22000 },
    dynamic: { ...defaultCombinedPolicy.dynamic, enabled: true } },
  householdProfiles: exampleHouseholds.map(item => ({ ...item,
    childAges2026: [...item.childAges2026], receives: { ...item.receives },
    manualAnnualBenefits2026: { ...item.manualAnnualBenefits2026 },
    ...(item.id === 'single-parent' ? { primaryWage2026: 36000, childAges2026: [2, 7] } : {}) })),
  householdYear: 2050,
  householdSelectedId: 'single-parent',
})

describe('portable named simulator configurations', () => {
  it('round-trips policy, assumptions, edited households and selected year through JSON', () => {
    const saved = makeConfiguration('  Test proposal  ', scenario(), 'test-id')
    const imported = parseConfiguration(JSON.stringify(saved))
    expect(imported.name).toBe('Test proposal')
    expect(imported.scenario).toEqual(scenario())
    expect(imported.scenario.policy.tax.progressiveIntermediateStartPerAdult).toBeNull()
    expect(imported.scenario.householdProfiles[0]!.childAges2026).toEqual([2, 7])
    expect(parseConfigurationLibrary(JSON.stringify([saved]))).toEqual([saved])
  })

  it('rejects unsupported files and malformed values before loading the model', () => {
    const valid = makeConfiguration('Test', scenario(), 'test-id')
    expect(() => parseConfiguration('{broken')).toThrow(/valid JSON/)
    expect(() => parseConfiguration(JSON.stringify({ ...valid, version: 2 }))).toThrow(/version 1/)
    expect(() => parseConfiguration(JSON.stringify({ ...valid, scenario: {
      ...valid.scenario, policy: { ...valid.scenario.policy, assumptions: {
        ...valid.scenario.policy.assumptions, fullRetirementAge: -1000,
      } },
    } }))).toThrow(/retirement age/)
    expect(() => parseConfiguration(JSON.stringify({ ...valid, scenario: {
      ...valid.scenario, policy: { ...valid.scenario.policy, baselineMode: 'anything' },
    } }))).toThrow(/baseline mode/)
  })
})
