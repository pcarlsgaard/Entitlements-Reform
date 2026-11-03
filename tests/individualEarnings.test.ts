import {describe,it,expect} from 'vitest'
import {defaultCombinedPolicy,scoreCombined} from '../src/model/combined'
import {exampleHouseholds,scoreExampleHousehold} from '../src/model/householdScenario'
import {individualNominalEarnings,individualCoveredEarnings,individualScheduledSocialSecurity}
 from '../src/model/individualEarnings'
import {nationalAverageWageIndex,piaBendPoints} from '../src/model/ssaScaledWorkers'
const p=defaultCombinedPolicy
const two=exampleHouseholds.find(h=>h.id==='two-earner')!
const person=(adult:number)=>({
 age2026:adult===0?two.primaryAge2026:two.spouseAge2026,
 wage2026:adult===0?two.primaryWage2026:two.spouseWage2026,
 workThroughAge:two.workThroughAge,
 creditedYearsBefore2026:adult===0?two.primaryCreditedYears2026:two.spouseCreditedYears2026,
})
describe('per-spouse SSA benefit and shared wage career history',()=>{
 it('uses the published 2026 SSA bend points',()=>{
  expect(piaBendPoints(2026,p.assumptions)).toEqual({first:1286,second:7749})
 })
 it('anchors each person's 2026 covered earnings to the actual entered wage',()=>{
  expect(individualNominalEarnings(person(0),2026,p.assumptions)).toBeCloseTo(65000,6)
  expect(individualNominalEarnings(person(1),2026,p.assumptions)).toBeCloseTo(35000,6)
  const first=individualCoveredEarnings(person(0),1988,68,p.assumptions)
  const second=individualCoveredEarnings(person(1),1990,68,p.assumptions)
  expect(first.filter(e=>e.year<2026&&e.coveredEarnings>0)).toHaveLength(16)
  expect(second.filter(e=>e.year<2026&&e.coveredEarnings>0)).toHaveLength(14)
  expect(first.find(e=>e.year===2026)?.coveredEarnings).toBeCloseTo(65000,4)
  expect(second.find(e=>e.year===2026)?.coveredEarnings).toBeCloseTo(35000,4)
  expect(first.find(e=>e.year===2050)!.coveredEarnings).toBeGreaterThan(65000)
 })
 it('makes higher wage translate to higher statutory current-law benefits',()=>{
  const a=individualScheduledSocialSecurity(person(0),68,2075,p.assumptions)
  const b=individualScheduledSocialSecurity(person(1),68,2075,p.assumptions)
  expect(a.aime).toBeGreaterThan(b.aime)
  expect(a.scheduledAnnualNominal).toBeGreaterThan(b.scheduledAnnualNominal)
  expect(a.scheduledAnnualNominal/b.scheduledAnnualNominal).toBeGreaterThan(1.15)
  const comparison=exampleHouseholds.find(h=>h.id==='two-earner')!
  const s=scoreCombined(p)
  const snap=scoreExampleHousehold(comparison,2075,p,s.baseline,s.combined)!
  expect(snap.adults[0]!.baselineSS).toBeGreaterThan(snap.adults[1]!.baselineSS)
  const d=(1+p.assumptions.inflation)**(2075-2026)
  console.log('INDIVIDUAL_TWO_EARNER_SSA_JSON='+JSON.stringify({
   workThroughAge:comparison.workThroughAge,primary2026:65000,spouse2026:35000,
   primaryAIME:a.aime,spouseAIME:b.aime,
   primaryScheduledReal:snap.adults[0]!.baselineSS/d,
   spouseScheduledReal:snap.adults[1]!.baselineSS/d,
   coupleScheduledReal:snap.baselineSocialSecurity/d,
  }))
 },120000)
 it('makes higher wages change saving and account retirement income, but not flat benefit floor',()=>{
  const policy={...p,benefits:{...p.benefits,socialSecurityReform:true},
   personalAccounts:{...p.personalAccounts,enabled:true,requiredContributionRate:.1}}
  const s=scoreCombined(policy)
  const snap=scoreExampleHousehold(two,2075,policy,s.baseline,s.combined)!
  const raised=scoreExampleHousehold({...two,primaryWage2026:100000},2075,policy,s.baseline,s.combined)!
  expect(raised.adults[0]!.baselineSS).toBeGreaterThan(snap.adults[0]!.baselineSS)
  expect(raised.adults[0]!.accountBalanceAtClaim).toBeGreaterThan(snap.adults[0]!.accountBalanceAtClaim)
  expect(raised.adults[0]!.privateAccountAnnuity).toBeGreaterThan(snap.adults[0]!.privateAccountAnnuity)
  expect(raised.adults[1]!.baselineSS).toBeCloseTo(snap.adults[1]!.baselineSS,8)
 },120000)
 it('keeps older people with no 2026 earnings on the existing-award proxy',()=>{
  const policy={...p,taxEnabled:false}
  const s=scoreCombined(policy)
  const retired=exampleHouseholds.find(h=>h.id==='retired-couple')!
  const snap=scoreExampleHousehold(retired,2026,policy,s.baseline,s.combined)!
  expect(snap.baselineSocialSecurity).toBe(49000)
 })
 it('stops account contributions when employment ends and preserves 2026 dollar rebase',()=>{
  const ratio=nationalAverageWageIndex(2050,p.assumptions)/nationalAverageWageIndex(2026,p.assumptions)
  expect(ratio).toBeGreaterThan(1)
  const shutoff={...person(0),workThroughAge:60}
  expect(individualNominalEarnings(shutoff,2050,p.assumptions)).toBe(0)
 })
})
