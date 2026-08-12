import type { ModelAssumptions } from './types'

/**
 * Nominal spending path for nondefense discretionary programs.
 *
 * The starting level is calibrated as a share of 2026 GDP. Thereafter the
 * component follows its own real growth assumption plus the common inflation
 * assumption, so its GDP share can rise or fall independently of the economy.
 */
export function nonDefenseDiscretionaryBillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  const yearsSinceReform = year - assumptions.reformYear
  const startingBillions =
    assumptions.nonDefenseDiscretionaryGDP2026 *
    assumptions.startingNominalGDPBillions
  const nominalGrowth =
    (1 + assumptions.nonDefenseDiscretionaryRealGrowth) *
      (1 + assumptions.inflation) -
    1
  return startingBillions * (1 + nominalGrowth) ** yearsSinceReform
}
