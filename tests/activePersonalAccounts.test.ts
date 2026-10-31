import {describe,it,expect} from 'vitest'
import {defaultAssumptions} from '../src/model/defaults'
import {defaultCombinedPolicy,scoreCombined} from '../src/model/combined'
import {defaultPersonalAccountSettings,projectAccountReform,
  personalAccountYearlyMatch} from '../src/model/personalAccountReform'
import {exampleHouseholds,scoreExampleHousehold} from '../src/model/householdScenario'
import type {CombinedPolicy} from '../src/model/combined'

const a={...defaultAssumptions,endYear:2095,fundingStrategy:'paygo' as const,
  socialSecurityInitialBenefitMode:'flatTransition' as const}

function policy(mode:'flatTransition'|'current'='flatTransition',cap=0):CombinedPolicy{
  return {
    ...defaultCombinedPolicy,
    taxEnabled:false,
    benefits:{socialSecurityReform:true,medicareReform:false},
    assumptions:{...a,socialSecurityInitialBenefitMode:mode},
    personalAccounts:{...defaultPersonalAccountSettings,enabled:true,governmentMatchCap2026:cap},
  }
}
describe('personal accounts in the active entitlement simulator',()=>{
  it('defaults to 6.5% of covered wages and 4% real gross return',()=>{
    expect(defaultCombinedPolicy.personalAccounts.enabled).toBe(false)
    expect(defaultCombinedPolicy.personalAccounts.requiredContributionRate).toBe(.065)
    expect(defaultCombinedPolicy.personalAccounts.expectedRealReturn).toBe(.04)
  })
  it('keeps private saving off Treasury books; public top-up offsets selected benefits',()=>{
    const p=policy()
    const out=scoreCombined(p)
    const opening=out.accountsByYear.get(2026)!
    const late=out.accountsByYear.get(2095)!
    expect(opening.privateContributionBillions).toBeGreaterThan(0)
    expect(opening.privateBenefitOffsetBillions).toBe(0)
    expect(opening.federalTopupsBillions).toBeCloseTo(opening.scheduledBenefitsBillions,5)
    expect(late.privateBenefitOffsetBillions).toBeGreaterThan(0)
    expect(late.federalTopupsBillions+late.privateBenefitOffsetBillions)
      .toBeCloseTo(late.scheduledBenefitsBillions,4)
    const r=out.combined.years[0]!
    expect(r.personalAccountMatching).toBe(0)
    expect(r.legacySocialSecurity).toBeCloseTo(opening.federalTopupsBillions,4)
    expect(r.flatSocialSecurityPaygo).toBe(0)
    const noAccounts=scoreCombined({...p,personalAccounts:{...p.personalAccounts,enabled:false}})
    expect(r.revenue).toBeCloseTo(noAccounts.combined.years[0]!.revenue,4)
  })
  it('applies account annuities to the separately selected current-law benefit formula',()=>{
    const flat=projectAccountReform(a,{...defaultPersonalAccountSettings,enabled:true},'scheduled')
    const current=projectAccountReform({...a,socialSecurityInitialBenefitMode:'current'},
      {...defaultPersonalAccountSettings,enabled:true},'scheduled')
    const y=2095-2026
    expect(flat[y]!.scheduledBenefitsBillions).not.toBeCloseTo(current[y]!.scheduledBenefitsBillions,2)
    expect(flat[y]!.privateContributionBillions).toBeCloseTo(current[y]!.privateContributionBillions,3)
    expect(flat[y]!.federalTopupsBillions).not.toBeCloseTo(current[y]!.federalTopupsBillions,2)
  })
  it('matching up to annual cap creates real public outlay and higher annuity balances',()=>{
    const cap=2500
    const base=scoreCombined(policy('flatTransition',0))
    const withMatch=scoreCombined(policy('flatTransition',cap))
    const r=withMatch.accountsByYear.get(2026)!
    expect(r.governmentMatchingBillions).toBeGreaterThan(0)
    expect(r.governmentMatchingBillions).toBeLessThan(r.privateContributionBillions)
    expect(withMatch.combined.years[0]!.personalAccountMatching).toBeCloseTo(r.governmentMatchingBillions,4)
    expect(withMatch.combined.years[0]!.totalPrimarySpending-
      base.combined.years[0]!.totalPrimarySpending).toBeCloseTo(r.governmentMatchingBillions,3)
    expect(withMatch.accountsByYear.get(2095)!.federalTopupsBillions)
      .toBeLessThanOrEqual(base.accountsByYear.get(2095)!.federalTopupsBillions)
    expect(personalAccountYearlyMatch(1000,2026,a,withMatchPolicy())).toBe(1000)
    expect(personalAccountYearlyMatch(10000,2026,a,withMatchPolicy())).toBe(cap)
  })
  it('reduces spendable working cash, shows retirement annuity and correctly splits government guarantee',()=>{
    const p=policy('current',1500)
    const result=scoreCombined(p)
    const worker=exampleHouseholds.find(x=>x.id==='younger-worker')!
    const now=scoreExampleHousehold(worker,2026,p,result.baseline,result.combined)!
    expect(now.mandatoryAccountSaving).toBeCloseTo(worker.primaryWage2026*.065)
    expect(now.federalAccountMatch).toBe(1500)
    expect(now.cashChange).toBeCloseTo(now.taxCashChange+now.cashTransferChange+
      now.socialSecurityChange-now.mandatoryAccountSaving,3)
    const retired=scoreExampleHousehold(worker,2070,p,result.baseline,result.combined)!
    expect(retired.privateAccountRetirementIncome).toBeGreaterThan(0)
    expect(retired.mandatoryAccountSaving).toBe(0)
    expect(retired.publicRetirementTopup).toBeGreaterThanOrEqual(0)
    expect(retired.adults[0]!.reformSS).toBeCloseTo(
      retired.adults[0]!.privateAccountAnnuity+retired.adults[0]!.publicTopup,4)
  })
})
function withMatchPolicy(){return {...defaultPersonalAccountSettings,enabled:true,governmentMatchCap2026:2500}}
