/**
 * X-tax top-rate sensitivity and Q1–Q4 consumption-protecting fiscal search.
 * Uses the pinned 2026 saved reform's existing income tax-unit and
 * macro/simulation infrastructure. This is NOT a Laffer-curve estimate:
 * the primary score assumes a fixed 5% compliance loss, and static profits
 * do not respond to the marginal DBCFT rate. Alternative business-base
 * elasticities below are explicit sensitivity assumptions only.
 */
import { scoreCombined, type CombinedPolicy } from './combined'
import { calculateMacro } from '../tax/model/macro'
import { calculateHealthAnalysis } from '../tax/model/health'
import { calculateFederalProgramSavings } from '../tax/model/transfers'
import { prepareTaxSearchConsumption, type TaxSearchConsumptionMetrics } from '../tax/model/consumptionAudit'
import { calculateLaborResponse } from '../tax/model/laborResponse'
import type { ReformSettings, WageBracket } from '../tax/model/types'

export interface HighTopSearchOptions {
  seed?:number
  maxCandidates?:number
  fullFiscalFinalists?:number
  minimumBottomFourWinnersPct?:number
}
export interface HighTopCandidate {
  id:string
  topRate:number
  brackets:WageBracket[]
  adultCredit:number
  childCredit:number
}
export interface HighTopRow {
  design:HighTopCandidate
  distribution:TaxSearchConsumptionMetrics
  q1q4WinnersPct:number
  q1q4Lose1Pct:number
  q1q4Lose5Pct:number
  q1q4Gain20Pct:number
  q4WinnersPct:number
  q5Lose5Pct:number
  additionalRevenueBillions:number
  modelNetRevenueBillions:number
  /** Lower is better, though primary-budget feasibility overrides this score. */
  policyLoss:number
  labor: null | {
    higherWedgeWorkersPct:number
    higherPersonalRateWorkersPct:number
    higherLiquidWorkersPct:number
    wedgeChangePp:number
    personalRateChangePp:number
    liquidChangePp:number
    netWageLogChange:number
  }
  fiscal: null | {
    primary2030GDP:number
    primary2032GDP:number
    primary2035GDP:number
    firstPrimarySurplusYear:number|null
    peakDebtGDP:number
    debt2095GDP:number
    meets2035Primary:boolean
    meets2032Primary:boolean
    meetsDebtTargets:boolean
    passesAll2035:boolean
  }
}
export interface HighTopSearchReport {
  assumptions:{
    topRates:number[];noncompliance:number;rothContribution:number;
    acaTransitionShare:number;businessWageTopParity:boolean
    baselineBusinessTaxableBaseBillions:number
    fiscalScreen:{deadline:number,terminalDebtGDP:number,peakDebtGDP:number}
  }
  candidateCount:number
  prelimEligible:number
  fiscalScored:number
  baseline:HighTopRow
  /** Original four-rate plan, then its fifth-rate extensions at each top rate. */
  rateSweep:HighTopRow[]
  /** Third/fourth wage rate, fifth-rate threshold and business top rate remain explicit. */
  fiveRateFrontier:HighTopRow[]
  bestByTopRate:(HighTopRow|null)[]
  best2035:HighTopRow|null
  best2032:HighTopRow|null
  bestFasterThanBaseline:HighTopRow|null
  frontier2035:HighTopRow[]
  frontierDebtOnly:HighTopRow[]
  closestPrimary:HighTopRow[]
  /** Illustrative taxable business base response to net-of-tax-rate. */
  staticRateSensitivity:{topRate:number,staticRevenueDeltaBillions:number,
    adjustedRevenueDeltaBillions:{e020:number,e050:number,e080:number}}[]
}

const topRates=[.35,.375,.40,.425,.45,.475,.50,.525,.55]
function rng(seed:number):()=>number{
  let z=seed>>>0;return ()=>{z|=0;z=z+0x6D2B79F5|0;let t=Math.imul(z^z>>>15,1|z);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}
}
const sig=(x:HighTopCandidate)=>[
 x.topRate,x.brackets.map(b=>b.rate+':'+b.upperPerAdult).join('/'),
 x.adultCredit,x.childCredit].join('|')
