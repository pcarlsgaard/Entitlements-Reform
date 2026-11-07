import { describe,expect,it } from 'vitest'
import saved from './fixtures/restoredAcaSaved.json'
import { scoreCombined } from '../src/model/combined'
import type { CombinedPolicy } from '../src/model/combined'
import { calculateConsumptionAudit } from '../src/tax/model/consumptionAudit'
import {
  acaApplicableRate2026,acaApplicableRateRestored2024,
  acaPremiumTaxCredit2026,acaPremiumTaxCreditRestored2024,
  greaterOfAcaUniversal,povertyGuideline2025Contiguous
} from '../src/tax/model/aca2026'

describe('Permanent restoration of enhanced 2024 ACA PTCs',()=>{
 it('matches IRS 2024 enhanced table at poverty boundary points',()=>{
  const fpl=povertyGuideline2025Contiguous(1)
  expect(acaApplicableRateRestored2024(fpl,1)).toBe(0)
  expect(acaApplicableRateRestored2024(1.5*fpl,1)).toBe(0)
  expect(acaApplicableRateRestored2024(2*fpl,1)).toBeCloseTo(.02,8)
  expect(acaApplicableRateRestored2024(2.5*fpl,1)).toBeCloseTo(.04,8)
  expect(acaApplicableRateRestored2024(3*fpl,1)).toBeCloseTo(.06,8)
  expect(acaApplicableRateRestored2024(4*fpl,1)).toBeCloseTo(.085,8)
  expect(acaApplicableRateRestored2024(4.5*fpl,1)).toBeCloseTo(.085,8)
  expect(acaApplicableRateRestored2024(.99*fpl,1)).toBeNull()
  expect(acaApplicableRate2026(4.5*fpl,1)).toBeNull()
  expect(acaPremiumTaxCreditRestored2024(4.5*fpl,1,18000)).toBeGreaterThan(0)
  const a=acaPremiumTaxCreditRestored2024(2*fpl,1,10000)
  const b=acaPremiumTaxCredit2026(2*fpl,1,10000)
  expect(a).toBeGreaterThan(b)
  const universal=3000,bench=10000
  const restored=acaPremiumTaxCreditRestored2024(2*fpl,1,bench)
  expect(greaterOfAcaUniversal(restored,universal,bench).allowed).toBe(restored)
  expect(greaterOfAcaUniversal(restored,universal,bench).allowed).toBeLessThanOrEqual(bench)
 })
 it('compares fixed saved scenario under 2026 law and restored 2024 enhancements',()=>{
  const original=saved.scenario.policy as CombinedPolicy
  const rates=['current2026','restored2024'] as const
  const transitions=[0,.25,1]
  const out=[]
  for(const rule of rates){
   for(const share of transitions){
    const p={...original,health:{...original.health,
      replaceAcaAptc:false,
      nonPolicyholderTreatment:'continueFamilyPolicy' as const,
      esiAcaTransitionShare:share,
      esiAcaScheduleScenario:rule}}
    const m=scoreCombined(p)
    const taxUnits=calculateConsumptionAudit(p.tax,p.health,p.personalAccounts)
    const years=m.combined.years
    const ending=(year:number)=>100*years.find(x=>x.year===year)!.endingDebtGDP
    const peak=years.reduce((best,x)=>x.endingDebtGDP>best.debt
      ? {debt:x.endingDebtGDP,year:x.year}:best,{debt:-Infinity,year:0})
    out.push({
      ACA:rule,share,
      taxNetRevenueBillions:m.tax.netRevenue,
      healthCreditCostBillions:m.health.totalHealthCreditCostBillions,
      esiAcaTopUpBillions:m.health.esiAcaTransitionTopUpCostBillions,
      fullTransitionTopUpBillions:m.health.esiAcaFullTransitionTopUpBillions,
      ACAEligiblePolicyholderMillions:m.health.esiAcaEligiblePolicyholderTaxUnitsMillions,
      ACAPositivePolicyholderMillions:m.health.esiAcaPositivePolicyholderTaxUnitsMillions,
      openingFiscalImprovementGDP:m.openingFiscalImprovementGDP,
      debt2035Pct:ending(2035),debt2050Pct:ending(2050),
      peakDebtPct:peak.debt*100,peakYear:peak.year,debt2095Pct:ending(2095),
      gainPct:taxUnits.total.gainPercent,
      loss1Pct:taxUnits.total.loss1Percent,loss5Pct:taxUnits.total.loss5Percent,
      loss10Pct:taxUnits.total.loss10Percent,
      q:taxUnits.byWageQuintile.map(q=>({
        label:q.label,
        gainPct:q.gainPercent,lose1Pct:q.loss1Percent,
        lose5Pct:q.loss5Percent,lose10Pct:q.loss10Percent,
        ACAExtraMeanDollars:q.meanAdditionalEsiAcaCreditDollars
      }))
    })
   }
  }
  console.log('RESTORED_ACA_2024_SAVED_REFORM_RESULT_JSON='+JSON.stringify(out))
  const get=(rule:string,share:number)=>out.find(x=>x.ACA===rule&&x.share===share)!
  expect(get('restored2024',0).esiAcaTopUpBillions).toBe(0)
  expect(get('restored2024',1).esiAcaTopUpBillions).toBeGreaterThan(
    get('current2026',1).esiAcaTopUpBillions)
  expect(get('restored2024',.25).debt2095Pct).toBeGreaterThan(
    get('current2026',.25).debt2095Pct)
  expect(get('restored2024',1).loss5Pct).toBeLessThan(
    get('current2026',1).loss5Pct)
 },600000)
})