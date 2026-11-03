/** Exploratory joint search. Wage-only CPS tax units are proxies, not complete household incidence.
 * Results printed in CI are descriptive and should not be conflated with a VAT score.
 */
import { describe, it, expect } from 'vitest'
import microdata from '../src/tax/data/microdata_2025.json'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { calculateHousehold } from '../src/tax/model/household'
import { calculateMacro } from '../src/tax/model/macro'
import { projectAccountReform } from '../src/model/personalAccountReform'
import { scoreExampleHousehold, exampleHouseholds } from '../src/model/householdScenario'
import { nominalGDPGrowth } from '../src/model/debt'
import type { ReformSettings, WageBracket, HouseholdInput } from '../src/tax/model/types'

type Cell=[number,number,number,number]
type TaxCase={r1:number,r2:number,t1:number,t2:number,rate:number,brackets:WageBracket[],
  revenueGDP:number,harmless:number,within1:number,meanDelta:number,p10:number,p50:number,p75:number}
const pct=(v:number)=>Math.round(v*10000)/100
const rnd=(v:number)=>Math.round(v*100)/100
const stamp=(x:unknown)=>console.log('RETIREMENT_FRONTIER_JSON='+JSON.stringify(x))
function percentileSampler(count=400) {
  const raw=(microdata.distribution as Cell[]).filter(c=>c[0]>0&&c[1]>0&&c[3]>0)
    .slice().sort((a,b)=>a[0]-b[0])
  const total=raw.reduce((s,c)=>s+c[3],0)
  const results:Cell[]=[]
  let pos=0,cum=raw[0]![3]
  for(let i=0;i<count;i++){
    const threshold=(i+.5)*total/count
    while(cum<threshold&&pos<raw.length-1){pos++;cum+=raw[pos]![3]}
    results.push(raw[pos]!)
  }
  return results.map(([cash,adults,_credit,weight],i)=>({
    q:(i+.5)/count,weight,adults,wage:cash*microdata.calibration.cashWageScaleToBea2025,
  }))
}
function combinedWages(wage:number,adults:number){return adults>=2
  ?2*Math.min(184500,wage/2):Math.min(184500,wage)}
