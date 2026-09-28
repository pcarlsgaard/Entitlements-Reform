/**
 * Pinned 2026 Trustees intermediate-assumption reference series.
 *
 * SSA OASDI cost: Table IV.B3, 2026 OASDI Trustees Report.
 * SSA retired workers: Table V.C4, 2026 OASDI Trustees Report.
 * CMS Medicare incurred expenditures: Table V.B2, 2026 Medicare Trustees Report.
 * CMS Medicare enrollment: Table V.B3, 2026 Medicare Trustees Report.
 *
 * These values are reference/calibration series, not user-policy choices.
 */
export const SSA_TRUSTEES_LONG_RUN_REAL_COVERED_WAGE_GROWTH = 0.0114

// Table V.B1, intermediate assumptions: annual real growth in the average
// wage in OASDI-covered employment, calendar years 2026–2100.
const ssaRealCoveredWageGrowthPercent2026 = [
  1.82, 1.54, 1.71, 1.86, 2.08, 2.08, 1.93, 1.77, 1.47, 1.38,
  1.28, 1.22, 1.23, 1.23, 1.21, 1.21, 1.20, 1.18, 1.17, 1.16,
  1.14, 1.14, 1.13, 1.13, 1.12, 1.11, 1.10, 1.10, 1.09, 1.09,
  1.08, 1.09, 1.10, 1.10, 1.10, 1.11, 1.12, 1.12, 1.12, 1.12,
  1.12, 1.13, 1.13, 1.13, 1.13, 1.13, 1.13, 1.12, 1.13, 1.13,
  1.14, 1.14, 1.13, 1.13, 1.13, 1.13, 1.13, 1.14, 1.14, 1.14,
  1.15, 1.14, 1.14, 1.14, 1.14, 1.14, 1.14, 1.14, 1.14, 1.14,
  1.13, 1.13, 1.13, 1.13, 1.13,
] as const

export function ssaRealCoveredWageGrowth(year: number): number {
  const bounded = Math.max(2026, Math.min(2100, Math.round(year)))
  return ssaRealCoveredWageGrowthPercent2026[bounded - 2026]! / 100
}

type Anchor = readonly [year: number, value: number]

function interpolate(anchors: readonly Anchor[], year: number): number {
  if (year <= anchors[0]![0]) return anchors[0]![1]
  if (year >= anchors.at(-1)![0]) return anchors.at(-1)![1]
  for (let i = 1; i < anchors.length; i += 1) {
    const [y1, v1] = anchors[i - 1]!
    const [y2, v2] = anchors[i]!
    if (year <= y2) {
      const t = (year - y1) / (y2 - y1)
      return v1 + t * (v2 - v1)
    }
  }
  return anchors.at(-1)![1]
}

// Intermediate OASDI cost as percent of GDP, annual 2056–2100.
const ssaOasdiCostPercent2056 = [
  6.19, 6.22, 6.26, 6.30, 6.34, 6.38, 6.41, 6.44, 6.47, 6.51,
  6.54, 6.57, 6.60, 6.63, 6.67, 6.70, 6.73, 6.76, 6.79, 6.82,
  6.85, 6.87, 6.89, 6.90, 6.91, 6.92, 6.93, 6.93, 6.93, 6.93,
  6.92, 6.91, 6.90, 6.88, 6.86, 6.84, 6.82, 6.80, 6.78, 6.76,
  6.74, 6.72, 6.71, 6.70, 6.69,
] as const

export function ssaOasdiCostGDP(year: number): number {
  const bounded = Math.max(2056, Math.min(2100, Math.round(year)))
  return ssaOasdiCostPercent2056[bounded - 2056]! / 100
}

const ssaRetiredWorkerAnchors: readonly Anchor[] = [
  [2026, 55.194],
  [2035, 64.804],
  [2056, 72.829],
  [2060, 75.393],
  [2070, 81.397],
  [2075, 84.322],
  [2085, 87.451],
  [2090, 87.446],
  [2095, 87.135],
  [2100, 87.133],
] as const

export function ssaRetiredWorkerMillions(year: number): number {
  return interpolate(ssaRetiredWorkerAnchors, year)
}

const cmsMedicareEnrollmentAnchors: readonly Anchor[] = [
  [2026, 70.743], [2027, 72.322], [2028, 74.026], [2029, 75.436],
  [2030, 76.598], [2031, 77.521], [2032, 78.327], [2033, 79.058],
  [2034, 79.827], [2035, 80.632], [2040, 82.606], [2045, 83.648],
  [2050, 85.413], [2055, 87.929], [2060, 90.916], [2065, 93.612],
  [2070, 96.634], [2075, 99.585], [2080, 101.485], [2085, 102.662],
  [2090, 102.816], [2095, 102.848], [2100, 103.133],
] as const

export function cmsMedicareEnrollmentMillions(year: number): number {
  return interpolate(cmsMedicareEnrollmentAnchors, year)
}

const cmsMedicareGrossGDPAnchors: readonly Anchor[] = [
  [2026, 0.0414], [2027, 0.0431], [2028, 0.0451], [2029, 0.0469],
  [2030, 0.0484], [2031, 0.0499], [2032, 0.0510], [2033, 0.0527],
  [2034, 0.0546], [2035, 0.0560], [2040, 0.0610], [2045, 0.0639],
  [2050, 0.0653], [2055, 0.0666], [2060, 0.0683], [2065, 0.0702],
  [2070, 0.0722], [2075, 0.0739], [2080, 0.0751], [2085, 0.0758],
  [2090, 0.0759], [2095, 0.0757], [2100, 0.0753],
] as const

export function cmsMedicareGrossGDP(year: number): number {
  return interpolate(cmsMedicareGrossGDPAnchors, year)
}
