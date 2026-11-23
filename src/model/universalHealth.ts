import { eligiblePopulationMillions } from './demographics'
import { medicareEligiblePopulationMillions, medicareForYear } from './medicare'
import { nonelderlySilverBenchmarkPerPerson2024 } from '../tax/model/health'
import type { ModelAssumptions } from './types'
import type { HealthPolicySettings } from '../tax/model/health'

/**
 * Universal private-plan pricing derived from the existing health engines:
 *   - under 65: ESI + nongroup Census HIPM Silver benchmark-per-covered-life;
 *   - 65+: 2026 CBO/Trustees-calibrated current-law Medicare net federal cost,
 *      grossed up by the published Part B beneficiary premium ONCE at the anchor.
 *
 * From 2027, both age groups use the same CPI + real per-enrollee plan-cost
 * growth. Population projections supply the changing under/over-65 weights.
 * The senior anchor is treated as a 90%-AV-equivalent reference for AV scenario
 * scaling, NOT a measured actuarial value for traditional Medicare.
 * The Medicare gross-up omits other patient payments and supplemental insurance.
 * Source prices are proxies, not predicted universal insurer bids.
 *
 * Competitive bids change the price of the reference benchmark, not underlying
 * health spending. Risk-adjustment/reinsurance transfers remain inside insurer
 * payments (no second budget charge). Member premiums go directly to plans,
 * not to Treasury. No prefunding assets are modeled.
 */
export const referencePartBMonthlyPremium2026 = 202.90
export const hipmSilverReferenceActuarialValue = 0.70

// Derive the source reference ONCE from the app's existing ESI/nongroup
// calibration, rather than using an unrelated nationwide flat premium.
let cachedUnder65Source: ReturnType<typeof nonelderlySilverBenchmarkPerPerson2024> | null = null
function under65Source() {
  // Lazy initialization prevents a module cycle when the ESI incidence
  // engine calls this pricing module for its contribution cap.
  return cachedUnder65Source ?? (cachedUnder65Source = nonelderlySilverBenchmarkPerPerson2024())
}

export interface UniversalHealthYear {
  year: number
  populationMillions: number
  nonelderlyPopulationMillions: number
  seniorPopulationMillions: number
  /** Current HIPM market Silver reference, source year 2024, before AV adjustment. */
  sourceSilverAnnualPerPerson2024: number
  /** Standardized nonelderly bid, in year dollars, using the selected AV. */
  nonelderlyGrossAnnualPerPerson: number
  /** 2026 Medicare-derived senior reference, then same all-age real growth. */
  seniorGrossAnnualPerPerson: number
  /** All-age population-weighted gross reference price, before bidding factor. */
  averageBidMonthly: number
  benchmarkMonthly: number
  memberPremiumMonthly: number
  grossBenchmarkBillions: number
  memberContributionsBillions: number
  publicBenchmarkBillions: number
  estimatedOutOfPocketBillions: number
  estimatedCoveredSpendingBillions: number
  ruralSupportBillions: number
  federalOutlayBillions: number
}

