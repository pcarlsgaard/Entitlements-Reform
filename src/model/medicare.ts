import { populationMillions, eligiblePopulationMillions, projectedSurvival } from './demographics'
import { nominalGDPBillionsForYear } from './budget'
import { cboCalibrationNominalGDPBillions, cboCalibrationUnder65MedicareGDP, cboMedicareNetGDP } from '../data/cboBaseline'
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
    const survivingBeneficiariesMillions = populationMillions(year, age, assumptions)
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
 * Calibrate the opening legacy senior slice once, so 2026 current law plus the explicit
 * under-65/offsetting-receipts component equals CBO's net Medicare baseline.
 * Premium support is the unscaled federal contribution. Beneficiary premiums
 * paid directly to a plan are outside that grant, so it is already a net
 * federal cost; no additional premium offset is subtracted from the grant.
 */
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
  const legacyScale = ((cboMedicareNetGDP(2026) - cboCalibrationUnder65MedicareGDP) *
    cboCalibrationNominalGDPBillions(2026)) /
    (eligiblePopulationMillions(2026, 65, defaultAssumptions) * defaultAssumptions.legacyMedicareCost2026 / 1000)
  const cohorts = result.cohorts.map((cohort) => ({
    ...cohort,
    legacyBillions: cohort.legacyBillions * legacyScale,
  }))

  return {
    ...result,
    legacyBillions: result.legacyBillions * legacyScale,
    cohorts,
  }
}

/** Total senior federal grant is a fixed share of GDP, divided by all eligibles. */
export function premiumSupportPerPersonNominal(year: number, a: ModelAssumptions, gdpFactor = 1): number {
  if (a.medicareFundingMode === 'gdpShare') {
    return a.medicareSupportGDPShare * nominalGDPBillionsForYear(year, a) * gdpFactor * 1000 /
      eligiblePopulationMillions(year, a.medicareEligibilityAge, a)
  }
  return a.premiumSupport2026 * (1 + a.premiumSupportRealGrowth) ** (year - a.reformYear) *
    (1 + a.inflation) ** (year - a.reformYear)
}
