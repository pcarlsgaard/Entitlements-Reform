import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { calculateConsumptionAudit } from '../src/tax/model/consumptionAudit'

const p=defaultCombinedPolicy
const baseTax={...p.tax,
  rate:.35,wageTaxMode:'progressive' as const,
  adultCredit:2700,adultCreditMode:'earned' as const,
  adultCreditEarningsBase:'compensation' as const,adultCreditPhaseInRate:.2,
  childCredit:5400,childCreditBaselineRefundableShare:.5,
  childCreditPhaseInRate:.2,under6ChildCredit:0,
  employerSocialInsuranceExemptionShare:0,employerHealthInsuranceExemptionShare:0,
  employerPensionOtherInsuranceExemptionShare:0,cashWageExemptionShare:0,
  replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true},
}
const personalAccounts={...p.personalAccounts,enabled:true,requiredContributionRate:.065}
const health={...p.health,adultHealthCredit:3000,childHealthCredit:1500,
  benchmarkPremiumScale:1.03,redistributionRule:'nationalEqual' as const,
  recipientScope:'policyholders' as const,
  nonPolicyholderTreatment:'continueFamilyPolicy' as const,
}
const alternatives=[
  {name:'Saved',rates:[.2,.25,.30,.35],thresholds:[65000,150000,310000],adultCredit:2700},
  {name:'A',rates:[.195,.25,.30,.35],thresholds:[65000,150000,185000],adultCredit:2700},
  {name:'B',rates:[.2,.25,.30,.35],thresholds:[65000,150000,170000],adultCredit:3000},
  {name:'C',rates:[.192,.255,.33,.35],thresholds:[65000,150000,250000],adultCredit:2700},
]
describe('2026 saved and A/B/C consumption histograms',()=>{
  it('uses fixed, exhaustive weighted bins and conserves the reference tax-unit sample',()=>{
    const out=alternatives.map(plan=>{
      const audit=calculateConsumptionAudit({
        ...baseTax,adultCredit:plan.adultCredit,
        progressiveWageBrackets:plan.rates.map((rate,i)=>({
          upperPerAdult:i<3?plan.thresholds[i]!:null,rate,
        }))
      },health,personalAccounts)
      const hist=audit.histogram
      const mass=hist.reduce((s,b)=>s+b.taxUnitsMillions,0)
      expect(hist).toHaveLength(11)
      expect(hist.reduce((s,b)=>s+b.sharePercent,0)).toBeCloseTo(100,7)
      expect(mass+audit.nonPositiveBaselineMillions).toBeCloseTo(audit.total.unitsMillions,5)
      expect(audit.total.unitsMillions).toBeGreaterThan(127)
      return{
        name:plan.name,rateSchedule:plan.rates,thresholds:plan.thresholds,
        adultCredit:plan.adultCredit,
        totalUnitsMillions:audit.total.unitsMillions,
        eligibleUnitsMillions:mass,
        excludedNonpositiveMillions:audit.nonPositiveBaselineMillions,
        total:audit.total,
        histogram:hist
      }
    })
    console.log('CONSUMPTION_HISTOGRAM_ALTERNATIVES_JSON='+JSON.stringify(out))
    expect(out[0]!.histogram.map(x=>x.label)).toEqual(out[3]!.histogram.map(x=>x.label))
  },600000)
})
