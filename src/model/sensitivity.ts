import { defaultAssumptions } from './defaults'
import type { ModelAssumptions } from './types'

export const macroBudgetAssumptionKeys = [
  'currentLawSSBenefitRealGrowth',
  'cohortSizeGrowth',
  'realGDPGrowth',
  'inflation',
  'startingDebtGDP',
  'baselineRealMarketRate',
  'startingEffectiveNominalRate',
  'debtSensitivity',
  'debtRatePassThrough',
  'legacyMedicareRealGrowth',
  'otherOASDIGDP',
  'under65MedicareGDP',
  'nonDefenseDiscretionaryGDP2026',
  'nonDefenseDiscretionaryRealGrowth',
  'otherPrimaryGDP',
] as const satisfies readonly (keyof ModelAssumptions)[]

/**
 * Restores only macroeconomic and broader-budget assumptions to the central
 * defaults. Benefit design, prefunding, transition dates, and fiscal objectives
 * remain unchanged, making the resulting comparison ceteris paribus.
 */
export function centralMacroBudgetReference(
  assumptions: ModelAssumptions,
): ModelAssumptions {
  const reference = { ...assumptions }
  for (const key of macroBudgetAssumptionKeys) {
    reference[key] = defaultAssumptions[key]
  }
  return reference
}

export function hasNoncentralMacroBudgetAssumptions(
  assumptions: ModelAssumptions,
): boolean {
  return macroBudgetAssumptionKeys.some(
    (key) => assumptions[key] !== defaultAssumptions[key],
  )
}
