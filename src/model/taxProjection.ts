import { calculateMacro } from '../tax/model/macro'
import type { ReformSettings } from '../tax/model/types'
import { eligiblePopulationMillions } from './demographics'
import { ssaRealCoveredWageGrowth } from '../data/trustees2026'
import type { ModelAssumptions } from './types'

/**
 * Re-express CPI-indexed dollar thresholds in the fixed microdata's wage units.
 * This moves households through a progressive schedule as real wages rise without
 * manufacturing a larger aggregate wage base: the macro compensation base itself
 * remains a fixed share of the modeled economy.
 */
export function indexedTaxSettings(tax: ReformSettings, realWageFactor: number): ReformSettings {
  const dollar = (value: number) => value / realWageFactor
  return { ...tax,
    progressiveZeroBracketPerAdult: dollar(tax.progressiveZeroBracketPerAdult),
    progressiveTopBracketPerAdult: dollar(tax.progressiveTopBracketPerAdult),
    progressiveIntermediateStartPerAdult: tax.progressiveIntermediateStartPerAdult === null ? null : dollar(tax.progressiveIntermediateStartPerAdult),
    adultCredit: dollar(tax.adultCredit),
    adultCreditPhaseOutStartPerAdult: dollar(tax.adultCreditPhaseOutStartPerAdult),
    childCredit: dollar(tax.childCredit), under6ChildCredit: dollar(tax.under6ChildCredit ?? 0),
  }
}

export function realWageGrowthFactor(year: number, a: ModelAssumptions): number {
  if (year <= 2026) return 1
  let factor = 1
  for (let y = 2027; y <= year; y += 1) {
    const annualGrowth = ssaRealCoveredWageGrowth(y) + a.realWageGrowthDeviation
    factor *= 1 + annualGrowth
  }
  return factor
}

export function realGDPPerCapitaGrowthFactor(year: number, a: ModelAssumptions): number {
  const populationFactor = eligiblePopulationMillions(year, 0, a) / eligiblePopulationMillions(2026, 0, a)
  return (1 + a.realGDPGrowth) ** (year - 2026) / populationFactor
}

/**
 * Annual reform revenue as a GDP share.
 *
 * Gross flat-tax receipts stay tied to the aggregate macro base. Progressive
 * receipts move as the explicit wage distribution crosses CPI-indexed brackets.
 * Credit eligibility follows wages, while the aggregate cost of a CPI-indexed
 * dollar credit scales with population relative to real GDP.
 */
export function taxRevenueChangePath(tax: ReformSettings, a: ModelAssumptions, insuranceCost: number): Map<number, number> {
  const result = new Map<number, number>()
  for (let year = a.reformYear; year <= a.endYear; year++) {
    const wageFactor = realWageGrowthFactor(year, a)
    const perCapitaGDPFactor = realGDPPerCapitaGrowthFactor(year, a)
    const score = calculateMacro(
      indexedTaxSettings(tax, wageFactor),
      { insuranceCreditCost: insuranceCost / wageFactor },
    )
    const creditScaleToGDP = wageFactor / perCapitaGDPFactor
    const adjustedCreditCost = (
      score.adultCreditCost + score.childCreditCost + score.insuranceCreditCost
    ) * creditScaleToGDP
    const adjustedNetRevenue = score.grossRevenue - adjustedCreditCost
    result.set(year, (adjustedNetRevenue - score.targetRevenue) / score.gdp)
  }
  return result
}