const capBrackets=(top:number,base:number[],cuts:number[]):WageBracket[]=>{
  const rates=[...base,top]
  return rates.map((rate,i)=>({rate,upperPerAdult:i<cuts.length?cuts[i]!:null}))
}
function candidate(
  id:string,top:number,rates:number[],cuts:number[],
  adult:number,child:number
):HighTopCandidate|null {
 if(top<.35||top>.55||![3,4].includes(rates.length)||cuts.length!==rates.length
   ||rates.some((r,i)=>r>top||(i>0&&r<rates[i-1]!)||r<0))return null
 if(cuts.some((c,i)=>c<10000||(i>0&&c<=cuts[i-1]!)))return null
 const full=[...rates,top]
 // Only the new fifth rate may jump 12.5–20 pp from an existing 35% band;
 // treat those as extreme sensitivity scenarios rather than coherent defaults.
 if(full.some((r,i)=>i>0&&r-full[i-1]!>(rates.length===4&&i===4?.20000001:.12500001)))return null
 if(rates.length===4 && (Math.abs(rates[3]!-.35)>1e-10 || top<=.35))return null
 return {id,topRate:top,brackets:capBrackets(top,rates,cuts),
  adultCredit:adult,childCredit:child}
}
function apply(base:CombinedPolicy,x:HighTopCandidate):CombinedPolicy {
 return {...base,tax:{...base.tax,rate:x.topRate,
   progressiveWageBrackets:x.brackets.map(b=>({...b})),
   adultCredit:x.adultCredit,childCredit:x.childCredit}}
}
const bottom4=(d:TaxSearchConsumptionMetrics,k:'winnersPct'|'lose1Pct'|'lose5Pct'|'gain20Pct')=>
  d.byQuintile.slice(0,4).reduce((s,q)=>s+q[k],0)/4
