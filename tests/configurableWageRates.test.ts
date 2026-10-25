import { describe, expect, it } from 'vitest'
import { calculateHousehold, calculateReformWageTax } from '../src/tax/model/household'
import { calculateMacro } from '../src/tax/model/macro'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import { marginalProtectionPresets } from '../src/tax/model/wageBrackets'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { indexedTaxSettings } from '../src/model/taxProjection'
import { exampleHouseholds } from '../src/model/householdScenario'
import { makeConfiguration, parseConfiguration } from '../src/model/savedConfigurations'

const configuredTax = () => ({
  ...defaultCombinedPolicy.tax,
  progressiveWageBrackets: marginalProtectionPresets[4].map(band => ({ ...band })),
})

describe('shared flexible X-tax schedule', () => {
  it('defaults to the same 17.5/25/30/35 ladder as the tax-reform simulator', () => {
    expect(defaultCombinedPolicy.tax.progressiveWageBrackets).toEqual(marginalProtectionPresets[4])
    const tax = configuredTax()
    expect(calculateReformWageTax(10000,'single',tax)).toBeCloseTo(1750,8)
    expect(calculateReformWageTax(250000,'single',tax))
      .toBeCloseTo(70000*.175 + 150000*.25 + 30000*.30,8)
    expect(calculateReformWageTax(200000,'married',tax))
      .toBeCloseTo(2*calculateReformWageTax(100000,'single',tax),8)
  })

  it('preserves the credit-driven 7.5% effective introductory rate and the 5-band negative rate', () => {
    const input = { filingStatus:'single' as const, cashWage:10000, children:0 }
    expect(calculateHousehold(input,configuredTax()).reformMarginalRate).toBeCloseTo(.075,7)
    expect(calculateHousehold(input,{...configuredTax(),
      progressiveWageBrackets: marginalProtectionPresets[5]}).reformMarginalRate).toBeCloseTo(-.025,7)
  })

  it('rescores national wage receipts and holds wage bracket rates fixed when solving business revenue neutrality', () => {
    const tax = configuredTax()
    const current = calculateMacro(tax)
    const original = calculateMacro({...tax,progressiveWageBrackets:null})
    expect(current.grossRevenue).toBeLessThan(original.grossRevenue)
    const solved = calculateMacro({...tax,rate:current.revenueNeutralRate})
    expect(solved.netRevenue).toBeCloseTo(solved.targetRevenue,5)
  })

  it('indexes each threshold on the same CPI convention as original brackets', () => {
    const tax = configuredTax()
    const priceIndexed = indexedTaxSettings(tax,1.10,'cpi')
    expect(priceIndexed.progressiveWageBrackets![0]!.upperPerAdult).toBeCloseTo(70000/1.1,8)
    expect(priceIndexed.progressiveWageBrackets!.at(-1)!.upperPerAdult).toBeNull()
    expect(indexedTaxSettings(tax,1.10,'wageBrackets').progressiveWageBrackets)
      .toEqual(tax.progressiveWageBrackets)
  })

  it('calculates both personal and employer-cost marginal rates without double-counting labor GDP', () => {
    const tax = configuredTax()
    const labor = calculateLaborResponse(tax,1)
    for(const value of [
      labor.weightedCurrentPersonalMarginalRate,
      labor.weightedReformPersonalMarginalRate,
      labor.weightedCurrentMarginalRate,
      labor.weightedReformMarginalRate,
    ]) expect(Number.isFinite(value)).toBe(true)
    expect(labor.workerShareHigherWedge).toBeGreaterThanOrEqual(0)
    expect(labor.workerShareHigherWedge).toBeLessThanOrEqual(1)
    expect(labor.workerShareHigherPersonalRate).toBeGreaterThanOrEqual(0)
    expect(labor.workerShareHigherPersonalRate).toBeLessThanOrEqual(1)
    const score = scoreCombined({...defaultCombinedPolicy,
      dynamic:{...defaultCombinedPolicy.dynamic,enabled:true,capitalGDPLevelAtReference:0}})
    expect(score.laborResponse?.weightedReformPersonalMarginalRate)
      .toBeCloseTo(labor.weightedReformPersonalMarginalRate,8)
    expect(score.steadyGDPLevelChange).toBeCloseTo(Math.max(-.05,Math.min(.05,
      score.netWageLogChange*defaultCombinedPolicy.dynamic.laborElasticity*defaultCombinedPolicy.dynamic.laborShareGDP)),8)
  })

  it('keeps saved pre-ladder configurations on their original bracket system', () => {
    const scenario = {
      policy: structuredClone(defaultCombinedPolicy),
      householdProfiles: structuredClone(exampleHouseholds),
      householdYear: 2035,
      householdSelectedId: exampleHouseholds[0]!.id,
    }
    const legacy = makeConfiguration('Legacy wage tax',scenario,'legacy-rate')
    delete (legacy.scenario.policy.tax as unknown as Record<string, unknown>).progressiveWageBrackets
    const restored = parseConfiguration(JSON.stringify(legacy))
    expect(restored.scenario.policy.tax.progressiveWageBrackets).toBeNull()
    const newSaved = makeConfiguration('New wage tax',scenario,'ladder')
    expect(parseConfiguration(JSON.stringify(newSaved)).scenario.policy.tax.progressiveWageBrackets)
      .toEqual(marginalProtectionPresets[4])
    const bad = structuredClone(newSaved)
    bad.scenario.policy.tax.progressiveWageBrackets![0]!.upperPerAdult = 999999
    expect(() => parseConfiguration(JSON.stringify(bad))).toThrow(/threshold/)
  })
})
