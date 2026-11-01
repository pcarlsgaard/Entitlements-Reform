import {describe,it,expect} from 'vitest'
import {defaultCombinedPolicy,scoreCombined} from '../src/model/combined'
import {scoreExampleHousehold,exampleHouseholds} from '../src/model/householdScenario'
import {calculateHousehold} from '../src/tax/model/household'
import {projectAccountReform} from '../src/model/personalAccountReform'
import {nominalGDPGrowth} from '../src/model/debt'
import type {WageBracket} from '../src/tax/model/types'

describe('frontier robustness and incidence audit (research)',()=>{
 it('compares private saving rates and match at a fixed wage-tax schedule',()=>{
  const schedule:WageBracket[]=[
   {upperPerAdult:15000,rate:.10},{upperPerAdult:60000,rate:.20},
   {upperPerAdult:220000,rate:.25},{upperPerAdult:275000,rate:.30},
   {upperPerAdult:null,rate:.35}]
  const a={...defaultCombinedPolicy.assumptions,
   socialSecurityInitialBenefitMode:'flatTransition' as const,
   flatBenefitFPLMultiple:1.8,fullRetirementAge:70,socialSecurityClaimAge:70,
   fundingStrategy:'paygo' as const}
  const tax={...defaultCombinedPolicy.tax,progressiveWageBrackets:schedule}
  const report=[]
  for(const rate of [.055,.065,.08,.1]){
   const policy={...defaultCombinedPolicy,tax,
    benefits:{socialSecurityReform:true,medicareReform:false},assumptions:a,
    personalAccounts:{...defaultCombinedPolicy.personalAccounts,enabled:true,
     requiredContributionRate:rate,expectedRealReturn:.04}}
   const scored=scoreCombined(policy)
   report.push({rate,debt2095:scored.combined.years.at(-1)!.endingDebtGDP,
    years:[2035,2050,2075,2095].map(year=>{
      const row=scored.combined.years.find(r=>r.year===year)!
      const acct=scored.accountsByYear.get(year)!
      return {year,topupGDP:acct.federalTopupsBillions/row.nominalGDP,
       accountSavingGDP:acct.privateContributionBillions/row.nominalGDP,
       extraPrivateAnnuitiesGDP:acct.privateExcessBillions/row.nominalGDP,
       publicMatchGDP:row.personalAccountMatching!/row.nominalGDP}
    })})
   if(rate===.065){
    const householdScenarios=exampleHouseholds.map(h=>{
      const rows=[2026,2035,2050].map(y=>scoreExampleHousehold(h,y,policy,scored.baseline,scored.combined))
        .filter(x=>x!==null).map(x=>({year:x!.year,age:x!.ages[0],
          deltaDisposable:x!.cashChange,requiredSaving:x!.mandatoryAccountSaving,
          taxCashDelta:x!.taxCashChange,ssDelta:x!.socialSecurityChange,
          transferDelta:x!.cashTransferChange}))
      return {household:h.id,rows}
    })
    report.push({familyChecks:householdScenarios})
   }
  }
  const g=nominalGDPGrowth(a)
  const match=[]
  for(const cap of [0,1000,2000,4000]){
    const p={...defaultCombinedPolicy.personalAccounts,enabled:true,
      requiredContributionRate:.065,expectedRealReturn:.04,governmentMatchCap2026:cap}
    const out=projectAccountReform(a,p,'scheduled')
    match.push({cap,years:[2035,2050,2095].map(year=>{
      const row=out[year-2026]!
      const gdp=a.startingNominalGDPBillions*(1+g)**(year-2026)
      return {year,publicTopupGDP:row.federalTopupsBillions/gdp,
        publicMatchGDP:row.governmentMatchingBillions/gdp,
        totalFederalRetirementGDP:(row.governmentMatchingBillions+row.federalTopupsBillions)/gdp,
        privateExcessGDP:row.privateExcessBillions/gdp}
    })})
  }
  const nontaxableExamples=[
   {filingStatus:'single' as const,cashWage:25000,children:0},
   {filingStatus:'single' as const,cashWage:55000,children:0},
   {filingStatus:'single' as const,cashWage:110000,children:0},
   {filingStatus:'married' as const,cashWage:35000,secondaryCashWage:25000,children:2,childrenUnder6:1},
   {filingStatus:'married' as const,cashWage:65000,secondaryCashWage:35000,children:2,childrenUnder6:1},
  ].map(h=>{
   const b=calculateHousehold(h,tax)
   const wages=h.cashWage+('secondaryCashWage'in h?(h.secondaryCashWage??0):0)
   const taxSaving= .065*wages
   return {label:h.filingStatus+'-'+wages+'-'+h.children, taxCashDelta:b.dollarChange,
     privateContribution:taxSaving,netDisposableDelta:b.dollarChange-taxSaving}
  })
  expect(report.length).toBe(5)
  console.log('RETIREMENT_ROBUSTNESS_JSON='+JSON.stringify({
    tag:'fixed 10/20/25/30/35 bracket, first at 15k, second at 60k, 180% FPL, 4% real return',
    report,match,nontaxableExamples,
  }))
 },180_000)
})
