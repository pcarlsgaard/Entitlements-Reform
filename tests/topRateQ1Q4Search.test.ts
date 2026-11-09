import { describe, expect, it } from 'vitest'
import saved from './fixtures/paretoSavedTaxReform2026.json'
import type { CombinedPolicy } from '../src/model/combined'
import { searchHighTopRates } from '../src/model/optimizeTopRate'

describe('Higher equal DBCFT and wage top rates: Q1–Q4 winners versus primary balance',()=>{
  it('runs a seeded multicriteria rate search and full fiscal validations',()=>{
    const p=saved.scenario.policy as CombinedPolicy
    const results=searchHighTopRates(p,{
      seed:20261108,maxCandidates:580,
      fullFiscalFinalists:68,
      minimumBottomFourWinnersPct:0,
    })
    expect(results.assumptions.businessWageTopParity).toBe(true)
    expect(results.assumptions.noncompliance).toBeCloseTo(.05)
    expect(results.assumptions.rothContribution).toBeCloseTo(.065)
    expect(results.candidateCount).toBeGreaterThan(200)
    expect(results.fiscalScored).toBeGreaterThanOrEqual(45)
    expect(results.rateSweep).toHaveLength(9)
    for(const r of results.rateSweep){
      expect(r.design.brackets.at(-1)!.rate).toBe(r.design.topRate)
      expect(r.fiscal).not.toBeNull()
      if(r.design.topRate>.35){
        expect(r.design.brackets).toHaveLength(5)
        expect(r.design.brackets[3]!.rate).toBe(.35)
        expect(r.design.brackets[3]!.upperPerAdult).toBe(500000)
      }
    }
    expect(results.rateSweep[0]!.design.brackets).toHaveLength(4)
    expect(results.rateSweep[8]!.design.topRate).toBe(.55)
    for(const r of [...results.frontier2035,...results.frontierDebtOnly]){
      expect(r.design.brackets.at(-1)!.rate).toBe(r.design.topRate)
      expect(r.fiscal).not.toBeNull()
      if(r.fiscal!.passesAll2035){
        expect(r.fiscal!.primary2035GDP).toBeGreaterThanOrEqual(0)
        expect(r.fiscal!.debt2095GDP).toBeLessThanOrEqual(.4000001)
      }
    }
    const slim=(r:typeof results.baseline|null)=>{
      if(!r)return null
      return {
        id:r.design.id,top:r.design.topRate,
        rates:r.design.brackets.map(b=>b.rate),
        perAdultCutoffs:r.design.brackets.slice(0,-1).map(b=>b.upperPerAdult),
        adult:r.design.adultCredit,child:r.design.childCredit,
        extraRevenueB:r.additionalRevenueBillions,
        q1q4Winners:r.q1q4WinnersPct,q1q4Loss1:r.q1q4Lose1Pct,
        q1q4Loss5:r.q1q4Lose5Pct,q1q4Gain20:r.q1q4Gain20Pct,
        q4Winners:r.q4WinnersPct,q5Loss5:r.q5Lose5Pct,
        overallWinnerPct:r.distribution.winnersPct,
        overallLose5Pct:r.distribution.lose5Pct,
        quintiles:r.distribution.byQuintile,
        policyScore:r.policyLoss,
        labor:r.labor,fiscal:r.fiscal
      }
    }
    console.log('HIGHER_TOP_RATE_Q1Q4_RESULTS_JSON='+JSON.stringify({
      assumptions:results.assumptions,
      counts:{candidates:results.candidateCount,prelimEligible:results.prelimEligible,
        fiscalScored:results.fiscalScored,
        strictFrontier:results.frontier2035.length,
        fiveRateFrontier:results.fiveRateFrontier.length},
      baseline:slim(results.baseline),
      rateSweep:results.rateSweep.map(slim),
      bestByTopRate:results.bestByTopRate.map(slim),
      best2035:slim(results.best2035),
      best2032:slim(results.best2032),
      bestFasterThanBaseline:slim(results.bestFasterThanBaseline),
      frontier2035:results.frontier2035.map(slim),
      fiveRateFrontier:results.fiveRateFrontier.map(slim),
      frontierDebtOnly:results.frontierDebtOnly.slice(0,12).map(slim),
      closestPrimary:results.closestPrimary.slice(0,8).map(slim),
      staticRateSensitivity:results.staticRateSensitivity,
    }))
  },600000)
})