function policyScore(r:HighTopRow):number {
 // Prevent "all big winners" or "all big losers"; prioritize Q1–Q4 winners.
 const d=r.distribution,l=r.labor
 return -4.5*r.q1q4WinnersPct
   +2.1*r.q1q4Lose5Pct+0.55*r.q1q4Lose1Pct
   +0.85*r.q1q4Gain20Pct+0.4*r.q5Lose5Pct
   +0.20*d.meanClippedDeviationFrom2Pct
   +(l?0.30*l.higherWedgeWorkersPct+0.18*l.higherPersonalRateWorkersPct
       +Math.max(0,l.wedgeChangePp)*2:0)
}
function nonDominated(rows:HighTopRow[],limit=12):HighTopRow[]{
 const value=(r:HighTopRow)=>[
  -r.q1q4WinnersPct,-r.q4WinnersPct,r.q1q4Lose5Pct,
  r.q1q4Gain20Pct,r.q5Lose5Pct,r.labor?.higherWedgeWorkersPct??100,
  r.design.topRate,r.fiscal?.firstPrimarySurplusYear??2100]
 return rows.filter(a=>!rows.some(b=>{
  if(a===b)return false
  const x=value(a),y=value(b)
  return y.every((v,i)=>v<=x[i]!+1e-8)&&y.some((v,i)=>v<x[i]!-1e-8)
 })).sort((a,b)=>policyScore(a)-policyScore(b)).slice(0,limit)
}
export function searchHighTopRates(
  prior:CombinedPolicy,
  options:HighTopSearchOptions={},
):HighTopSearchReport{
 if(!prior.personalAccounts.enabled)throw new Error('Keep required personal account deposits')
 if(prior.tax.noncomplianceRate<=0||prior.tax.rate!==.35)throw new Error('Expected 35% baseline with specified compliance')
 const base:CombinedPolicy={...prior,
  health:{...prior.health,replaceAcaAptc:false,
    nonPolicyholderTreatment:'continueFamilyPolicy',
    esiAcaTransitionShare:prior.health.esiAcaTransitionShare??0}}
 const health=calculateHealthAnalysis(base.tax,base.health)
 const programSavings=calculateFederalProgramSavings(base.transfers)+health.estimatedExistingAptcSavingsBillions
 const net=(p:CombinedPolicy)=>calculateMacro(p.tax,{
   insuranceCreditCost:health.totalHealthCreditCostBillions,
   federalTransferSavings:programSavings})
 const referenceRevenue=net(base).netRevenue
 const businessBase=net(base).businessTaxableBase
 const inc=prepareTaxSearchConsumption(base.tax,base.health,base.personalAccounts)
 const list=new Map<string,HighTopCandidate>()
 const add=(x:HighTopCandidate|null)=>{if(x&&!list.has(sig(x)))list.set(sig(x),x)}
 const compromise=[.185,.275,.335],compromiseCuts=[70000,185000,310000]
 // Include both exact known plan and pure top-rate variations.
 const priorDesign=candidate('debt-only-4rate-35',.35,compromise,compromiseCuts,2700,5400)!
 add(priorDesign)
 for(const top of topRates){
  if(top===.35)continue
  // Four-rate tests permit a shifting third band but cannot preserve the
  // original <=35% lower rates above a 47.5% top without huge bracket jumps.
  add(candidate('four-'+top,top,compromise,compromiseCuts,2700,5400))
  add(candidate('four-plus-adult-'+top,top,compromise,compromiseCuts,3100,5400))
  add(candidate('four-earlier-'+top,top,compromise,[70000,185000,225000],2700,5400))
  add(candidate('four-saved-'+top,top,[.20,.25,.30],[65000,150000,310000],2700,5400))
  // Fifth rate: exact 18.5/27.5/33.5/35 wage rates stay unchanged.
  // Only the top band above the fourth per-adult threshold is new.
  add(candidate('fixed-'+top,top,[...compromise,.35],
    [70000,185000,310000,500000],2700,5400))
  for(const highCut of [400000,600000,750000,1000000]){
   add(candidate('five-compromise-'+top+'-'+highCut,top,[...compromise,.35],
     [70000,185000,310000,highCut],2700,5400))
  }
  add(candidate('five-plus-adult-'+top,top,[...compromise,.35],
     [70000,185000,310000,500000],3300,5400))
  add(candidate('five-saved-'+top,top,[.20,.25,.30,.35],
     [65000,150000,310000,500000],2700,5400))
 }
 // Independent schedule / credit combinations, retaining the 35% DBCFT parity.
 const rnd=rng(options.seed??20261108)
 const first=[.175,.185,.192,.20,.205]
 const second=[.255,.265,.275,.285,.295]
 const third=[.31,.325,.335,.345,.355,.375,.395,.415,.435]
 const cutsets=[[65000,150000,225000],[70000,150000,310000],
   [70000,185000,310000],[65000,185000,225000],[65000,185000,400000],
   [70000,185000,400000],[70000,225000,400000]]
 const creditsets=[[2700,5400],[3000,5400],[3300,5400],[2700,6000],
   [3300,6000],[2400,5400],[2700,4600],[3600,5400]]
 const max=options.maxCandidates??520
 for(let i=0;i<max*10&&list.size<max;i++){
  const top=topRates[Math.floor(rnd()*topRates.length)]!
  const a=first[Math.floor(rnd()*first.length)]!
  const b=second[Math.floor(rnd()*second.length)]!
  const c=third[Math.floor(rnd()*third.length)]!
  const cuts=cutsets[Math.floor(rnd()*cutsets.length)]!
  const credit=creditsets[Math.floor(rnd()*creditsets.length)]!
  if(top>.35 && rnd()<.48){
    const upper=Math.max(c,.35)
    const lowerCut=Math.max(cuts[2]!,310000)
    const highCut=[400000,500000,600000,750000,1000000][Math.floor(rnd()*5)]!
    if(lowerCut<highCut)
      add(candidate('random-five-'+i,top,[a,b,Math.min(upper,.35),.35],
        [cuts[0]!,cuts[1]!,lowerCut,highCut],credit[0]!,credit[1]!))
  } else {
    add(candidate('candidate-'+i,top,[a,b,c],cuts,credit[0]!,credit[1]!))
  }
 }
 // Targeted exact compromise-family top rates with extra Q1–Q4 options.
 for(const top of topRates){
  for(const third of [.325,.335,.345,.36,.375,.395,.415]){
   for(const cuts of [[70000,185000,225000],[70000,185000,310000],
     [70000,185000,400000],[65000,150000,310000]]){
    for(const cr of [[2700,5400],[3000,5400],[3300,5400],[2700,6000]]){
      add(candidate('local-'+top+'-'+third+'-'+cuts[2]+'-'+cr[0],
        top,[.185,.275,third],cuts,cr[0]!,cr[1]!))
      if(top>.35 && cuts[2]!<=310000){
        for(const upperCut of [400000,600000,1000000]){
          if(upperCut<=cuts[2]!)continue
          add(candidate('five-local-'+top+'-'+third+'-'+upperCut+'-'+cr[0]+'-'+cuts[2],
            top,[.185,.275,Math.min(.35,Math.max(.335,third)),.35],
            [...cuts,upperCut],cr[0]!,cr[1]!))
        }
      }
    }
   }
  }
 }
 const prescreen:HighTopRow[]=[]
 for(const d of list.values()){
  const p=apply(base,d),m=inc(p.tax),rev=net(p).netRevenue
  const row:HighTopRow={
    design:d,distribution:m,q1q4WinnersPct:bottom4(m,'winnersPct'),
    q1q4Lose1Pct:bottom4(m,'lose1Pct'),
    q1q4Lose5Pct:bottom4(m,'lose5Pct'),
    q1q4Gain20Pct:bottom4(m,'gain20Pct'),
    q4WinnersPct:m.byQuintile[3]!.winnersPct,
    q5Lose5Pct:m.byQuintile[4]!.lose5Pct,
    additionalRevenueBillions:rev-referenceRevenue,
    modelNetRevenueBillions:rev,policyLoss:0,labor:null,fiscal:null}
  row.policyLoss=policyScore(row)
  prescreen.push(row)
 }
 const baseline=prescreen.find(x=>x.design.id==='debt-only-4rate-35')!
 const sweep=topRates.map(t=>t===.35?baseline:prescreen.find(x=>x.design.id==='fixed-'+t)!)
 if(sweep.some(x=>!x))throw new Error('Missing fifth-rate reference design for a top-rate scenario')
 // Sort pool by both welfare and fiscal plausibility, with a verified
 // representative for each rate bucket / primary deficit cutoff.
 const eligible=prescreen.filter(x=>x.additionalRevenueBillions>=300)
 const selected=new Map<string,HighTopRow>()
 const select=(rows:HighTopRow[],count:number)=>{
  for(const r of rows.slice(0,count))selected.set(sig(r.design),r)
 }
 // Full rate sweep gets scored even if far short of balance.
 select(sweep,sweep.length)
 select([baseline],1)
 const pool=[...eligible].sort((a,b)=>a.policyLoss-b.policyLoss)
 select(pool,14)
 select([...eligible].sort((a,b)=>b.q1q4WinnersPct-a.q1q4WinnersPct),18)
 select([...eligible].sort((a,b)=>a.q1q4Lose5Pct-b.q1q4Lose5Pct),10)
 const targetBands=[[400,520],[520,600],[600,725],[725,925]]
 for(const [low,high] of targetBands)select(
  eligible.filter(x=>x.additionalRevenueBillions>=low&&x.additionalRevenueBillions<high)
    .sort((a,b)=>a.policyLoss-b.policyLoss),9)
 for(const t of topRates)select(
   eligible.filter(x=>x.design.topRate===t).sort((a,b)=>a.policyLoss-b.policyLoss),6)
 const fullMax=options.fullFiscalFinalists??85
 // Reserve capacity for fifth-rate designs at every top-rate tier and every
 // cutoff sensitivity, rather than letting the 4-rate candidate pool dominate.
 const fifthRows=[...eligible].filter(x=>x.design.brackets.length===5)
 select(fifthRows.sort((a,b)=>b.q1q4WinnersPct-a.q1q4WinnersPct),18)
 const shortlist=[...selected.values()].slice(0,Math.max(fullMax,sweep.length))
 const laborRate=base.health.employerFicaPassThroughRate
 for(const r of shortlist){
  const x=apply(base,r.design)
  const labor=calculateLaborResponse(x.tax,laborRate,
     base.personalAccounts.requiredContributionRate)
  r.labor={
   higherWedgeWorkersPct:100*labor.workerShareHigherWedge,
   higherPersonalRateWorkersPct:100*labor.workerShareHigherPersonalRate,
   higherLiquidWorkersPct:100*labor.workerShareHigherLiquidRate,
   wedgeChangePp:100*(labor.weightedReformMarginalRate-labor.weightedCurrentMarginalRate),
   personalRateChangePp:100*(labor.weightedReformPersonalMarginalRate-labor.weightedCurrentPersonalMarginalRate),
   liquidChangePp:100*(labor.weightedReformLiquidMarginalRate-labor.weightedCurrentPersonalMarginalRate),
   netWageLogChange:labor.netWageLogChange,
  }
  r.policyLoss=policyScore(r)
  const result=scoreCombined(x)
  const years=result.combined.years
  const at=(y:number)=>years.find(s=>s.year===y)!
  const primary=(y:number)=>at(y).primaryBalance/at(y).nominalGDP
  const peak=Math.max(...years.map(s=>s.endingDebtGDP))
  const end=at(2095).endingDebtGDP
  const first=years.find(s=>s.primaryBalance>=0)?.year??null
  r.fiscal={
   primary2030GDP:primary(2030),
   primary2032GDP:primary(2032),
   primary2035GDP:primary(2035),
   firstPrimarySurplusYear:first,
   peakDebtGDP:peak,debt2095GDP:end,
   meets2035Primary:primary(2035)>=0,
   meets2032Primary:primary(2032)>=0,
   meetsDebtTargets:peak<=1.50&&end<=.4+1e-8,
   passesAll2035:primary(2035)>=0&&peak<=1.50&&end<=.4+1e-8
  }
 }
 const scored=shortlist
 const fullBaseline=scored.find(x=>x.design.id==='debt-only-4rate-35')??baseline
 const fullyFeasible=scored.filter(x=>x.fiscal?.passesAll2035)
 const minQ4=options.minimumBottomFourWinnersPct??0
 const acceptable=fullyFeasible.filter(x=>x.q1q4WinnersPct>=minQ4)
 const byPolicy=[...acceptable].sort((a,b)=>a.policyLoss-b.policyLoss)
 const earlier=acceptable.filter(x=>x.fiscal!.firstPrimarySurplusYear!==null
   &&x.fiscal!.firstPrimarySurplusYear!<2035)
 const byTop=topRates.map(rate=>
   [...fullyFeasible].filter(x=>x.design.topRate===rate)
    .sort((a,b)=>b.q1q4WinnersPct-a.q1q4WinnersPct||a.policyLoss-b.policyLoss)[0]??null)
 const staticRateSensitivity=topRates.map(t=>{
   const baseRow=sweep.find(x=>x.design.topRate===t)!
   const adjusted=(e:number)=>{
    const ratio=Math.pow((1-t)/(.65),e)
    return baseRow.additionalRevenueBillions-t*businessBase*(1-ratio)
   }
   return {topRate:t,staticRevenueDeltaBillions:baseRow.additionalRevenueBillions,
     adjustedRevenueDeltaBillions:{e020:adjusted(.2),e050:adjusted(.5),e080:adjusted(.8)}}
 })
 return {
  assumptions:{topRates,noncompliance:base.tax.noncomplianceRate,
    rothContribution:base.personalAccounts.requiredContributionRate,
    acaTransitionShare:base.health.esiAcaTransitionShare??0,
    businessWageTopParity:true,baselineBusinessTaxableBaseBillions:businessBase,
    fiscalScreen:{deadline:2035,terminalDebtGDP:.40,peakDebtGDP:1.50}},
  candidateCount:list.size,prelimEligible:eligible.length,fiscalScored:scored.length,
  baseline:fullBaseline,rateSweep:sweep,bestByTopRate:byTop,
  best2035:byPolicy[0]??null,
  best2032:earlier.sort((a,b)=>a.policyLoss-b.policyLoss)[0]??null,
  bestFasterThanBaseline:[...fullyFeasible].sort((a,b)=>
    (a.fiscal!.firstPrimarySurplusYear??2100)-(b.fiscal!.firstPrimarySurplusYear??2100)
       ||a.policyLoss-b.policyLoss)[0]??null,
  frontier2035:nonDominated(acceptable,18),
  fiveRateFrontier:nonDominated(acceptable.filter(x=>x.design.brackets.length===5),18),
  frontierDebtOnly:nonDominated(scored.filter(x=>x.fiscal?.meetsDebtTargets),18),
  closestPrimary:[...scored].sort((a,b)=>
    Math.max(0,-a.fiscal!.primary2035GDP)*1000
    -Math.max(0,-b.fiscal!.primary2035GDP)*1000
    ||a.policyLoss-b.policyLoss).slice(0,12),
  staticRateSensitivity
 }
}
