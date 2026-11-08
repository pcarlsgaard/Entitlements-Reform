import { describe,expect,it } from 'vitest'
import saved from './fixtures/paretoSavedTaxReform2026.json'
import type { CombinedPolicy } from '../src/model/combined'
import { optimizeTaxReform } from '../src/model/optimizeTaxReform'

describe('Constrained 2026 Pareto X-tax search',()=>{
  it('preserves broad base, 35% top/business parity and 6.5% new Roth while assessing fiscal/work/tails',()=>{
    const base=saved.scenario.policy as CombinedPolicy
    const result=optimizeTaxReform(base,{
      seed:20261108,
      candidates:120,
      laborFinalists:24,
      fiscalFinalists:10,
      debtTargetGDP:.40,
      debtPeakGDP:1.50,
      primaryBalanceDeadline:2035,
      minimumRevenueDeltaBillions:-55,
    })
    expect(result.inputs.fixedBusinessRate).toBe(.35)
    expect(result.inputs.fixedRothRate).toBe(.065)
    expect(result.inputs.noncomplianceRate).toBe(.05)
    expect(result.prescreenCount).toBeGreaterThan(75)
    expect(result.fullyScoredCount).toBeGreaterThanOrEqual(8)
    expect(result.baseline.distribution.unitsMillions).toBeGreaterThan(125)
    expect(result.baseline.labor).not.toBeNull()
    expect(result.baseline.fiscal).not.toBeNull()
    for(const row of [...result.frontier,...result.bestNearFeasible]){
      const bands=row.candidate.brackets
      expect([4,5]).toContain(bands.length)
      expect(bands.at(-1)!.rate).toBe(.35)
      expect(bands.at(-1)!.upperPerAdult).toBeNull()
      for(let i=1;i<bands.length;i++)expect(bands[i]!.rate).toBeGreaterThanOrEqual(bands[i-1]!.rate)
      expect(row.labor).not.toBeNull()
      expect(row.fiscal).not.toBeNull()
      expect(Number.isFinite(row.balancedScore)).toBe(true)
      if(row.fiscal!.passes){
        expect(row.fiscal!.debt2095GDP).toBeLessThanOrEqual(.4000001)
        expect(row.fiscal!.peakDebtGDP).toBeLessThanOrEqual(1.5000001)
        expect(row.fiscal!.primaryBalance2035GDP).toBeGreaterThanOrEqual(-1e-10)
      }
    }
    const fmt=(row:typeof result.baseline | null)=>{
      if(!row)return null
      return {id:row.candidate.id,
       brackets:row.candidate.brackets.map(x=>({to:x.upperPerAdult,rate:x.rate})),
       adultCredit:row.candidate.adultCredit,
       childCredit:row.candidate.childCredit,
       adultCreditPhaseInRate:row.candidate.adultCreditPhaseInRate,
       childCreditPhaseInRate:row.candidate.childCreditPhaseInRate,
       revenueDeltaBillions:row.revenueDeltaBillions,
       distribution:{
        winnersPct:row.distribution.winnersPct,
        lose1Pct:row.distribution.lose1Pct,
        lose5Pct:row.distribution.lose5Pct,
        lose10Pct:row.distribution.lose10Pct,
        gain20Pct:row.distribution.gain20Pct,
        gain40Pct:row.distribution.gain40Pct,
        deviation:row.distribution.meanClippedDeviationFrom2Pct,
        quintiles:row.distribution.byQuintile
       },labor:row.labor,
       score:row.balancedScore,
       fiscal:row.fiscal}
    }
    console.log('PARETO_OPTIMIZER_2026_RESULTS_JSON='+JSON.stringify({
      inputs:result.inputs,
      counts:{candidates:result.prescreenCount,revenueEligible:result.eligibleLaborCount,
        laborFinalists:result.inputs.laborFinalists,fullyScored:result.fullyScoredCount,
        feasible:result.feasibleCount,frontier:result.frontier.length},
      baseline:fmt(result.baseline),
      leaders:Object.fromEntries(Object.entries(result.leaders).map(([k,v])=>[k,fmt(v)])),
      frontier:result.frontier.slice(0,12).map(fmt),
      near:result.bestNearFeasible.map(fmt),
    }))
  },600000)
})
