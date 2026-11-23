import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { universalHealthForYear } from '../src/model/universalHealth'
import { primaryComponentSum } from '../src/model/simulate'
import { parseConfiguration } from '../src/model/savedConfigurations'
import { exampleHouseholds } from '../src/model/householdScenario'

const base = defaultCombinedPolicy
const universal = {
  ...base,
  health: { ...base.health, pathway: 'advantageForAll' as const },
}

describe('Advantage for All alternative to health purchase credits', () => {
  it('preserves the old purchase-credit pathway by default', () => {
    const result = scoreCombined(base)
    expect(base.health.pathway).toBe('purchaseCredits')
    expect(result.universal2026).toBeNull()
    expect(result.combined.years[0]!.universalHealthPremiumSupport).toBe(0)
    expect(result.health.totalHealthCreditCostBillions).toBeGreaterThan(0)
  })

  it('quotes a transparent gross bid, member premium and federal residual', () => {
    const y = universalHealthForYear(2026, base.assumptions, universal.health)
    expect(y.averageBidMonthly).toBeGreaterThan(0)
    expect(y.nonelderlyGrossAnnualPerPerson).toBeGreaterThan(y.sourceSilverAnnualPerPerson2024)
    expect(y.seniorGrossAnnualPerPerson).toBeGreaterThan(0)
    expect(y.benchmarkMonthly).toBeCloseTo(y.averageBidMonthly * .96, 10)
    expect(y.memberPremiumMonthly).toBeCloseTo(202.90, 10)
    expect(y.grossBenchmarkBillions - y.memberContributionsBillions)
      .toBeCloseTo(y.publicBenchmarkBillions, 8)
    expect(y.federalOutlayBillions)
      .toBeCloseTo(y.publicBenchmarkBillions + y.ruralSupportBillions, 8)
    expect(y.populationMillions).toBeGreaterThan(300)
  })

  it('grows per-enrollee plan costs at the same default 1.8% real rate for both ages', () => {
    expect(universal.health.universalBidRealGrowth).toBe(.018)
    expect(universal.health.universalMemberPremiumRealGrowth).toBe(0)
    const opening = universalHealthForYear(2026, base.assumptions, universal.health)
    const later = universalHealthForYear(2036, base.assumptions, universal.health)
    const nominalFactor = ((1 + base.assumptions.inflation) * 1.018) ** 10
    expect(later.nonelderlyGrossAnnualPerPerson / opening.nonelderlyGrossAnnualPerPerson)
      .toBeCloseTo(nominalFactor, 8)
    expect(later.seniorGrossAnnualPerPerson / opening.seniorGrossAnnualPerPerson)
      .toBeCloseTo(nominalFactor, 8)
    expect(later.ruralSupportBillions / opening.ruralSupportBillions)
      .toBeCloseTo(nominalFactor, 8)
    expect(later.memberPremiumMonthly / opening.memberPremiumMonthly)
      .toBeCloseTo((1 + base.assumptions.inflation) ** 10, 8)
  })

  it('applies all-age cost growth to both age groups without changing 2026 anchors', () => {
    const slow = { ...universal.health, universalBidRealGrowth: .01 }
    const fast = { ...universal.health, universalBidRealGrowth: .03 }
    const initialSlow = universalHealthForYear(2026, base.assumptions, slow)
    const initialFast = universalHealthForYear(2026, base.assumptions, fast)
    expect(initialSlow.grossBenchmarkBillions).toBeCloseTo(initialFast.grossBenchmarkBillions, 8)
    const laterSlow = universalHealthForYear(2046, base.assumptions, slow)
    const laterFast = universalHealthForYear(2046, base.assumptions, fast)
    expect(laterFast.nonelderlyGrossAnnualPerPerson).toBeGreaterThan(laterSlow.nonelderlyGrossAnnualPerPerson)
    expect(laterFast.seniorGrossAnnualPerPerson).toBeGreaterThan(laterSlow.seniorGrossAnnualPerPerson)
    expect(laterFast.grossBenchmarkBillions).toBeGreaterThan(laterSlow.grossBenchmarkBillions)
    expect(laterFast.federalOutlayBillions).toBeGreaterThan(laterSlow.federalOutlayBillions)
  })

  it('indexes member contributions separately from all-age healthcare spending', () => {
    const baseline = universalHealthForYear(2046, base.assumptions, universal.health)
    const higherMember = universalHealthForYear(2046, base.assumptions,
      { ...universal.health, universalMemberPremiumRealGrowth: .02 })
    expect(higherMember.grossBenchmarkBillions).toBeCloseTo(baseline.grossBenchmarkBillions, 8)
    expect(higherMember.memberPremiumMonthly).toBeGreaterThan(baseline.memberPremiumMonthly)
    expect(higherMember.memberContributionsBillions).toBeGreaterThan(baseline.memberContributionsBillions)
    expect(higherMember.federalOutlayBillions).toBeLessThan(baseline.federalOutlayBillions)
  })

  it('replaces federal Medicare and Medicaid instead of stacking an extra credit', () => {
    const score = scoreCombined(universal)
    const y = score.combined.years[0]!
    const b = score.baseline.years[0]!
    expect(score.health.totalHealthCreditCostBillions).toBe(0)
    expect(score.universal2026).not.toBeNull()
    expect(y.universalHealthPremiumSupport).toBeCloseTo(score.universal2026!.federalOutlayBillions, 8)
    expect(y.legacySeniorMedicare).toBe(0)
    expect(y.premiumSupportPaygo).toBe(0)
    expect(y.under65Medicare).toBe(0)
    expect(y.medicaidChipMarketplace).toBe(0)
    expect(b.legacySeniorMedicare + b.under65Medicare + b.medicaidChipMarketplace).toBeGreaterThan(0)
    expect(score.universalFederalIncrement2026Billions).toBeCloseTo(
      score.universal2026!.federalOutlayBillions -
      b.legacySeniorMedicare - b.premiumSupportPaygo - b.under65Medicare - b.medicaidChipMarketplace, 8)
    expect(primaryComponentSum(y)).toBeCloseTo(y.totalPrimarySpending, 8)
    expect(y.newCohortPrefunding).toBe(0)
  })

  it('links benchmark choice and household premium to federal cost, not government receipts', () => {
    const low = universalHealthForYear(2026, base.assumptions, universal.health)
    const average = universalHealthForYear(2026, base.assumptions,
      { ...universal.health, universalBenchmark: 'average' })
    expect(average.benchmarkMonthly).toBeGreaterThan(low.benchmarkMonthly)
    expect(average.federalOutlayBillions).toBeGreaterThan(low.federalOutlayBillions)
    const cheaperSource = universalHealthForYear(2026, base.assumptions,
      { ...universal.health, universalBidMultiplier: 0.95 })
    expect(cheaperSource.averageBidMonthly).toBeLessThan(low.averageBidMonthly)
    const higherAV = universalHealthForYear(2026, base.assumptions,
      { ...universal.health, universalTargetActuarialValue: 0.95 })
    expect(higherAV.nonelderlyGrossAnnualPerPerson).toBeGreaterThan(low.nonelderlyGrossAnnualPerPerson)
    expect(higherAV.seniorGrossAnnualPerPerson).toBeGreaterThan(low.seniorGrossAnnualPerPerson)
    expect(higherAV.seniorGrossAnnualPerPerson / low.seniorGrossAnnualPerPerson)
      .toBeCloseTo(.95 / .90, 8)
    const higherMember = universalHealthForYear(2026, base.assumptions,
      { ...universal.health, universalMemberPremiumMonthly2026: 302.90 })
    expect(higherMember.grossBenchmarkBillions).toBeCloseTo(low.grossBenchmarkBillions, 8)
    expect(higherMember.memberContributionsBillions).toBeGreaterThan(low.memberContributionsBillions)
    expect(higherMember.federalOutlayBillions).toBeLessThan(low.federalOutlayBillions)
  })

  it('does not simultaneously apply separate senior premium support or ACA top-ups', () => {
    const policy = { ...universal, health: {
      ...universal.health, adultHealthCredit: 20000, childHealthCredit: 20000,
      replaceAcaAptc: false, esiAcaTransitionShare: 1,
    }}
    const a = scoreCombined(policy)
    const b = scoreCombined({ ...policy, benefits: { ...policy.benefits, medicareReform: true } })
    for(const index of [0, 10, 30]){
      expect(a.combined.years[index]!.totalPrimarySpending)
        .toBeCloseTo(b.combined.years[index]!.totalPrimarySpending, 6)
      expect(a.combined.years[index]!.premiumSupportPaygo).toBe(0)
    }
    expect(a.health.estimatedExistingAptcSavingsBillions).toBe(0)
    expect(a.health.esiAcaTransitionTopUpCostBillions).toBe(0)
    expect(a.tax.insuranceCreditCost).toBe(0)
  })

  it('can switch the universal plan off without changing current law', () => {
    const disabled = scoreCombined({ ...universal, taxEnabled: false })
    expect(disabled.universal2026).toBeNull()
    expect(disabled.combined.years[0]!.universalHealthPremiumSupport).toBe(0)
    for(let index of [0,10,30]){
      expect(disabled.combined.years[index]!.endingDebtGDP)
        .toBeCloseTo(disabled.baseline.years[index]!.endingDebtGDP, 9)
    }
  })

  it('preserves explicitly saved pre-change premium growth while adding member growth', () => {
    const payload = {
      format: 'entitlements-reform-configuration', version: 1,
      id: 'pre-growth-config', name: 'Universal old setting',
      savedAt: '2026-11-22T00:00:00.000Z',
      scenario: {
        policy: { ...universal,
          health: { ...universal.health, universalBidRealGrowth: .015 } },
        householdProfiles: structuredClone(exampleHouseholds),
        householdYear: 2026, householdSelectedId: exampleHouseholds[0]!.id,
      },
    }
    delete (payload.scenario.policy.health as unknown as Record<string, unknown>)
      .universalMemberPremiumRealGrowth
    const parsed = parseConfiguration(JSON.stringify(payload))
    expect(parsed.scenario.policy.health.universalBidRealGrowth).toBe(.015)
    expect(parsed.scenario.policy.health.universalMemberPremiumRealGrowth).toBe(0)
  })

  it('migrates previously saved policies to purchase credits rather than universal insurance', () => {
    const payload = {
      format: 'entitlements-reform-configuration',version: 1,
      id: 'old-config', name: 'Saved tax credits', savedAt:'2026-11-01T00:00:00.000Z',
      scenario: {
        policy:{...base,health:{...base.health}},
        householdProfiles:structuredClone(exampleHouseholds), householdYear:2026, householdSelectedId:exampleHouseholds[0]!.id,
      }
    }
    const health = payload.scenario.policy.health as Record<string, unknown>
    for(const key of [
      'pathway', 'universalBenchmark', 'universalBidMultiplier', 'universalTargetActuarialValue',
      'universalSecondLowestBidFactor', 'universalMemberPremiumMonthly2026',
      'universalBidRealGrowth', 'universalMemberPremiumRealGrowth',
      'universalRuralSupportBillions2026',
    ]) delete health[key]
    const parsed = parseConfiguration(JSON.stringify(payload))
    expect(parsed.scenario.policy.health.pathway).toBe('purchaseCredits')
    expect(parsed.scenario.policy.health.universalMemberPremiumMonthly2026).toBe(202.90)
    expect(parsed.scenario.policy.health.universalBidRealGrowth).toBe(.018)
    expect(parsed.scenario.policy.health.universalMemberPremiumRealGrowth).toBe(0)
  })
})
