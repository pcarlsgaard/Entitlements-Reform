import { describe, it, expect } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { defaultAssumptions } from '../src/model/defaults'
import { calculateMacro } from '../src/tax/model/macro'
import { calculateHealthAnalysis, defaultHealthPolicySettings } from '../src/tax/model/health'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import type { CombinedPolicy } from '../src/model/combined'
import type { ReformSettings } from '../src/tax/model/types'

const baseTax: ReformSettings={
 ...defaultCombinedPolicy.tax,
 rate:.35,wageTaxMode:'progressive',progressiveZeroBracketPerAdult:0,
 progressiveTopBracketPerAdult:250000,progressiveMiddleRate:.25,
 progressiveIntermediateStartPerAdult:200000,progressiveIntermediateRate:.30,
 adultCredit:2000,adultCreditMode:'earned',adultCreditPhaseInRate:.10,
 adultCreditPhaseOutStartPerAdult:50000,adultCreditPhaseOutRate:0,adultCreditTakeUpRate:1,
 childCredit:6000,under6ChildCredit:6000,childCreditBaselineRefundableShare:.5,childCreditPhaseInRate:.25,
 noncomplianceRate:.075,exemptionShare:0,cashWageExemptionShare:0,employerSocialInsuranceExemptionShare:0,
 employerHealthInsuranceExemptionShare:0,employerPensionOtherInsuranceExemptionShare:0,
 replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true},
 adultCreditEarningsBase:'compensation'
}
const health={...defaultHealthPolicySettings,adultHealthCredit:3000,childHealthCredit:1500,uninsuredTakeUpRate:.85,employerHealthPassThroughRate:1,employerFicaPassThroughRate:1,employeePremiumPreTaxShare:1,benchmarkPremiumScale:1.03,replaceAcaAptc:false,redistributionRule:'nationalEqual' as const,recipientScope:'policyholders' as const}

function policy(tax:ReformSettings):CombinedPolicy{
 return {...defaultCombinedPolicy,taxEnabled:true,tax,
  health:{...defaultCombinedPolicy.health,...health},
  transfers:{replacedPrograms:{snap:false,wic:false,schoolMeals:false,summerEbt:false,tanf:false,liheap:false,housing:false}},
  benefits:{socialSecurityReform:true,medicareReform:true},
  assumptions:{...defaultAssumptions,reformYear:2026,endYear:2095,maxModeledAge:110,benefitPhaseInYears:40,flatBenefitFPLMultiple:1.5,individualFPL2026:15960,realFPLGrowth:0,fullRetirementAge:68,socialSecurityBenefitCap2026:null,vestingYears:35,socialSecurityClaimAge:70,qualifyingEarnings2026:18000,averageWorkingYears:35,averageAnnualEarnings2026:50000,actuarialDiscountRate:.023,medicareFundingMode:'perPerson',medicareSupportGDPShare:.0395393424550185,nonDefenseDiscretionaryMode:'cbo',currentLawSSBenefit2026:24500,currentLawSSBenefitRealGrowth:.0114,fundingStrategy:'paygo',prefundingStartAge:18,realEndowmentYield:.025,medicareEligibilityAge:65,premiumSupport2026:19000,premiumSupportRealGrowth:.018,legacyMedicareCost2026:19000,legacyMedicareRealGrowth:.015,legacyMedicareHIShare2026:.3401608579088472,medicareYearA:2030,medicareYearB:2035,cohortSizeMillions2026:4.2,cohortSizeGrowth:.002,startingNominalGDPBillions:31902,realGDPGrowth:.018,realWageGrowthDeviation:0,inflation:.02,startingDebtGDP:1.00605,baselineRealMarketRate:.023,startingEffectiveNominalRate:.0323741364743303,debtSensitivity:.0002,debtRatePassThrough:.15,otherOASDIGDP:.01,under65MedicareGDP:.006,nonDefenseDiscretionaryGDP2026:.03121,nonDefenseDiscretionaryRealGrowth:.018,otherMandatoryGDP2026:.02994,policyHorizonYears:70,policyHorizonDebtTargetGDP:1.01,peakDebtCeilingGDP:1.5,debtPaydownTargetGDP:.4,debtPaydownSurplusCapGDP:0},
  baselineMode:'scheduled',
  dynamic:{enabled:true,laborElasticity:.02,laborShareGDP:.6,phaseInYears:10,capitalGDPLevelAtReference:.014,capitalRateSensitivity:.15,capitalPhaseInYears:15}
 }
}
function summarize(name:string,tax:ReformSettings){
 const h=calculateHealthAnalysis(tax,health)
 const m=calculateMacro(tax,{insuranceCreditCost:h.totalHealthCreditCostBillions})
 const l=calculateLaborResponse(tax,1)
 const r=scoreCombined(policy(tax))
 const yr=(y:number)=>r.combined.years.find(x=>x.year===y)!
 const peak=r.combined.years.reduce((a,b)=>a.endingDebtGDP>b.endingDebtGDP?a:b)
 const primary=r.combined.years.find(x=>x.primaryDeficit<=1e-6)
 const total=r.combined.years.find(x=>x.overallDeficit<=1e-6)
 return {name,revenue:m.netRevenue,revenueGDP:m.netRevenue/m.gdp,mtr:l.weightedReformMarginalRate,netWageLog:l.netWageLogChange,laborGDP:r.steadyGDPLevelChange,totalDynamicGDP:r.steadyGDPLevelChange+r.steadyCapitalGDPLevelChange,debt2036:yr(2036).endingDebtGDP,debt2050:yr(2050).endingDebtGDP,debt2075:yr(2075).endingDebtGDP,debt2095:yr(2095).endingDebtGDP,peakDebtGDP:peak.endingDebtGDP,peakYear:peak.year,primaryBalanceYear:primary?.year??null,totalBalanceYear:total?.year??null}
}
describe('25-28-35 bracket candidates',()=>{
 it('prints candidate tradeoffs',()=>{
  const variants=[
   ['25/30/35 200/250',baseTax],
   ['25/28/35 175/250',{...baseTax,progressiveIntermediateStartPerAdult:175000,progressiveIntermediateRate:.28}],
   ['25/28/35 150/250',{...baseTax,progressiveIntermediateStartPerAdult:150000,progressiveIntermediateRate:.28}],
   ['25/28/35 125/250',{...baseTax,progressiveIntermediateStartPerAdult:125000,progressiveIntermediateRate:.28}],
   ['25/28/35 100/250',{...baseTax,progressiveIntermediateStartPerAdult:100000,progressiveIntermediateRate:.28}],
  ] as const
  const rows=variants.map(([n,t])=>summarize(n,t))
  console.log('MID28='+JSON.stringify(rows))
  expect(rows.length).toBe(5)
 },30000)
})
