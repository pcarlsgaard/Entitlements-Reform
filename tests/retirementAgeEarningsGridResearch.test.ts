/** Research grid using the production household cashflow + retired-worker benefit model.
 * Does not redefine benefits or change production settings.
 */
import { describe,it,expect } from 'vitest'
import { defaultCombinedPolicy,scoreCombined } from '../src/model/combined'
import { exampleHouseholds,scoreExampleHousehold } from '../src/model/householdScenario'
import { incomeGroups,projectAccountReform } from '../src/model/personalAccountReform'
import { relativeBenefitAtPercentile } from '../src/model/socialSecurityDistribution'
import { populationMillions } from '../src/model/demographics'
import type { CombinedPolicy } from '../src/model/combined'
const ages=[20,25,30,35,40,45,50,55,60,65] as const
const floors=[1.25,1.5,1.75,2.0] as const
const rates=[.04,.055,.065,.08,.10,.12] as const
const wageMean=incomeGroups.reduce((s,g)=>s+g.share*g.wage,0)
const benefitMean=incomeGroups.reduce((s,g)=>s+g.share*relativeBenefitAtPercentile(g.benefitRank),0)
const baseTaxSchedule=[
 {upperPerAdult:15000,rate:.10},{upperPerAdult:60000,rate:.20},
 {upperPerAdult:220000,rate:.25},{upperPerAdult:275000,rate:.30},
 {upperPerAdult:null,rate:.35},
]
const base:CombinedPolicy={
 ...defaultCombinedPolicy,
 tax:{...defaultCombinedPolicy.tax,progressiveWageBrackets:baseTaxSchedule},
 benefits:{socialSecurityReform:true,medicareReform:false},
 assumptions:{...defaultCombinedPolicy.assumptions,
   socialSecurityInitialBenefitMode:'flatTransition',flatBenefitFPLMultiple:1.75,
   socialSecurityClaimAge:70,fullRetirementAge:70,fundingStrategy:'paygo'},
 baselineMode:'scheduled',
 personalAccounts:{...defaultCombinedPolicy.personalAccounts,enabled:true,
   requiredContributionRate:.065,governmentMatchCap2026:0,expectedRealReturn:.04},
}
type Person={age:number,rank:string,weight:number,wage:number,multiplier:number,retirementYear:number}
const people:Person[]=ages.flatMap(age=>incomeGroups.map(group=>{
 const weight=populationMillions(2026,age,base.assumptions)*group.share
 return {age,rank:group.name,weight,
  wage:Math.round(50000*group.wage/wageMean),
  multiplier:relativeBenefitAtPercentile(group.benefitRank)/benefitMean,
  retirementYear:2026+70-age}
}))
const totalWeight=people.reduce((s,p)=>s+p.weight,0)
const bottom80Weight=(p:Person)=>p.rank==='p90'?0:p.rank==='p75'?p.weight/2:p.weight
const lowerWeight=people.reduce((s,p)=>s+bottom80Weight(p),0)
const percent=(n:number)=>Math.round(n*10000)/100
function run(ret:number){
 const output=[]
 const baseSimByFloor=new Map<number,ReturnType<typeof scoreCombined>>()
 for(const floor of floors){
   const noAccounts:CombinedPolicy={...base,
     assumptions:{...base.assumptions,flatBenefitFPLMultiple:floor},
     personalAccounts:{...base.personalAccounts,enabled:false}}
   baseSimByFloor.set(floor,scoreCombined(noAccounts))
 }
 const example=exampleHouseholds.find(x=>x.id==='younger-worker')!
 for(const floor of floors)for(const rate of rates){
  const policy:CombinedPolicy={...base,
   assumptions:{...base.assumptions,flatBenefitFPLMultiple:floor},
   personalAccounts:{...base.personalAccounts,requiredContributionRate:rate,expectedRealReturn:ret}}
  const sim=baseSimByFloor.get(floor)!
  let weightedProtected=0,lowerProtected=0,nearProtected=0,nearWeight=0,
     midProtected=0,midWeight=0,earlyProtected=0,earlyWeight=0,
     lossWeight=0,lossFractionSum=0,shortfallShareSum=0,
     workingProtected=0,lowerWorkingProtected=0,weightedWorkingDelta=0
  let worst={loss:0,age:0,rank:'',wage:0}
  const cellRows=[]
  for(const person of people){
   const profile={...example,filingStatus:'single' as const,
      primaryAge2026:person.age,spouseAge2026:person.age,
      primaryWage2026:person.wage,spouseWage2026:0,
      primaryClaimAge:70,spouseClaimAge:70,
      primaryCreditedYears2026:Math.max(0,person.age-22),
      spouseCreditedYears2026:Math.max(0,person.age-22),
      workThroughAge:69,legacyBenefitMultiplier:person.multiplier,
      childAges2026:[],receives:{snap:false,wic:false,schoolMeals:false,
        summerEbt:false,tanf:false,liheap:false,housing:false},
      manualAnnualBenefits2026:{}}
   const retirement=scoreExampleHousehold(profile,person.retirementYear,policy,
     sim.baseline,sim.combined)!
   const working=scoreExampleHousehold(profile,2026,policy,sim.baseline,sim.combined)!
   const baseline=retirement.baselineSocialSecurity
   const reformed=retirement.reformSocialSecurity
   const loss=baseline>0?(reformed/baseline-1):0
   const protectedAtRetirement=loss>=-1e-9
   if(protectedAtRetirement)weightedProtected+=person.weight
   if(protectedAtRetirement)lowerProtected+=bottom80Weight(person)
   if(person.age>=50){nearWeight+=person.weight;if(protectedAtRetirement)nearProtected+=person.weight}
   else if(person.age>=35){midWeight+=person.weight;if(protectedAtRetirement)midProtected+=person.weight}
   else {earlyWeight+=person.weight;if(protectedAtRetirement)earlyProtected+=person.weight}
   if(loss<0){
    lossWeight+=person.weight
    lossFractionSum+=person.weight*(-loss)
    shortfallShareSum+=person.weight*(baseline-reformed)/baseline
   }
   if(loss<worst.loss)worst={loss,age:person.age,rank:person.rank,wage:person.wage}
   const workingOk=working.cashChange>=-1e-9
   if(workingOk)workingProtected+=person.weight
   if(workingOk)lowerWorkingProtected+=bottom80Weight(person)
   weightedWorkingDelta+=working.cashChange*person.weight
   cellRows.push({age:person.age,rank:person.rank,wage:person.wage,
      changePct:percent(loss),retirementYear:person.retirementYear,
      privateAnnual:Math.round(retirement.privateAccountRetirementIncome),
      publicAnnual:Math.round(retirement.publicRetirementTopup),
      baselineAnnual:Math.round(baseline),reformAnnual:Math.round(reformed),
      workingDelta:Math.round(working.cashChange)})
  }
  const a=projectAccountReform(policy.assumptions,policy.personalAccounts,'scheduled')
  const sums=(year:number)=>{
   const x=a[year-2026]!
   const row=sim.combined.years[year-2026]!
   return {year,topupsGDP:percent(x.federalTopupsBillions/row.nominalGDP),
     totalPrivateSavingsGDP:percent(x.privateContributionBillions/row.nominalGDP),
     aboveGuaranteeGDP:percent(x.privateExcessBillions/row.nominalGDP)}
  }
  const result={
   floor,rate,return:ret,retirementHoldAll:percent(weightedProtected/totalWeight),
   retirementHoldBottom80:percent(lowerProtected/lowerWeight),
   nearRetirementHold:percent(nearProtected/nearWeight),
   midRetirementHold:percent(midProtected/midWeight),
   earlyRetirementHold:percent(earlyProtected/earlyWeight),
   meanLossAmongLosers:percent(lossWeight?lossFractionSum/lossWeight:0),
   averageLossPctAcrossAll:percent(lossFractionSum/totalWeight),
   workingHoldAll:percent(workingProtected/totalWeight),
   workingHoldBottom80:percent(lowerWorkingProtected/lowerWeight),
   meanWorkingCashDelta:Math.round(weightedWorkingDelta/totalWeight),
   worst:{...worst,lossPct:percent(worst.loss)},
   fiscal:[sums(2035),sums(2050),sums(2075),sums(2095)],
   cellRows,
  }
  output.push(result)
 }
 return output
}
describe('retirement hold-harmless across 2026 age-by-earning cohorts',()=>{
 it('tests 24 combinations of 2026 cohort ages and income groups at a 4% real return',()=>{
  const out=run(.04)
  expect(out).toHaveLength(24)
  console.log('RETIREMENT_AGE_EARNINGS_GRID_JSON='+JSON.stringify(out))
 },240000)
})
