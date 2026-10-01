import { populationMillions, eligiblePopulationMillions, projectedSurvival } from './demographics'
import { actuarialClaimFactor, currentLawClaimFactor, representativeWorkCredits, workCreditFraction } from './claiming'
import { cboBaselineEndYear, cboCalibrationNominalGDPBillions, cboCalibrationOtherOASDIGDP, cboSocialSecurityGDP } from '../data/cboBaseline'
import { ssaOasdiCostGDP, ssaRetiredWorkerMillions } from '../data/trustees2026'
import { currentLawRetirementAge, defaultAssumptions } from './defaults'
import { applySocialSecurityCOLAs, socialSecurityBenefitCapNominal } from './socialSecurityPolicy'
import {
  fullyPrefundsSocialSecurity,
  usesSavingsFundedSequence,
} from './fundingStrategy'
import type {
  BenefitShares,
  EntitlementDesign,
  ModelAssumptions,
  SSCohortAudit,
  SocialSecurityYearResult,
} from './types'

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function socialSecurityBenefitShares(
  retirementYear: number,
  assumptions: ModelAssumptions,
): BenefitShares {
  const flatShare = clamp(
    (retirementYear - assumptions.reformYear) /
      assumptions.benefitPhaseInYears,
  )
  return { legacyShare: 1 - flatShare, flatShare }
}

export function flatBenefitReal(
  year: number,
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.individualFPL2026 *
    assumptions.flatBenefitFPLMultiple *
    (1 + assumptions.realFPLGrowth) ** (year - assumptions.reformYear)
  )
}

/** Real growth affects new awards only. Existing awards receive the selected post-award COLA. */
export function legacySocialSecurityBenefitNominal(
  retirementYear: number,
  year: number,
  assumptions: ModelAssumptions,
  usePolicyCOLA = true,
  claimYear = retirementYear,
): number {
  const yearsToReferenceAward = Math.max(
    0,
    retirementYear - assumptions.reformYear,
  )
  const initialYear = Math.max(claimYear, assumptions.reformYear)
  const yearsToInitialYear = Math.max(
    0,
    initialYear - assumptions.reformYear,
  )
  const initialBenefit = assumptions.currentLawSSBenefit2026 *
    (1 + assumptions.currentLawSSBenefitRealGrowth) ** yearsToReferenceAward *
    (1 + assumptions.inflation) ** yearsToInitialYear
  return applySocialSecurityCOLAs(
    initialBenefit,
    initialYear,
    year,
    assumptions,
    usePolicyCOLA,
  )
}

export function flatSocialSecurityBenefitNominal(
  birthYear: number,
  claimYear: number,
  year: number,
  assumptions: ModelAssumptions,
  usePolicyCOLA = true,
  creditedYears = representativeWorkCredits(assumptions),
): number {
  const yearsToClaim = Math.max(0, claimYear - assumptions.reformYear)
  const initialBenefit =
    flatBenefitReal(claimYear, assumptions) *
    (1 + assumptions.inflation) ** yearsToClaim *
    actuarialClaimFactor(birthYear, claimYear - birthYear, assumptions) *
    workCreditFraction(creditedYears, assumptions)
  return applySocialSecurityCOLAs(
    initialBenefit,
    Math.max(claimYear, assumptions.reformYear),
    year,
    assumptions,
    usePolicyCOLA,
  )
}

export function firstPrefundedSSRetirementYear(
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.reformYear +
    assumptions.fullRetirementAge -
    assumptions.prefundingStartAge
  )
}

export function isSSFlatComponentPrefunded(
  retirementYear: number,
  assumptions: ModelAssumptions,
): boolean {
  return (
    fullyPrefundsSocialSecurity(assumptions.fundingStrategy) &&
    retirementYear >= firstPrefundedSSRetirementYear(assumptions)
  )
}

export type SocialSecurityPrefundedShareResolver = (
  retirementYear: number,
) => number

export function cohortSizeMillions(
  cohortEntryYear: number,
  assumptions: ModelAssumptions,
): number {
  return (
    assumptions.cohortSizeMillions2026 *
    (1 + assumptions.cohortSizeGrowth) **
      (cohortEntryYear - assumptions.reformYear)
  )
}

