import { describe,it,expect } from 'vitest'
import saved from './fixtures/temporary45GlideBaseline.json'
import type { CombinedPolicy } from '../src/model/combined'
import { scoreCombined } from '../src/model/combined'
import {
  topRateAtYear,topRateGlideTaxForYear,taxAtTopRate,type TopRateGlidepath,
} from '../src/model/topRateGlidepath'

const policy=saved.scenario.policy as CombinedPolicy
const fy=(name:string,score:ReturnType<typeof scoreCombined>,glide?:TopRateGlidepath)=>{
 const years=score.combined.years
 const find=(y:number)=>years.find(r=>r.year===y)!
 const prim=(y:number)=>find(y).primaryBalance/find(y).nominalGDP
 const peak=years.reduce((m,r)=>r.endingDebtGDP>m.value?
   {year:r.year,value:r.endingDebtGDP}:m,{year:0,value:-Infinity})
 const first=years.find(r=>r.primaryBalance>=0)?.year??null
 const firstSustained=years.find((r,i)=>
    r.primaryBalance>=0 && years.slice(i).every(t=>t.primaryBalance>=0))?.year??null
 const maxDeficitAfterFirst=first===null?null:Math.max(0,...years.filter(r=>r.year>first)
    .map(r=>-r.primaryBalance/r.nominalGDP))
 const full=glide?topRateGlideTaxForYear(policy.tax,glide):null
 return{
  name,glide:glide??null,
  topRates:full?[2026,2028,2030,2035,2040,2045,2050,2055,2060,2070,2095]
    .map(y=>({year:y,rate:full(y).rate})):null,
  primary:{
    y2026:prim(2026),y2028:prim(2028),y2030:prim(2030),
    y2035:prim(2035),y2040:prim(2040),y2045:prim(2045),
    y2050:prim(2050),y2060:prim(2060),y2095:prim(2095),
  },
  firstPrimarySurplus:first,firstSustainedPrimarySurplus:firstSustained,
  maxDeficitAfterFirst,
  debt:{y2035:find(2035).endingDebtGDP,y2050:find(2050).endingDebtGDP,
    y2060:find(2060).endingDebtGDP,y2080:find(2080).endingDebtGDP,
    y2095:find(2095).endingDebtGDP,
    peak:peak.value,peakYear:peak.year},
  firstDebtBelow40:years.find(r=>r.endingDebtGDP<=.4)?.year??null,
  fullFiscalCheck:prim(2035)>=0&&find(2095).endingDebtGDP<=.4
    &&peak.value<=1.50,
  primaryCapBindingYears:years.filter(r=>r.revenue+1e-6<r.scheduledRevenueRate*r.nominalGDP).length,
 }
}

describe('Temporary 45% top wage/DBCFT rate: 35% statutory glide',()=>{
 it('applies identical annual DBCFT and highest wage rate without altering the lower wage ladder',()=>{
  const path:TopRateGlidepath={initialRate:.45,floorRate:.35,holdThroughYear:2030,floorYear:2045}
  const build=topRateGlideTaxForYear(policy.tax,path)
  expect(topRateAtYear(path,2026)).toBeCloseTo(.45)
  expect(topRateAtYear(path,2030)).toBeCloseTo(.45)
  expect(topRateAtYear(path,2045)).toBeCloseTo(.35)
  expect(topRateAtYear(path,2037)).toBeGreaterThan(.35)
  for(const year of [2026,2030,2035,2040,2045,2095]){
    const tax=build(year)
    expect(tax.rate).toBeCloseTo(tax.progressiveWageBrackets!.at(-1)!.rate)
    expect(tax.progressiveWageBrackets!.slice(0,-1))
      .toEqual(policy.tax.progressiveWageBrackets!.slice(0,-1))
    expect(tax.adultCredit).toBe(3300)
    expect(tax.childCredit).toBe(5400)
  }
  expect(taxAtTopRate(policy.tax,.35).rate).toBe(.35)
 })
 it('scores annual glide and compares first-year primary closing with sustained primary and long-run debt',()=>{
  const constant45=scoreCombined(policy)
  const constant45Callback=scoreCombined(policy,'cpi',()=>policy.tax)
  expect(constant45Callback.combined.years[20]!.endingDebtGDP)
    .toBeCloseTo(constant45.combined.years[20]!.endingDebtGDP,10)
  const constant35Tax=taxAtTopRate(policy.tax,.35)
  const constant35=scoreCombined({...policy,tax:constant35Tax})
  const paths:TopRateGlidepath[]=[
   {initialRate:.45,floorRate:.35,holdThroughYear:2028,floorYear:2035},
   {initialRate:.45,floorRate:.35,holdThroughYear:2028,floorYear:2040},
   {initialRate:.45,floorRate:.35,holdThroughYear:2028,floorYear:2045},
   {initialRate:.45,floorRate:.35,holdThroughYear:2028,floorYear:2050},
   {initialRate:.45,floorRate:.35,holdThroughYear:2030,floorYear:2040},
   {initialRate:.45,floorRate:.35,holdThroughYear:2030,floorYear:2045},
   {initialRate:.45,floorRate:.35,holdThroughYear:2030,floorYear:2050},
   {initialRate:.45,floorRate:.35,holdThroughYear:2035,floorYear:2045},
   {initialRate:.45,floorRate:.35,holdThroughYear:2035,floorYear:2050},
   {initialRate:.45,floorRate:.35,holdThroughYear:2035,floorYear:2055},
   {initialRate:.45,floorRate:.35,holdThroughYear:2040,floorYear:2050},
   {initialRate:.45,floorRate:.35,holdThroughYear:2040,floorYear:2060},
   {initialRate:.45,floorRate:.35,holdThroughYear:2045,floorYear:2065},
  ]
  const results=[
    fy('permanent45',constant45),
    fy('permanent35-from-2026',constant35),
    ...paths.map(p=>fy('hold'+p.holdThroughYear+'-floor'+p.floorYear,
      scoreCombined(policy,'cpi',topRateGlideTaxForYear(policy.tax,p)),p)),
  ]
  const low=results.find(x=>x.name==='permanent35-from-2026')!
  const high=results.find(x=>x.name==='permanent45')!
  expect(high.debt.y2095).toBeLessThan(low.debt.y2095)
  for(const x of results){
    expect(Number.isFinite(x.debt.y2095)).toBe(true)
    expect(Number.isFinite(x.primary.y2035)).toBe(true)
  }
  console.log('TEMPORARY_45_TO_35_GLIDEPATH_RESULTS_JSON='+JSON.stringify(results))
 },600000)
})
