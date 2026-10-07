import { defaultAssumptions } from './defaults'
import { nominalGDPBillionsForYear } from './budget'
import type { ModelAssumptions } from './types'

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
 * The discretionary scores refer to appropriations policies. Because this
 * simulator carries outlays rather than budget authority/spendout vintages,
 * the CRFB presets use a transparent savings ramp calibrated to these totals.
 */
export const crfbOtherSpendingScoresBillions = {
  defenseOnePercent: 680,
  defenseFreeze: 1_150,
  nonDefenseOnePercent: 540,
  nonDefenseFreeze: 940,
  reverse2025FarmExpansion: 100,
  eliminateAllFarmSubsidies: 410,
  federalRetirementReform: 190,
} as const

const scoreWindowStart = 2026
const scoreWindowEnd = 2036

const referenceGDP = (year: number) => nominalGDPBillionsForYear(year, defaultAssumptions)
const referenceGDPBillions = Array.from(
  { length: scoreWindowEnd - scoreWindowStart + 1 },
  (_, index) => referenceGDP(scoreWindowStart + index),
).reduce((sum, value) => sum + value, 0)

const rampDenominatorGDPBillions = Array.from(
  { length: scoreWindowEnd - scoreWindowStart + 1 },
  (_, index) => {
    const year = scoreWindowStart + index
    const phase = (year - scoreWindowStart) / (scoreWindowEnd - scoreWindowStart)
    return referenceGDP(year) * phase
  },
).reduce((sum, value) => sum + value, 0)

export function scoreBillionsToPermanentGDPShare(scoreBillions: number): number {
  return scoreBillions / referenceGDPBillions
}

function discretionaryScoreBillions(
  mode: DiscretionaryPolicyMode,
  category: 'defense' | 'nonDefense',
): number {
  if (mode === 'onePercentNominal')
    return category === 'defense'
      ? crfbOtherSpendingScoresBillions.defenseOnePercent
      : crfbOtherSpendingScoresBillions.nonDefenseOnePercent
  if (mode === 'nominalFreeze')
    return category === 'defense'
      ? crfbOtherSpendingScoresBillions.defenseFreeze
      : crfbOtherSpendingScoresBillions.nonDefenseFreeze
  return 0
}

export function discretionaryReferenceScoreBillions(
  mode: DiscretionaryPolicyMode,
  category: 'defense' | 'nonDefense',
): number {
  return discretionaryScoreBillions(mode, category)
}

/**
 * Approximate the CRFB appropriations presets as a savings path against
 * discretionary outlays. Savings phase linearly from zero in 2026 to a mature
 * GDP share in 2036, calibrated so the default-GDP cumulative savings exactly
 * reproduce the CRFB score through 2036. The mature share persists thereafter.
 */
export function discretionaryPolicySavingsGDP(
  mode: DiscretionaryPolicyMode,
  category: 'defense' | 'nonDefense',
  year: number,
): number {
  const score = discretionaryScoreBillions(mode, category)
  if (score === 0) return 0
  const matureShare = score / rampDenominatorGDPBillions
  const phase = Math.max(0, Math.min(1,
    (year - scoreWindowStart) / (scoreWindowEnd - scoreWindowStart)))
  return matureShare * phase
}

/**
 * Custom nominal outlay growth is a direct model primitive, not a CRFB score.
 * Standard CRFB presets return null here because they are score-calibrated
 * through discretionaryPolicySavingsGDP instead.
 */
export function discretionaryNominalGrowth(
  mode: DiscretionaryPolicyMode,
  customGrowth: number,
): number | null {
  return mode === 'customNominal' ? customGrowth : null
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

export function totalReferenceScoreBillions(policy: OtherSpendingPolicy): number {
  return targetedReferenceScoreBillions(policy) +
    discretionaryReferenceScoreBillions(policy.defenseMode, 'defense') +
    discretionaryReferenceScoreBillions(policy.nonDefenseMode, 'nonDefense')
}
