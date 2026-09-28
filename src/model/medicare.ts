import { populationMillions, eligiblePopulationMillions, projectedSurvival } from './demographics'
import { nominalGDPBillionsForYear } from './budget'
import { cboBaselineEndYear, cboCalibrationNominalGDPBillions, cboCalibrationUnder65MedicareGDP, cboMedicareNetGDP } from '../data/cboBaseline'
import { cmsMedicareEnrollmentMillions, cmsMedicareGrossGDP } from '../data/trustees2026'
import { defaultAssumptions } from './defaults'
import {
  fullyPrefundsMedicare,
  usesCohortFundingSchedule,
} from './fundingStrategy'
import { clamp } from './socialSecurity'
import type {
  EntitlementDesign,
  MedicareYearResult,
  ModelAssumptions,
} from './types'

export type MedicarePrefundedShareResolver = (
  eligibilityYear: number,
) => number

function medicareEnrollmentGrowthAdjustment(year: number): number {
  const trusteesIndex = cmsMedicareEnrollmentMillions(year) / cmsMedicareEnrollmentMillions(2026)
  const seniorPopulationIndex = eligiblePopulationMillions(year, 65, defaultAssumptions) /
    eligiblePopulationMillions(2026, 65, defaultAssumptions)
  return trusteesIndex / seniorPopulationIndex
}

export function medicareEligiblePopulationMillions(
  year: number,
  assumptions: ModelAssumptions,
): number {
  let total = 0
  const adjustment = medicareEnrollmentGrowthAdjustment(year)
  for (let age = assumptions.medicareEligibilityAge; age <= assumptions.maxModeledAge; age += 1)
    total += populationMillions(year, age, assumptions) * adjustment
  return total
}

export function firstPrefundedMedicareEligibilityYear(
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.reformYear +
    assumptions.medicareEligibilityAge -
    assumptions.prefundingStartAge
  )
}

export function newEntrantPremiumSupportShare(
  eligibilityYear: number,
  assumptions: ModelAssumptions,
): number {
  if (eligibilityYear >= assumptions.medicareYearA) return 1
  if (eligibilityYear <= assumptions.reformYear) return 0
  return clamp(
    (eligibilityYear - assumptions.reformYear) /
      (assumptions.medicareYearA - assumptions.reformYear),
  )
}

export function medicarePremiumSupportShare(
  eligibilityYear: number,
  auditYear: number,
  assumptions: ModelAssumptions,
): number {
  if (auditYear >= assumptions.medicareYearB) return 1
  const entrantShare = newEntrantPremiumSupportShare(
    eligibilityYear,
    assumptions,
  )
  if (auditYear <= assumptions.medicareYearA) return entrantShare
  const existingBeneficiaryConversion = clamp(
    (auditYear - assumptions.medicareYearA) /
      (assumptions.medicareYearB - assumptions.medicareYearA),
  )
  return Math.max(entrantShare, existingBeneficiaryConversion)
}

export function isMedicareComponentPrefunded(
  eligibilityYear: number,
  assumptions: ModelAssumptions,
): boolean {
  return (
    fullyPrefundsMedicare(assumptions.fundingStrategy) &&
    eligibilityYear >= firstPrefundedMedicareEligibilityYear(assumptions)
  )
}

