/**
 * Retired-worker benefit distribution used to model percentile-targeted Social Security reforms.
 *
 * Source: SSA Annual Statistical Supplement 2026, table 5.B6, December 2025.
 * Counts are current-payment retired workers by monthly benefit band. Band midpoints
 * represent each cell; the open-ended $3,300+ cell is solved so the weighted mean
 * equals SSA's reported $2,071.30 monthly benefit. All relative benefits are then
 * normalized to a mean of 1, so enabling the distribution alone cannot change
 * aggregate current-law spending.
 *
 * This is a benefit-distribution proxy. Progressive price indexing is defined by
 * AIME percentile, so the simulator treats rank in this retired-worker benefit
 * distribution as an approximation to AIME rank rather than claiming a microdata-
 * exact SSA PIA calculation.
 */

export interface SocialSecurityBenefitBin {
  share: number
  percentileMidpoint: number
  relativeBenefit: number
}

const reportedMeanMonthlyBenefit = 2071.30
const rawCounts = [
  286509, 340317, 441070, 519136, 579399, 777468, 1248385, 1512204,
  1907828, 2144312, 2200568, 2185153, 2165069, 2151501, 2135924,
  2122695, 2122705, 2143081, 2101475, 2251888, 2290307, 2188335,
  1982028, 1730365, 1543934, 1486767, 1408080, 1240406, 1154211,
  1018613, 889368, 5355563,
] as const

const rawMonthlyAmounts = [
  250, 350, 450, 550, 650, 750, 850, 950, 1050, 1150, 1250, 1350,
  1450, 1550, 1650, 1750, 1850, 1950, 2050, 2150, 2250, 2350, 2450,
  2550, 2650, 2750, 2850, 2950, 3050, 3150, 3250, 3877.4869034684143,
] as const

const totalCount = rawCounts.reduce((sum, value) => sum + value, 0)

let cumulative = 0
export const socialSecurityBenefitBins: readonly SocialSecurityBenefitBin[] =
  rawCounts.map((count, index) => {
    const share = count / totalCount
    const bin: SocialSecurityBenefitBin = {
      share,
      percentileMidpoint: cumulative + share / 2,
      relativeBenefit: rawMonthlyAmounts[index]! / reportedMeanMonthlyBenefit,
    }
    cumulative += share
    return bin
  })

export function relativeBenefitAtPercentile(percentile: number): number {
  const p = Math.max(0, Math.min(1, percentile))
  let running = 0
  for (let index = 0; index < socialSecurityBenefitBins.length; index += 1) {
    const bin = socialSecurityBenefitBins[index]!
    const next = running + bin.share
    if (p <= next || index === socialSecurityBenefitBins.length - 1) {
      return bin.relativeBenefit
    }
    running = next
  }
  return 1
}

export function weightedRelativeBenefitMean(): number {
  return socialSecurityBenefitBins.reduce(
    (sum, bin) => sum + bin.share * bin.relativeBenefit,
    0,
  )
}