/** SSA population reaching the selected age in this year, with explicit scenario scaling. */
export function cohortSizeAtAgeMillions(
  cohortEntryYear: number,
  age: number,
  assumptions: ModelAssumptions,
): number {
  return populationMillions(cohortEntryYear, age, assumptions)
}

function rawSocialSecurityForYear(
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
  resolvePrefundedShare?: SocialSecurityPrefundedShareResolver,
): SocialSecurityYearResult {
  if (
    entitlementDesign === 'reform' &&
    usesSavingsFundedSequence(assumptions.fundingStrategy) &&
    !resolvePrefundedShare
  ) {
    throw new Error(
      'Savings-funded Social Security financing requires its cohort funding schedule.',
    )
  }
  const cohorts: SSCohortAudit[] = []
  const beneficiaryGrowthAdjustment = retiredWorkerGrowthAdjustment(year)

  for (
    let age = assumptions.maxModeledAge;
    age >= 62;
    age -= 1
  ) {
    const birthYear = year - age
    const alreadyRetired = assumptions.reformYear - birthYear >= currentLawRetirementAge
    const retirementAge = entitlementDesign === 'currentLaw' || alreadyRetired
      ? currentLawRetirementAge : assumptions.socialSecurityClaimAge
    if (age < retirementAge) continue
    // Reference cohort date locks the transition blend independently of claiming.
    const retirementYear = birthYear + (entitlementDesign === 'currentLaw' || alreadyRetired
      ? currentLawRetirementAge : assumptions.fullRetirementAge)
    const claimYear = birthYear + retirementAge
    const currentLawBenefit = legacySocialSecurityBenefitNominal(
      birthYear + 67,
      year,
      assumptions,
      entitlementDesign === 'reform',
      claimYear,
    ) * currentLawClaimFactor(retirementAge)
    const survivalFraction = projectedSurvival(retirementAge, age, birthYear)
    const survivingBeneficiariesMillions =
      populationMillions(year, age, assumptions) * ssParticipation * beneficiaryGrowthAdjustment
    const initialCohortMillions = survivalFraction > 0 ? survivingBeneficiariesMillions / survivalFraction : 0
    const individualFlatBenefit = flatSocialSecurityBenefitNominal(
      birthYear,
      claimYear,
      year,
      assumptions,
      entitlementDesign === 'reform',
    )
    const { legacyShare, flatShare } =
      entitlementDesign === 'currentLaw'
        ? { legacyShare: 1, flatShare: 0 }
        : socialSecurityBenefitShares(retirementYear, assumptions)
    const prefundedShare = clamp(
      entitlementDesign === 'currentLaw'
        ? 0
        : resolvePrefundedShare
          ? resolvePrefundedShare(retirementYear)
          : isSSFlatComponentPrefunded(retirementYear, assumptions)
            ? 1
            : 0,
    )
    const prefunded = prefundedShare > 0
    const legacyPaygoBillions =
      (survivingBeneficiariesMillions * legacyShare * currentLawBenefit) /
      1_000
    const flatBenefitBillions =
      (survivingBeneficiariesMillions * flatShare * individualFlatBenefit) / 1_000
    const flatPaygoBillions = flatBenefitBillions * (1 - prefundedShare)

    cohorts.push({
      birthYear,
      legacyBenefitPerPerson: currentLawBenefit,
      flatBenefitPerPerson: individualFlatBenefit,
      claimAge: retirementAge,
      claimYear,
      retirementYear,
      initialCohortMillions,
      survivingBeneficiariesMillions,
      survivalFraction,
      legacyShare,
      flatShare,
      prefunded,
      prefundedShare,
      legacyPaygoBillions,
      flatBenefitBillions,
      flatPaygoBillions,
      totalCohortSSSpendingBillions:
        legacyPaygoBillions + flatPaygoBillions,
    })
  }

  return {
    legacyBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.legacyPaygoBillions,
      0,
    ),
    flatBenefitBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.flatBenefitBillions,
      0,
    ),
    flatPaygoBillions: cohorts.reduce(
      (sum, cohort) => sum + cohort.flatPaygoBillions,
      0,
    ),
    cohorts,
  }
}