export function universalHealthForYear(
  year: number, assumptions: ModelAssumptions, settings: HealthPolicySettings,
): UniversalHealthYear {
  const source = under65Source()
  const elapsed = year - assumptions.reformYear
  const cpi = (1 + assumptions.inflation) ** elapsed
  // One plan-cost growth assumption for the entire population. Age mix is
  // still modeled through annual enrollee population counts.
  const realCostGrowth = (1 + settings.universalBidRealGrowth) ** elapsed
  const memberPremiumGrowth = (1 + settings.universalMemberPremiumRealGrowth) ** elapsed
  const nonelderlyPopulationMillions = eligiblePopulationMillions(year, 0, assumptions) -
    eligiblePopulationMillions(year, 65, assumptions)
  const seniorPopulationMillions = eligiblePopulationMillions(year, 65, assumptions)
  const populationMillions = nonelderlyPopulationMillions + seniorPopulationMillions

  // The existing HIPM benchmark scale projects its source 2024 cost to 2025;
  // one further annual inflation adjustment projects it into 2026.
  const nonelderlySilver2026 = source.annualPremiumPerPerson *
    Math.max(0, settings.benchmarkPremiumScale) * (1 + assumptions.inflation)
  const avFactor = settings.universalTargetActuarialValue / hipmSilverReferenceActuarialValue
  const nonelderlyGrossAnnualPerPerson = nonelderlySilver2026 * avFactor *
    settings.universalBidMultiplier * cpi * realCostGrowth

  // Current-law Medicare is an INITIAL-LEVEL CALIBRATION only; importing its
  // projected spending here would silently impose a different growth curve on
  // seniors than on younger universal-plan members.
  const openingMedicareNetBillions = medicareForYear(
    assumptions.reformYear, assumptions, undefined, 'currentLaw',
  ).legacyBillions
  const openingMedicareMembersMillions = medicareEligiblePopulationMillions(
    assumptions.reformYear, assumptions,
  )
  const seniorGross2026 = (
    (openingMedicareMembersMillions > 0
      ? openingMedicareNetBillions * 1000 / openingMedicareMembersMillions : 0)
    + referencePartBMonthlyPremium2026 * 12
  )
  // There is no observed traditional-Medicare AV comparable to HIPM Silver;
  // the 90% standard is explicitly a sensitivity reference, not a claim that
  // the original Medicare benefits are exactly 90% actuarial value.
  const seniorAvSensitivity = settings.universalTargetActuarialValue / 0.90
  const seniorGrossAnnualPerPerson = seniorGross2026 * seniorAvSensitivity *
    settings.universalBidMultiplier * cpi * realCostGrowth

  const grossReferenceBillions = (
    nonelderlyPopulationMillions * nonelderlyGrossAnnualPerPerson +
    seniorPopulationMillions * seniorGrossAnnualPerPerson
  ) / 1000
  const benchmarkFactor = settings.universalBenchmark === 'secondLowest'
    ? settings.universalSecondLowestBidFactor : 1
  const grossBenchmarkBillions = grossReferenceBillions * benchmarkFactor
  const averageBidMonthly = populationMillions > 0
    ? grossReferenceBillions * 1000 / (populationMillions * 12) : 0
  const benchmarkMonthly = averageBidMonthly * benchmarkFactor
  const memberPremiumMonthly = Math.min(
    benchmarkMonthly, settings.universalMemberPremiumMonthly2026 * cpi * memberPremiumGrowth,
  )
  const memberContributionsBillions = populationMillions * memberPremiumMonthly * 12 / 1000
  const publicBenchmarkBillions = grossBenchmarkBillions - memberContributionsBillions
  // The model has no separate claims and administrative load series.
  // Use the gross benchmark as a proxy for the plan-paid share of covered costs.
  const estimatedOutOfPocketBillions = grossBenchmarkBillions *
    (1 - settings.universalTargetActuarialValue) / settings.universalTargetActuarialValue
  const estimatedCoveredSpendingBillions = grossBenchmarkBillions + estimatedOutOfPocketBillions
  const ruralSupportBillions = settings.universalRuralSupportBillions2026 * cpi * realCostGrowth
  return {
    year, populationMillions, nonelderlyPopulationMillions, seniorPopulationMillions,
    sourceSilverAnnualPerPerson2024: source.annualPremiumPerPerson,
    nonelderlyGrossAnnualPerPerson, seniorGrossAnnualPerPerson,
    averageBidMonthly, benchmarkMonthly, memberPremiumMonthly,
    grossBenchmarkBillions, memberContributionsBillions, publicBenchmarkBillions,
    estimatedOutOfPocketBillions, estimatedCoveredSpendingBillions,
    ruralSupportBillions, federalOutlayBillions: publicBenchmarkBillions + ruralSupportBillions,
  }
}
