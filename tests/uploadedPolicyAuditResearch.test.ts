/** Read-only check of the policy values in the user's 2026-11-02 exported scenario.
 * The JSON filename says 180%/6.5% but its actual policy is 175%/10%.
 */
import {describe,it,expect} from 'vitest'
import {defaultCombinedPolicy,scoreCombined} from '../src/model/combined'
import {exampleHouseholds,scoreExampleHousehold} from '../src/model/householdScenario'
import type {CombinedPolicy} from '../src/model/combined'
import {scaledFactor,nationalAverageWageIndex,projectedTaxableMaximum,
  averageIndexedMonthlyEarnings,primaryInsuranceAmount,projectedCOLA} from '../src/model/ssaScaledWorkers'
import {accountBalanceAtClaim,accountAnnuityFactor} from '../src/model/personalAccountReform'
import {currentLawClaimFactor} from '../src/model/claiming'
import {oasiPayableShare} from '../src/model/currentLaw'
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
 it('audits both two-earner spouses and tests the common legacy multiplier',()=>{
  const score=scoreCombined(p)
  const profile=householdProfiles.find(x=>x.id==='two-earner')!
  const breakdown=[2026,2056,2058,2060,2070,2075].map(year=>{
   const r=scoreExampleHousehold(profile,year,p,score.baseline,score.combined)!
   return {year,ages:r.ages,
    baselineSocialSecurity:r.baselineSocialSecurity,
    reformSocialSecurity:r.reformSocialSecurity,
    delta:r.socialSecurityChange,
    adults:r.adults.map(x=>({
      age:x.age,baselineSS:x.baselineSS,
      scheduledPublicSS:x.scheduledReformSS,
      privateAnnuity:x.privateAccountAnnuity,
      federalTopup:x.publicTopup,
      combinedRetirement:x.reformSS,
      accountBalanceAtClaim:x.accountBalanceAtClaim,
      claimYear:x.accountClaimYear,
     }))
   }
  })
  const sensitivity=[.6,.7,.8,.9,1,1.1,1.2].map(multiplier=>{
   const h={...profile,legacyBenefitMultiplier:multiplier}
   const r=scoreExampleHousehold(h,2075,p,score.baseline,score.combined)!
   return {multiplier,current:r.baselineSocialSecurity,
     reform:r.reformSocialSecurity,difference:r.socialSecurityChange,
     privateAnnuity:r.privateAccountRetirementIncome}
  })
  console.log('TWO_EARNER_DETAILED_AUDIT_JSON='+JSON.stringify({breakdown,sensitivity}))
  const r=breakdown.find(x=>x.year===2075)!
  expect(r.adults).toHaveLength(2)
  expect(Math.abs(r.delta+48817)).toBeLessThan(3)
 },120000)

 it('cross-checks two-earner pension with wage-anchored SSA age-earnings profiles',()=>{
  const ages=[38,36],incomes=[65000,35000];
  const output=ages.map((age2026,i)=>{
   const birth=2026-age2026,claimAge=68,claimYear=birth+claimAge;
   const anchor=scaledFactor(age2026,'medium')*nationalAverageWageIndex(2026,p.assumptions)
   const ratio=incomes[i]!/anchor
   const wages=Array.from({length:47},(_,j)=>{
     const age=21+j,year=birth+age
     const factor=scaledFactor(Math.min(64,age),'medium')
     return {year,age,coveredEarnings:Math.min(projectedTaxableMaximum(year,p.assumptions),
       ratio*factor*nationalAverageWageIndex(year,p.assumptions))}
   })
   const aime=averageIndexedMonthlyEarnings(wages,birth,p.assumptions)
   const piaAt62=primaryInsuranceAmount(aime,birth+62,p.assumptions)
   let colas=1
   for(let y=birth+63;y<=2075;y++)colas*=1+projectedCOLA(y,p.assumptions)
   const scheduled2075=piaAt62*12*currentLawClaimFactor(claimAge)*colas
   const privateBalance=accountBalanceAtClaim(birth,claimAge,p.assumptions,p.personalAccounts,(year)=>{
     const w=wages.find(r=>r.year===year)
     return (w?.coveredEarnings??0)*p.personalAccounts.requiredContributionRate
   })
   const privateAtClaim=privateBalance/accountAnnuityFactor(birth,claimAge,p.assumptions)
   const private2075=privateAtClaim*(1+p.assumptions.inflation)**(2075-claimYear)
   const flat2075=p.assumptions.individualFPL2026*p.assumptions.flatBenefitFPLMultiple*
     (1+p.assumptions.inflation)**(2075-2026)
   const reform2075=Math.max(flat2075,private2075)
   return {i,birth,age2026,earnings2026:incomes[i],claimYear,aime,piaAt62,
      scheduled2075,privateBalance,privateAtClaim,private2075,flat2075,reform2075,
      scheduledDelta:reform2075-scheduled2075}
  })
  const baseline=output.reduce((s,x)=>s+x.scheduled2075,0)
  const reform=output.reduce((s,x)=>s+x.reform2075,0)
  console.log('TWO_EARNER_SSA_EARNINGS_SENSITIVITY_JSON='+JSON.stringify({
    output,scheduledBaseline:baseline,reformBenefit:reform,
    scheduledDifference:reform-baseline,payableBaseline:baseline*oasiPayableShare(2075),
    payableDifference:reform-baseline*oasiPayableShare(2075)
  }))
  expect(output).toHaveLength(2)
 },120000)

})
