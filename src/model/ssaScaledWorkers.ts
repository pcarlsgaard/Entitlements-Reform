/**
 * SSA OCACT 2026 scaled-worker illustrations and a statutory retired-worker
 * AIME/PIA calculator. Inputs are hypothetical annual earnings histories;
 * scaled profiles are not a population microsimulation.
 *
 * Source: https://www.ssa.gov/OACT/NOTES/ran3/an2026-3.pdf Table 6, pp 8–9
 * AWI: https://www.ssa.gov/OACT/COLA/AWI.html (1977–2025)
 * PIA: https://www.ssa.gov/OACT/COLA/piaformula.html (1979 base bends)
 */
import { ssaRealCoveredWageGrowth } from '../data/trustees2026'
import { currentLawClaimFactor } from './claiming'
import type { ModelAssumptions } from './types'
export type ScaledWorkerClass='veryLow'|'low'|'medium'|'high'
export const scaledWorkerClasses:readonly ScaledWorkerClass[]=['veryLow','low','medium','high']
export const scaledWorkerAIMEPercentOfAWI={veryLow:.25,low:.45,medium:1,high:1.6} as const
// SSA 2026 actuarial note Table 6: preliminary adjusted ages 21–64; exact
// published final factors are at most 0.001 different after rounding.
export const preliminaryScaledFactors21to64:readonly number[]=[
 .226,.279,.357,.426,.480,.527,.571,.611,.647,.678,
 .706,.732,.754,.775,.793,.808,.822,.834,.845,.854,
 .863,.870,.876,.882,.887,.890,.893,.894,.894,.893,
 .892,.888,.883,.876,.867,.851,.832,.812,.788,.758,
 .717,.693,.669,.646,
]
export const scaledAdjustment={veryLow:.306,low:.550,medium:1.223,high:1.957} as const
// OCACT Table 6 explicitly ends at age 64. Ages 65+ have zero earnings in
// this canonical scaled-worker exercise; extensions must be separately modeled.
export function scaledFactor(age:number,tier:ScaledWorkerClass):number{
 if(age<21||age>64)return 0
 return preliminaryScaledFactors21to64[age-21]!*scaledAdjustment[tier]
}
const awi1977to2025:readonly number[]=[
 9779.44,10556.03,11479.46,12513.46,13773.10,14531.34,
 15239.24,16135.07,16822.51,17321.82,18426.51,19334.04,
 20099.55,21027.98,21811.60,22935.42,23132.67,23753.53,
 24705.66,25913.90,27426.00,28861.44,30469.84,32154.82,
 32921.92,33252.09,34064.95,35648.55,36952.94,38651.41,
 40405.48,41334.97,40711.61,41673.83,42979.61,44321.67,
 44888.16,46481.52,48098.63,48642.15,50321.89,52145.80,
 54099.99,55628.60,60575.07,63795.13,66621.80,69846.57,72800.33,
]
const awiCache=new Map<string,number>()
export function nationalAverageWageIndex(year:number,a:ModelAssumptions):number{
 if(!Number.isInteger(year))throw new Error('AWI year must be an integer')
 if(year>=1977&&year<=2025)return awi1977to2025[year-1977]!
 if(year<1977)throw new RangeError('Historical AWI starts in 1977 for this model')
 const key=[year,a.inflation,a.realWageGrowthDeviation].join(':')
 const found=awiCache.get(key)
 if(found!==undefined)return found
 let value=awi1977to2025.at(-1)!
 for(let y=2026;y<=year;y++)
   value*=(1+ssaRealCoveredWageGrowth(y)+a.realWageGrowthDeviation)*(1+a.inflation)
 awiCache.set(key,value)
 return value
}
export interface CoveredEarning{year:number,age:number,coveredEarnings:number}
// Simplified 2026 taxable maximum ratio; scaled very-low through high profiles
// are below this ceiling. This must not be used for the SSA maximum-earner case.
const coveredCeiling2026=184500
export function projectedTaxableMaximum(year:number,a:ModelAssumptions):number{
 if(year===2026)return coveredCeiling2026
 return coveredCeiling2026*nationalAverageWageIndex(year,a)/nationalAverageWageIndex(2026,a)
}
export function scaledWorkerEarnings(birthYear:number,tier:ScaledWorkerClass,
 a:ModelAssumptions):CoveredEarning[]{
 return Array.from({length:44},(_,i)=>{
  const age=i+21,year=birthYear+age
  const raw=scaledFactor(age,tier)*nationalAverageWageIndex(year,a)
  return {year,age,coveredEarnings:Math.min(raw,projectedTaxableMaximum(year,a))}
 })
}
export function averageIndexedMonthlyEarnings(record:readonly CoveredEarning[],
 birthYear:number,a:ModelAssumptions):number{
 const age60Year=birthYear+60
 const baseAWI=nationalAverageWageIndex(age60Year,a)
 const indexed=record.filter(r=>r.age>=21&&r.year<=birthYear+70).map(r=>{
   const cap=r.coveredEarnings
   return Math.max(0,cap)*(r.year<age60Year?baseAWI/nationalAverageWageIndex(r.year,a):1)
 })
 indexed.sort((x,y)=>y-x)
 const sum=indexed.slice(0,35).reduce((s,v)=>s+v,0)
 return Math.floor(sum/(35*12))
}
export function piaBendPoints(eligibilityYear:number,a:ModelAssumptions){
 const ratio=nationalAverageWageIndex(eligibilityYear-2,a)/9779.44
 return {first:Math.round(180*ratio),second:Math.round(1085*ratio)}
}
export function primaryInsuranceAmount(aime:number,eligibilityYear:number,a:ModelAssumptions):number{
 const {first,second}=piaBendPoints(eligibilityYear,a)
 const pia=.9*Math.min(aime,first)+.32*Math.max(0,Math.min(aime,second)-first)+
   .15*Math.max(0,aime-second)
 return Math.floor((pia+1e-8)*10)/10
}
const historicCola:Record<number,number>={2022:.059,2023:.087,2024:.032,2025:.025,2026:.028}
export function projectedCOLA(year:number,a:ModelAssumptions):number{
 return historicCola[year]??a.inflation
}
export interface ScaledWorkerRetirementBenefit {
 aime:number;piaAt62:number;piaAtClaim:number;annualAtClaim:number;claimYear:number;
 indexedEarningsYears:number
}
export function scaledWorkerRetirementBenefit(birthYear:number,tier:ScaledWorkerClass,
 claimAge:number,a:ModelAssumptions):ScaledWorkerRetirementBenefit{
 const earnings=scaledWorkerEarnings(birthYear,tier,a)
 const aime=averageIndexedMonthlyEarnings(earnings,birthYear,a)
 const eligibilityYear=birthYear+62,claimYear=birthYear+claimAge
 const piaAt62=primaryInsuranceAmount(aime,eligibilityYear,a)
 let piaAtClaim=piaAt62
 for(let year=eligibilityYear+1;year<=claimYear;year++)
   piaAtClaim=Math.floor((piaAtClaim*(1+projectedCOLA(year,a))+1e-8)*10)/10
 return {aime,piaAt62,piaAtClaim,
  annualAtClaim:piaAtClaim*12*currentLawClaimFactor(claimAge),
  claimYear,indexedEarningsYears:earnings.filter(r=>r.coveredEarnings>0).length}
}
