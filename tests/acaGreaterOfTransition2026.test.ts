import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { calculateHealthAnalysis } from '../src/tax/model/health'
import { calculateConsumptionAudit } from '../src/tax/model/consumptionAudit'
import {
  acaApplicableRate2026, acaPremiumTaxCredit2026,
  greaterOfAcaUniversal,povertyGuideline2025Contiguous,
} from '../src/tax/model/aca2026'

const b=defaultCombinedPolicy
const health={...b.health,adultHealthCredit:3000,childHealthCredit:1500,
  benchmarkPremiumScale:1.03,nonPolicyholderTreatment:'continueFamilyPolicy' as const,
  redistributionRule:'nationalEqual' as const,recipientScope:'policyholders' as const,
}
const tax={...b.tax,wageTaxMode:'progressive' as const,rate:.35,
  adultCredit:2700,adultCreditEarningsBase:'compensation' as const,
  adultCreditPhaseInRate:.2,childCredit:5400,childCreditBaselineRefundableShare:.5,
  childCreditPhaseInRate:.2,under6ChildCredit:0,
  progressiveWageBrackets:[
    {upperPerAdult:65000,rate:.20},{upperPerAdult:150000,rate:.25},
    {upperPerAdult:310000,rate:.30},{upperPerAdult:null,rate:.35},
  ],
}
const roth={...b.personalAccounts,enabled:true,requiredContributionRate:.065}

