export interface SocialSecurityPIABin {
  share: number
  lowerMonthlyPIA: number
  upperMonthlyPIA: number
  representativeMonthlyPIA: number
}

/**
 * 2025 retired-worker PIA award distribution from SSA Annual Statistical
 * Supplement 2026, table 6.B4. Published percentages sum to 99.9% because
 * of rounding; shares are normalized below. The open-ended top bin uses a
 * representative value chosen so the normalized distribution reproduces
 * SSA's published $2,224.69 average PIA. The upper bound uses the 2025
 * maximum benefit at FRA ($4,018) as a practical PIA ceiling.
 */
const rawPIABins: readonly SocialSecurityPIABin[] = [
  { share: .006, lowerMonthlyPIA: 0, upperMonthlyPIA: 300, representativeMonthlyPIA: 250 },
  { share: .010, lowerMonthlyPIA: 300, upperMonthlyPIA: 400, representativeMonthlyPIA: 350 },
  { share: .012, lowerMonthlyPIA: 400, upperMonthlyPIA: 500, representativeMonthlyPIA: 450 },
  { share: .013, lowerMonthlyPIA: 500, upperMonthlyPIA: 600, representativeMonthlyPIA: 550 },
  { share: .014, lowerMonthlyPIA: 600, upperMonthlyPIA: 700, representativeMonthlyPIA: 650 },
  { share: .014, lowerMonthlyPIA: 700, upperMonthlyPIA: 800, representativeMonthlyPIA: 750 },
  { share: .015, lowerMonthlyPIA: 800, upperMonthlyPIA: 900, representativeMonthlyPIA: 850 },
  { share: .015, lowerMonthlyPIA: 900, upperMonthlyPIA: 1000, representativeMonthlyPIA: 950 },
  { share: .020, lowerMonthlyPIA: 1000, upperMonthlyPIA: 1100, representativeMonthlyPIA: 1050 },
  { share: .036, lowerMonthlyPIA: 1100, upperMonthlyPIA: 1200, representativeMonthlyPIA: 1150 },
  { share: .039, lowerMonthlyPIA: 1200, upperMonthlyPIA: 1300, representativeMonthlyPIA: 1250 },
  { share: .038, lowerMonthlyPIA: 1300, upperMonthlyPIA: 1400, representativeMonthlyPIA: 1350 },
  { share: .038, lowerMonthlyPIA: 1400, upperMonthlyPIA: 1500, representativeMonthlyPIA: 1450 },
  { share: .037, lowerMonthlyPIA: 1500, upperMonthlyPIA: 1600, representativeMonthlyPIA: 1550 },
  { share: .037, lowerMonthlyPIA: 1600, upperMonthlyPIA: 1700, representativeMonthlyPIA: 1650 },
  { share: .036, lowerMonthlyPIA: 1700, upperMonthlyPIA: 1800, representativeMonthlyPIA: 1750 },
  { share: .036, lowerMonthlyPIA: 1800, upperMonthlyPIA: 1900, representativeMonthlyPIA: 1850 },
  { share: .035, lowerMonthlyPIA: 1900, upperMonthlyPIA: 2000, representativeMonthlyPIA: 1950 },
  { share: .034, lowerMonthlyPIA: 2000, upperMonthlyPIA: 2100, representativeMonthlyPIA: 2050 },
  { share: .033, lowerMonthlyPIA: 2100, upperMonthlyPIA: 2200, representativeMonthlyPIA: 2150 },
  { share: .031, lowerMonthlyPIA: 2200, upperMonthlyPIA: 2300, representativeMonthlyPIA: 2250 },
  { share: .030, lowerMonthlyPIA: 2300, upperMonthlyPIA: 2400, representativeMonthlyPIA: 2350 },
  { share: .029, lowerMonthlyPIA: 2400, upperMonthlyPIA: 2500, representativeMonthlyPIA: 2450 },
  { share: .027, lowerMonthlyPIA: 2500, upperMonthlyPIA: 2600, representativeMonthlyPIA: 2550 },
  { share: .026, lowerMonthlyPIA: 2600, upperMonthlyPIA: 2700, representativeMonthlyPIA: 2650 },
  { share: .025, lowerMonthlyPIA: 2700, upperMonthlyPIA: 2800, representativeMonthlyPIA: 2750 },
  { share: .023, lowerMonthlyPIA: 2800, upperMonthlyPIA: 2900, representativeMonthlyPIA: 2850 },
  { share: .022, lowerMonthlyPIA: 2900, upperMonthlyPIA: 3000, representativeMonthlyPIA: 2950 },
  { share: .029, lowerMonthlyPIA: 3000, upperMonthlyPIA: 3100, representativeMonthlyPIA: 3050 },
  { share: .034, lowerMonthlyPIA: 3100, upperMonthlyPIA: 3200, representativeMonthlyPIA: 3150 },
  { share: .032, lowerMonthlyPIA: 3200, upperMonthlyPIA: 3300, representativeMonthlyPIA: 3250 },
  { share: .173, lowerMonthlyPIA: 3300, upperMonthlyPIA: 4018, representativeMonthlyPIA: 3676.678092485551 },
]

const rawShare = rawPIABins.reduce((sum, bin) => sum + bin.share, 0)
export const ssaAverageMonthlyPIA2025 = 2224.69
export const ssaMaximumMonthlyBenefitFRA2025 = 4018

export const socialSecurityPIABins = rawPIABins.map((bin) => ({
  ...bin,
  share: bin.share / rawShare,
}))

export interface SocialSecurityPIAQuantile extends SocialSecurityPIABin {
  percentileMidpoint: number
  benefitMultiplier: number
}

export const socialSecurityPIAQuantiles: readonly SocialSecurityPIAQuantile[] = (() => {
  let cumulative = 0
  return socialSecurityPIABins.map((bin) => {
    const lower = cumulative
    cumulative += bin.share
    return {
      ...bin,
      percentileMidpoint: (lower + cumulative) / 2,
      benefitMultiplier: bin.representativeMonthlyPIA / ssaAverageMonthlyPIA2025,
    }
  })
})()

export function monthlyPIAAtPercentile(percentile: number): number {
  const p = Math.min(0.999999, Math.max(0, percentile))
  let cumulative = 0
  for (const bin of socialSecurityPIABins) {
    const next = cumulative + bin.share
    if (p <= next) {
      const within = bin.share > 0 ? (p - cumulative) / bin.share : 0
      return bin.lowerMonthlyPIA +
        Math.min(1, Math.max(0, within)) * (bin.upperMonthlyPIA - bin.lowerMonthlyPIA)
    }
    cumulative = next
  }
  return ssaMaximumMonthlyBenefitFRA2025
}

export function piaMultiplierAtPercentile(percentile: number): number {
  return monthlyPIAAtPercentile(percentile) / ssaAverageMonthlyPIA2025
}

export function percentileForPIAMultiplier(multiplier: number): number {
  const target = Math.max(0, multiplier) * ssaAverageMonthlyPIA2025
  let cumulative = 0
  for (const bin of socialSecurityPIABins) {
    const next = cumulative + bin.share
    if (target <= bin.upperMonthlyPIA) {
      const width = Math.max(1, bin.upperMonthlyPIA - bin.lowerMonthlyPIA)
      const within = Math.min(1, Math.max(0, (target - bin.lowerMonthlyPIA) / width))
      return Math.min(1, cumulative + within * bin.share)
    }
    cumulative = next
  }
  return 1
}
