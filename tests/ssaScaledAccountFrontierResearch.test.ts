/**
 * SSA 2026 scaled-workers + PIA vs funded accounts and flat transition.
 * Sources: OCACT Note 2026.3 Tables 1 & 6 and SSA Trustees 2026 Table V.C7.
 * This is a cohort archetype study, NOT nationally representative incidence.
 */
import {describe,it,expect} from 'vitest'
import {defaultCombinedPolicy} from '../src/model/combined'
import {scaledWorkerClasses,scaledWorkerEarnings,scaledWorkerRetirementBenefit,
 piaBendPoints,scaledFactor,primaryInsuranceAmount} from '../src/model/ssaScaledWorkers'
import type {ScaledWorkerClass} from '../src/model/ssaScaledWorkers'
import {accountAnnuityFactor,accountBalanceAtClaim} from '../src/model/personalAccountReform'
import {socialSecurityBenefitShares,flatBenefitNominal} from '../src/model/socialSecurity'
import {populationMillions} from '../src/model/demographics'
import {calculateHousehold} from '../src/tax/model/household'
import {defaultAssumptions} from '../src/model/defaults'
import type {ModelAssumptions} from '../src/model/types'

const ages=[20,25,30,35,40,45,50,55,60,65] as const
const floors=[1.25,1.5,1.75,2] as const
const rates=[.04,.055,.065,.08,.10,.12] as const
const transitions=[20,35,50] as const
const defaultTax={...defaultCombinedPolicy.tax,progressiveWageBrackets:[
 {upperPerAdult:15000,rate:.10},{upperPerAdult:60000,rate:.20},
 {upperPerAdult:220000,rate:.25},{upperPerAdult:275000,rate:.30},
 {upperPerAdult:null,rate:.35},
]}
const assumptions:ModelAssumptions={...defaultCombinedPolicy.assumptions,
 socialSecurityClaimAge:70,fullRetirementAge:70,
 socialSecurityInitialBenefitMode:'flatTransition'}