describe('2026 ACA greater-of nonstacking rules and ESI transition sensitivities',()=>{
  it('uses 2025 poverty guidelines and 2026 statutory contribution rates',()=>{
    expect(povertyGuideline2025Contiguous(1)).toBe(15650)
    expect(povertyGuideline2025Contiguous(4)).toBe(32150)
    expect(acaApplicableRate2026(15650,1)).toBeCloseTo(.021)
    expect(acaApplicableRate2026(1.50*15650,1)).toBeCloseTo(.0419,6)
    expect(acaApplicableRate2026(3.5*15650,1)).toBeCloseTo(.0996,6)
    expect(acaApplicableRate2026(4.01*15650,1)).toBeNull()
    expect(acaApplicableRate2026(.99*15650,1)).toBeNull()
    expect(acaPremiumTaxCredit2026(2*15650,1,12000)).toBeGreaterThan(0)
    expect(acaPremiumTaxCredit2026(5*15650,1,12000)).toBe(0)
    expect(greaterOfAcaUniversal(6000,3500,10000))
      .toEqual({allowed:6000,topUpOverUniversal:2500})
    expect(greaterOfAcaUniversal(4000,6500,10000))
      .toEqual({allowed:6500,topUpOverUniversal:0})
    expect(greaterOfAcaUniversal(20000,8000,10000))
      .toEqual({allowed:10000,topUpOverUniversal:2000})
  })

  it('makes greater-of the default and preserves explicit legacy replacements',()=>{
    expect(b.health.replaceAcaAptc).toBe(false)
    expect(b.health.esiAcaTransitionShare).toBe(0)
    const max=calculateHealthAnalysis(tax,{...health,replaceAcaAptc:false,esiAcaTransitionShare:0})
    const replace=calculateHealthAnalysis(tax,{...health,replaceAcaAptc:true,esiAcaTransitionShare:0})
    expect(max.estimatedExistingAptcSavingsBillions).toBe(0)
    expect(replace.estimatedExistingAptcSavingsBillions).toBeGreaterThan(0)
    expect(max.nongroupAptcFloorTopUpCostBillions).toBeLessThan(replace.nongroupAptcFloorTopUpCostBillions)
    expect(max.nongroupLegacyAptc2024Billions).toBeGreaterThan(60)
    const additionalRelativeToReplace =
      max.totalHealthCreditCostBillions-
      (replace.totalHealthCreditCostBillions-replace.estimatedExistingAptcSavingsBillions)
    expect(additionalRelativeToReplace).toBeGreaterThan(40)
    expect(additionalRelativeToReplace).toBeLessThan(80)
  },240000)

  it('charges eligible switchers only the ACA credit in excess of the universal credit',()=>{
    const a=calculateHealthAnalysis(tax,{...health,replaceAcaAptc:false,esiAcaTransitionShare:0})
    const half=calculateHealthAnalysis(tax,{...health,replaceAcaAptc:false,esiAcaTransitionShare:.5})
    const all=calculateHealthAnalysis(tax,{...health,replaceAcaAptc:false,esiAcaTransitionShare:1})
    expect(all.esiAcaFullTransitionTopUpBillions).toBeGreaterThan(20)
    expect(all.esiAcaFullTransitionTopUpBillions).toBeLessThan(75)
    expect(a.esiAcaEligiblePolicyholderTaxUnitsMillions).toBeGreaterThan(10)
    expect(a.esiAcaEligiblePolicyholderTaxUnitsMillions).toBeLessThan(40)
    expect(a.esiAcaTransitionTopUpCostBillions).toBe(0)
    expect(half.esiAcaTransitionTopUpCostBillions).toBeCloseTo(
      all.esiAcaTransitionTopUpCostBillions*.5,7)
    expect(all.totalHealthCreditCostBillions-a.totalHealthCreditCostBillions)
      .toBeCloseTo(all.esiAcaTransitionTopUpCostBillions,6)
    expect(all.esiAcaFullTransitionTopUpExcluding100To138FplBillions)
      .toBeLessThanOrEqual(all.esiAcaFullTransitionTopUpBillions)
    console.log('ACA_TRANSITION_2026_SCENARIOS_JSON='+JSON.stringify({
      default2026CostB:a.totalHealthCreditCostBillions,
      nongroupLegacyAptc2024B:a.nongroupLegacyAptc2024Billions,
      nongroupACAIncrementOverExistingB:a.nongroupAptcFloorTopUpCostBillions,
      fullEsiACAIncrementB:all.esiAcaFullTransitionTopUpBillions,
      fullEsiACAIncrementExcl100to138B:all.esiAcaFullTransitionTopUpExcluding100To138FplBillions,
      policyholderUnitsM:all.esiAcaEligiblePolicyholderTaxUnitsMillions,
      policyholderAcaPositiveM:all.esiAcaPositivePolicyholderTaxUnitsMillions,
      fiscalDeltaByTransitionShare:[0,.1,.25,.5,1].map(s=>({
        transitionShare:s,extraBillions:s*all.esiAcaFullTransitionTopUpBillions
      }))
    }))
  },240000)

  it('reflects ACA transition credits in the 2026 tax-unit consumption sensitivity',()=>{
    const a=calculateConsumptionAudit(tax,{...health,esiAcaTransitionShare:0},roth)
    const full=calculateConsumptionAudit(tax,{...health,esiAcaTransitionShare:1},roth)
    expect(full.total.loss5Millions).toBeLessThanOrEqual(a.total.loss5Millions)
    expect(full.total.meanAdditionalEsiAcaCreditDollars).toBeGreaterThan(0)
    expect(a.total.meanAdditionalEsiAcaCreditDollars).toBe(0)
    console.log('ACA_TRANSITION_CONSUMPTION_JSON='+JSON.stringify({
      before:a.byWageQuintile.slice(0,3).map(x=>({q:x.label,loss1:x.loss1Percent,loss5:x.loss5Percent})),
      after:full.byWageQuintile.slice(0,3).map(x=>({q:x.label,loss1:x.loss1Percent,loss5:x.loss5Percent})),
      beforeAll:a.total.loss5Percent,afterAll:full.total.loss5Percent
    }))
  },240000)

  it('increases modeled federal credits when the optional transition share increases',()=>{
    const a=scoreCombined({...b,health:{...health,replaceAcaAptc:false,esiAcaTransitionShare:0}})
    const half=scoreCombined({...b,health:{...health,replaceAcaAptc:false,esiAcaTransitionShare:.5}})
    expect(half.health.totalHealthCreditCostBillions).toBeGreaterThan(a.health.totalHealthCreditCostBillions)
    expect(half.tax.netRevenue).toBeLessThan(a.tax.netRevenue)
  },240000)
})
