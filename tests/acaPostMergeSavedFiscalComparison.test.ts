import { describe,it,expect } from 'vitest'
import saved from './fixtures/acaSaved2026.json'
import { scoreCombined } from '../src/model/combined'
import type { CombinedPolicy } from '../src/model/combined'
import { calculateConsumptionAudit } from '../src/tax/model/consumptionAudit'

describe('Saved reform after max ACA or universal PTC rule',()=>{
 it('compares original replacement to new greater-of ACA plus 0/25/100% ESI switcher scenarios',()=>{
  const baseline=saved.scenario.policy as CombinedPolicy
  const scenarios=[
    {label:'Original saved: ACA replacement',keepAca:false,shift:0},
    {label:'Max ACA/universal: ESI transition 0%',keepAca:true,shift:0},
    {label:'Max ACA/universal: ESI transition 25%',keepAca:true,shift:.25},
    {label:'Max ACA/universal: ESI transition 100%',keepAca:true,shift:1},
  ]
  const results=scenarios.map(x=>{
   const policy={...baseline,
    health:{...baseline.health,
      nonPolicyholderTreatment:'continueFamilyPolicy' as const,
      replaceAcaAptc:!x.keepAca,esiAcaTransitionShare:x.shift}}
   const result=scoreCombined(policy)
   const years=result.combined.years
   const year=(n:number)=>years.find(r=>r.year===n)!
   const peak=years.reduce((p,r)=>r.endingDebtGDP>p.debtGDP?
        {year:r.year,debtGDP:r.endingDebtGDP}:p,{year:0,debtGDP:-Infinity})
   const audit=calculateConsumptionAudit(policy.tax,policy.health,policy.personalAccounts)
   return {
    label:x.label,
    taxNetRevenueBillions:result.tax.netRevenue,
    healthCreditsBillions:result.health.totalHealthCreditCostBillions,
    nongroupAcaFloorTopUpBillions:result.health.nongroupAptcFloorTopUpCostBillions,
    avoidedAcaRepealSavingsBillions:result.health.estimatedExistingAptcSavingsBillions,
    esiAcaIncrementBillions:result.health.esiAcaTransitionTopUpCostBillions,
    openingNetFiscalImprovementGDP:result.openingFiscalImprovementGDP,
    realGDPLevelResponsePercent:result.steadyGDPLevelChange*100,
    debtPercent:{'2035':year(2035).endingDebtGDP*100,
      '2050':year(2050).endingDebtGDP*100,
      '2095':year(2095).endingDebtGDP*100},
    peakDebtPercent:peak.debtGDP*100,peakDebtYear:peak.year,
    consumption:{
      gainPercent:audit.total.gainPercent,
      lose1Percent:audit.total.loss1Percent,
      lose5Percent:audit.total.loss5Percent,
      q1to3:audit.byWageQuintile.slice(0,3).map(r=>({
        label:r.label,gainPercent:r.gainPercent,
        lose1Percent:r.loss1Percent,lose5Percent:r.loss5Percent})),
    }
   }
  })
  console.log('SAVED_POST_ACA_FISCAL_RESULTS_JSON='+JSON.stringify(results))
  expect(results).toHaveLength(4)
  expect(results[1]!.taxNetRevenueBillions).toBeLessThan(results[0]!.taxNetRevenueBillions)
  expect(results[2]!.taxNetRevenueBillions).toBeLessThan(results[1]!.taxNetRevenueBillions)
  expect(results[3]!.taxNetRevenueBillions).toBeLessThan(results[2]!.taxNetRevenueBillions)
 },600000)
})