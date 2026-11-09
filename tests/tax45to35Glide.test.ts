import { describe,expect,it } from 'vitest'
import saved from './fixtures/glideSavedTaxReform2026.json'
import type { CombinedPolicy } from '../src/model/combined'
import { evaluateTaxGlides,linearTopRate,taxWithMatchedTopRate } from '../src/model/taxGlide'
import { calculateMacro } from '../src/tax/model/macro'

describe('45%→35% matched wage/DBCFT glide after primary balance',()=>{
 const original=saved.scenario.policy as CombinedPolicy
 const policy:CombinedPolicy={
  ...original,
  tax:{...original.tax,rate:.45,
    progressiveWageBrackets:[
      {upperPerAdult:65000,rate:.175},
      {upperPerAdult:150000,rate:.265},
      {upperPerAdult:310000,rate:.315},
      {upperPerAdult:750000,rate:.35},
      {upperPerAdult:null,rate:.45},
    ],adultCredit:3300,childCredit:5400},
  health:{...original.health,replaceAcaAptc:false,
    nonPolicyholderTreatment:'continueFamilyPolicy',esiAcaTransitionShare:0},
 }
 it('preserves bracket thresholds/credits and matches business to top wage rate',()=>{
  for(const r of [.35,.375,.4,.425,.45]){
   const tax=taxWithMatchedTopRate(policy.tax,r)
   expect(tax.rate).toBe(r)
   expect(tax.progressiveWageBrackets!.at(-1)!.rate).toBe(r)
   expect(tax.progressiveWageBrackets!.slice(0,-1))
     .toEqual(policy.tax.progressiveWageBrackets!.slice(0,-1))
   expect(tax.adultCredit).toBe(3300)
   expect(tax.childCredit).toBe(5400)
   expect(calculateMacro(tax).businessTaxableBase)
     .toBeCloseTo(calculateMacro(policy.tax).businessTaxableBase,6)
  }
  expect(linearTopRate(2029,2030,10)).toBe(.45)
  expect(linearTopRate(2030,2030,10)).toBeCloseTo(.44,10)
  expect(linearTopRate(2034,2030,10)).toBeCloseTo(.40,10)
  expect(linearTopRate(2039,2030,10)).toBeCloseTo(.35,10)
  expect(linearTopRate(2045,2030,10)).toBe(.35)
 })
 it('runs 2026–2095 fiscal and primary-balance outcomes across cut dates and speeds',()=>{
  const study=evaluateTaxGlides(policy,[2029,2032,2035,2040],[5,10,20])
  expect(study.constant45.rate2035).toBe(.45)
  expect(study.immediate35.rate2035).toBe(.35)
  expect(study.glides).toHaveLength(12)
  for(const x of study.glides){
   expect(x.rate2030).toBeGreaterThanOrEqual(.35)
   expect(x.rate2035).toBeLessThanOrEqual(.45)
   expect(x.rate2050).toBeGreaterThanOrEqual(.35)
   expect(x.rate2050).toBeLessThanOrEqual(.45)
   expect(x.debt2095GDP).toBeGreaterThanOrEqual(0)
   expect(x.debt2095GDP).toBeLessThan(5)
   expect(x.primary2035GDP).toBeGreaterThan(-.10)
   expect(x.firstCutYear).not.toBeNull()
  }
  const pct=(x:number)=>Math.round(x*10000)/100
  const rows=[study.constant45,study.immediate35,...study.glides].map(r=>({
   label:r.label,firstCutYear:r.firstCutYear,glideYears:r.durationYears,
   firstSurplus:r.firstPrimarySurplusYear,firstDurableSurplus:r.firstThreeYearPrimarySurplus,
   first35:r.fullyAt35Year,
   rates:[r.rate2030,r.rate2035,r.rate2040,r.rate2050].map(x=>Math.round(x*1000)/10),
   primary2030Pct:pct(r.primary2030GDP),primary2035Pct:pct(r.primary2035GDP),
   primary2040Pct:pct(r.primary2040GDP),primary2050Pct:pct(r.primary2050GDP),
   primary2095Pct:pct(r.primary2095GDP),
   yearsPrimaryDeficit2035to2055:r.primaryDeficitYears2035to2055,
   peakDebtPct:pct(r.peakDebtGDP),peakDebtYear:r.yearOfPeakDebt,
   debt2035Pct:pct(r.debt2035GDP),
   debt2050Pct:pct(r.debt2050GDP),debt2075Pct:pct(r.debt2075GDP),
   debt2095Pct:pct(r.debt2095GDP),
   passes2035Primary:r.meets2035Primary,
   passes2095Debt40:r.meets2095DebtTarget40,
   passesPeakDebt150:r.meetsPeakDebt150,
   adjustmentTo40pctGDP:pct(r.fiscalAdjustmentTo40GDP)
  }))
  console.log('FORTY_FIVE_TO_THIRTY_FIVE_GLIDE_JSON='+JSON.stringify({
    base:{rate:.45,lowerRates:[.175,.265,.315,.35],
      ceilings:[65000,150000,310000,750000],
      adultCredit:3300,childCredit:5400,noncompliance:policy.tax.noncomplianceRate,
      rothRate:policy.personalAccounts.requiredContributionRate,
      health:policy.health.replaceAcaAptc?'ACA_replaced':'ACA_greater_of'},
    trigger:{constant45FirstPrimarySurplus:study.constant45FirstPrimarySurplus,
      constant45FirstThreeYearPrimarySurplus:study.constant45FirstThreeYearPrimarySurplus},
    rows,
  }))
 },600000)
})
