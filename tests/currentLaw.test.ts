import { describe, expect, it } from 'vitest'
import { reconciliationErrors } from '../src/model/audit'
import {
  hiPayableShare,
  oasiPayableShare,
  seniorMedicarePayableShare,
} from '../src/model/currentLaw'
import { defaultAssumptions, withAssumptions } from '../src/model/defaults'
import { compareScenarios } from '../src/model/scenarios'

describe('2026 Trustees payable-benefit paths', () => {
  it('uses the OASI depletion and 2100 endpoints with an annual depletion-year approximation', () => {
    expect(oasiPayableShare(2031)).toBe(1)
    expect(oasiPayableShare(2032)).toBeCloseTo(0.945, 12)
    expect(oasiPayableShare(2033)).toBe(0.78)
    expect(oasiPayableShare(2100)).toBe(0.62)
    expect(oasiPayableShare(2160)).toBe(0.62)
  })

  it('uses the HI depletion, 2050, and 2100 endpoints', () => {
    expect(hiPayableShare(2032)).toBe(1)
    expect(hiPayableShare(2033)).toBeCloseTo(0.9175, 12)
    expect(hiPayableShare(2034)).toBe(0.89)
    expect(hiPayableShare(2050)).toBe(0.85)
    expect(hiPayableShare(2100)).toBe(0.93)
    expect(hiPayableShare(2160)).toBe(0.93)
  })

  it('reduces only Medicare Part A while Parts B and D remain fully payable', () => {
    const share = seniorMedicarePayableShare(2050, defaultAssumptions)
    expect(share).toBeCloseTo(
      1 - defaultAssumptions.legacyMedicareHIShare2026 * 0.15,
      12,
    )
    expect(share).toBeGreaterThan(hiPayableShare(2050))
  })
})

describe('current-law baseline comparison', () => {
  const comparison = compareScenarios(withAssumptions({ endYear: 2160 }))
  const scheduled = comparison.baselines.scheduled.permanent.simulation
  const payable = comparison.baselines.payable.permanent.simulation

  it('keeps every retirement and Medicare cohort on current-law benefits', () => {
    const socialSecurity = scheduled.socialSecurityByYear.get(2050)
    const medicare = scheduled.medicareByYear.get(2050)
    expect(
      socialSecurity?.cohorts.every(
        (cohort) => cohort.legacyShare === 1 && cohort.flatShare === 0,
      ),
    ).toBe(true)
    expect(
      medicare?.cohorts.every(
        (cohort) =>
          cohort.legacyShare === 1 && cohort.premiumSupportShare === 0,
      ),
    ).toBe(true)
  })

  it('is identical before depletion and records lower delivered benefits afterward', () => {
    const scheduled2026 = scheduled.years.find((row) => row.year === 2026)!
    const payable2026 = payable.years.find((row) => row.year === 2026)!
    const scheduled2050 = scheduled.years.find((row) => row.year === 2050)!
    const payable2050 = payable.years.find((row) => row.year === 2050)!

    expect(payable2026.totalPrimarySpending).toBe(
      scheduled2026.totalPrimarySpending,
    )
    expect(payable2050.legacySocialSecurity).toBeLessThan(
      scheduled2050.legacySocialSecurity,
    )
    expect(payable2050.legacySeniorMedicare).toBeLessThan(
      scheduled2050.legacySeniorMedicare,
    )
    expect(payable2050.otherOASDI).toBe(scheduled2050.otherOASDI)
  })

  it('does not misstate insolvency cuts as a reform financing choice', () => {
    expect(comparison.baselines.scheduled.assumptions.fundingStrategy).toBe(
      'paygo',
    )
    expect(comparison.baselines.payable.assumptions.fundingStrategy).toBe(
      'paygo',
    )
    expect(
      comparison.baselines.payable.permanent.rate,
    ).toBeLessThan(comparison.baselines.scheduled.permanent.rate)
  })

  for (const mode of ['scheduled', 'payable'] as const) {
    it(`reconciles every annual identity for the ${mode} baseline`, () => {
      const simulation = comparison.baselines[mode].permanent.simulation
      for (const row of simulation.years) {
        for (const error of Object.values(reconciliationErrors(row))) {
          expect(error).toBeCloseTo(0, 8)
        }
      }
    })
  }
})
