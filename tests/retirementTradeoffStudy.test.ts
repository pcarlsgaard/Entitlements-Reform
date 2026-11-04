import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { projectAccountReform } from '../src/model/personalAccountReform'
describe('Retirement tax substitution sensitivity',()=>{
  it('calculates 2026-2095 federal debt and private offsets',()=>{
    const results=[]
    for(const rate of [.05,.06,.07,.08,.09,.10,.11,.12,.13,.14,.15]){
      const p=structuredClone(defaultCombinedPolicy)
      p.tax.rate=.36
      p.tax.noncomplianceRate=.055
      p.tax.adultCredit=2700
      p.tax.childCredit=5400
      p.tax.progressiveWageBrackets=[
        { upperPerAdult:70000,rate:.175 },
        { upperPerAdult:184500,rate:.25 },
        { upperPerAdult:220000,rate:.25 },
        { upperPerAdult:275000,rate:.30 },
        { upperPerAdult:null,rate:.35 },
      ]
      p.benefits={socialSecurityReform:true,medicareReform:true}
      p.personalAccounts={enabled:true,requiredContributionRate:rate,
        expectedRealReturn:.045,governmentMatchCap2026:0}
      p.spendingEnabled=true
      p.otherSpending.defenseMode='currentLaw'
      p.otherSpending.nonDefenseMode='onePercentNominal'
      p.otherSpending.farmSubsidyPolicy='eliminateAll'
      p.otherSpending.federalRetirementReform=true
      Object.assign(p.assumptions,{benefitPhaseInYears:70,flatBenefitFPLMultiple:2,
        fullRetirementAge:68,socialSecurityClaimAge:68,
        socialSecurityCOLAMode:'chainedCpi',
        socialSecurityInitialBenefitMode:'flatTransition',
        startingNominalGDPBillions:31902,
        debtSensitivity:0,startingDebtGDP:1.00605,
        startingEffectiveNominalRate:.0323741364743303,
        nonDefenseDiscretionaryGDP2026:.03121,
        otherMandatoryGDP2026:.02994,
        medicareFundingMode:'perPerson',
        premiumSupportRealGrowth:.018,
        medicareSupportGDPShare:.0395393424550185,
        otherOASDIGDP:.01,under65MedicareGDP:.006,
        debtPaydownSurplusCapGDP:.10})
      Object.assign(p.health,{uninsuredTakeUpRate:.85,adultHealthCredit:3000,childHealthCredit:1500,replaceAcaAptc:true,benchmarkPremiumScale:1.03,
        employerHealthPassThroughRate:1,employerFicaPassThroughRate:1,
        redistributionRule:'nationalEqual',recipientScope:'policyholders'})
      Object.assign(p.dynamic,{enabled:true,laborElasticity:.15,laborShareGDP:.6})
      const out=scoreCombined(p,'cpi',.10-rate)
      const debt=(y:number)=>out.combined.years.find(x=>x.year===y)!.endingDebtGDP*100
      const account=(y:number)=>out.accountsByYear.get(y)!
      const coveredTax2026=out.cappedWageTaxChangeGDP(2026)*p.assumptions.startingNominalGDPBillions
      results.push({saving:rate,coveredWageTaxAdjustment:.10-rate,
        rates:p.tax.progressiveWageBrackets.map(x=>x.rate),
        effectiveMarginalRatesUnderCap:p.tax.progressiveWageBrackets.slice(0,2).map(x=>x.rate+.10-rate),
        tax2026:out.tax.netRevenue+coveredTax2026,
        coveredTax2026,
        debt2035:debt(2035),debt2050:debt(2050),
        debt2075:debt(2075),debt2095:debt(2095),
        peak:Math.max(...out.combined.years.map(x=>x.endingDebtGDP))*100,
        private2026:account(2026).privateContributionBillions,
        replacementShare2075:account(2075).privateBenefitOffsetBillions/account(2075).scheduledBenefitsBillions,
        replacementShare2095:account(2095).privateBenefitOffsetBillions/account(2095).scheduledBenefitsBillions,
        offset2075:account(2075).privateBenefitOffsetBillions,
        public2075:account(2075).federalTopupsBillions,
        replacementShare2075:account(2075).privateBenefitOffsetBillions/account(2075).scheduledBenefitsBillions,
        offset2095:account(2095).privateBenefitOffsetBillions,
        public2095:account(2095).federalTopupsBillions,
        replacementShare2095:account(2095).privateBenefitOffsetBillions/account(2095).scheduledBenefitsBillions,
        extra2095:account(2095).privateExcessBillions,
        fiscalAdjustment:out.additionalFiscalAdjustmentGDP,
        laborGDP:out.steadyGDPLevelChange})
    }
    console.log('RETIREMENT_TRADEOFF_RESULTS_JSON='+JSON.stringify(results))
    expect(results.length).toBe(11)
  },900000)
})

describe('real return sensitivity for 2075 retirement replacement',()=>{
 it('assesses lower and higher account returns independent of tax policy',()=>{
   const rows=[]
   for(const realReturn of [.025,.035,.045,.055]){
     for(const requiredContributionRate of [.08,.09,.10]){
       const a={...defaultCombinedPolicy.assumptions,
         benefitPhaseInYears:70,flatBenefitFPLMultiple:2,
         socialSecurityInitialBenefitMode:'flatTransition' as const,
         fullRetirementAge:68,socialSecurityClaimAge:68,
         socialSecurityCOLAMode:'chainedCpi' as const,
         medicareFundingMode:'perPerson' as const,
         startingNominalGDPBillions:31902,
         currentLawSSBenefit2026:24500,
         startingDebtGDP:1.00605,
       }
       const p={enabled:true,requiredContributionRate,
         expectedRealReturn:realReturn,governmentMatchCap2026:0}
       const year=projectAccountReform(a,p,'scheduled').find(x=>x.year===2075)!
       rows.push({realReturn,requiredContributionRate,
         replacementShare2075:year.privateBenefitOffsetBillions/year.scheduledBenefitsBillions,
         topups2075Billions:year.federalTopupsBillions})
     }
   }
   console.log('RETIREMENT_RETURN_SENSITIVITY_JSON='+JSON.stringify(rows))
   expect(rows.length).toBe(12)
 },900000)
})