function input(wage:number,adults:number):HouseholdInput{return {
 filingStatus:adults>=2?'married':'single',cashWage:adults>=2?wage/2:wage,
 secondaryCashWage:adults>=2?wage/2:0,children:0
}}
function newTax(base:ReformSettings,r1:number,r2:number,t1:number,t2:number):ReformSettings{
 const bands:WageBracket[]=[{upperPerAdult:t1,rate:r1},{upperPerAdult:t2,rate:r2},
 {upperPerAdult:220000,rate:.25},{upperPerAdult:275000,rate:.30},
 {upperPerAdult:null,rate:.35}]
 return {...base,progressiveWageBrackets:bands,wageTaxMode:'progressive'}
}
describe('retirement account and wage-bracket policy frontier (research only)',()=>{
 it('maps incidence, retirement and budget tradeoffs without claiming a full distributional score',()=>{
  const sample=percentileSampler(400).filter(s=>s.q<=.80)
  const base=defaultCombinedPolicy
  const macroBase=calculateMacro(base.tax)
  const rates=[.04,.055,.065,.08,.10]
  const taxSchedules:{settings:ReformSettings,revenueGDP:number,r1:number,r2:number,t1:number,t2:number}[]=[]
  for(const r1 of [0,.05,.075,.10])for(const r2 of [.125,.15,.175,.20])
   for(const t1 of [15000,20000,30000])for(const t2 of [60000,70000,85000]){
    if(t1>=t2)continue
    const settings=newTax(base.tax,r1,r2,t1,t2)
    const revenueGDP=(calculateMacro(settings).netRevenue-macroBase.netRevenue)/macroBase.gdp
    taxSchedules.push({settings,revenueGDP,r1,r2,t1,t2})
   }
  const wageSearch:Record<string,unknown>[]=[]
  for(const rate of rates){
   const out:TaxCase[]=[]
   for(const c of taxSchedules){
    let sum=0,held=0,almost=0
    const vals:number[]=[]
    for(const unit of sample){
     const score=calculateHousehold(input(unit.wage,unit.adults),c.settings)
     const contribution=combinedWages(unit.wage,unit.adults)*rate
     const d=score.dollarChange-contribution
     const floor=score.currentDisposableResources
     sum+=d
     held+=Number(d>=0)
     almost+=Number(d>=-Math.max(0,floor*.01))
     vals.push(d)
    }
    const n=sample.length
    out.push({r1:c.r1,r2:c.r2,t1:c.t1,t2:c.t2,rate,
      brackets:c.settings.progressiveWageBrackets!,revenueGDP:c.revenueGDP,
      harmless:held/n,within1:almost/n,meanDelta:sum/n,
      p10:vals[Math.floor(n*.125)]!,p50:vals[Math.floor(n*.625)]!,p75:vals[Math.floor(n*.93)]!})
   }
   const s=(a:TaxCase,b:TaxCase)=>b.within1-a.within1||
     b.harmless-a.harmless||b.revenueGDP-a.revenueGDP
   const all=out.slice().sort(s)
   const budget=out.filter(v=>v.revenueGDP>=-.002).sort(s)
   wageSearch.push({rate,mostProtected:all.slice(0,2).map(v=>({
    firstRate:v.r1,secondRate:v.r2,firstTop:v.t1,secondTop:v.t2,
    hold:pct(v.harmless),within1:pct(v.within1),revenueGDP:pct(v.revenueGDP),meanDelta:rnd(v.meanDelta)})),
    within0point2GDP:budget.slice(0,2).map(v=>({
    firstRate:v.r1,secondRate:v.r2,firstTop:v.t1,secondTop:v.t2,
    hold:pct(v.harmless),within1:pct(v.within1),revenueGDP:pct(v.revenueGDP),meanDelta:rnd(v.meanDelta)}))})
  }
  const social=[]
  const ass={...base.assumptions,socialSecurityInitialBenefitMode:'flatTransition' as const,
    socialSecurityClaimAge:70,fundingStrategy:'paygo' as const}
  const growth=nominalGDPGrowth(ass)
  for(const floor of [1.5,1.65,1.8,2.0])for(const rate of rates){
   const p={...base.personalAccounts,enabled:true,
    requiredContributionRate:rate,expectedRealReturn:.04,governmentMatchCap2026:0}
   const a={...ass,flatBenefitFPLMultiple:floor}
   const rows=projectAccountReform(a,p,'scheduled')
   const points=[2035,2050,2075,2095].map(y=>{
    const q=rows[y-2026]!
    const g=a.startingNominalGDPBillions*(1+growth)**(y-2026)
    return {year:y,guaranteedGDP:pct(q.scheduledBenefitsBillions/g),
      topupGDP:pct(q.federalTopupsBillions/g),privateOffsetGDP:pct(q.privateBenefitOffsetBillions/g),
      privateExcessGDP:pct(q.privateExcessBillions/g),privateDepositsGDP:pct(q.privateContributionBillions/g)}
   })
   social.push({floor,rate,points})
  }
  // Finalist cross checks with exact household scorer, limited to four scenarios
  // to avoid repeatedly rerunning the full 70-year debt engine for every tax candidate.
  const finalists=[]
  for(const [floor,rate,r1,r2,t1,t2] of [
   [1.5,.065,.075,.175,20000,70000],
   [1.8,.065,.075,.175,20000,70000],
   [1.8,.08,.05,.15,20000,70000],
   [2.0,.08,.05,.15,20000,70000],
  ] as number[][]){
   const tax=newTax(base.tax,r1!,r2!,t1!,t2!)
   const policy={...base,tax,benefits:{socialSecurityReform:true,medicareReform:false},
    assumptions:{...ass,flatBenefitFPLMultiple:floor!},
    personalAccounts:{...base.personalAccounts,enabled:true,
      requiredContributionRate:rate!,expectedRealReturn:.04,governmentMatchCap2026:0}}
   const model=scoreCombined(policy)
   const profiles=[]
   for(const age of [26,40,55,63]){
    for(const wage of [25000,55000,110000]){
      const person={...exampleHouseholds[4]!,filingStatus:'single' as const,primaryAge2026:age,
        primaryWage2026:wage,spouseWage2026:0,childAges2026:[],
        primaryClaimAge:70,workThroughAge:69,
        primaryCreditedYears2026:Math.max(0,age-22),legacyBenefitMultiplier:wage<30000?.7:wage<70000?1:1.5}
      const at=2026+70-age
      const row=scoreExampleHousehold(person,at,policy,model.baseline,model.combined)!
      profiles.push({age2026:age,wage,retireYear:at,prior:rnd(row.baselineSocialSecurity),
        combined:rnd(row.reformSocialSecurity),topup:rnd(row.publicRetirementTopup),
        private:rnd(row.privateAccountRetirementIncome),
        changePct: row.baselineSocialSecurity>0?pct(row.reformSocialSecurity/row.baselineSocialSecurity-1):null})
    }
   }
   finalists.push({floor,rate,lowWageRates:[r1,r2],thresholds:[t1,t2],
     2050:model.accountsByYear.get(2050),2095:model.accountsByYear.get(2095),
     debt2095:model.combined.years.at(-1)!.endingDebtGDP,
     incomeProfiles:profiles})
  }
  expect(wageSearch.length).toBe(rates.length)
  expect(social.length).toBe(4*rates.length)
  stamp({source:'main default X-tax with modeled CPS wage-only distribution and no child credits in the percentile screen',
    referenceGrossTax:macroBase.netRevenue,referenceGDP:macroBase.gdp,
    nOriginal:microdata.distribution.length,nQuantileSample:sample.length,
    lower80CutoffWage:sample.at(-1)!.wage,
    wageSearch,social,finalists})
 },240_000)
})
