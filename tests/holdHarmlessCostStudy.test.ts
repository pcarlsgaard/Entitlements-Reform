import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { calculateHoldHarmlessCostStudy } from '../src/tax/model/consumptionAudit'

const base=defaultCombinedPolicy
const tax={...base.tax,
  rate:.35,wageTaxMode:'progressive' as const,
  adultCreditMode:'earned' as const,adultCreditEarningsBase:'compensation' as const,
  adultCreditPhaseInRate:.20,adultCreditTakeUpRate:1,
  childCredit:5400,childCreditBaselineRefundableShare:.5,
  childCreditPhaseInRate:.2,under6ChildCredit:0,
  employerSocialInsuranceExemptionShare:0,employerHealthInsuranceExemptionShare:0,
  employerPensionOtherInsuranceExemptionShare:0,cashWageExemptionShare:0,
  replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true},
}
const health={...base.health,adultHealthCredit:3000,childHealthCredit:1500,
  benchmarkPremiumScale:1.03,redistributionRule:'nationalEqual' as const,
  recipientScope:'policyholders' as const,
  employerFicaPassThroughRate:1,employerHealthPassThroughRate:1,
  nonPolicyholderTreatment:'continueFamilyPolicy' as const,
}
const accounts={...base.personalAccounts,enabled:true,requiredContributionRate:.065}
const plans=[
  {name:'Saved',rates:[.2,.25,.30,.35],thresholds:[65000,150000,310000],adultCredit:2700},
  {name:'A',rates:[.195,.25,.30,.35],thresholds:[65000,150000,185000],adultCredit:2700},
  {name:'B',rates:[.20,.25,.30,.35],thresholds:[65000,150000,170000],adultCredit:3000},
  {name:'C',rates:[.192,.255,.33,.35],thresholds:[65000,150000,250000],adultCredit:2700},
]
describe('five year Q1-Q3 old law election vs 1% consumption hold harmless',()=>{
  it('scores annual refundable make-whole costs and evaluates shadow prior-law filing elections',()=>{
    const out=plans.map(plan=>{
      const p={...tax,adultCredit:plan.adultCredit,
        progressiveWageBrackets:plan.rates.map((rate,i)=>({
          upperPerAdult:i<3?plan.thresholds[i]!:null,rate
        }))
      }
      const s=calculateHoldHarmlessCostStudy(p,health,accounts)
      const sum=s.byBottomQuintile.reduce((v,r)=>v+r.annualHoldHarmlessBillions,0)
      expect(s.allEligible.annualHoldHarmlessBillions).toBeCloseTo(sum,6)
      expect(s.allEligible.annualHoldHarmlessBillions).toBeGreaterThan(0)
      expect(s.allEligible.annualHoldHarmlessExcludingRothBillions)
        .toBeLessThanOrEqual(s.allEligible.annualHoldHarmlessBillions+1e-8)
      expect(s.allEligible.zeroLossBillions).toBeGreaterThanOrEqual(s.allEligible.annualHoldHarmlessBillions)
      expect(s.allEligible.combinedOldElectionAndMakeWholeBillions)
        .toBeGreaterThanOrEqual(s.allEligible.annualHoldHarmlessBillions-1e-8)
      expect(s.totalTaxUnitsMillions).toBeGreaterThan(127)
      expect(s.positiveBaselineEligibleMillions).toBeGreaterThan(75)
      return {
        plan:plan.name, rates:plan.rates, thresholds:plan.thresholds,
        adultCredit:plan.adultCredit,stats:s.allEligible,
        quintiles:s.byBottomQuintile, boundaries:s.quintileWageBoundariesDollars,
      }
    })
    console.log('HOLD_HARMLESS_2026_STUDY_JSON='+JSON.stringify(out))
  },900000)
})
