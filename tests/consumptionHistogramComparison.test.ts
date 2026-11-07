import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { calculateConsumptionHistogram } from '../src/tax/model/consumptionAudit'
const p=defaultCombinedPolicy
const baseTax={...p.tax,
  rate:.35,wageTaxMode:'progressive' as const,
  adultCredit:2700,adultCreditMode:'earned' as const,
  adultCreditEarningsBase:'compensation' as const,
  adultCreditPhaseInRate:.2,adultCreditPhaseOutRate:0,
  adultCreditTakeUpRate:1,
  childCredit:5400,childCreditBaselineRefundableShare:.5,childCreditPhaseInRate:.2,under6ChildCredit:0,
  noncomplianceRate:.05,exemptionShare:0,
  cashWageExemptionShare:0,employerSocialInsuranceExemptionShare:0,
  employerHealthInsuranceExemptionShare:0,employerPensionOtherInsuranceExemptionShare:0,
  replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true}
}
const health={...p.health,
  adultHealthCredit:3000,childHealthCredit:1500,uninsuredTakeUpRate:.85,
  employerHealthPassThroughRate:1,employerFicaPassThroughRate:1,
  employeePremiumPreTaxShare:1,benchmarkPremiumScale:1.03,
  replaceAcaAptc:true,redistributionRule:'nationalEqual' as const,
  recipientScope:'policyholders' as const,
  nonPolicyholderTreatment:'continueFamilyPolicy' as const
}
const accounts={...p.personalAccounts,enabled:true,requiredContributionRate:.065,expectedRealReturn:.045,governmentMatchCap2026:0}
const cases=[
  {plan:'Saved',rates:[.20,.25,.30,.35],cutoffs:[65000,150000,310000],adultCredit:2700},
  {plan:'A',rates:[.195,.25,.30,.35],cutoffs:[65000,150000,185000],adultCredit:2700},
  {plan:'B',rates:[.20,.25,.30,.35],cutoffs:[65000,150000,170000],adultCredit:3000},
  {plan:'C',rates:[.192,.255,.33,.35],cutoffs:[65000,150000,250000],adultCredit:2700},
]
describe('saved-plan 2026 consumption gain/loss histogram comparison',()=>{
  it('scores identical tax-unit and health samples with the exact four bracket alternatives',()=>{
    const result=cases.map(plan=>{
      const tax={...baseTax,adultCredit:plan.adultCredit,
        progressiveWageBrackets:plan.rates.map((rate,i)=>({
          upperPerAdult:i<3?plan.cutoffs[i]!:null,rate
        }))
      }
      return {plan:plan.plan,adultCredit:plan.adultCredit,
        rates:plan.rates,cutoffs:plan.cutoffs,
        ...calculateConsumptionHistogram(tax,health,accounts)}
    })
    for(const s of result){
      expect(s.binSharePctOfTaxUnits).toHaveLength(60)
      expect(s.taxUnitsMillions).toBeGreaterThan(127)
      expect(s.lossOver10Pct).toBeLessThanOrEqual(s.lossOver5Pct)
      expect(s.lossOver5Pct).toBeLessThanOrEqual(s.lossOver1Pct)
      const sum=s.binSharePctOfTaxUnits.reduce((a,b)=>a+b,0)+
        s.belowRangePct+s.aboveRangePct+s.unknownDenominatorPct
      expect(sum).toBeCloseTo(100,5)
    }
    expect(result[0]!.gainPct).toBeGreaterThan(65)
    expect(result[0]!.lossOver5Pct).toBeGreaterThan(3.5)
    for(const a of result)expect(a.taxUnitsMillions).toBeCloseTo(result[0]!.taxUnitsMillions,4)
    console.log('CONSUMPTION_HISTOGRAM_2026='+JSON.stringify(result))
  },240000)
})
