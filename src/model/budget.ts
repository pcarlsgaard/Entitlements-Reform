import type { ModelAssumptions } from './types'
import {
  cboDefenseDiscretionaryGDP,
  cboMedicaidChipMarketplaceGDP,
  cboNondefenseDiscretionaryGDP,
  cboOtherMandatoryGDP,
} from '../data/cboBaseline'
import { defaultAssumptions } from './defaults'

export function nominalGDPBillionsForYear(
  year: number,
  assumptions: ModelAssumptions,
): number {
  const nominalGrowth =
    (1 + assumptions.realGDPGrowth) * (1 + assumptions.inflation) - 1
  return (
    assumptions.startingNominalGDPBillions *
    (1 + nominalGrowth) ** (year - assumptions.reformYear)
  )
}

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
  const usesCboCentralPath =
    assumptions.nonDefenseDiscretionaryGDP2026 ===
      defaultAssumptions.nonDefenseDiscretionaryGDP2026 &&
    assumptions.nonDefenseDiscretionaryRealGrowth ===
      defaultAssumptions.nonDefenseDiscretionaryRealGrowth
  if (usesCboCentralPath) {
    return (
      cboNondefenseDiscretionaryGDP(year) *
      nominalGDPBillionsForYear(year, assumptions)
    )
  }

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

export function defenseDiscretionaryBillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  return (
    cboDefenseDiscretionaryGDP(year) *
    nominalGDPBillionsForYear(year, assumptions)
  )
}

export function medicaidChipMarketplaceBillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  return (
    cboMedicaidChipMarketplaceGDP(year) *
    nominalGDPBillionsForYear(year, assumptions)
  )
}

export function otherMandatoryBillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  const levelAdjustment =
    assumptions.otherMandatoryGDP2026 /
    defaultAssumptions.otherMandatoryGDP2026
  return (
    cboOtherMandatoryGDP(year) *
    levelAdjustment *
    nominalGDPBillionsForYear(year, assumptions)
  )
}
