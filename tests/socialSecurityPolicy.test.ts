import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../src/model/defaults'
import { calculateEndowmentPerPerson } from '../src/model/endowment'
import { legacySocialSecurityBenefitNominal } from '../src/model/socialSecurity'
import {
  applySocialSecurityCOLAs,
  socialSecurityBenefitCapNominal,
  socialSecurityCOLAProtectedBenefitNominal,
  socialSecurityCOLARate,
  socialSecurityCombinedCOLACapScale,
} from '../src/model/socialSecurityPolicy'

describe('modular Social Security benefit reforms', () => {
  it('keeps current-law CPI-W as the neutral default', () => {
    const a = { ...defaultAssumptions, inflation: 0.02 }
    expect(socialSecurityCOLARate(2027, a)).toBeCloseTo(0.02, 12)
    expect(applySocialSecurityCOLAs(50_000, 2026, 2027, a)).toBeCloseTo(51_000, 8)
  })

  it('implements SSA chained-CPI and CPI-E differentials after the selected start year', () => {
    const chained = {
      ...defaultAssumptions,
      inflation: 0.02,
      socialSecurityCOLAIndex: 'chainedCPI' as const,
      socialSecurityCOLAStartYear: 2027,
    }
    const elderly = {
      ...chained,
      socialSecurityCOLAIndex: 'cpiE' as const,
    }
    expect(socialSecurityCOLARate(2026, chained)).toBeCloseTo(0.02, 12)
    expect(socialSecurityCOLARate(2027, chained)).toBeCloseTo(0.017, 12)
    expect(socialSecurityCOLARate(2027, elderly)).toBeCloseTo(0.0215, 12)
    expect(applySocialSecurityCOLAs(50_000, 2026, 2027, chained)).toBeCloseTo(50_850, 8)
    expect(applySocialSecurityCOLAs(50_000, 2026, 2027, elderly)).toBeCloseTo(51_075, 8)
  })

  it('caps the dollar COLA rather than the underlying benefit', () => {
    const a = {
      ...defaultAssumptions,
      inflation: 0.02,
      socialSecurityCOLACapProtectedBenefit2026: 33_000,
      socialSecurityCOLACapIndexing: 'wage' as const,
    }
    expect(socialSecurityCOLAProtectedBenefitNominal(2026, a)).toBe(33_000)
    expect(applySocialSecurityCOLAs(50_000, 2026, 2027, a)).toBeCloseTo(50_660, 8)
    expect(applySocialSecurityCOLAs(30_000, 2026, 2027, a)).toBeCloseTo(30_600, 8)
  })

  it('applies one dollar COLA cap to the combined transition benefit', () => {
    const a = {
      ...defaultAssumptions,
      inflation: 0.02,
      socialSecurityCOLACapProtectedBenefit2026: 33_000,
    }
    const scale = socialSecurityCombinedCOLACapScale(
      40_000,
      2026,
      2027,
      a,
    )
    expect(40_000 * 1.02 * scale).toBeCloseTo(40_660, 8)
    expect(scale).toBeLessThan(1)
  })

  it('can combine a COLA cap with chained CPI without additive savings assumptions', () => {
    const a = {
      ...defaultAssumptions,
      inflation: 0.02,
      socialSecurityCOLAIndex: 'chainedCPI' as const,
      socialSecurityCOLACapProtectedBenefit2026: 33_000,
    }
    const combined = applySocialSecurityCOLAs(50_000, 2026, 2027, a)
    expect(combined).toBeCloseTo(50_561, 8)
    expect(combined).toBeGreaterThan(50_000)
    expect(combined).toBeLessThan(50_850)
  })

  it('keeps the current-law comparator independent of selected COLA reforms', () => {
    const a = {
      ...defaultAssumptions,
      inflation: 0.02,
      socialSecurityCOLAIndex: 'chainedCPI' as const,
      socialSecurityCOLACapProtectedBenefit2026: 33_000,
    }
    const policy = legacySocialSecurityBenefitNominal(2026, 2030, a, true)
    const currentLaw = legacySocialSecurityBenefitNominal(2026, 2030, a, false)
    expect(policy).toBeLessThan(currentLaw)
    expect(currentLaw).toBeCloseTo(
      a.currentLawSSBenefit2026 * 1.02 ** 4,
      8,
    )
  })

  it('starts post-award COLA reform at the actual claiming year, not the age-67 reference year', () => {
    const a = {
      ...defaultAssumptions,
      inflation: 0.02,
      currentLawSSBenefitRealGrowth: 0.01,
      socialSecurityCOLAIndex: 'chainedCPI' as const,
      socialSecurityCOLAStartYear: 2027,
    }
    const referenceYear = 2031
    const delayedClaimYear = 2034
    const atClaim = legacySocialSecurityBenefitNominal(
      referenceYear,
      delayedClaimYear,
      a,
      true,
      delayedClaimYear,
    )
    const expectedAtClaim =
      a.currentLawSSBenefit2026 *
      1.01 ** (referenceYear - 2026) *
      1.02 ** (delayedClaimYear - 2026)
    expect(atClaim).toBeCloseTo(expectedAtClaim, 8)
    expect(legacySocialSecurityBenefitNominal(
      referenceYear,
      2035,
      a,
      true,
      delayedClaimYear,
    )).toBeCloseTo(expectedAtClaim * 1.017, 8)
  })

  it('supports CRFB-style benefit-cap indexing alternatives', () => {
    const cpi = {
      ...defaultAssumptions,
      inflation: 0.02,
      socialSecurityBenefitCap2026: 50_000,
      socialSecurityBenefitCapIndexing: 'cpi' as const,
    }
    const chained = {
      ...cpi,
      socialSecurityBenefitCapIndexing: 'chainedCPI' as const,
    }
    const fixed20 = {
      ...cpi,
      socialSecurityBenefitCapIndexing: 'fixed20Wage' as const,
    }
    const fixed30 = {
      ...cpi,
      socialSecurityBenefitCapIndexing: 'fixed30Wage' as const,
    }
    expect(socialSecurityBenefitCapNominal(2027, cpi)).toBeCloseTo(51_000, 8)
    expect(socialSecurityBenefitCapNominal(2027, chained)).toBeCloseTo(50_850, 8)
    expect(socialSecurityBenefitCapNominal(2045, fixed20)).toBe(50_000)
    expect(socialSecurityBenefitCapNominal(2046, fixed20)!).toBeGreaterThan(50_000)
    expect(socialSecurityBenefitCapNominal(2055, fixed30)).toBe(50_000)
    expect(socialSecurityBenefitCapNominal(2056, fixed30)!).toBeGreaterThan(50_000)
  })

  it('passes COLA reforms through the prefunded flat-benefit present value', () => {
    const baseline = calculateEndowmentPerPerson(defaultAssumptions)
    const chained = calculateEndowmentPerPerson({
      ...defaultAssumptions,
      socialSecurityCOLAIndex: 'chainedCPI',
    })
    const capped = calculateEndowmentPerPerson({
      ...defaultAssumptions,
      socialSecurityCOLACapProtectedBenefit2026: 10_000,
    })
    expect(chained.socialSecurityPV).toBeLessThan(baseline.socialSecurityPV)
    expect(capped.socialSecurityPV).toBeLessThan(baseline.socialSecurityPV)
    expect(chained.medicarePV).toBe(baseline.medicarePV)
  })
})
