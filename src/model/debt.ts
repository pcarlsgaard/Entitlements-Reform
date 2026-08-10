import type { ModelAssumptions } from './types'

export function nominalGDPGrowth(assumptions: ModelAssumptions): number {
  return (
    (1 + assumptions.realGDPGrowth) * (1 + assumptions.inflation) - 1
  )
}

export function realMarketRateTarget(
  beginningDebtGDP: number,
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.baselineRealMarketRate +
    assumptions.debtSensitivity *
      Math.max(beginningDebtGDP - assumptions.startingDebtGDP, 0)
  )
}

export function nominalRateFromReal(
  realRate: number,
  inflation: number,
): number {
  return (1 + realRate) * (1 + inflation) - 1
}

export function updateEffectiveRate(
  previousEffectiveRate: number,
  nominalTargetRate: number,
  lambda: number,
): number {
  return (
    previousEffectiveRate +
    lambda * (nominalTargetRate - previousEffectiveRate)
  )
}
