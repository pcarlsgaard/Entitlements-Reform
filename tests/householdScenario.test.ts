import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { exampleHouseholds, scoreExampleHousehold } from '../src/model/householdScenario'

const example = (id: string) => exampleHouseholds.find(row => row.id === id)!

describe('cohort-linked household snapshots', () => {
  it('matches cash and benefit paths when all reforms are disabled', () => {
    const policy = { ...defaultCombinedPolicy, taxEnabled: false }
    const score = scoreCombined(policy)
    const household = scoreExampleHousehold(example('retired-couple'), 2035, policy, score.baseline, score.combined)!
    expect(household.cashChange).toBeCloseTo(0, 8)
    expect(household.reformSocialSecurity).toBeCloseTo(household.baselineSocialSecurity, 8)
    expect(household.reformMedicarePayment).toBeCloseTo(household.baselineMedicarePayment, 8)
    expect(household.healthCreditGross).toBe(0)
  })

  it('books a SNAP removal in cash once and keeps health credit outside disposable cash', () => {
    const profile = example('single-parent')
    const policy = { ...defaultCombinedPolicy, transfers: {
      replacedPrograms: { ...defaultCombinedPolicy.transfers.replacedPrograms, snap: true },
    } }
    const score = scoreCombined(policy)
    const household = scoreExampleHousehold(profile, 2026, policy, score.baseline, score.combined)!
    const snap = household.programs.find(row => row.program.id === 'snap')!
    expect(snap.annualGovernmentBenefit).toBeGreaterThan(0)
    expect(household.cashTransferChange).toBeCloseTo(-snap.annualGovernmentBenefit, 8)
    expect(household.cashChange).toBeCloseTo(
      household.taxCashChange + household.cashTransferChange + household.socialSecurityChange, 8)
    expect(household.healthCreditGross).toBe(0) // Public coverage preset.
    const coveredPolicy = { ...policy, health: { ...policy.health, adultHealthCredit: 9000 } }
    const covered = scoreExampleHousehold({ ...profile, coverage: 'esi' }, 2026, coveredPolicy,
      score.baseline, score.combined)!
    expect(covered.healthCreditGross).toBeGreaterThan(0)
    expect(covered.cashChange).toBeCloseTo(household.cashChange, 8)
  })

  it('shows retirement-age timing and a CPI-indexed per-person cap', () => {
    const policy = { ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: false },
      assumptions: { ...defaultCombinedPolicy.assumptions, fullRetirementAge: 68,
        socialSecurityBenefitCap2026: 18_000 } }
    const score = scoreCombined(policy)
    const near = scoreExampleHousehold(example('near-retiree'), 2030, policy, score.baseline, score.combined)!
    expect(near.ages).toEqual([68])
    expect(near.baselineSocialSecurity).toBe(0)
    expect(near.reformSocialSecurity).toBeGreaterThan(0)
    expect(near.reformSocialSecurity).toBeLessThanOrEqual(18_000 * 1.02 ** 4 + 1e-8)
    const old = scoreExampleHousehold(example('retired-couple'), 2095, policy, score.baseline, score.combined)
    expect(old).toBeNull()
  })

  it('counts gross prefunded Medicare support even when PAYGO spending is zero', () => {
    const policy = { ...defaultCombinedPolicy, taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: true },
      assumptions: { ...defaultCombinedPolicy.assumptions, fundingStrategy: 'both' as const, prefundingStartAge: 18 as const } }
    const score = scoreCombined(policy)
    const young = { ...example('younger-worker'), primaryAge2026: 16 }
    const snapshot = scoreExampleHousehold(young, 2075, policy, score.baseline, score.combined)!
    const cohort = score.combined.medicareByYear.get(2075)!.cohorts.find(row => row.eligibilityYear === 2075)!
    expect(cohort.prefundedShare).toBeGreaterThan(0)
    expect(snapshot.reformMedicarePayment).toBeGreaterThan(0)
  })

  it('ages children out of credits and transfer rules and ignores repeal while tax is off', () => {
    const policy = { ...defaultCombinedPolicy, taxEnabled: false, transfers: {
      replacedPrograms: { ...defaultCombinedPolicy.transfers.replacedPrograms, snap: true, schoolMeals: true },
    } }
    const score = scoreCombined(policy)
    const household = example('single-parent')
    const first = scoreExampleHousehold(household, 2026, policy, score.baseline, score.combined)!
    const later = scoreExampleHousehold(household, 2050, policy, score.baseline, score.combined)!
    expect(first.childAges).toEqual([3, 8])
    expect(later.childAges).toEqual([])
    expect(later.programs.find(row => row.program.id === 'schoolMeals')!.annualGovernmentBenefit).toBe(0)
    expect(first.cashTransferChange).toBe(0)
    expect(later.cashTransferChange).toBe(0)
  })
})
