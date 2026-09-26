import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'

describe('combined fiscal bridge', () => {
  it('reproduces the current-law debt path with both reforms disabled', () => {
    const result = scoreCombined({
      ...defaultCombinedPolicy,
      taxEnabled: false,
      benefits: { socialSecurityReform: false, medicareReform: false },
    })
    for (let i = 0; i < result.combined.years.length; i += 1) {
      expect(result.combined.years[i]!.endingDebtGDP).toBeCloseTo(result.baseline.years[i]!.endingDebtGDP, 10)
    }
    expect(result.periods[0]!.fiscalImprovementBillions).toBeCloseTo(0, 6)
  })

  it('books tax replacement, transfer savings, and ACA credits in their respective budget lines', () => {
    const result = scoreCombined(defaultCombinedPolicy)
    const year = result.combined.years[0]!
    const baseline = result.baseline.years[0]!
    expect(year.revenueRate - baseline.revenueRate).toBeCloseTo(
      (result.tax.netRevenue - result.tax.targetRevenue) / result.tax.gdp, 10,
    )
    expect(baseline.otherMandatory - year.otherMandatory).toBeCloseTo(
      (result.tax.refundableTaxCreditOutlaySavings + result.programSavingsBillions) / result.tax.gdp * year.nominalGDP, 6,
    )
    expect(baseline.medicaidChipMarketplace - year.medicaidChipMarketplace).toBeCloseTo(
      result.health.estimatedExistingAptcSavingsBillions / result.tax.gdp * year.nominalGDP, 6,
    )
    expect(year.overallDeficit - baseline.overallDeficit).toBeCloseTo(
      -result.tax.deficitReductionPercentGdp * year.nominalGDP, 6,
    )
    expect(result.additionalFiscalAdjustmentGDP).toBeGreaterThan(0)
    const gdpYears = result.combined.years.reduce((sum, row) => sum + row.nominalGDP, 0)
    expect(result.periods[1]!.fiscalImprovementGDP).toBeCloseTo(
      result.periods[1]!.fiscalImprovementBillions / gdpYears, 10,
    )
  })

  it('applies a CPI-indexed retiree cap to each cohort after legacy calibration', () => {
    const uncapped = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: false } })
    const capped = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: false },
      assumptions: { ...defaultCombinedPolicy.assumptions, socialSecurityBenefitCap2026: 12_000 } })
    const year = 2050, row = capped.combined.socialSecurityByYear.get(year)!
    for (const cohort of row.cohorts) {
      const nominalCap = 12_000 * 1.02 ** (year - 2026) * cohort.survivingBeneficiariesMillions / 1000
      expect(cohort.legacyPaygoBillions + cohort.flatBenefitBillions).toBeLessThanOrEqual(nominalCap + 1e-8)
    }
    expect(capped.combined.years[year - 2026]!.totalPrimarySpending).toBeLessThan(
      uncapped.combined.years[year - 2026]!.totalPrimarySpending)
    expect(capped.baseline.years[year - 2026]!.legacySocialSecurity).toBeCloseTo(
      uncapped.baseline.years[year - 2026]!.legacySocialSecurity, 8)
  })

  it('keeps independent growth and retirement-age effects visible', () => {
    const unchanged = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: true } })
    const changed = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: true }, assumptions: {
        ...defaultCombinedPolicy.assumptions, realGDPGrowth: 0.01,
        legacyMedicareRealGrowth: 0.03, fullRetirementAge: 72,
      } })
    expect(changed.baseline.years[20]!.legacySocialSecurity).toBeCloseTo(
      unchanged.baseline.years[20]!.legacySocialSecurity, 8)
    expect(changed.combined.years[20]!.legacySocialSecurity).not.toBeCloseTo(
      unchanged.combined.years[20]!.legacySocialSecurity, 4)
    expect(changed.combined.years[60]!.endingDebtGDP).not.toBeCloseTo(
      unchanged.combined.years[60]!.endingDebtGDP, 3)
  })

  it('uses the entitlement funding plan when both benefit reforms are enabled', () => {
    const result = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: true },
      assumptions: { ...defaultCombinedPolicy.assumptions, fundingStrategy: 'both', prefundingStartAge: 18 },
    })
    expect(result.combined.years[0]!.newCohortPrefunding).toBeGreaterThan(0)
    expect(result.baseline.years[0]!.newCohortPrefunding).toBe(0)
    expect(result.combined.years[0]!.totalPrimarySpending).toBeCloseTo(
      result.combined.years[0]!.legacySocialSecurity + result.combined.years[0]!.flatSocialSecurityPaygo +
      result.combined.years[0]!.otherOASDI + result.combined.years[0]!.legacySeniorMedicare +
      result.combined.years[0]!.premiumSupportPaygo + result.combined.years[0]!.under65Medicare +
      result.combined.years[0]!.medicaidChipMarketplace + result.combined.years[0]!.otherMandatory +
      result.combined.years[0]!.defenseDiscretionary + result.combined.years[0]!.nonDefenseDiscretionary +
      result.combined.years[0]!.newCohortPrefunding, 6)
  })

  it('switches Social Security and Medicare independently while retaining the other baseline', () => {
    const ss = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: false } })
    const med = scoreCombined({ ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: false, medicareReform: true } })
    const index = 2035 - 2026
    expect(ss.combined.years[index]!.legacySeniorMedicare).toBeCloseTo(
      ss.baseline.years[index]!.legacySeniorMedicare, 8,
    )
    expect(med.combined.years[index]!.legacySocialSecurity).toBeCloseTo(
      med.baseline.years[index]!.legacySocialSecurity, 8,
    )
    expect(ss.combined.years[index]!.legacySocialSecurity).not.toBeCloseTo(
      ss.baseline.years[index]!.legacySocialSecurity, 4,
    )
    expect(med.combined.years[index]!.legacySeniorMedicare).not.toBeCloseTo(
      med.baseline.years[index]!.legacySeniorMedicare, 4,
    )
    expect(Number.isFinite(ss.periods[1]!.terminalDebtGDP)).toBe(true)
  })
})
