import { describe, expect, it } from 'vitest'
import saved from './fixtures/paretoSavedTaxReform2026.json'
import type { CombinedPolicy } from '../src/model/combined'
import { searchHighTopRates } from '../src/model/optimizeTopRate'

describe('Five-rate 40% DBCFT/wage top optimizer',()=>{
 it('maximizes Q1–Q4 consumption winners subject to 2035 primary balance',()=>{
  const policy=saved.scenario.policy as CombinedPolicy
  const out=searchHighTopRates(policy,{
   seed:20261108,fixedTopRate:.40,fiveOnly:true,
   maxCandidates:1000,fullFiscalFinalists:90,
   targetAdditionalRevenueBillions:[495,525,550,570,590,625,660],
  })
  expect(out.assumptions.topRates).toEqual([.35,.40])
  expect(out.rateSweep).toHaveLength(2)
  expect(out.baseline.design.topRate).toBe(.35)
  expect(out.fiscalScored).toBeGreaterThan(55)
  for(const r of [...out.frontier2035,...out.frontierDebtOnly]){
    expect(r.design.topRate===.40||r.design.id==='debt-only-4rate-35').toBe(true)
    if(r.design.topRate===.40){
      expect(r.design.brackets).toHaveLength(5)
      expect(r.design.brackets[3]!.rate).toBe(.35)
      expect(r.design.brackets[4]!.rate).toBe(.40)
    }
    if(r.fiscal?.passesAll2035){
      expect(r.fiscal.primary2035GDP).toBeGreaterThanOrEqual(0)
      expect(r.fiscal.debt2095GDP).toBeLessThanOrEqual(.4000001)
    }
  }
  const fmt=(r:typeof out.baseline|null)=>{
    if(!r)return null
    return{
      id:r.design.id,rates:r.design.brackets.map(x=>x.rate),
      cuts:r.design.brackets.slice(0,-1).map(x=>x.upperPerAdult),
      adult:r.design.adultCredit,child:r.design.childCredit,
      extraRevenueB:r.additionalRevenueBillions,
      q1q4:{winners:r.q1q4WinnersPct,loss1:r.q1q4Lose1Pct,
        loss5:r.q1q4Lose5Pct,gain20:r.q1q4Gain20Pct},
      q4Winners:r.q4WinnersPct,q5Loss5:r.q5Lose5Pct,
      overallWinners:r.distribution.winnersPct,
      overallLoss5:r.distribution.lose5Pct,
      quintiles:r.distribution.byQuintile,labor:r.labor,fiscal:r.fiscal,
      score:r.policyLoss,
    }
  }
  console.log('FIVE_RATE_40_PARETO_RESULTS_JSON='+JSON.stringify({
   assumptions:out.assumptions,
   counts:{candidates:out.candidateCount,screened:out.prelimEligible,fiscals:out.fiscalScored,
     strictFrontier:out.frontier2035.length},
   baseline:fmt(out.baseline),
   fixed40:fmt(out.rateSweep[1]!),
   best2035:fmt(out.best2035),
   best2032:fmt(out.best2032),
   bestPrimaryFast:fmt(out.bestFasterThanBaseline),
   frontier2035:out.frontier2035.slice(0,16).map(fmt),
   frontierDebtOnly:out.frontierDebtOnly.slice(0,12).map(fmt),
   nearPrimary:out.closestPrimary.slice(0,10).map(fmt),
   sensitivity:out.staticRateSensitivity
  }))
 },600000)
})
