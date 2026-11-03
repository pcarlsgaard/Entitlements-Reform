/** Read-only check of the policy values in the user's 2026-11-02 exported scenario.
 * The JSON filename says 180%/6.5% but its actual policy is 175%/10%.
 */
import {describe,it,expect} from 'vitest'
import {defaultCombinedPolicy,scoreCombined} from '../src/model/combined'
import {exampleHouseholds,scoreExampleHousehold} from '../src/model/householdScenario'
import type {CombinedPolicy} from '../src/model/combined'
const p:CombinedPolicy={
 ...defaultCombinedPolicy,
 tax:{
 ...defaultCombinedPolicy.tax,
 rate:.35,wageTaxMode:'progressive',
 progressiveWageBrackets:[
  {upperPerAdult:15000,rate:.1},{upperPerAdult:60000,rate:.2},
  {upperPerAdult:220000,rate:.25},{upperPerAdult:275000,rate:.3},
  {upperPerAdult:null,rate:.35},
 ],
 adultCredit:3000,adultCreditMode:'earned',adultCreditPhaseInRate:.1,
 adultCreditPhaseOutRate:0,childCredit:6000,
 childCreditBaselineRefundableShare:.5,childCreditPhaseInRate:.2,
 under6ChildCredit:0,noncomplianceRate:.055,
 },
 benefits:{socialSecurityReform:true,medicareReform:true},
 personalAccounts:{enabled:true,requiredContributionRate:.10,expectedRealReturn:.04,governmentMatchCap2026:0},
 spendingEnabled:true,
 otherSpending:{
 ...defaultCombinedPolicy.otherSpending,
 nonDefenseMode:'onePercentNominal',farmSubsidyPolicy:'reverse2025Expansion',
 },
 assumptions:{
 ...defaultCombinedPolicy.assumptions,
 reformYear:2026,endYear:2095,benefitPhaseInYears:20,
 socialSecurityInitialBenefitMode:'flatTransition',
 flatBenefitFPLMultiple:1.75,fullRetirementAge:68,
 socialSecurityClaimAge:70,medicareFundingMode:'gdpShare',
 medicareSupportGDPShare:.0395393424550185,
 medicareEligibilityAge:65,medicareYearA:2030,medicareYearB:2035,
 fundingStrategy:'paygo',debtSensitivity:0,
 debtPaydownSurplusCapGDP:0,revenueCapBasis:'totalBalance',
 },
 baselineMode:'scheduled',
 dynamic:{...defaultCombinedPolicy.dynamic,enabled:false},
}
const householdProfiles=exampleHouseholds.map(h=>({
  ...h,
  ...(h.id==='single-parent'?{primaryClaimAge:67}:{}),
  ...(h.id==='two-earner'?{primaryClaimAge:68,spouseClaimAge:68,workThroughAge:68}:{}),
  ...(h.id==='near-retiree'?{primaryClaimAge:67,primaryCreditedYears2026:38}:{}),
}))
describe('November 2 uploaded scenario score audit (research only)',()=>{
 it('recalculates fiscal path and five named household examples',()=>{
  const score=scoreCombined(p)
  const fiscal=[2026,2035,2050,2075,2095].map(year=>{
   const row=score.combined.years.find(r=>r.year===year)!
   const b=score.baseline.years.find(r=>r.year===year)!
   const accounts=score.accountsByYear.get(year)
   return {year,endingDebtGDP:row.endingDebtGDP,
      baselineDebtGDP:b.endingDebtGDP,
      overallDeficitGDP:row.overallDeficit/row.nominalGDP,
      primaryDeficitGDP:(row.overallDeficit-row.netInterest)/row.nominalGDP,
      revenueGDP:row.revenue/row.nominalGDP,
      ssRetirementTopupGDP:(accounts?.federalTopupsBillions??0)/row.nominalGDP,
      privateAccountSavingsGDP:(accounts?.privateContributionBillions??0)/row.nominalGDP,
      privateAccountExcessGDP:(accounts?.privateExcessBillions??0)/row.nominalGDP
   }
  })
  const householdYears=[2026,2035,2050,2075,2095]
  const households=householdProfiles.flatMap(h=>householdYears.map(year=>{
   const row=scoreExampleHousehold(h,year,p,score.baseline,score.combined)
   return row?{profile:h.id,year,primaryAge:row.ages[0],
     currentCash:Math.round(row.currentCash),reformCash:Math.round(row.reformCash),
     cashChange:Math.round(row.cashChange),
     taxCashChange:Math.round(row.taxCashChange),
     mandatorySaving:Math.round(row.mandatoryAccountSaving),
     ssChange:Math.round(row.socialSecurityChange),
     baselineSocialSecurity:Math.round(row.baselineSocialSecurity),
     reformSocialSecurity:Math.round(row.reformSocialSecurity),
     healthCreditGross:Math.round(row.healthCreditGross)
   }:{profile:h.id,year,unavailable:true}
  }))
  const summary={
   config:'Actual 175% FPL, 10% savings, 20-year transition',
   fiscal,
   households,
   openingTaxDeltaGDP:score.netTaxRevenueChangeGDP,
   initialDebtGDP:p.assumptions.startingDebtGDP,
   additionalFiscalAdjustmentGDP:score.additionalFiscalAdjustmentGDP
  }
  console.log('UPLOADED_POLICY_AUDIT_JSON='+JSON.stringify(summary))
  expect(fiscal).toHaveLength(5)
 },60000)
})
