import { eligiblePopulationMillions } from './demographics'
import { medicareEligiblePopulationMillions, medicareForYear } from './medicare'
import { nonelderlySilverBenchmarkPerPerson2024 } from '../tax/model/health'
import type { ModelAssumptions } from './types'
import type { HealthPolicySettings } from '../tax/model/health'

/**
 * Universal private-plan pricing derived from the existing health engines:
 *   - under 65: ESI + nongroup Census HIPM Silver benchmark-per-covered-life;
 *   - 65+: CBO/Trustees-calibrated current-law Medicare net federal cost,
 *      grossed up by the published Part B beneficiary premium.
 *
 * HIPM Silver is roughly 70% actuarial value; the standard benefit defaults
 * to 90% AV, making the conversion an EXPLICIT scenario assumption. The
 * Medicare gross-up omits other patient payments and supplemental insurance.
 * This is a benchmark premium reference, not a prediction of universal bidding.
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
  /** Counterfactual 90%-AV risk-standardized nonelderly bid, in year dollars. */
  nonelderlyGrossAnnualPerPerson: number
  /** Medicare-derived senior gross annual plan-price proxy, in year dollars. */
  seniorGrossAnnualPerPerson: number
  /** All-age population-weighted gross reference price, before bidding factor. */
  averageBidMonthly: number
  benchmarkMonthly: number
  memberPremiumMonthly: number
  grossBenchmarkBillions: number
  memberContributionsBillions: number
  publicBenchmarkBillions: number
  ruralSupportBillions: number
  federalOutlayBillions: number
}

export function universalHealthForYear(
  year: number, assumptions: ModelAssumptions, settings: HealthPolicySettings,
): UniversalHealthYear {
  const source = under65Source()
  const elapsed = year - assumptions.reformYear
  const cpi = (1 + assumptions.inflation) ** elapsed
  const nonelderlyGrowth = (1 + settings.universalBidRealGrowth) ** elapsed
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
    settings.universalBidMultiplier * cpi * nonelderlyGrowth

  // Medicare's existing calibrated cohort engine projects NET federal Medicare
  // costs from CBO/Trustees. The 2026 Part B premium is added to approximate
  // gross insured cost; it is independent of the selected NEW member premium.
  const medicareNetSpendingBillions = medicareForYear(
    year, assumptions, undefined, 'currentLaw',
  ).legacyBillions
  const medicareBeneficiariesMillions = medicareEligiblePopulationMillions(year, assumptions)
  const seniorGrossAnnualPerPerson = (
    (medicareBeneficiariesMillions > 0
      ? medicareNetSpendingBillions * 1000 / medicareBeneficiariesMillions : 0)
    + referencePartBMonthlyPremium2026 * 12 * cpi
  ) * settings.universalBidMultiplier

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
    benchmarkMonthly, settings.universalMemberPremiumMonthly2026 * cpi,
  )
  const memberContributionsBillions = populationMillions * memberPremiumMonthly * 12 / 1000
  const publicBenchmarkBillions = grossBenchmarkBillions - memberContributionsBillions
  const ruralSupportBillions = settings.universalRuralSupportBillions2026 * cpi * nonelderlyGrowth
  return {
    year, populationMillions, nonelderlyPopulationMillions, seniorPopulationMillions,
    sourceSilverAnnualPerPerson2024: source.annualPremiumPerPerson,
    nonelderlyGrossAnnualPerPerson, seniorGrossAnnualPerPerson,
    averageBidMonthly, benchmarkMonthly, memberPremiumMonthly,
    grossBenchmarkBillions, memberContributionsBillions, publicBenchmarkBillions,
    ruralSupportBillions, federalOutlayBillions: publicBenchmarkBillions + ruralSupportBillions,
  }
}
