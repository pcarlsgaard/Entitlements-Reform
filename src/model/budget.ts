import type { ModelAssumptions } from './types'
import {
  cboDefenseDiscretionaryGDP,
  cboMedicaidChipMarketplaceGDP,
  cboMedicaidShareOfCombinedHealthLine,
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
  if (assumptions.nonDefenseDiscretionaryMode === 'cbo') {
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

// MACStats FY2023 benefit amounts and direct service shares (Exhibit 18).
// Disability includes all spending in that eligibility group. Outside that
// group, retain identified LTSS and existing Medicare premium assistance.
// Managed care is a separate bucket and can contain additional LTSS.
const medicaidBenefitGroups = [
  { spending: 132.6, retainedShare: .028, expansion: false }, // children
  { spending: 191.5, retainedShare: .026, expansion: true },
  { spending: 99.5, retainedShare: .017, expansion: false }, // other adults
  { spending: 245.8, retainedShare: 1, expansion: false }, // disability
  { spending: 180.8, retainedShare: .467, expansion: false }, // aged
]
const expansionFederalMatch = .90
// Approximate the regular match so the FY2023 mix reconciles to the FY2024
// national benefit match, following the expiration of enhanced COVID matching.
const regularFederalMatch = (.647 * 850.2 - expansionFederalMatch * 191.5) / (850.2 - 191.5)
const retainedFederalMedicaidShare = medicaidBenefitGroups.reduce((sum, group) =>
  sum + group.spending * group.retainedShare *
    (group.expansion ? expansionFederalMatch : regularFederalMatch), 0) / (.647 * 850.2)

export function retainedMedicaidBillions(year: number, assumptions: ModelAssumptions): number {
  return medicaidChipMarketplaceBillions(year, assumptions) *
    cboMedicaidShareOfCombinedHealthLine(year) * retainedFederalMedicaidShare
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
