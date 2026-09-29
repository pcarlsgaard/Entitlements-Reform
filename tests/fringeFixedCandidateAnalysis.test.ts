import { describe, it, expect } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { defaultAssumptions } from '../src/model/defaults'
import { calculateMacro } from '../src/tax/model/macro'
import { calculateHealthAnalysis, defaultHealthPolicySettings } from '../src/tax/model/health'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import type { CombinedPolicy } from '../src/model/combined'
import type { ReformSettings } from '../src/tax/model/types'

const taxBase: ReformSettings = {
  ...defaultCombinedPolicy.tax,
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

function makePolicy(tax:ReformSettings):CombinedPolicy {
 return {
  ...defaultCombinedPolicy,taxEnabled:true,tax,
  health:{...defaultCombinedPolicy.health,...health},
  transfers:{replacedPrograms:{snap:false,wic:false,schoolMeals:false,summerEbt:false,tanf:false,liheap:false,housing:false}},
  benefits:{socialSecurityReform:true,medicareReform:true},
  assumptions:{...defaultAssumptions,reformYear:2026,endYear:2095,maxModeledAge:110,benefitPhaseInYears:40,flatBenefitFPLMultiple:1.5,individualFPL2026:15960,realFPLGrowth:0,fullRetirementAge:68,socialSecurityBenefitCap2026:null,vestingYears:35,socialSecurityClaimAge:70,qualifyingEarnings2026:18000,averageWorkingYears:35,averageAnnualEarnings2026:50000,actuarialDiscountRate:.023,medicareFundingMode:'perPerson',medicareSupportGDPShare:.0395393424550185,nonDefenseDiscretionaryMode:'cbo',currentLawSSBenefit2026:24500,currentLawSSBenefitRealGrowth:.0114,fundingStrategy:'paygo',prefundingStartAge:18,realEndowmentYield:.025,medicareEligibilityAge:65,premiumSupport2026:19000,premiumSupportRealGrowth:.018,legacyMedicareCost2026:19000,legacyMedicareRealGrowth:.015,legacyMedicareHIShare2026:.3401608579088472,medicareYearA:2030,medicareYearB:2035,cohortSizeMillions2026:4.2,cohortSizeGrowth:.002,startingNominalGDPBillions:31902,realGDPGrowth:.018,realWageGrowthDeviation:0,inflation:.02,startingDebtGDP:1.00605,baselineRealMarketRate:.023,startingEffectiveNominalRate:.0323741364743303,debtSensitivity:.0002,debtRatePassThrough:.15,otherOASDIGDP:.01,under65MedicareGDP:.006,nonDefenseDiscretionaryGDP2026:.03121,nonDefenseDiscretionaryRealGrowth:.018,otherMandatoryGDP2026:.02994,policyHorizonYears:70,policyHorizonDebtTargetGDP:1.01,peakDebtCeilingGDP:1.5,debtPaydownTargetGDP:.4,debtPaydownSurplusCapGDP:0},
  baselineMode:'scheduled',
  dynamic:{enabled:true,laborElasticity:.02,laborShareGDP:.6,phaseInYears:10,capitalGDPLevelAtReference:.014,capitalRateSensitivity:.15,capitalPhaseInYears:15},
 }
}
const variants=[
 {name:'original 25/30/35 75/150',middle:.30,start:75000,top:150000},
 {name:'recent 25/30/35 200/250',middle:.30,start:200000,top:250000},
 {name:'25/28/35 75/200',middle:.28,start:75000,top:200000},
 {name:'25/28/35 100/200',middle:.28,start:100000,top:200000},
 {name:'25/28/35 100/225',middle:.28,start:100000,top:225000},
 {name:'25/28/35 125/225',middle:.28,start:125000,top:225000},
 {name:'25/28/35 125/250',middle:.28,start:125000,top:250000},
]
function summarize(v:(typeof variants)[number]){
 const tax={...taxBase,progressiveIntermediateRate:v.middle,progressiveIntermediateStartPerAdult:v.start,progressiveTopBracketPerAdult:v.top}
 const h=calculateHealthAnalysis(tax,health)
 const m=calculateMacro(tax,{insuranceCreditCost:h.totalHealthCreditCostBillions})
 const l=calculateLaborResponse(tax,1)
 const r=scoreCombined(makePolicy(tax))
 const yr=(y:number)=>r.combined.years.find(x=>x.year===y)!
 const peak=r.combined.years.reduce((a,b)=>a.endingDebtGDP>b.endingDebtGDP?a:b)
 const total=r.combined.years.find(x=>x.overallDeficit<=1e-6)
 return {
  name:v.name,revenueGDP:m.netRevenue/m.gdp,revenue:m.netRevenue,
  currentMtr:l.weightedCurrentMarginalRate,reformMtr:l.weightedReformMarginalRate,
  netWageLog:l.netWageLogChange,primary:l.primaryNetWageLogChange,secondary:l.secondaryNetWageLogChange,
  laborGDP:r.steadyGDPLevelChange,totalDynamicGDP:r.steadyGDPLevelChange+r.steadyCapitalGDPLevelChange,
  debt2050:yr(2050).endingDebtGDP,debt2075:yr(2075).endingDebtGDP,debt2095:yr(2095).endingDebtGDP,
  peakDebt:peak.endingDebtGDP,peakYear:peak.year,totalBalanceYear:total?.year??null
 }
}
describe('corrected fringe convention MTR candidates',()=>{
 it('prints corrected results',()=>{
  console.log('FRINGE_FIXED_CANDIDATES='+JSON.stringify(variants.map(summarize)))
  expect(true).toBe(true)
 },60000)
})
