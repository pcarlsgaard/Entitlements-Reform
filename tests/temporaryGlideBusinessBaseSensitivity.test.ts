import { describe,it,expect } from 'vitest'
import saved from './fixtures/temporary45GlideBaseline.json'
import type { CombinedPolicy } from '../src/model/combined'
import { scoreCombined } from '../src/model/combined'
import { topRateAtYear,topRateGlideTaxForYear,
  businessBaseElasticityAdjustmentGDP,type TopRateGlidepath } from '../src/model/topRateGlidepath'

const base=saved.scenario.policy as CombinedPolicy
describe('Transparency: 45%-35% glide under business cash-flow tax base erosion',()=>{
 it('stress-tests 2035 primary and 2095 debt instead of presuming static rates maximize receipts',()=>{
  const paths:TopRateGlidepath[]=[
    {initialRate:.45,floorRate:.35,holdThroughYear:2035,floorYear:2055},
    {initialRate:.45,floorRate:.35,holdThroughYear:2035,floorYear:2060},
    {initialRate:.45,floorRate:.35,holdThroughYear:2040,floorYear:2060},
    {initialRate:.45,floorRate:.35,holdThroughYear:2045,floorYear:2065},
  ]
  const results=[]
  for(const path of paths){
    const taxAtYear=topRateGlideTaxForYear(base.tax,path)
    for(const elasticity of [0,.1,.2,.5]){
      const revenueResponse=businessBaseElasticityAdjustmentGDP(base.tax,
        year=>topRateAtYear(path,year),elasticity)
      const result=scoreCombined(base,'cpi',taxAtYear,revenueResponse)
      const years=result.combined.years
      const at=(year:number)=>years.find(x=>x.year===year)!
      const primary=(year:number)=>at(year).primaryBalance/at(year).nominalGDP
      const firstSustained=years.find((x,i)=>x.primaryBalance>=0
        &&years.slice(i).every(z=>z.primaryBalance>=0))?.year??null
      const peak=Math.max(...years.map(x=>x.endingDebtGDP))
      results.push({
        holdThrough:path.holdThroughYear,floorYear:path.floorYear,
        elasticity,
        extra2026RevenueLossBillions:revenueResponse(2026)*result.tax.gdp,
        primary2035GDP:primary(2035),primary2040GDP:primary(2040),
        primary2050GDP:primary(2050),primary2060GDP:primary(2060),
        firstSustainedSurplus:firstSustained,
        peakDebtGDP:peak,debt2095GDP:at(2095).endingDebtGDP,
        passes2035:primary(2035)>=0,
        passesDebt:peak<=1.50&&at(2095).endingDebtGDP<=.40,
        passesSustainedBy2035:firstSustained!==null&&firstSustained<=2035,
      })
    }
  }
  expect(results).toHaveLength(paths.length*4)
  for(const p of paths){
    const zero=results.find(x=>x.holdThrough===p.holdThroughYear&&x.floorYear===p.floorYear&&x.elasticity===0)!
    const adverse=results.find(x=>x.holdThrough===p.holdThroughYear&&x.floorYear===p.floorYear&&x.elasticity===.5)!
    expect(zero.debt2095GDP).toBeLessThanOrEqual(adverse.debt2095GDP+1e-6)
    expect(zero.primary2035GDP).toBeGreaterThan(adverse.primary2035GDP)
  }
  console.log('TEMPORARY_GLIDE_BUSINESS_BASE_SENSITIVITY_JSON='+JSON.stringify(results))
 },600000)
 it('tests joint downside: no dynamic GDP uplift plus a smaller business tax base',()=>{
  const conservative:CombinedPolicy={...base,dynamic:{...base.dynamic,enabled:false}}
  const results=[]
  for(const [hold,floor] of [[2035,2055],[2035,2060],[2040,2060],[2045,2065]]){
   const path:TopRateGlidepath={initialRate:.45,floorRate:.35,
     holdThroughYear:hold!,floorYear:floor!}
   const taxForYear=topRateGlideTaxForYear(conservative.tax,path)
   for(const elasticity of [0,.1,.2,.5]){
    const rateResponse=businessBaseElasticityAdjustmentGDP(conservative.tax,
      year=>topRateAtYear(path,year),elasticity)
    const score=scoreCombined(conservative,'cpi',taxForYear,rateResponse)
    const y=score.combined.years
    const get=(year:number)=>y.find(x=>x.year===year)!
    const p=(year:number)=>get(year).primaryBalance/get(year).nominalGDP
    results.push({
      holdThrough:hold,floorYear:floor,elasticity,
      primary2035GDP:p(2035),primary2040GDP:p(2040),
      primary2050GDP:p(2050),
      debt2095GDP:get(2095).endingDebtGDP,
      peakDebtGDP:Math.max(...y.map(x=>x.endingDebtGDP)),
      firstSustainedSurplus:y.find((x,i)=>x.primaryBalance>=0
        &&y.slice(i).every(z=>z.primaryBalance>=0))?.year??null,
    })
   }
  }
  console.log('TEMPORARY_GLIDE_JOINT_DOWNSIDE_JSON='+JSON.stringify(results))
  expect(results).toHaveLength(16)
 },600000)

})
