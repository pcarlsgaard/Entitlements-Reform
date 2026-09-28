import { calculateMacro } from '../tax/model/macro'
import type { ReformSettings } from '../tax/model/types'
import { eligiblePopulationMillions } from './demographics'
import type { ModelAssumptions } from './types'

/** Re-express CPI-indexed dollar thresholds in the fixed microdata's income units.
 * Real income grows with GDP per person; the within-population income distribution
 * and age mix of tax units are held fixed. No nominal bracket creep is introduced.
 */
export function indexedTaxSettings(tax: ReformSettings, realIncomeFactor: number): ReformSettings {
  const dollar = (value: number) => value / realIncomeFactor
  return { ...tax,
    progressiveZeroBracketPerAdult: dollar(tax.progressiveZeroBracketPerAdult),
    progressiveTopBracketPerAdult: dollar(tax.progressiveTopBracketPerAdult),
    progressiveIntermediateStartPerAdult: tax.progressiveIntermediateStartPerAdult === null ? null : dollar(tax.progressiveIntermediateStartPerAdult),
    adultCredit: dollar(tax.adultCredit),
    adultCreditPhaseOutStartPerAdult: dollar(tax.adultCreditPhaseOutStartPerAdult),
    childCredit: dollar(tax.childCredit), under6ChildCredit: dollar(tax.under6ChildCredit ?? 0),
  }
}
export function realIncomeGrowthFactor(year: number, a: ModelAssumptions): number {
  const populationFactor = eligiblePopulationMillions(year, 0, a) / eligiblePopulationMillions(2026, 0, a)
  return (1 + a.realGDPGrowth) ** (year - 2026) / populationFactor
}
export function taxRevenueChangePath(tax: ReformSettings, a: ModelAssumptions, insuranceCost: number): Map<number, number> {
  const result = new Map<number, number>()
  for (let year = a.reformYear; year <= a.endYear; year++) {
    const income = realIncomeGrowthFactor(year, a)
    const score = calculateMacro(indexedTaxSettings(tax, income), { insuranceCreditCost: insuranceCost / income })
    result.set(year, (score.netRevenue - score.targetRevenue) / score.gdp)
  }
  return result
}