function rawMedicareForYear(
  year: number,
  assumptions: ModelAssumptions,
  resolvePrefundedShare?: MedicarePrefundedShareResolver,
  entitlementDesign: EntitlementDesign = 'reform',
): MedicareYearResult {
  if (
    entitlementDesign === 'reform' &&
    usesCohortFundingSchedule(assumptions.fundingStrategy) &&
    !resolvePrefundedShare
  ) {
    throw new Error(
      'Sequential Medicare financing requires its cohort funding schedule.',
    )
  }
  const cohorts: MedicareYearResult['cohorts'] = []
  const firstEligibilityYear =
    year - (assumptions.maxModeledAge - assumptions.medicareEligibilityAge)
  const inflationFactor =
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  const legacyCost =
    assumptions.legacyMedicareCost2026 *
    (1 + assumptions.legacyMedicareRealGrowth) **
      (year - assumptions.reformYear) *
    inflationFactor
  const premiumSupport = premiumSupportPerPersonNominal(year, assumptions)

  for (
    let eligibilityYear = firstEligibilityYear;
    eligibilityYear <= year;
    eligibilityYear += 1
  ) {
    const age = assumptions.medicareEligibilityAge + year - eligibilityYear
    const survivalFraction = projectedSurvival(assumptions.medicareEligibilityAge, age,
      eligibilityYear - assumptions.medicareEligibilityAge)
    const survivingBeneficiariesMillions =
      populationMillions(year, age, assumptions) * medicareEnrollmentGrowthAdjustment(year)
    const initialCohortMillions = survivalFraction > 0 ? survivingBeneficiariesMillions / survivalFraction : 0
    const premiumSupportShare =
      entitlementDesign === 'currentLaw'
        ? 0
        : medicarePremiumSupportShare(eligibilityYear, year, assumptions)
    const legacyShare = 1 - premiumSupportShare
    const prefundedShare = clamp(
      entitlementDesign === 'currentLaw'
        ? 0
        : resolvePrefundedShare
          ? resolvePrefundedShare(eligibilityYear)
          : isMedicareComponentPrefunded(eligibilityYear, assumptions)
            ? 1
            : 0,
    )

    cohorts.push({
      eligibilityYear,
      premiumSupportShare,
      legacyShare,
      initialCohortMillions,
      survivingBeneficiariesMillions,
      prefundedShare,
      legacyBillions:
        (survivingBeneficiariesMillions * legacyShare * legacyCost) / 1_000,
      premiumSupportPaygoBillions:
        (survivingBeneficiariesMillions *
          premiumSupportShare *
          premiumSupport *
          (1 - prefundedShare)) /
        1_000,
    })
  }

  return {
    legacyBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.legacyBillions,
      0,
    ),
    premiumSupportPaygoBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.premiumSupportPaygoBillions,
      0,
    ),
    cohorts,
  }
}

/**
 * Current-law Medicare is calibrated to CBO's net program share through 2056.
 * After CBO's horizon, the net share follows the growth of the 2026 Medicare
 * Trustees' total-expenditure share. The gross Trustees level is used only as
 * a growth index so beneficiary premiums/offsetting receipts are not double counted.
 */
function scheduledMedicareNetGDP(year: number): number {
  if (year <= cboBaselineEndYear) return cboMedicareNetGDP(year)
  return cboMedicareNetGDP(cboBaselineEndYear) *
    cmsMedicareGrossGDP(year) / cmsMedicareGrossGDP(cboBaselineEndYear)
}

export function medicareForYear(
  year: number,
  assumptions: ModelAssumptions,
  resolvePrefundedShare?: MedicarePrefundedShareResolver,
  entitlementDesign: EntitlementDesign = 'reform',
): MedicareYearResult {
  const result = rawMedicareForYear(
    year,
    assumptions,
    resolvePrefundedShare,
    entitlementDesign,
  )
  const centralCurrentLaw = rawMedicareForYear(
    year,
    defaultAssumptions,
    undefined,
    'currentLaw',
  )
  const targetLegacyBillions = Math.max(
    0,
    scheduledMedicareNetGDP(year) - cboCalibrationUnder65MedicareGDP,
  ) * cboCalibrationNominalGDPBillions(year)
  const legacyScale = centralCurrentLaw.legacyBillions > 0
    ? targetLegacyBillions / centralCurrentLaw.legacyBillions
    : 1
  const cohorts = result.cohorts.map((cohort) => ({
    ...cohort,
    legacyBillions: cohort.legacyBillions * legacyScale,
  }))

  return {
    ...result,
    legacyBillions: cohorts.reduce((sum, cohort) => sum + cohort.legacyBillions, 0),
    cohorts,
  }
}

/** Total senior federal grant is a fixed share of GDP, divided by modeled enrollees. */
export function premiumSupportPerPersonNominal(year: number, a: ModelAssumptions, gdpFactor = 1): number {
  if (a.medicareFundingMode === 'gdpShare') {
    return a.medicareSupportGDPShare * nominalGDPBillionsForYear(year, a) * gdpFactor * 1000 /
      medicareEligiblePopulationMillions(year, a)
  }
  return a.premiumSupport2026 * (1 + a.premiumSupportRealGrowth) ** (year - a.reformYear) *
    (1 + a.inflation) ** (year - a.reformYear)
}