// One opening beneficiary calibration, shared by legacy and flat benefits. Never
// recalibrate one benefit formula to future CBO totals independently of the other.
export const ssParticipation = ((cboSocialSecurityGDP(2026) - cboCalibrationOtherOASDIGDP) *
  cboCalibrationNominalGDPBillions(2026)) /
  (eligiblePopulationMillions(2026, 67, defaultAssumptions) * defaultAssumptions.currentLawSSBenefit2026 / 1000)

function retiredWorkerGrowthAdjustment(year: number): number {
  const trusteesIndex = ssaRetiredWorkerMillions(year) / ssaRetiredWorkerMillions(2026)
  const populationIndex = eligiblePopulationMillions(year, 67, defaultAssumptions) /
    eligiblePopulationMillions(2026, 67, defaultAssumptions)
  return trusteesIndex / populationIndex
}

function scheduledSocialSecurityGDP(year: number): number {
  if (year <= cboBaselineEndYear) return cboSocialSecurityGDP(year)
  // CBO and SSA use different economic baselines. Bridge smoothly from CBO's
  // final published year to the Trustees level, then use Trustees directly.
  if (year < 2060) {
    const t = (year - cboBaselineEndYear) / (2060 - cboBaselineEndYear)
    return cboSocialSecurityGDP(cboBaselineEndYear) +
      t * (ssaOasdiCostGDP(2060) - cboSocialSecurityGDP(cboBaselineEndYear))
  }
  return ssaOasdiCostGDP(year)
}

const centralCurrentLawLegacyCache = new Map<number, number>()
function centralCurrentLawLegacyBillions(year: number): number {
  const cached = centralCurrentLawLegacyCache.get(year)
  if (cached !== undefined) return cached
  const value = rawSocialSecurityForYear(year, defaultAssumptions, 'currentLaw').legacyBillions
  centralCurrentLawLegacyCache.set(year, value)
  return value
}

export function socialSecurityForYear(
  year: number,
  assumptions: ModelAssumptions,
  entitlementDesign: EntitlementDesign = 'reform',
  resolvePrefundedShare?: SocialSecurityPrefundedShareResolver,
): SocialSecurityYearResult {
  const result = rawSocialSecurityForYear(
    year,
    assumptions,
    entitlementDesign,
    resolvePrefundedShare,
  )
  const centralLegacyBillions = centralCurrentLawLegacyBillions(year)
  const targetLegacyBillions = Math.max(
    0,
    scheduledSocialSecurityGDP(year) - cboCalibrationOtherOASDIGDP,
  ) * cboCalibrationNominalGDPBillions(year)
  const legacyScale = centralLegacyBillions > 0
    ? targetLegacyBillions / centralLegacyBillions
    : 1

  const cohorts = result.cohorts.map((cohort) => {
    const uncappedLegacy = cohort.legacyPaygoBillions * legacyScale
    const uncappedTotal = uncappedLegacy + cohort.flatBenefitBillions
    const capPerPerson = entitlementDesign === 'reform'
      ? socialSecurityBenefitCapNominal(year, assumptions)
      : null
    const capBillions = capPerPerson !== null
      ? capPerPerson * cohort.survivingBeneficiariesMillions / 1_000
      : Number.POSITIVE_INFINITY
    const capScale = uncappedTotal > 0 ? Math.min(1, capBillions / uncappedTotal) : 1
    const legacyPaygoBillions = uncappedLegacy * capScale
    const flatBenefitBillions = cohort.flatBenefitBillions * capScale
    const flatPaygoBillions = cohort.flatPaygoBillions * capScale
    return {
      ...cohort,
      legacyPaygoBillions,
      flatBenefitBillions,
      flatPaygoBillions,
      totalCohortSSSpendingBillions:
        legacyPaygoBillions + flatPaygoBillions,
    }
  })

  return {
    ...result,
    legacyBillions: cohorts.reduce((sum, cohort) => sum + cohort.legacyPaygoBillions, 0),
    flatBenefitBillions: cohorts.reduce((sum, cohort) => sum + cohort.flatBenefitBillions, 0),
    flatPaygoBillions: cohorts.reduce((sum, cohort) => sum + cohort.flatPaygoBillions, 0),
    cohorts,
  }
}
