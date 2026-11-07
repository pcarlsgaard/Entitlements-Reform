import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { calculateConsumptionAudit } from '../src/tax/model/consumptionAudit'

const p=defaultCombinedPolicy
const tax={...p.tax,
  rate:.35,wageTaxMode:'progressive' as const,
  progressiveWageBrackets:[
    {upperPerAdult:65000,rate:.20},
    {upperPerAdult:150000,rate:.25},
    {upperPerAdult:310000,rate:.30},
    {upperPerAdult:null,rate:.35}
  ],
  adultCredit:2700,adultCreditMode:'earned' as const,
  adultCreditEarningsBase:'compensation' as const,adultCreditPhaseInRate:.2,
  childCredit:5400,childCreditBaselineRefundableShare:.5,
  childCreditPhaseInRate:.2,under6ChildCredit:0,
  employerSocialInsuranceExemptionShare:0,employerHealthInsuranceExemptionShare:0,
  employerPensionOtherInsuranceExemptionShare:0,cashWageExemptionShare:0,
  replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true},
}
const accounts={...p.personalAccounts,enabled:true,requiredContributionRate:.065}
const h={...p.health,adultHealthCredit:3000,childHealthCredit:1500,
  benchmarkPremiumScale:1.03,redistributionRule:'nationalEqual' as const,
  recipientScope:'policyholders' as const}

describe('premium construction and 2026 consumption-decomposition audit',()=>{
  it('reports large ESI Silver replacement-premium tail without treating contract linkage as known',()=>{
    const audit=calculateConsumptionAudit(tax,{...h,nonPolicyholderTreatment:'continueFamilyPolicy'},accounts)
    const group=audit.premiumByAge.find(x=>x.label==='60–64')!
    const young=audit.premiumByAge.find(x=>x.label==='Under 30')!
    expect(group.policyholdersMillions).toBeGreaterThan(3)
    expect(group.meanPremiumDollars).toBeGreaterThan(young.meanPremiumDollars)
    expect(group.sharePremiumOver20000).toBeGreaterThan(young.sharePremiumOver20000)
    expect(audit.matchedPolicyIdentifiersAvailable).toBe(false)
    expect(audit.nongroupPremiumStatusAvailable).toBe(false)
    expect(audit.byWageQuintile).toHaveLength(5)
    expect(audit.total.unitsMillions).toBeGreaterThan(120)
    expect(audit.nonPositiveBaselineMillions).toBeGreaterThanOrEqual(0)
    const n=audit.byWageQuintile.reduce((sum,r)=>sum+r.unitsMillions,0)
    expect(n).toBeCloseTo(audit.total.unitsMillions,5)
    for(const band of audit.byWageQuintile){
      expect(Number.isFinite(band.meanTaxCreditChangeDollars)).toBe(true)
      expect(Number.isFinite(band.meanHealthTransitionChangeDollars)).toBe(true)
      expect(Number.isFinite(band.meanRothSavingDollars)).toBe(true)
      expect(band.meanTaxCreditChangeDollars+band.meanHealthTransitionChangeDollars+
        band.meanRothSavingDollars).toBeCloseTo(band.meanChangeDollars,4)
      expect(band.loss10Percent).toBeLessThanOrEqual(band.loss5Percent+1e-8)
      expect(band.loss5Percent).toBeLessThanOrEqual(band.loss1Percent+1e-8)
      expect(band.gainPercent+band.loss1Percent).toBeLessThanOrEqual(100.01)
    }
    console.log('PREMIUM_AUDIT_2026_REFERENCE='+JSON.stringify({
      byQuintile:audit.byWageQuintile,all:audit.total,
      premiumByAge:audit.premiumByAge,
      premiumByTier:audit.premiumByTier,
      losers5ByCoverage:audit.loss5ByCoverage,
      nonPositiveBaselineMillions:audit.nonPositiveBaselineMillions,
    }))
  },240000)

  it('maintains no assigned premium for non-policyholders in the continuation option',()=>{
    const continu=calculateConsumptionAudit(tax,{...h,nonPolicyholderTreatment:'continueFamilyPolicy'},accounts)
    const legacy=calculateConsumptionAudit(tax,{...h,nonPolicyholderTreatment:'asModeled'},accounts)
    const exclude=calculateConsumptionAudit(tax,{...h,nonPolicyholderTreatment:'exclude'},accounts)
    expect(continu.total.unitsMillions).toBeCloseTo(legacy.total.unitsMillions,5)
    expect(continu.total.unitsMillions).toBeGreaterThan(exclude.total.unitsMillions)
    expect(exclude.excludedTaxUnitsMillions).toBeGreaterThan(10)
    const contDependent5=continu.loss5ByCoverage.find(x=>x.label==='dependent')!
    const legacyDependent5=legacy.loss5ByCoverage.find(x=>x.label==='dependent')!
    expect(contDependent5.unitsMillions).toBeLessThan(legacyDependent5.unitsMillions)
    expect(exclude.loss5ByCoverage.find(x=>x.label==='dependent')!.unitsMillions).toBe(0)
  },240000)

  it('quantifies premium sensitivity without treating it as a fiscal score',()=>{
    const scenarios=[1.03,.90,.80].map(scale=>{
      const a=calculateConsumptionAudit(tax,{
        ...h,benchmarkPremiumScale:scale,
        nonPolicyholderTreatment:'continueFamilyPolicy',
      },accounts)
      return {scale,loss5Percent:a.total.loss5Percent,
        low3Loss5Millions:a.byWageQuintile.slice(0,3).reduce((sum,q)=>sum+q.loss5Millions,0),
        olderMeanPremium:a.premiumByAge.find(q=>q.label==='60–64')!.meanPremiumDollars}
    })
    console.log('PREMIUM_AUDIT_PRICE_SENSITIVITY_JSON='+JSON.stringify(scenarios))
    expect(scenarios[1]!.olderMeanPremium).toBeLessThan(scenarios[0]!.olderMeanPremium)
    expect(scenarios[2]!.olderMeanPremium).toBeLessThan(scenarios[1]!.olderMeanPremium)
    expect(scenarios[1]!.low3Loss5Millions).toBeLessThanOrEqual(scenarios[0]!.low3Loss5Millions)
    expect(scenarios[2]!.low3Loss5Millions).toBeLessThanOrEqual(scenarios[1]!.low3Loss5Millions)
  },240000)

  it('isolates compulsory Roth saving from gross statutory reform cash changes',()=>{
    const saved=calculateConsumptionAudit(tax,{...h,nonPolicyholderTreatment:'continueFamilyPolicy'},accounts)
    const noAccounts=calculateConsumptionAudit(tax,{...h,nonPolicyholderTreatment:'continueFamilyPolicy'},{
      ...accounts,enabled:false
    })
    expect(saved.total.meanRothSavingDollars).toBeLessThan(0)
    expect(noAccounts.total.meanRothSavingDollars).toBe(0)
    expect(noAccounts.total.meanTaxCreditChangeDollars).toBeCloseTo(saved.total.meanTaxCreditChangeDollars,6)
    expect(noAccounts.total.meanHealthTransitionChangeDollars).toBeCloseTo(saved.total.meanHealthTransitionChangeDollars,6)
    expect(noAccounts.total.meanChangeDollars).toBeGreaterThan(saved.total.meanChangeDollars)
    expect(noAccounts.total.loss5Millions).toBeLessThanOrEqual(saved.total.loss5Millions)
  },240000)
})
