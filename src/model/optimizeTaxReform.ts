/**
 * Constrained, reproducible multi-objective wage X-tax optimizer.
 *
 * Hard constraints: 35% business = top wage rate; broad cash-flow base;
 * unchanged health and spending rules; fixed new Roth contribution and
 * noncompliance; coherent nondecreasing 4/5-rate ladders.
 *
 * Constraints on the fully scored simulation: federal primary balance >=0
 * by 2035; 2095 debt <=40% GDP; peak debt <=150% GDP. No outside
 * revenue adjustment is used to satisfy these tests.
 *
 * Scores distinguish (1) employer-inclusive economic wedge, (2) statutory
 * personal marginal rate, and (3) current consumption after mandatory Roth
 * saving. The working model cannot capture ACA PTC clawback MTRs.
 * This is a seeded heuristic/Pareto search, not a global-optimality proof.
 */
import { scoreCombined, type CombinedPolicy } from './combined'
import { calculateMacro } from '../tax/model/macro'
import { calculateHealthAnalysis } from '../tax/model/health'
import { calculateFederalProgramSavings } from '../tax/model/transfers'
import { prepareTaxSearchConsumption, type TaxSearchConsumptionMetrics } from '../tax/model/consumptionAudit'
import { calculateLaborResponse, type LaborResponseResult } from '../tax/model/laborResponse'
import type { ReformSettings, WageBracket } from '../tax/model/types'

export interface OptimizerOptions {
  seed?:number
  candidates?:number
  laborFinalists?:number
  fiscalFinalists?:number
  debtTargetGDP?:number
  debtPeakGDP?:number
  primaryBalanceDeadline?:number
  /** Minimum added annual net X-tax revenue before full fiscal verification. */
  minimumRevenueDeltaBillions?:number
}
export interface TaxOptimizationCandidate {
  id:string
  brackets:WageBracket[]
  adultCredit:number
  childCredit:number
  adultCreditPhaseInRate:number
  childCreditPhaseInRate:number
}
export interface TaxOptimizationReportRow {
  candidate:TaxOptimizationCandidate
  distribution:TaxSearchConsumptionMetrics
  netRevenueBillions:number
  revenueDeltaBillions:number
  labor: {
    higherWedgePct:number
    higherPersonalRatePct:number
    wedgeChangePp:number
    personalRateChangePp:number
    netWageLogChange:number
  } | null
  balancedScore:number
  balancedRank?:number
  fiscal: {
    passes:boolean
    primaryBalance2035GDP:number
    firstPrimarySurplusYear:number|null
    peakDebtGDP:number
    debt2095GDP:number
    openingFiscalImprovementGDP:number
  } | null
}
export interface TaxOptimizationResult {
  inputs:{
    seed:number;candidates:number;laborFinalists:number;fiscalFinalists:number
    fixedBusinessRate:number;fixedRothRate:number;noncomplianceRate:number
    fixedAcaTransitionShare:number;fiscalCriteria:{debtTargetGDP:number;peakDebtGDP:number;primaryBalanceDeadline:number}
  }
  baseline:TaxOptimizationReportRow
  prescreenCount:number
  eligibleLaborCount:number
  fullyScoredCount:number
  feasibleCount:number
  leaders:{
    balanced:TaxOptimizationReportRow|null
    minimumSevereLosses:TaxOptimizationReportRow|null
    maximumWinners:TaxOptimizationReportRow|null
    strongerWorkIncentives:TaxOptimizationReportRow|null
    minimumBigWinners:TaxOptimizationReportRow|null
    fiveRate:TaxOptimizationReportRow|null
    maximumRevenue:TaxOptimizationReportRow|null
  }
  frontier:TaxOptimizationReportRow[]
  bestNearFeasible:TaxOptimizationReportRow[]
}

const compact=(v:number)=>Math.round(v*1e5)/1e5
const pick=(rng:()=>number,values:readonly number[])=>values[Math.floor(rng()*values.length)]!
function seeded(seed:number):()=>number {
  let v=seed|0
  return ()=>{v=(v+0x6d2b79f5)|0;let x=v;x=Math.imul(x^(x>>>15),x|1)
    x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296}
}
const brackets=(rates:number[],cuts:number[]):WageBracket[]=>rates.map((rate,i)=>({
  rate,upperPerAdult:i===rates.length-1?null:cuts[i]!,
}))
const signature=(c:TaxOptimizationCandidate)=>[
  c.brackets.map(x=>((x.rate*1000)|0)+':'+x.upperPerAdult).join('/'),
  c.adultCredit,c.childCredit,c.adultCreditPhaseInRate,c.childCreditPhaseInRate].join('|')
