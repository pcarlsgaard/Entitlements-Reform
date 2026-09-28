import { currentLawRevenueGDP, replacedRevenueDriftGDP } from '../src/model/revenueBaseline'
import { calculateEndowmentPerPerson } from '../src/model/endowment'
import { describe, it, expect } from 'vitest'
import { defaultAssumptions as defaults } from '../src/model/defaults'
import { actuarialClaimFactor, annualWorkCredit, claimAnnuity, workCreditFraction } from '../src/model/claiming'
import { socialSecurityForYear } from '../src/model/socialSecurity'
import { medicareForYear, premiumSupportPerPersonNominal } from '../src/model/medicare'
import { nonDefenseDiscretionaryBillions, nominalGDPBillionsForYear } from '../src/model/budget'
import { projectedSurvival } from '../src/model/demographics'
import { realWageGrowthFactor, taxRevenueChangePath } from '../src/model/taxProjection'
import { ssaRealCoveredWageGrowth } from '../src/data/trustees2026'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { calculateAggregateChildCreditCost, hasDetailedChildCreditMicrodata, childCreditPopulationSummary } from '../src/tax/model/childCredits'
import { parseConfiguration } from '../src/model/savedConfigurations'
import saved from '../configurations/config1-paygo.json'

describe('selected policy rules and robustness', () => {
  it('does not keep current-law receipt growth from taxes that are replaced', () => {
    const drift = replacedRevenueDriftGDP(2056, defaultCombinedPolicy.tax)
    expect(currentLawRevenueGDP(2056) - currentLawRevenueGDP(2026) - drift).toBeCloseTo((1.039 - 0.617) / 100, 4)
    expect(currentLawRevenueGDP(2095)).toBe(currentLawRevenueGDP(2056))
  })
  it('includes known future GDP changes in prefunding a GDP-linked Medicare pool', () => {
    const baseline = calculateEndowmentPerPerson(defaults)
    const dynamic = calculateEndowmentPerPerson(defaults, 2026, () => 1.02)
    expect(dynamic.medicarePV).toBeCloseTo(baseline.medicarePV * 1.02, 7)
    expect(dynamic.socialSecurityPV).toBe(baseline.socialSecurityPV)
  })
  it('does not scale the statutory flat SS promise to force current-law totals', () => {
    const a = { ...defaults, fundingStrategy: 'paygo' as const, fullRetirementAge: 67, socialSecurityClaimAge: 67,
      currentLawSSBenefitRealGrowth: 0, flatBenefitFPLMultiple: 24500 / defaults.individualFPL2026 }
    for (const year of [2026, 2035, 2055, 2095]) {
      const reform = socialSecurityForYear(year, a)
      for (const cohort of reform.cohorts)
        expect(cohort.flatBenefitPerPerson).toBeCloseTo(cohort.legacyBenefitPerPerson, 8)
      const directFlatCost = reform.cohorts.reduce((sum, cohort) =>
        sum + cohort.survivingBeneficiariesMillions * cohort.flatShare * cohort.flatBenefitPerPerson / 1000, 0)
      expect(reform.flatBenefitBillions).toBeCloseTo(directFlatCost, 8)
    }
  })
  it('preserves expected flat-benefit lifetime value across claiming ages and cohorts', () => {
    for (const birth of [1970, 1990, 2026]) for (const age of [62, 65, 67, 70, 75]) {
      const pv = claimAnnuity(birth, age, defaults) * actuarialClaimFactor(birth, age, defaults)
      expect(pv).toBeCloseTo(claimAnnuity(birth, defaults.fullRetirementAge, defaults), 11)
    }
    expect(projectedSurvival(62, 85, 2026)).toBeGreaterThan(projectedSurvival(62, 85, 1970))
  })
  it('credits partial earnings-years without an eligibility cliff', () => {
    expect(annualWorkCredit(3780, 7560)).toBe(0.5)
    expect(annualWorkCredit(100000, 7560)).toBe(1)
    expect(workCreditFraction(17.5, defaults)).toBe(0.5)
    expect(workCreditFraction(35, defaults)).toBe(1)
  })
  it('holds the Medicare pool at the chosen GDP share after transition, across population paths', () => {
    for (const growth of [-0.005, 0.002, 0.01]) {
      const a = { ...defaults, fundingStrategy: 'paygo' as const, cohortSizeGrowth: growth }
      for (const year of [2035, 2055, 2095]) expect(medicareForYear(year, a).premiumSupportPaygoBillions /
        nominalGDPBillionsForYear(year, a)).toBeCloseTo(a.medicareSupportGDPShare, 12)
    }
    expect(premiumSupportPerPersonNominal(2055, {...defaults, cohortSizeGrowth: 0.01})).toBeLessThan(
      premiumSupportPerPersonNominal(2055, defaults))
  })
  it('makes NDD mode explicit and continuous within the chosen mode', () => {
    const a = {...defaults, nonDefenseDiscretionaryMode: 'growth' as const}
    expect(nonDefenseDiscretionaryBillions(2095, {...a, nonDefenseDiscretionaryRealGrowth: 0.01800001}) /
      nonDefenseDiscretionaryBillions(2095, a)).toBeCloseTo(1, 5)
    expect(nonDefenseDiscretionaryBillions(2095, {...defaults, nonDefenseDiscretionaryRealGrowth: 0.01800001})).toBe(
      nonDefenseDiscretionaryBillions(2095, defaults))
  })
  it('separates progressive wage drift from the GDP-linked flat X-tax base', () => {
    const a = {...defaults, endYear: 2095}
    const lowInflation = taxRevenueChangePath(defaultCombinedPolicy.tax, {...a, inflation: 0}, 100)
    const highInflation = taxRevenueChangePath(defaultCombinedPolicy.tax, {...a, inflation: 0.08}, 100)
    expect([...lowInflation]).toEqual([...highInflation])

    const noCredits = {...defaultCombinedPolicy.tax, adultCredit: 0, childCredit: 0, under6ChildCredit: 0}
    const flat = {...noCredits, wageTaxMode: 'flat' as const}
    const flatLow = taxRevenueChangePath(flat, {...a, realWageGrowthDeviation: -0.005}, 0)
    const flatHigh = taxRevenueChangePath(flat, {...a, realWageGrowthDeviation: 0.005}, 0)
    expect(flatHigh.get(2095)).toBeCloseTo(flatLow.get(2095)!, 10)

    const progressiveLow = taxRevenueChangePath(noCredits, {...a, realWageGrowthDeviation: -0.005}, 0)
    const progressiveHigh = taxRevenueChangePath(noCredits, {...a, realWageGrowthDeviation: 0.005}, 0)
    expect(progressiveHigh.get(2095)!).toBeGreaterThan(progressiveLow.get(2095)!)
    expect(ssaRealCoveredWageGrowth(2026)).toBeCloseTo(0.0182, 10)
    expect(ssaRealCoveredWageGrowth(2035)).toBeCloseTo(0.0138, 10)
    expect(ssaRealCoveredWageGrowth(2095)).toBeCloseTo(0.0114, 10)
    expect(realWageGrowthFactor(2027, defaults)).toBeCloseTo(1.0154, 10)
  })
  it('uses detailed child data and actually scores the earnings phase-in', () => {
    expect(hasDetailedChildCreditMicrodata()).toBe(true)
    expect(childCreditPopulationSummary().childrenMillions).toBeCloseTo(72.021348, 8)
    const tax = {...defaultCombinedPolicy.tax, childCreditBaselineRefundableShare: 0.5, childCreditPhaseInRate: 0}
    expect(calculateAggregateChildCreditCost({...tax, childCreditPhaseInRate: 0.25})).toBeGreaterThan(calculateAggregateChildCreditCost(tax))
  })
  it('migrates original Config1 with opening support generosity preserved', () => {
    const migrated = parseConfiguration(JSON.stringify(saved)).scenario.policy
    expect(migrated.assumptions.medicareFundingMode).toBe('gdpShare')
    expect(premiumSupportPerPersonNominal(2026, migrated.assumptions)).toBeCloseTo(saved.scenario.policy.assumptions.premiumSupport2026, 8)
    expect(migrated.assumptions.socialSecurityClaimAge).toBe(70)
  })
  it('leaves the flat SS promise unchanged under faster GDP growth while GDP-linked Medicare rises', () => {
    const a = {...defaults, fundingStrategy:'paygo' as const}
    expect(socialSecurityForYear(2070,{...a,realGDPGrowth:0.03})).toEqual(socialSecurityForYear(2070,a))
    const policy = {...defaultCombinedPolicy, benefits:{socialSecurityReform:true,medicareReform:true},
      dynamic:{...defaultCombinedPolicy.dynamic,enabled:true}}
    const s = scoreCombined(policy)
    const i = 30
    expect(s.combined.years[i]!.premiumSupportPaygo / s.combined.years[i]!.nominalGDP).toBeCloseTo(a.medicareSupportGDPShare, 10)
    expect(s.combined.years[i]!.flatSocialSecurityPaygo).toBe(s.staticCombined.years[i]!.flatSocialSecurityPaygo)
  })
})
