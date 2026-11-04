import { describe, it, expect } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'

describe('6.5% mandatory Roth and child-credit-preserving wage schedules',()=>{
  it('scores fiscal headroom versus peak debt with 35% DBCFT and covered-wage substitution',()=>{
    const configs=[
      {name:'debtFirst',rates:[.159,.268,.310,.35],cutoffs:[65000,150000,310000]},
      {name:'balancedRounded',rates:[.155,.225,.290,.35],cutoffs:[65000,150000,250000]},
      {name:'nearRevenueFloor',rates:[.147,.218,.281,.35],cutoffs:[62500,150000,250000]},
      {name:'greaterDebtCushion',rates:[.162,.233,.296,.35],cutoffs:[62500,150000,250000]},
    ]
    const outputs=[]
    for(const c of configs){
      const p=structuredClone(defaultCombinedPolicy)
      p.taxEnabled=true
      Object.assign(p.tax,{
        rate:.35, noncomplianceRate:.055, wageTaxMode:'progressive',
        adultCredit:2700, adultCreditMode:'earned',
        adultCreditPhaseInRate:.23, adultCreditPhaseOutRate:0,
        adultCreditTakeUpRate:1, adultCreditEarningsBase:'compensation',
        childCredit:5400, childCreditBaselineRefundableShare:.5,
        childCreditPhaseInRate:.20, under6ChildCredit:0,
        exemptionShare:0,cashWageExemptionShare:0,
        employerSocialInsuranceExemptionShare:0,
        employerHealthInsuranceExemptionShare:0,
        employerPensionOtherInsuranceExemptionShare:0,
      })
      p.tax.progressiveWageBrackets=[
        {upperPerAdult:c.cutoffs[0]!,rate:c.rates[0]!},
        {upperPerAdult:c.cutoffs[1]!,rate:c.rates[1]!},
        {upperPerAdult:c.cutoffs[2]!,rate:c.rates[2]!},
        {upperPerAdult:null,rate:.35},
      ]
      Object.assign(p.health,{
        uninsuredTakeUpRate:.85,adultHealthCredit:3000,childHealthCredit:1500,
        replaceAcaAptc:true,benchmarkPremiumScale:1.03,
        employerHealthPassThroughRate:1,employerFicaPassThroughRate:1,
        employeePremiumPreTaxShare:1,
        redistributionRule:'nationalEqual',recipientScope:'policyholders',
      })
      p.benefits={socialSecurityReform:true,medicareReform:true}
      p.personalAccounts={enabled:true,requiredContributionRate:.065,
        expectedRealReturn:.045,governmentMatchCap2026:0}
      p.spendingEnabled=true
      Object.assign(p.otherSpending,{
        defenseMode:'currentLaw',nonDefenseMode:'onePercentNominal',
        farmSubsidyPolicy:'eliminateAll',federalRetirementReform:true,
      })
      Object.assign(p.assumptions,{
        benefitPhaseInYears:70,flatBenefitFPLMultiple:2,
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
        debtPaydownSurplusCapGDP:.10,
      })
      Object.assign(p.dynamic,{enabled:true,laborElasticity:.15,laborShareGDP:.6})
      const s=scoreCombined(p,'cpi',.035)
      const debt=(y:number)=>s.combined.years.find(row=>row.year===y)!.endingDebtGDP*100
      outputs.push({
        name:c.name,rates:c.rates,cutoffs:c.cutoffs,
        grossWageTax2026:s.tax.grossWageRevenue,
        cappedTax2026:s.cappedWageTaxChangeGDP(2026)*31902,
        netTax2026:s.tax.netRevenue+s.cappedWageTaxChangeGDP(2026)*31902,
        peakDebtGDP:Math.max(...s.combined.years.map(row=>row.endingDebtGDP))*100,
        debt2035:debt(2035),debt2050:debt(2050),
        debt2075:debt(2075),debt2095:debt(2095),
        private2075:s.accountsByYear.get(2075)!.privateBenefitOffsetBillions/
                    s.accountsByYear.get(2075)!.scheduledBenefitsBillions,
        private2095:s.accountsByYear.get(2095)!.privateBenefitOffsetBillions/
                    s.accountsByYear.get(2095)!.scheduledBenefitsBillions,
      })
    }
    console.log('CAPPED_WAGE_6P5_FRONTIER_JSON='+JSON.stringify(outputs))
    expect(outputs.length).toBe(configs.length)
  },900000)
})
