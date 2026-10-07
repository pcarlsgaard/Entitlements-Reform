import type { ModelAssumptions } from './types'
import { defaultAssumptions } from './defaults'
import { nominalGDPBillionsForYear } from './budget'

export type DiscretionaryPolicyMode =
  | 'currentLaw'
  | 'onePercentNominal'
  | 'nominalFreeze'
  | 'customNominal'

export type FarmSubsidyPolicy =
  | 'currentLaw'
  | 'reverse2025Expansion'
  | 'eliminateAll'

export interface OtherSpendingPolicy {
  defenseMode: DiscretionaryPolicyMode
  nonDefenseMode: DiscretionaryPolicyMode
  defenseCustomNominalGrowth: number
  nonDefenseCustomNominalGrowth: number
  farmSubsidyPolicy: FarmSubsidyPolicy
  federalRetirementReform: boolean
}

export const defaultOtherSpendingPolicy: OtherSpendingPolicy = {
  defenseMode: 'currentLaw',
  nonDefenseMode: 'currentLaw',
  defenseCustomNominalGrowth: 0.01,
  nonDefenseCustomNominalGrowth: 0.01,
  farmSubsidyPolicy: 'currentLaw',
  federalRetirementReform: false,
}

/**
 * Current CRFB Debt Fixer reference scores, cumulative through 2036.
 * These are used only to calibrate the targeted-policy savings path; broad
 * discretionary caps are modeled directly from their annual nominal growth rule.
 */
export const crfbOtherSpendingScoresBillions = {
  reverse2025FarmExpansion: 100,
  eliminateAllFarmSubsidies: 410,
  federalRetirementReform: 190,
} as const

const scoreWindowStart = 2026
const scoreWindowEnd = 2036

const referenceGDPBillions = Array.from(
  { length: scoreWindowEnd - scoreWindowStart + 1 },
  (_, index) => nominalGDPBillionsForYear(scoreWindowStart + index, defaultAssumptions),
).reduce((sum, value) => sum + value, 0)

export function scoreBillionsToPermanentGDPShare(scoreBillions: number): number {
  return scoreBillions / referenceGDPBillions
}

/**
 * Targeted CRFB options are normalized to a constant share of GDP whose
 * cumulative savings reproduce the quoted CRFB score through 2036 under the
 * simulator's default nominal-GDP path. This is an explicit long-run
 * extrapolation, not a CRFB score beyond 2036.
 */
export function otherMandatoryPolicySavingsGDP(policy: OtherSpendingPolicy): number {
  const farmScore =
    policy.farmSubsidyPolicy === 'eliminateAll'
      ? crfbOtherSpendingScoresBillions.eliminateAllFarmSubsidies
      : policy.farmSubsidyPolicy === 'reverse2025Expansion'
        ? crfbOtherSpendingScoresBillions.reverse2025FarmExpansion
        : 0
  const retirementScore = policy.federalRetirementReform
    ? crfbOtherSpendingScoresBillions.federalRetirementReform
    : 0
  return scoreBillionsToPermanentGDPShare(farmScore + retirementScore)
}

export function discretionaryNominalGrowth(
  mode: DiscretionaryPolicyMode,
  customGrowth: number,
): number | null {
  if (mode === 'currentLaw') return null
  if (mode === 'onePercentNominal') return 0.01
  if (mode === 'nominalFreeze') return 0
  return customGrowth
}

export function discretionaryPolicyBillions(
  year: number,
  startingGDPShare: number,
  nominalGrowth: number,
  assumptions: ModelAssumptions,
): number {
  const startingBillions = startingGDPShare * assumptions.startingNominalGDPBillions
  return startingBillions * (1 + nominalGrowth) ** (year - assumptions.reformYear)
}

export function targetedReferenceScoreBillions(policy: OtherSpendingPolicy): number {
  const farm =
    policy.farmSubsidyPolicy === 'eliminateAll'
      ? crfbOtherSpendingScoresBillions.eliminateAllFarmSubsidies
      : policy.farmSubsidyPolicy === 'reverse2025Expansion'
        ? crfbOtherSpendingScoresBillions.reverse2025FarmExpansion
        : 0
  return farm + (policy.federalRetirementReform
    ? crfbOtherSpendingScoresBillions.federalRetirementReform
    : 0)
}
