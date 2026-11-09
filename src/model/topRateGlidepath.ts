import type { ReformSettings } from '../tax/model/types'
import { calculateMacro } from '../tax/model/macro'

/**
 * A transitional, statutory top-rate path.
 * Both the headline DBCFT and highest marginal wage X-tax rate follow
 * precisely the same annual rate. Other wage thresholds, lower rates, and
 * adult/child credit parameters are held constant and CPI-indexed by the
 * calling tax projection.
 */
export interface TopRateGlidepath {
  initialRate: number
  floorRate: number
  /** Rate remains at initialRate in this year. Decline begins the next year. */
  holdThroughYear: number
  /** First year in which the permanent lower rate applies. */
  floorYear: number
}
export function validateTopRateGlidepath(base: ReformSettings, glide: TopRateGlidepath): void {
  const bands = base.progressiveWageBrackets
  if (base.wageTaxMode !== 'progressive' || !bands || bands.length < 2)
    throw new Error('Rate glide requires a progressive X-tax wage ladder')
  if (Math.abs(bands.at(-1)!.rate - base.rate) > 1e-8)
    throw new Error('The initial DBCFT rate must match the top wage rate')
  if (glide.floorRate < bands[bands.length - 2]!.rate - 1e-8)
    throw new Error('The glide floor cannot be below the preceding wage bracket')
  if (Math.abs(base.rate - glide.initialRate)>1e-8)
    throw new Error('The baseline and glide start top rates differ')
  if (glide.floorRate > glide.initialRate ||
      glide.holdThroughYear < 2026 || glide.floorYear <= glide.holdThroughYear)
    throw new Error('Glide years and rate endpoints are inconsistent')
}
export function topRateAtYear(glide: TopRateGlidepath, year: number):number {
  if(year <= glide.holdThroughYear) return glide.initialRate
  if(year >= glide.floorYear) return glide.floorRate
  const fraction=(year-glide.holdThroughYear)/(glide.floorYear-glide.holdThroughYear)
  return glide.initialRate+(glide.floorRate-glide.initialRate)*fraction
}
export function taxAtTopRate(base: ReformSettings, rate: number):ReformSettings {
  const bands = base.progressiveWageBrackets
  if (!bands?.length) throw new Error('Missing progressive wage brackets')
  if(rate<bands[bands.length-2]!.rate-1e-8)
    throw new Error('Top rate cannot be below fourth wage bracket')
  return {...base, rate,
    progressiveWageBrackets:bands.map((band,i)=>i===bands.length-1
      ?{...band,rate}:{...band})
  }
}
export function topRateGlideTaxForYear(base:ReformSettings, glide:TopRateGlidepath) {
  validateTopRateGlidepath(base,glide)
  return (year:number)=>taxAtTopRate(base,topRateAtYear(glide,year))
}

/**
 * One explicit (not empirically calibrated) adverse taxable-business-base
 * response. Illustrative elasticity is with respect to net-of-tax rate,
 * normalized to the taxable base at a permanent 35% business tax:
 *
 * B(rate) / B(35%) = [(1-rate)/(1-.35)]^elasticity
 *
 * The source simulator assumes zero such base erosion. This function returns
 * a NEGATIVE fraction of 2026 GDP to subtract from simulated annual receipts.
 * It holds this static GDP-share hit at each year's statutory business rate.
 * This does not include capital formation feedback, avoidance thresholds,
 * cross-border adjustment, or the possible gains in revenue when rates fall.
 */
export function businessBaseElasticityAdjustmentGDP(
  base:ReformSettings,
  statutoryRateForYear:(year:number)=>number,
  elasticity:number,
  referenceRate=.35,
):(year:number)=>number {
  if(!Number.isFinite(elasticity)||elasticity<0||!Number.isFinite(referenceRate)
    ||referenceRate<0||referenceRate>=1)throw new Error('Invalid business base sensitivity')
  const score=calculateMacro(base)
  return (year:number)=>{
    const rate=statutoryRateForYear(year)
    if(rate<0||rate>=1)throw new Error('Invalid annual business rate')
    const baseFraction=Math.pow((1-rate)/(1-referenceRate),elasticity)
    return -rate*score.businessTaxableBase*(1-baseFraction)/score.gdp
  }
}
