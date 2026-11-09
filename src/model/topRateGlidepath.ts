import type { ReformSettings } from '../tax/model/types'

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
