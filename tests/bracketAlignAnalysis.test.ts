import { describe, it, expect } from 'vitest'
import { calculateMacro } from '../src/tax/model/macro'
import { calculateHealthAnalysis, defaultHealthPolicySettings } from '../src/tax/model/health'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import type { ReformSettings } from '../src/tax/model/types'

const base: ReformSettings={
 rate:.35,wageTaxMode:'progressive',progressiveZeroBracketPerAdult:0,
 progressiveTopBracketPerAdult:150000,progressiveMiddleRate:.25,
 progressiveIntermediateStartPerAdult:75000,progressiveIntermediateRate:.30,
 adultCredit:2000,adultCreditMode:'earned',adultCreditPhaseInRate:.10,
 adultCreditPhaseOutStartPerAdult:50000,adultCreditPhaseOutRate:0,adultCreditTakeUpRate:1,
 childCredit:6000,under6ChildCredit:6000,childCreditBaselineRefundableShare:.5,childCreditPhaseInRate:.25,
 noncomplianceRate:.075,exemptionShare:0,cashWageExemptionShare:0,employerSocialInsuranceExemptionShare:0,
 employerHealthInsuranceExemptionShare:0,employerPensionOtherInsuranceExemptionShare:0,
 replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true},
 adultCreditEarningsBase:'compensation'
}
const health={...defaultHealthPolicySettings,adultHealthCredit:3000,childHealthCredit:1500,uninsuredTakeUpRate:.85,employerHealthPassThroughRate:1,employerFicaPassThroughRate:1,employeePremiumPreTaxShare:1,benchmarkPremiumScale:1.03,replaceAcaAptc:false,redistributionRule:'nationalEqual' as const,recipientScope:'policyholders' as const}
function score(tax:ReformSettings){
 const h=calculateHealthAnalysis(tax,health)
 const m=calculateMacro(tax,{insuranceCreditCost:h.totalHealthCreditCostBillions})
 const l=calculateLaborResponse(tax,1)
 return {revenue:m.netRevenue,revenueGDP:m.netRevenue/m.gdp,mtr:l.weightedReformMarginalRate,netWageLog:l.netWageLogChange}
}
describe('current bracket aligned Con3',()=>{
 it('reports revenue and MTR',()=>{
  const aligned={...base,progressiveIntermediateStartPerAdult:197300,progressiveTopBracketPerAdult:250525}
  const b=score(base), a=score(aligned)
  console.log('BRACKET_ALIGN='+JSON.stringify({base:b,aligned:a,deltaRevenue:a.revenue-b.revenue,deltaRevenueGDP:a.revenueGDP-b.revenueGDP}))
  expect(a.revenue).toBeLessThan(b.revenue)
 })
})