const weightByClass:Record<ScaledWorkerClass,number>={
 veryLow:.186,low:.235,medium:.302,high:.199
}
// From SSA Note 2026.3 Table 1, nearest AIME groups: 18.6/23.5/30.2/19.9%.
// The unmodeled maximum-earner group comprises 7.8%; only 7.7% of the high
// group (of its 19.9 total) is included in the lowest 80%.
const lower80WeightByClass:Record<ScaledWorkerClass,number>={
 veryLow:.186,low:.235,medium:.302,high:.077
}
const round=(n:number)=>Math.round(n*100)/100
type Worker={
 age2026:number;tier:ScaledWorkerClass;weight:number;bottom80Weight:number;
 annual2026:number;birth:number;claimYear:number;
 baseline:number;coveredEarnings:ReturnType<typeof scaledWorkerEarnings>;
 annualAnnuityByRate:Map<number,number>;workingTaxDifference:number
}
const workers:Worker[]=[]
for(const age of ages){
 const birth=2026-age
 for(const tier of scaledWorkerClasses){
  const record=scaledWorkerEarnings(birth,tier,assumptions)
  const baseline=scaledWorkerRetirementBenefit(birth,tier,70,assumptions).annualAtClaim
  const annual2026=record.find(r=>r.year===2026)?.coveredEarnings??0
  const workingTaxDifference=calculateHousehold(
    {filingStatus:'single',cashWage:annual2026,children:0},defaultTax
  ).dollarChange
  const annualAnnuityByRate=new Map<number,number>()
  for(const rate of rates){
   const balance=accountBalanceAtClaim(birth,70,assumptions,{
     enabled:true,requiredContributionRate:rate,
     expectedRealReturn:.04,governmentMatchCap2026:0,
   },(year,workAge)=>{
      const annual=record.find(x=>x.year===year)?.coveredEarnings??0
      return workAge>=21&&workAge<=64?annual*rate:0
   })
   const annuity=balance/accountAnnuityFactor(birth,70,assumptions)
   annualAnnuityByRate.set(rate,annuity)
  }
  const pop=populationMillions(2026,age,assumptions)
  workers.push({age2026:age,tier,weight:pop*weightByClass[tier],
   bottom80Weight:pop*lower80WeightByClass[tier],annual2026,birth,
   claimYear:birth+70,baseline,coveredEarnings:record,
   annualAnnuityByRate,workingTaxDifference})
 }
}
const weight=workers.reduce((s,w)=>s+w.weight,0)
const b80weight=workers.reduce((s,w)=>s+w.bottom80Weight,0)
function grid(){
 const out=[]
 for(const years of transitions)for(const floor of floors)for(const rate of rates){
  const a={...assumptions,benefitPhaseInYears:years,flatBenefitFPLMultiple:floor}
  let protectedWeight=0,protectedLowerWeight=0,protectedWorkingWeight=0
  let shortfallSum=0,lossWeight=0,meanLossAmongLosers=0,retirementValueSum=0
  const byTier=scaledWorkerClasses.map(tier=>{
    const group=workers.filter(w=>w.tier===tier)
    let sum=0,protectedWeightTier=0,total=0
    for(const w of group){
      const {flatShare,legacyShare}=socialSecurityBenefitShares(w.claimYear,a)
      const publicPromise=w.baseline*legacyShare+
        flatBenefitNominal(w.claimYear,w.claimYear,a)*flatShare
      const reform=Math.max(publicPromise,w.annualAnnuityByRate.get(rate)!)
      const delta=reform/w.baseline-1
      sum+=delta*w.weight;total+=w.weight
      if(delta>=-1e-9)protectedWeightTier+=w.weight
    }
    return {tier,meanNetChangePct:round(100*sum/total),
     heldHarmlessPct:round(100*protectedWeightTier/total)}
  })
  const cellRows=[]
  for(const w of workers){
   const {flatShare,legacyShare}=socialSecurityBenefitShares(w.claimYear,a)
   const pensionFloor=flatBenefitNominal(w.claimYear,w.claimYear,a)
   const scheduledPublic=legacyShare*w.baseline+flatShare*pensionFloor
   const annuity=w.annualAnnuityByRate.get(rate)!
   const reform=Math.max(scheduledPublic,annuity)
   const pct=100*(reform/w.baseline-1)
   const working=w.workingTaxDifference-w.annual2026*rate
   const protectedRetirement=pct>=-1e-7
   if(protectedRetirement){protectedWeight+=w.weight;protectedLowerWeight+=w.bottom80Weight}
   if(working>=-1e-7)protectedWorkingWeight+=w.bottom80Weight
   if(pct<0){shortfallSum+=w.weight*(-pct);meanLossAmongLosers+=w.weight*(-pct);lossWeight+=w.weight}
   retirementValueSum+=(reform-w.baseline)*w.weight
   cellRows.push({age2026:w.age2026,tier:w.tier,yearAt70:w.claimYear,
     annualEarnings2026:Math.round(w.annual2026),baselineBenefitAt70:Math.round(w.baseline),
     accountAnnuityAt70:Math.round(annuity),publicPromiseAt70:Math.round(scheduledPublic),
     reformedBenefitAt70:Math.round(reform),changePercent:round(pct),
     workingCashDifference2026:Math.round(working)})
  }
  out.push({years,floor,rate,heldHarmlessBottom80Pct:round(100*protectedLowerWeight/b80weight),
   heldHarmlessModeledWorkersPct:round(100*protectedWeight/weight),
   workingHeldHarmlessBottom80Pct:round(100*protectedWorkingWeight/b80weight),
   averageLossAcrossModeledWorkersPct:round(shortfallSum/weight),
   averageLossAmongLosersPct:round(meanLossAmongLosers/(lossWeight||1)),
   averageNetBenefitChangePct:round(100*retirementValueSum/
       workers.reduce((s,w)=>s+w.weight*w.baseline,0)),
   byTier,cellRows})
 }
 return out
}
describe('2026 SSA scaled earnings and retirement account frontier',()=>{
 it('validates 2026 PIA bends and the published Table 6 age profile',()=>{
  expect(piaBendPoints(2026,defaultAssumptions)).toEqual({first:1286,second:7749})
  expect(piaBendPoints(2027,defaultAssumptions)).toEqual({first:1340,second:8077})
  expect(scaledFactor(21,'medium')).toBeCloseTo(.276,2)
  expect(scaledFactor(49,'high')).toBeCloseTo(1.749,2)
  const refs={veryLow:11954,low:15659,medium:25846,high:34157}
  const compares=scaledWorkerClasses.map(tier=>{
    const computed=scaledWorkerRetirementBenefit(1961,tier,65,assumptions).annualAtClaim
    return {tier,ssaTrustees2026Age65:refs[tier],
      modeledAge65:Math.round(computed),gapPct:round(100*(computed/refs[tier]-1))}
  })
  console.log('SSA_VALIDATION_JSON='+JSON.stringify(compares))
  // Differences may arise from CPI assumptions, projected 2026 AWI and PIA rounding.
  for(const x of compares)expect(Math.abs(x.gapPct)).toBeLessThan(12)
 },45000)
 it('tests 72 policy combinations over 40 SSA scaled-cohort cells',()=>{
  const all=grid()
  expect(all).toHaveLength(72)
  console.log('SSA_SCALED_ACCOUNT_GRID_JSON='+JSON.stringify(all))
 },120000)
})