function coherent(c:TaxOptimizationCandidate):boolean {
 const b=c.brackets
 if(b.length<4||b.length>5||b.at(-1)!.rate!==.35||b.at(-1)!.upperPerAdult!==null)return false
 let previous=0,lower=0
 for(let i=0;i<b.length;i++){
  if(b[i]!.rate<previous || b[i]!.rate>.35 || (i>0 && b[i]!.rate-previous>.125))return false
  if(i<b.length-1){
    if(b[i]!.upperPerAdult===null||b[i]!.upperPerAdult!<=lower)return false
    lower=b[i]!.upperPerAdult!
  }
  previous=b[i]!.rate
 }
 return c.childCredit>=0 && c.adultCredit>=0
}
function mkCandidate(
 id:string,rates:number[],cuts:number[],adultCredit:number,childCredit:number,
 adultCreditPhaseInRate=.20,childCreditPhaseInRate=.20,
):TaxOptimizationCandidate {
 return {id,brackets:brackets(rates,cuts),adultCredit,childCredit,
  adultCreditPhaseInRate,childCreditPhaseInRate}
}
function schedule(base:CombinedPolicy,c:TaxOptimizationCandidate):CombinedPolicy {
 const tax:ReformSettings={...base.tax,rate:.35,wageTaxMode:'progressive',
  progressiveWageBrackets:c.brackets.map(b=>({...b})),
  adultCredit:c.adultCredit,childCredit:c.childCredit,
  adultCreditPhaseInRate:c.adultCreditPhaseInRate,
  childCreditPhaseInRate:c.childCreditPhaseInRate,
 }
 return {...base,tax}
}
function randomCandidate(rng:()=>number,i:number):TaxOptimizationCandidate {
 const five=rng()<.34
 let rates:number[],cuts:number[]
 if(five){
  rates=[pick(rng,[.075,.10,.125]),pick(rng,[.175,.19,.20,.215]),
    pick(rng,[.235,.25,.265,.28]),pick(rng,[.285,.30,.315,.33]),.35]
  cuts=[pick(rng,[10000,17000,25000]),pick(rng,[50000,65000,75000]),
    pick(rng,[120000,150000,185000,220000]),pick(rng,[184500,250000,310000])]
 } else {
  rates=[pick(rng,[.175,.185,.192,.20,.21,.22]),
    pick(rng,[.235,.25,.26,.275,.285]),pick(rng,[.29,.30,.315,.33]),.35]
  cuts=[pick(rng,[45000,55000,65000,70000,80000]),
    pick(rng,[110000,150000,185000,220000]),
    pick(rng,[184500,250000,310000,350000])]
 }
 return mkCandidate('seed-'+i,rates,cuts,
   pick(rng,[1800,2100,2400,2700,3000,3300]),
   pick(rng,[4000,4600,5000,5400,5800,6200]),
   pick(rng,[.15,.20]),pick(rng,[.15,.20,.25]))
}
function assessLabor(l:LaborResponseResult):NonNullable<TaxOptimizationReportRow['labor']> {
 return {
  higherWedgePct:100*l.workerShareHigherWedge,
  higherPersonalRatePct:100*l.workerShareHigherPersonalRate,
  wedgeChangePp:100*(l.weightedReformMarginalRate-l.weightedCurrentMarginalRate),
  personalRateChangePp:100*(l.weightedReformPersonalMarginalRate-l.weightedCurrentPersonalMarginalRate),
  netWageLogChange:l.netWageLogChange,
 }
}
function score(row:TaxOptimizationReportRow):number {
 const d=row.distribution,l=row.labor
 // Not a social welfare function; a transparent political/policy target.
 return d.lose5Pct*7+d.lose10Pct*9+d.lose1Pct*.6
   +d.gain20Pct*.8 +d.gain40Pct*.75
   +d.meanClippedDeviationFrom2Pct*.35
   +Math.max(0,65-d.winnersPct)*2.3
   +d.byQuintile.slice(0,3).reduce((s,q)=>s+q.lose5Pct*1.8,0)
   +(l?l.higherWedgePct*.14+l.higherPersonalRatePct*.16
      +Math.max(0,l.wedgeChangePp)*2.0+Math.max(0,l.personalRateChangePp)*1.2:0)
}
function laborPriority(row:TaxOptimizationReportRow):number {
 const d=row.distribution
 return d.lose5Pct*7+d.lose10Pct*8+d.lose1Pct*.5
   +d.gain20Pct*.7+d.gain40Pct*.6+d.meanClippedDeviationFrom2Pct*.3
   +Math.max(0,65-d.winnersPct)*2.1
   +d.byQuintile.slice(0,3).reduce((s,q)=>s+q.lose5Pct,0)
}
function nonDominated(candidates:TaxOptimizationReportRow[]):TaxOptimizationReportRow[] {
 const dims=(x:TaxOptimizationReportRow)=>[
  x.distribution.lose5Pct,x.distribution.lose1Pct,x.distribution.gain20Pct,
  100-x.distribution.winnersPct,x.labor?.higherWedgePct??100,
  x.labor?.higherPersonalRatePct??100,
 ]
 return candidates.filter(a=>!candidates.some(b=>{
  if(a===b)return false
  const x=dims(a),y=dims(b)
  return y.every((v,i)=>v<=x[i]!+1e-7)&&y.some((v,i)=>v<x[i]!-1e-7)
 })).sort((a,b)=>a.balancedScore-b.balancedScore)
}

