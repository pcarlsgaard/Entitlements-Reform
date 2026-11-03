import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { exampleHouseholds, scoreExampleHousehold, householdWorkCredits } from '../src/model/householdScenario'
import { individualNominalEarnings } from '../src/model/individualEarnings'
import { nationalAverageWageIndex, projectedTaxableMaximum } from '../src/model/ssaScaledWorkers'
import { accountBalanceAtClaim, personalAccountYearlyMatch } from '../src/model/personalAccountReform'
import { calculateTransferAnalysis } from '../src/tax/model/transfers'
import { annualWorkCredit } from '../src/model/claiming'

const original = exampleHouseholds.find(x=>x.id==='two-earner')!
const policy = {
  ...defaultCombinedPolicy,
  benefits: {...defaultCombinedPolicy.benefits,socialSecurityReform:true},
  personalAccounts:{...defaultCombinedPolicy.personalAccounts,enabled:true,requiredContributionRate:.10},
}

const worker = (index: number) => ({
  age2026:index===0?original.primaryAge2026:original.spouseAge2026,
  wage2026:index===0?original.primaryWage2026:original.spouseWage2026,
  creditedYearsBefore2026:index===0?original.primaryCreditedYears2026:original.spouseCreditedYears2026,
  workThroughAge:original.workThroughAge,
})

describe('cross-module consistency: one annual wage path for all household cash flows',()=>{
  it('ties annual wages, tax delta and private deposits to the same indexed earnings',()=>{
    const scored=scoreCombined(policy)
    for(const year of [2026,2035,2050]){
      const snapshot=scoreExampleHousehold(original,year,policy,scored.baseline,scored.combined)!
      const d=(1+policy.assumptions.inflation)**(year-2026)
      const wages=[0,1].map(i=>individualNominalEarnings(worker(i),year,policy.assumptions))
      const real=wages.map(w=>w/d)
      const childAges=original.childAges2026.map(x=>x+year-2026).filter(x=>x<18)
      const input={
        household:{filingStatus:original.filingStatus,
          cashWage:real[0]!,secondaryCashWage:real[1]!,
          children:childAges.length,childrenUnder6:childAges.filter(x=>x<6).length},
        employerFicaPassThroughRate:policy.health.employerFicaPassThroughRate,
        preschoolChildren:childAges.filter(x=>x<6).length,
        schoolAgeChildren:childAges.filter(x=>x>=6).length,
        monthlyShelterCost:original.monthlyShelterCost2026,
        monthlyDependentCareExpense:childAges.length?original.monthlyDependentCareExpense2026:0,
        inKindValuationFactor:original.inKindValuationFactor,
        receives:original.receives,
        manualAnnualBenefits:original.manualAnnualBenefits2026,
      }
      const tax=calculateTransferAnalysis(input,policy.tax,policy.transfers)
      const expectedTax=(tax.reformRetained.annual-tax.currentLaw.annual)*d
      const expectedDeposits=wages.reduce((sum,w)=>sum+
        Math.min(w,projectedTaxableMaximum(year,policy.assumptions))*.10,0)
      expect(snapshot.annualWages).toBeCloseTo(wages[0]!+wages[1]!,5)
      expect(snapshot.taxCashChange).toBeCloseTo(expectedTax,5)
      expect(snapshot.mandatoryAccountSaving).toBeCloseTo(expectedDeposits,5)
      expect(snapshot.adults[0]!.annualContribution).toBeCloseTo(
        Math.min(wages[0]!,projectedTaxableMaximum(year,policy.assumptions))*.10,5)
      expect(snapshot.adults[1]!.annualContribution).toBeCloseTo(
        Math.min(wages[1]!,projectedTaxableMaximum(year,policy.assumptions))*.10,5)
      console.log('CONSISTENT_AWI_HOUSEHOLD_JSON='+JSON.stringify({
        year,realWages:Math.round((wages[0]!+wages[1]!)/d),
        realSaving:Math.round(expectedDeposits/d),
        realTaxChange:Math.round(snapshot.taxCashChange/d),
      }))
    }
  },120000)
  it('calculates future flat-benefit work credits using the identical wage history',()=>{
    const a=policy.assumptions
    for(const i of [0,1]){
      const w=worker(i)
      let expected=w.creditedYearsBefore2026
      for(let age=w.age2026;age<68&&age<=w.workThroughAge;age++){
        const year=2026+age-w.age2026
        const realWage=individualNominalEarnings(w,year,a)/(1+a.inflation)**(year-2026)
        expected+=annualWorkCredit(realWage,a.qualifyingEarnings2026)
      }
      expect(householdWorkCredits(original,i,68,policy)).toBeCloseTo(expected,8)
    }
  })
  it('calculates the retirement account from exactly the same post-2026 covered earnings',()=>{
    const a=policy.assumptions,p=policy.personalAccounts,scored=scoreCombined(policy)
    const snapshot=scoreExampleHousehold(original,2075,policy,scored.baseline,scored.combined)!
    for(const i of [0,1]){
      const w=worker(i),claim=68,birth=2026-w.age2026
      const balance=accountBalanceAtClaim(birth,claim,a,p,(year)=>{
        const contribution=Math.min(projectedTaxableMaximum(year,a),
          individualNominalEarnings(w,year,a))*p.requiredContributionRate
        return contribution+personalAccountYearlyMatch(contribution,year,a,p)
      })
      const comparison={...original,primaryClaimAge:68,spouseClaimAge:68}
      const withClaim=scoreExampleHousehold(comparison,2075,policy,scored.baseline,scored.combined)!
      expect(withClaim.adults[i]!.accountBalanceAtClaim).toBeCloseTo(balance,5)
      expect(snapshot.adults[i]!.baselineSS).toBeGreaterThan(0)
    }
  },120000)
  it('reconstructs past wages at a constant fraction of the historical AWI',()=>{
    const a=policy.assumptions
    for(const i of [0,1]){
      const w=worker(i),anchor=nationalAverageWageIndex(2026,a)
      const first=2026-w.creditedYearsBefore2026
      for(const year of [first,2020,2025,2026,2027,2050]){
        const wage=individualNominalEarnings(w,year,a)
        expect(wage).toBeCloseTo(w.wage2026*nationalAverageWageIndex(year,a)/anchor,5)
      }
    }
  })
})
