import { describe, it, expect } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { defaultAssumptions } from '../src/model/defaults'
import type { CombinedPolicy } from '../src/model/combined'

function policy(aligned:boolean, dynamicEnabled:boolean): CombinedPolicy {
  return {
    ...defaultCombinedPolicy,
    taxEnabled: true,
    tax: {
      ...defaultCombinedPolicy.tax,
      rate: 0.35,
      wageTaxMode: 'progressive',
      progressiveZeroBracketPerAdult: 0,
      progressiveTopBracketPerAdult: aligned ? 250525 : 150000,
      progressiveMiddleRate: 0.25,
      progressiveIntermediateStartPerAdult: aligned ? 197300 : 75000,
      progressiveIntermediateRate: 0.30,
      adultCredit: 2000,
      adultCreditMode: 'earned',
      adultCreditPhaseInRate: 0.10,
      adultCreditPhaseOutStartPerAdult: 50000,
      adultCreditPhaseOutRate: 0,
      adultCreditTakeUpRate: 1,
      childCredit: 6000,
      under6ChildCredit: 6000,
      childCreditBaselineRefundableShare: 0.50,
      childCreditPhaseInRate: 0.25,
      noncomplianceRate: 0.075,
      exemptionShare: 0,
      cashWageExemptionShare: 0,
      employerSocialInsuranceExemptionShare: 0,
      employerHealthInsuranceExemptionShare: 0,
      employerPensionOtherInsuranceExemptionShare: 0,
      adultCreditEarningsBase: 'compensation',
      replacedTaxes: { individualIncome: true, payroll: true, corporateIncome: true, customs: true },
    },
    health: {
      ...defaultCombinedPolicy.health,
      adultHealthCredit: 3000,
      childHealthCredit: 1500,
      uninsuredTakeUpRate: 0.85,
      employerHealthPassThroughRate: 1,
      employerFicaPassThroughRate: 1,
      employeePremiumPreTaxShare: 1,
      benchmarkPremiumScale: 1.03,
      replaceAcaAptc: false,
      redistributionRule: 'nationalEqual',
      recipientScope: 'policyholders',
    },
    transfers: { replacedPrograms: {
      snap:false,wic:false,schoolMeals:false,summerEbt:false,tanf:false,liheap:false,housing:false,
    }},
    benefits: { socialSecurityReform:true, medicareReform:true },
    assumptions: {
      ...defaultAssumptions,
      reformYear:2026,endYear:2095,maxModeledAge:110,benefitPhaseInYears:40,
      flatBenefitFPLMultiple:1.5,individualFPL2026:15960,realFPLGrowth:0,
      fullRetirementAge:68,socialSecurityBenefitCap2026:null,vestingYears:35,
      socialSecurityClaimAge:70,qualifyingEarnings2026:18000,averageWorkingYears:35,
      averageAnnualEarnings2026:50000,actuarialDiscountRate:.023,
      medicareFundingMode:'perPerson',medicareSupportGDPShare:.0395393424550185,
      nonDefenseDiscretionaryMode:'cbo',currentLawSSBenefit2026:24500,
      currentLawSSBenefitRealGrowth:.0114,fundingStrategy:'paygo',prefundingStartAge:18,
      realEndowmentYield:.025,medicareEligibilityAge:65,premiumSupport2026:19000,
      premiumSupportRealGrowth:.018,legacyMedicareCost2026:19000,legacyMedicareRealGrowth:.015,
      legacyMedicareHIShare2026:.3401608579088472,medicareYearA:2030,medicareYearB:2035,
      cohortSizeMillions2026:4.2,cohortSizeGrowth:.002,startingNominalGDPBillions:31902,
      realGDPGrowth:.018,realWageGrowthDeviation:0,inflation:.02,startingDebtGDP:1.00605,
      baselineRealMarketRate:.023,startingEffectiveNominalRate:.0323741364743303,
      debtSensitivity:.0002,debtRatePassThrough:.15,otherOASDIGDP:.01,under65MedicareGDP:.006,
      nonDefenseDiscretionaryGDP2026:.03121,nonDefenseDiscretionaryRealGrowth:.018,
      otherMandatoryGDP2026:.02994,policyHorizonYears:70,policyHorizonDebtTargetGDP:1.01,
      peakDebtCeilingGDP:1.5,debtPaydownTargetGDP:.4,debtPaydownSurplusCapGDP:0,
    },
    baselineMode:'scheduled',
    dynamic:{
      enabled:dynamicEnabled,laborElasticity:.02,laborShareGDP:.6,phaseInYears:10,
      capitalGDPLevelAtReference:.014,capitalRateSensitivity:.15,capitalPhaseInYears:15,
    },
  }
}
function summarize(p:CombinedPolicy){
  const r=scoreCombined(p)
  const yr=(y:number)=>r.combined.years.find(x=>x.year===y)!
  const primary=r.combined.years.find(x=>x.primaryDeficit<=1e-6)
  const total=r.combined.years.find(x=>x.overallDeficit<=1e-6)
  const target=r.combined.years.find(x=>x.endingDebtGDP<=p.assumptions.debtPaydownTargetGDP+1e-9)
  const peak=r.combined.years.reduce((a,b)=>a.endingDebtGDP>b.endingDebtGDP?a:b)
  const firstFalling=r.combined.years.find((x,i,a)=>i>0&&x.endingDebtGDP<a[i-1]!.endingDebtGDP)
  return {
    debt2036:yr(2036).endingDebtGDP,debt2050:yr(2050).endingDebtGDP,
    debt2075:yr(2075).endingDebtGDP,debt2095:yr(2095).endingDebtGDP,
    deficit2036GDP:yr(2036).overallDeficit/yr(2036).nominalGDP,
    deficit2050GDP:yr(2050).overallDeficit/yr(2050).nominalGDP,
    deficit2075GDP:yr(2075).overallDeficit/yr(2075).nominalGDP,
    deficit2095GDP:yr(2095).overallDeficit/yr(2095).nominalGDP,
    primaryBalanceYear:primary?.year??null,totalBalanceYear:total?.year??null,
    debt40Year:target?.year??null,peakDebtGDP:peak.endingDebtGDP,peakDebtYear:peak.year,
    firstDebtDeclineYear:firstFalling?.year??null,
    netWageLogChange:r.netWageLogChange,
    laborGDP:r.steadyGDPLevelChange,capitalGDP:r.steadyCapitalGDPLevelChange,
    totalDynamicGDP:r.steadyGDPLevelChange+r.steadyCapitalGDPLevelChange,
  }
}
describe('aligned bracket long run test',()=>{
  it('prints full trajectories',()=>{
    const out={
      baseStatic:summarize(policy(false,false)),
      baseDynamic:summarize(policy(false,true)),
      alignedStatic:summarize(policy(true,false)),
      alignedDynamic:summarize(policy(true,true)),
    }
    console.log('ALIGNED_LONGRUN='+JSON.stringify(out))
    expect(out.alignedDynamic.debt2095).toBeLessThan(out.alignedDynamic.peakDebtGDP)
  },30000)
})