export function optimizeTaxReform(
 saved:CombinedPolicy,opts:OptimizerOptions={},
):TaxOptimizationResult {
 const seed=opts.seed??20261108,n=opts.candidates??180
 const laborFinalists=opts.laborFinalists??36,fiscalFinalists=opts.fiscalFinalists??12
 const debtTargetGDP=opts.debtTargetGDP??.40,debtPeakGDP=opts.debtPeakGDP??1.50
 const primaryBalanceDeadline=opts.primaryBalanceDeadline??2035
 const minRevenueDelta=opts.minimumRevenueDeltaBillions??-50
 if(Math.abs(saved.tax.rate-.35)>1e-10||saved.tax.noncomplianceRate<=0)
   throw new Error('Use a saved policy with fixed 35% DBCFT rate and explicit compliance assumption')
 if(!saved.personalAccounts.enabled)throw new Error('Retirement-prefunding deposits must be enabled')
 const base:CombinedPolicy={...saved,health:{
   ...saved.health,replaceAcaAptc:false,nonPolicyholderTreatment:'continueFamilyPolicy',
   esiAcaTransitionShare:saved.health.esiAcaTransitionShare??0,
 }}
 const reference=prepareTaxSearchConsumption(base.tax,base.health,base.personalAccounts)
 const health=calculateHealthAnalysis(base.tax,base.health)
 const insuranceCreditCost=health.totalHealthCreditCostBillions
 const federalTransferSavings=calculateFederalProgramSavings(base.transfers)
   +health.estimatedExistingAptcSavingsBillions
 const macro=(p:CombinedPolicy)=>calculateMacro(p.tax,{insuranceCreditCost,federalTransferSavings})
 const referenceRevenue=macro(base).netRevenue
 const savedBrackets=base.tax.progressiveWageBrackets??[]
 const savedCandidate:TaxOptimizationCandidate={
  id:'saved',brackets:savedBrackets.map(b=>({...b})),
  adultCredit:base.tax.adultCredit,childCredit:base.tax.childCredit,
  adultCreditPhaseInRate:base.tax.adultCreditPhaseInRate,
  childCreditPhaseInRate:base.tax.childCreditPhaseInRate,
 }
 const rng=seeded(seed),candidateMap=new Map<string,TaxOptimizationCandidate>()
 const put=(candidate:TaxOptimizationCandidate)=>{
  if(!coherent(candidate))return
  const key=signature(candidate)
  if(!candidateMap.has(key))candidateMap.set(key,candidate)
 }
 put(savedCandidate)
 put(mkCandidate('A', [.195,.25,.30,.35],[65000,150000,185000],2700,5400))
 put(mkCandidate('B', [.20,.25,.30,.35],[65000,150000,170000],3000,5400))
 put(mkCandidate('C', [.192,.255,.33,.35],[65000,150000,250000],2700,5400))
 put(mkCandidate('five-rate-classic',[.075,.175,.25,.30,.35],[17000,65000,150000,250000],2700,5400))
 put(mkCandidate('four-rate-low',[.175,.25,.30,.35],[70000,185000,275000],2400,5400))
 for(let i=0;i<n*4&&candidateMap.size<n;i++)put(randomCandidate(rng,i))
 const prelim:TaxOptimizationReportRow[]=[]
 for(const candidate of candidateMap.values()){
  const p=schedule(base,candidate),distribution=reference(p.tax)
  const netRevenueBillions=macro(p).netRevenue
  prelim.push({candidate,distribution,netRevenueBillions,
   revenueDeltaBillions:netRevenueBillions-referenceRevenue,labor:null,
   balancedScore:0,fiscal:null})
 }
 const revenueEligible=prelim.filter(r=>r.revenueDeltaBillions>=minRevenueDelta)
 const eligible=revenueEligible.length>0?revenueEligible:prelim
 const firstRank=[...eligible].sort((a,b)=>laborPriority(a)-laborPriority(b))
 const byWins=[...eligible].sort((a,b)=>b.distribution.winnersPct-a.distribution.winnersPct)
 const byLoss=[...eligible].sort((a,b)=>a.distribution.lose5Pct-b.distribution.lose5Pct)
 const byGentle=[...eligible].sort((a,b)=>a.distribution.gain20Pct-b.distribution.gain20Pct)
 const byRevenue=[...eligible].sort((a,b)=>b.netRevenueBillions-a.netRevenueBillions)
 const byRateFive=[...eligible].filter(r=>r.candidate.brackets.length===5)
   .sort((a,b)=>laborPriority(a)-laborPriority(b))
 const selected=new Map<string,TaxOptimizationReportRow>()
 const select=(xs:TaxOptimizationReportRow[],count:number)=>{
  for(const c of xs.slice(0,count))selected.set(signature(c.candidate),c)
 }
 select(firstRank,Math.ceil(laborFinalists*.4))
 select(byWins,Math.ceil(laborFinalists*.16))
 select(byLoss,Math.ceil(laborFinalists*.15))
 select(byGentle,Math.ceil(laborFinalists*.12))
 select(byRevenue,Math.ceil(laborFinalists*.13))
 select(byRateFive,Math.ceil(laborFinalists*.12))
 select(prelim.filter(r=>r.candidate.id==='saved'),1)
 const laborRows=[...selected.values()]
 for(const r of laborRows){
  r.labor=assessLabor(calculateLaborResponse(schedule(base,r.candidate).tax,
     base.health.employerFicaPassThroughRate))
  r.balancedScore=score(r)
 }
 laborRows.sort((a,b)=>a.balancedScore-b.balancedScore)
 const full=new Map<string,TaxOptimizationReportRow>()
 const include=(xs:TaxOptimizationReportRow[],count:number)=>{
  for(const r of xs.slice(0,count))full.set(signature(r.candidate),r)
 }
 include(laborRows,Math.ceil(fiscalFinalists*.40))
 include([...laborRows].sort((a,b)=>a.distribution.lose5Pct-b.distribution.lose5Pct),
  Math.ceil(fiscalFinalists*.12))
 include([...laborRows].sort((a,b)=>b.distribution.winnersPct-a.distribution.winnersPct),
  Math.ceil(fiscalFinalists*.12))
 include([...laborRows].sort((a,b)=>(a.labor!.higherWedgePct+a.labor!.higherPersonalRatePct)-
   (b.labor!.higherWedgePct+b.labor!.higherPersonalRatePct)),Math.ceil(fiscalFinalists*.15))
 include([...laborRows].sort((a,b)=>b.netRevenueBillions-a.netRevenueBillions),
  Math.ceil(fiscalFinalists*.08))
 include(laborRows.filter(r=>r.candidate.brackets.length===5),2)
 include(laborRows.filter(r=>r.candidate.id==='saved'),1)
 const verified=[...full.values()]
 for(const r of verified){
  const s=scoreCombined(schedule(base,r.candidate))
  const ys=s.combined.years
  const checkpoint=ys.find(row=>row.year===primaryBalanceDeadline)
  const y2095=ys.find(row=>row.year===2095)
  if(!checkpoint||!y2095)throw new Error('Saved scenario is missing primary or terminal fiscal year')
  const peak=Math.max(...ys.filter(row=>row.year<=2095).map(row=>row.endingDebtGDP))
  const firstPrimarySurplusYear=ys.find(row=>
    row.year<=primaryBalanceDeadline&&row.primaryBalance>=0)?.year??null
  const passes=checkpoint.primaryBalance>=0 &&
    y2095.endingDebtGDP<=debtTargetGDP+1e-8&&peak<=debtPeakGDP+1e-8
  r.fiscal={passes,
    primaryBalance2035GDP:checkpoint.primaryBalance/checkpoint.nominalGDP,
    firstPrimarySurplusYear,peakDebtGDP:peak,
    debt2095GDP:y2095.endingDebtGDP,
    openingFiscalImprovementGDP:s.openingFiscalImprovementGDP}
 }
 const feasible=verified.filter(r=>r.fiscal?.passes)
 const leadersFrom=feasible.length>0?feasible:verified
 const best=(sort:(a:TaxOptimizationReportRow,b:TaxOptimizationReportRow)=>number,
     filter?:(r:TaxOptimizationReportRow)=>boolean)=>{
   return [...leadersFrom].filter(filter??(()=>true)).sort(sort)[0]??null
 }
 const rank=(r:TaxOptimizationReportRow)=>r.balancedScore
 const baseline=prelim.find(r=>r.candidate.id==='saved')!
 baseline.labor=assessLabor(calculateLaborResponse(base.tax,base.health.employerFicaPassThroughRate))
 baseline.balancedScore=score(baseline)
 // The baseline must receive a full score whether or not it made the shortlist.
 if(!baseline.fiscal){
  const y=scoreCombined(base).combined.years
  const c=y.find(z=>z.year===primaryBalanceDeadline)!,tail=y.find(z=>z.year===2095)!
  const peak=Math.max(...y.map(z=>z.endingDebtGDP))
  baseline.fiscal={passes:c.primaryBalance>=0&&tail.endingDebtGDP<=debtTargetGDP&&peak<=debtPeakGDP,
   primaryBalance2035GDP:c.primaryBalance/c.nominalGDP,
   firstPrimarySurplusYear:y.find(z=>z.year<=primaryBalanceDeadline&&z.primaryBalance>=0)?.year??null,
   peakDebtGDP:peak,debt2095GDP:tail.endingDebtGDP,openingFiscalImprovementGDP:0}
 }
 const near=[...verified].sort((a,b)=>{
  const violation=(r:TaxOptimizationReportRow)=>Math.max(0,r.fiscal!.debt2095GDP-debtTargetGDP)*300
    +Math.max(0,r.fiscal!.peakDebtGDP-debtPeakGDP)*150
    +Math.max(0,-r.fiscal!.primaryBalance2035GDP)*1000
  return violation(a)-violation(b)||rank(a)-rank(b)
 })
 const frontier=nonDominated(leadersFrom)
 return{
  inputs:{seed,candidates:candidateMap.size,laborFinalists:laborRows.length,
    fiscalFinalists:verified.length,fixedBusinessRate:.35,
    fixedRothRate:base.personalAccounts.requiredContributionRate,
    noncomplianceRate:base.tax.noncomplianceRate,
    fixedAcaTransitionShare:base.health.esiAcaTransitionShare??0,
    fiscalCriteria:{debtTargetGDP,peakDebtGDP:debtPeakGDP,primaryBalanceDeadline}},
  baseline,prescreenCount:prelim.length,eligibleLaborCount:eligible.length,
  fullyScoredCount:verified.length,feasibleCount:feasible.length,
  leaders:{
   balanced:best((a,b)=>rank(a)-rank(b)),
   minimumSevereLosses:best((a,b)=>a.distribution.lose5Pct-b.distribution.lose5Pct),
   maximumWinners:best((a,b)=>b.distribution.winnersPct-a.distribution.winnersPct),
   strongerWorkIncentives:best((a,b)=>((a.labor!.higherWedgePct+a.labor!.higherPersonalRatePct)
      -(b.labor!.higherWedgePct+b.labor!.higherPersonalRatePct))),
   minimumBigWinners:best((a,b)=>a.distribution.gain20Pct-b.distribution.gain20Pct),
   fiveRate:best((a,b)=>rank(a)-rank(b),r=>r.candidate.brackets.length===5),
   maximumRevenue:best((a,b)=>b.netRevenueBillions-a.netRevenueBillions),
  },frontier:frontier.slice(0,20),bestNearFeasible:near.slice(0,5),
 }
}
