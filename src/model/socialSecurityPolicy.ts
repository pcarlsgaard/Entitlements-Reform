import { ssaRealCoveredWageGrowth } from '../data/trustees2026'
import type { ModelAssumptions } from './types'

const CHAINED_CPI_DIFFERENTIAL = 0.003
const CPI_E_DIFFERENTIAL = 0.0015

function currentLawCOLARate(assumptions: ModelAssumptions): number {
  return Math.max(0, assumptions.inflation)
}

export function socialSecurityCOLARate(
  year: number,
  assumptions: ModelAssumptions,
  usePolicy = true,
): number {
  const currentLaw = currentLawCOLARate(assumptions)
  if (!usePolicy || year < assumptions.socialSecurityCOLAStartYear) return currentLaw

  switch (assumptions.socialSecurityCOLAIndex) {
    case 'chainedCPI':
      return Math.max(0, currentLaw - CHAINED_CPI_DIFFERENTIAL)
    case 'cpiE':
      return Math.max(0, currentLaw + CPI_E_DIFFERENTIAL)
    case 'cpiW':
    default:
      return currentLaw
  }
}

function nominalCpiFactor(
  fromYear: number,
  throughYear: number,
  assumptions: ModelAssumptions,
  chained = false,
): number {
  if (throughYear <= fromYear) return 1
  const annualRate = chained
    ? Math.max(0, assumptions.inflation - CHAINED_CPI_DIFFERENTIAL)
    : Math.max(0, assumptions.inflation)
  return (1 + annualRate) ** (throughYear - fromYear)
}

export function nominalWageIndexFactor(
  fromYear: number,
  throughYear: number,
  assumptions: ModelAssumptions,
): number {
  if (throughYear <= fromYear) return 1
  let factor = 1
  for (let year = fromYear + 1; year <= throughYear; year += 1) {
    const realWageGrowth =
      ssaRealCoveredWageGrowth(year) + assumptions.realWageGrowthDeviation
    factor *=
      (1 + Math.max(-0.99, realWageGrowth)) *
      (1 + Math.max(-0.99, assumptions.inflation))
  }
  return factor
}

export function socialSecurityCOLAProtectedBenefitNominal(
  year: number,
  assumptions: ModelAssumptions,
): number | null {
  const base = assumptions.socialSecurityCOLACapProtectedBenefit2026
  if (base === null) return null
  if (assumptions.socialSecurityCOLACapIndexing === 'cpi') {
    return base * nominalCpiFactor(assumptions.reformYear, year, assumptions)
  }
  return base * nominalWageIndexFactor(assumptions.reformYear, year, assumptions)
}

/**
 * Apply post-award Social Security COLAs one year at a time.
 *
 * The optional CRFB-style cap limits the dollar COLA, not the underlying
 * benefit level: increase_t = min(B_(t-1) * cola_t, protectedBenefit_(t-1) * cola_t).
 */
export function applySocialSecurityCOLAs(
  initialAnnualBenefit: number,
  initialYear: number,
  throughYear: number,
  assumptions: ModelAssumptions,
  usePolicy = true,
): number {
  if (throughYear <= initialYear) return initialAnnualBenefit
  let benefit = initialAnnualBenefit

  for (let year = initialYear + 1; year <= throughYear; year += 1) {
    const cola = socialSecurityCOLARate(year, assumptions, usePolicy)
    let increase = benefit * cola
    if (usePolicy) {
      const protectedBenefit = socialSecurityCOLAProtectedBenefitNominal(
        year - 1,
        assumptions,
      )
      if (protectedBenefit !== null) {
        increase = Math.min(increase, protectedBenefit * cola)
      }
    }
    benefit += increase
  }
  return benefit
}

export function socialSecurityBenefitCapNominal(
  year: number,
  assumptions: ModelAssumptions,
): number | null {
  const base = assumptions.socialSecurityBenefitCap2026
  if (base === null) return null
  const elapsed = Math.max(0, year - assumptions.reformYear)

  switch (assumptions.socialSecurityBenefitCapIndexing) {
    case 'chainedCPI':
      return base * nominalCpiFactor(
        assumptions.reformYear,
        year,
        assumptions,
        true,
      )
    case 'fixed20Wage': {
      const freezeYears = 20
      if (elapsed < freezeYears) return base
      const wageIndexStarts = assumptions.reformYear + freezeYears - 1
      return base * nominalWageIndexFactor(wageIndexStarts, year, assumptions)
    }
    case 'fixed30Wage': {
      const freezeYears = 30
      if (elapsed < freezeYears) return base
      const wageIndexStarts = assumptions.reformYear + freezeYears - 1
      return base * nominalWageIndexFactor(wageIndexStarts, year, assumptions)
    }
    case 'cpi':
    default:
      return base * nominalCpiFactor(assumptions.reformYear, year, assumptions)
  }
}
