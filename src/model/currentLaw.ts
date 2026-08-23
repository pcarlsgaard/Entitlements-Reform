import type { CurrentLawBaselineMode, ModelAssumptions } from './types'

const OASI_DEPLETION_PAYABLE_SHARE = 0.78
const OASI_2100_PAYABLE_SHARE = 0.62
const HI_DEPLETION_PAYABLE_SHARE = 0.89
const HI_2050_PAYABLE_SHARE = 0.85
const HI_2100_PAYABLE_SHARE = 0.93

function interpolate(
  year: number,
  startYear: number,
  startValue: number,
  endYear: number,
  endValue: number,
): number {
  const position = (year - startYear) / (endYear - startYear)
  return startValue + position * (endValue - startValue)
}

/**
 * Share of scheduled OASI benefits deliverable from dedicated current-law
 * financing. The Trustees publish 78% at Q4 2032 depletion and 62% in 2100.
 * The annual model assigns one quarter of 2032 the depletion share, linearly
 * interpolates full-year shares thereafter, and holds the 2100 endpoint beyond
 * the Trustees' projection horizon.
 */
export function oasiPayableShare(year: number): number {
  if (year < 2032) return 1
  if (year === 2032) {
    return 0.75 + 0.25 * OASI_DEPLETION_PAYABLE_SHARE
  }
  if (year <= 2100) {
    return interpolate(
      year,
      2033,
      OASI_DEPLETION_PAYABLE_SHARE,
      2100,
      OASI_2100_PAYABLE_SHARE,
    )
  }
  return OASI_2100_PAYABLE_SHARE
}

/**
 * Share of scheduled Medicare Hospital Insurance (Part A) benefits deliverable
 * from dedicated current-law financing. The annual model assigns three
 * quarters of 2033 the Q2 depletion share, interpolates the Trustees' published
 * 2033/2050/2100 points, and holds the 2100 endpoint after 2100.
 */
export function hiPayableShare(year: number): number {
  if (year < 2033) return 1
  if (year === 2033) {
    return 0.25 + 0.75 * HI_DEPLETION_PAYABLE_SHARE
  }
  if (year <= 2050) {
    return interpolate(
      year,
      2034,
      HI_DEPLETION_PAYABLE_SHARE,
      2050,
      HI_2050_PAYABLE_SHARE,
    )
  }
  if (year <= 2100) {
    return interpolate(
      year,
      2050,
      HI_2050_PAYABLE_SHARE,
      2100,
      HI_2100_PAYABLE_SHARE,
    )
  }
  return HI_2100_PAYABLE_SHARE
}

/** Parts B and D remain fully financed; only the modeled Part A share is cut. */
export function seniorMedicarePayableShare(
  year: number,
  assumptions: ModelAssumptions,
): number {
  const hiShare = assumptions.legacyMedicareHIShare2026
  return 1 - hiShare + hiShare * hiPayableShare(year)
}

export function currentLawDeliveryShares(
  year: number,
  assumptions: ModelAssumptions,
  mode: CurrentLawBaselineMode,
): { socialSecurity: number; seniorMedicare: number } {
  if (mode === 'scheduled') {
    return { socialSecurity: 1, seniorMedicare: 1 }
  }
  return {
    socialSecurity: oasiPayableShare(year),
    seniorMedicare: seniorMedicarePayableShare(year, assumptions),
  }
}
