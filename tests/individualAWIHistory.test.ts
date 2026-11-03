import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { exampleHouseholds, scoreExampleHousehold } from '../src/model/householdScenario'
import { individualNominalEarnings, individualCoveredEarnings, individualScheduledSocialSecurity } from '../src/model/individualEarnings'
import { averageIndexedMonthlyEarnings, nationalAverageWageIndex, primaryInsuranceAmount, projectedTaxableMaximum } from '../src/model/ssaScaledWorkers'
import { realWageGrowthFactor } from '../src/model/taxProjection'

const a=defaultCombinedPolicy.assumptions
const couple=exampleHouseholds.find(row=>row.id==='two-earner')!
const worker=(index:number)=>({
  age2026:index===0?couple.primaryAge2026:couple.spouseAge2026,
  wage2026:index===0?couple.primaryWage2026:couple.spouseWage2026,
  workThroughAge:couple.workThroughAge,
  creditedYearsBefore2026:index===0?couple.primaryCreditedYears2026:couple.spouseCreditedYears2026,
})

describe('one AWI-indexed earnings history for lifetime household calculations',()=>{
  it('maintains each wage as a fixed fraction of AWI before and after 2026',()=>{
    const awi2026=nationalAverageWageIndex(2026,a)
    for(const index of [0,1]){
      const w=worker(index)
      for(const year of [2015,2025,2026,2027,2035,2050]){
        const actual=individualNominalEarnings(w,year,a)
        const expected=w.wage2026*nationalAverageWageIndex(year,a)/awi2026
        expect(actual).toBeCloseTo(expected,7)
        expect(actual/nationalAverageWageIndex(year,a))
          .toBeCloseTo(w.wage2026/awi2026,10)
      }
      for(const year of [2027,2035,2050]){
        const deflator=(1+a.inflation)**(year-2026)
        expect(individualNominalEarnings(w,year,a)/deflator/w.wage2026)
          .toBeCloseTo(realWageGrowthFactor(year,a),10)
      }
    }
  })
  it('does not invent earnings before the entered years worked, and respects fractional credited years',()=>{
    const spouse=worker(1)
    expect(individualNominalEarnings(spouse,2011,a)).toBe(0)
    expect(individualNominalEarnings(spouse,2012,a)).toBeGreaterThan(0)
    const fractional={...spouse,creditedYearsBefore2026:14.5}
    expect(individualNominalEarnings(fractional,2011,a))
      .toBeCloseTo(.5*spouse.wage2026*nationalAverageWageIndex(2011,a)/nationalAverageWageIndex(2026,a),6)
  })
  it('calculates PIA from the same modeled covered earnings after applying the taxable maximum',()=>{
    const spouse=worker(1),birth=2026-spouse.age2026
    const history=individualCoveredEarnings(spouse,birth,68,a)
    for(const e of history.filter(e=>e.coveredEarnings>0)){
      const wage=individualNominalEarnings(spouse,e.year,a)
      expect(e.coveredEarnings).toBeCloseTo(Math.min(wage,projectedTaxableMaximum(e.year,a)),6)
    }
    const aime=averageIndexedMonthlyEarnings(history,birth,a)
    const benefit=individualScheduledSocialSecurity(spouse,68,2075,a)
    expect(benefit.aime).toBe(aime)
    expect(benefit.eligibilityPIA).toBe(primaryInsuranceAmount(aime,birth+62,a))
    const primary=individualScheduledSocialSecurity(worker(0),68,2075,a)
    expect(primary.scheduledAnnualNominal).toBeGreaterThan(benefit.scheduledAnnualNominal)
    expect(primary.aime).toBeGreaterThan(benefit.aime)
  })
  it('feeds the identical forward AWI wages to household taxes and 10% account contributions',()=>{
    const policy={...defaultCombinedPolicy,
      personalAccounts:{...defaultCombinedPolicy.personalAccounts,enabled:true,requiredContributionRate:.10}}
    const score=scoreCombined(policy)
    const results=[2026,2035,2050].map(year=>{
      const snap=scoreExampleHousehold(couple,year,policy,score.baseline,score.combined)!
      const wages=[worker(0),worker(1)].map(w=>individualNominalEarnings(w,year,a))
      const expected=wages.reduce((sum,x)=>sum+x,0)
      const annualSaving=wages.reduce((sum,x)=>sum+Math.min(x,projectedTaxableMaximum(year,a))*.10,0)
      expect(snap.annualWages).toBeCloseTo(expected,6)
      expect(snap.mandatoryAccountSaving).toBeCloseTo(annualSaving,6)
      expect(snap.adults[0]!.annualContribution).toBeCloseTo(wages[0]!*.1,6)
      expect(snap.adults[1]!.annualContribution).toBeCloseTo(wages[1]!*.1,6)
      return {year,combinedEarnings2026Dollars:expected/(1+a.inflation)**(year-2026),
        mandatorySaving2026Dollars:annualSaving/(1+a.inflation)**(year-2026),
        taxCashChange2026Dollars:snap.taxCashChange/(1+a.inflation)**(year-2026)}
    })
    console.log('AWI_COHERENT_TWO_EARNER_TIMELINE_JSON='+JSON.stringify(results))
  },120000)
})
