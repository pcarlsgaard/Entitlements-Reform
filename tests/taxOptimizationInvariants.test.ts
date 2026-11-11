import { describe,expect,it } from 'vitest'
import saved from './fixtures/paretoSavedTaxReform2026.json'
import type { CombinedPolicy } from '../src/model/combined'
import { calculateConsumptionAudit,prepareTaxSearchConsumption } from '../src/tax/model/consumptionAudit'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'

const original=saved.scenario.policy as CombinedPolicy
const base:CombinedPolicy={...original,
  health:{...original.health,replaceAcaAptc:false,
    nonPolicyholderTreatment:'continueFamilyPolicy',esiAcaTransitionShare:0}}
describe('X-tax cached optimization metrics match source engines',()=>{
 it('matches the full weighted tax-unit audit under both the saved and a revised bracket/credit schedule',()=>{
  const evaluate=prepareTaxSearchConsumption(base.tax,base.health,base.personalAccounts)
  const proposals=[
    base.tax,
    {...base.tax,adultCredit:3000,childCredit:5000,
      progressiveWageBrackets:[
        {upperPerAdult:70000,rate:.185},
        {upperPerAdult:185000,rate:.275},
        {upperPerAdult:310000,rate:.335},
        {upperPerAdult:null,rate:.35}
      ]}
  ]
  for(const tax of proposals){
    const fast=evaluate(tax)
    const full=calculateConsumptionAudit(tax,base.health,base.personalAccounts)
    const eligible=full.total.unitsMillions-full.nonPositiveBaselineMillions
    const pct=(millions:number)=>100*millions/eligible
    expect(fast.unitsMillions).toBeCloseTo(eligible,4)
    expect(fast.lose1Pct).toBeCloseTo(pct(full.total.loss1Millions),4)
    expect(fast.lose5Pct).toBeCloseTo(pct(full.total.loss5Millions),4)
    expect(fast.lose10Pct).toBeCloseTo(pct(full.total.loss10Millions),4)
    for(let q=0;q<5;q++){
      const denominator=full.byWageQuintile[q]!.unitsMillions
        -(q===0?full.nonPositiveBaselineMillions:0)
      expect(fast.byQuintile[q]!.lose5Pct).toBeCloseTo(
        100*full.byWageQuintile[q]!.loss5Millions/denominator,1)
    }
  }
 },120000)
 it('keeps private retirement saving separate from the economic wedge while measuring liquid take-home',()=>{
  const statutory=calculateLaborResponse(base.tax,1,0)
  const saving=calculateLaborResponse(base.tax,1,.065)
  expect(statutory.weightedReformLiquidMarginalRate)
    .toBeCloseTo(statutory.weightedReformPersonalMarginalRate,8)
  expect(statutory.workerShareHigherLiquidRate)
    .toBeCloseTo(statutory.workerShareHigherPersonalRate,8)
  expect(saving.weightedReformLiquidMarginalRate)
    .toBeGreaterThan(statutory.weightedReformPersonalMarginalRate)
  expect(saving.weightedReformMarginalRate)
    .toBeCloseTo(statutory.weightedReformMarginalRate,8)
  expect(saving.workerShareHigherLiquidRate)
    .toBeGreaterThanOrEqual(saving.workerShareHigherPersonalRate)
 },120000)
})