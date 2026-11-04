import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
describe('Retirement tax substitution sensitivity',()=>{
  it('calculates 2026-2095 federal debt and private offsets',()=>{
    const results=[]
    for(const rate of [.075,.085,.09,.095,.105]){
      const p=structuredClone(defaultCombinedPolicy)
      p.tax.rate=.36
      p.tax.noncomplianceRate=.055
      p.tax.adultCredit=2700
      p.tax.childCredit=5400
      p.tax.progressiveWageBrackets=[
        { upperPerAdult:70000,rate:.175+.10-rate },
        { upperPerAdult:220000,rate:.25+.10-rate },
        { upperPerAdult:275000,rate:.30+.10-rate },
        { upperPerAdult:null,rate:.36+.10-rate },
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
      const out=scoreCombined(p)
      const debt=(y:number)=>out.combined.years.find(x=>x.year===y)!.endingDebtGDP*100
      const account=(y:number)=>out.accountsByYear.get(y)!
      results.push({saving:rate,rates:p.tax.progressiveWageBrackets.map(x=>x.rate),
        tax2026:out.tax.netRevenue,
        debt2035:debt(2035),debt2050:debt(2050),
        debt2075:debt(2075),debt2095:debt(2095),
        peak:Math.max(...out.combined.years.map(x=>x.endingDebtGDP))*100,
        private2026:account(2026).privateContributionBillions,
        replacementShare2075:account(2075).privateBenefitOffsetBillions/account(2075).scheduledBenefitsBillions,
        replacementShare2095:account(2095).privateBenefitOffsetBillions/account(2095).scheduledBenefitsBillions,
        offset2075:account(2075).privateBenefitOffsetBillions,
        public2075:account(2075).federalTopupsBillions,
        offset2095:account(2095).privateBenefitOffsetBillions,
        public2095:account(2095).federalTopupsBillions,
        extra2095:account(2095).privateExcessBillions,
        fiscalAdjustment:out.additionalFiscalAdjustmentGDP,
        laborGDP:out.steadyGDPLevelChange})
    }
    console.log('RETIREMENT_TRADEOFF_RESULTS_JSON='+JSON.stringify(results))
    expect(results.length).toBe(5)
  },900000)
})
