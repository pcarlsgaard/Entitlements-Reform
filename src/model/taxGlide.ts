import { scoreCombined, type CombinedPolicy } from './combined'
import type { ReformSettings } from '../tax/model/types'
import type { SimulationResult } from './types'

/** Match the DBCFT headline rate and highest wage rate every year. */
export function taxWithMatchedTopRate(
  base: ReformSettings, rate: number,
): ReformSettings {
  const rates = base.progressiveWageBrackets
  if (!rates || rates.length !== 5 || Math.abs(rates[3]!.rate - .35) > 1e-9) {
    throw new Error('The 45-to-35 glide requires four preserved lower bands with a 35% fourth rate.')
  }
  if (rate < .35 || rate > .45) throw new Error('Glide top rate must remain 35%–45%.')
  return { ...base, rate,
    progressiveWageBrackets: rates.map((b,i)=>i===rates.length-1?{...b,rate}:{...b}) }
}

/**
 * Last year's full 45% rate is firstCutYear-1; firstCutYear begins the cut.
 * duration=10 means ten annual one-percentage-point cuts 45%→35%.
 * Four lower rates, thresholds and all credits remain fixed.
 */
export function linearTopRate(
  year:number, firstCutYear:number, duration:number,
  initial=.45, floor=.35,
):number {
  if (!Number.isInteger(firstCutYear) || !Number.isInteger(duration) || duration<1)
    throw new Error('Glide start and duration must be integer years.')
  const fraction = Math.max(0,Math.min(1,(year-firstCutYear+1)/duration))
  return initial+(floor-initial)*fraction
}
export interface GlideResult {
  label:string
  firstCutYear:number|null
  durationYears:number|null
  fullyAt35Year:number|null
  rate2030:number
  rate2035:number
  rate2040:number
  rate2050:number
  firstPrimarySurplusYear:number|null
  firstThreeYearPrimarySurplus:number|null
  primary2030GDP:number
  primary2035GDP:number
  primary2040GDP:number
  primary2050GDP:number
  primary2095GDP:number
  primaryDeficitYears2035to2055:number
  peakDebtGDP:number
  yearOfPeakDebt:number
  debt2035GDP:number
  debt2050GDP:number
  debt2075GDP:number
  debt2095GDP:number
  minimumAnnualRevenueRate:number
  maximumAnnualRevenueRate:number
  meets2035Primary:boolean
  meets2095DebtTarget40:boolean
  meetsPeakDebt150:boolean
  /** The model cannot impose an endogenous base elasticity or automatic fiscal brake. */
  fiscalAdjustmentTo40GDP:number
}
export interface GlideExperiment {
  /** Constant-45 first-surplus date is an endogenous observation, not automatic legal trigger. */
  constant45FirstPrimarySurplus:number|null
  constant45FirstThreeYearPrimarySurplus:number|null
  constant45:GlideResult
  immediate35:GlideResult
  glides:GlideResult[]
}
function year3Positive(sim:SimulationResult):number|null{
  const y=sim.years
  const first=y.find((r,i)=>i<=y.length-3&&
    y[i]!.primaryBalance>=0&&y[i+1]!.primaryBalance>=0&&y[i+2]!.primaryBalance>=0)
  return first?.year??null
}
function toResult(
  label:string,score:ReturnType<typeof scoreCombined>,
  rateAtYear:(year:number)=>number,firstCutYear:number|null,durationYears:number|null,
):GlideResult{
  const sim=score.combined
  const ys=sim.years
  const year=(y:number)=>ys.find(r=>r.year===y)!
  const primary=(y:number)=>year(y).primaryBalance/year(y).nominalGDP
  const worst=ys.reduce((prev,y)=>y.endingDebtGDP>prev.endingDebtGDP?y:prev,ys[0]!)
  const revenueRates=ys.map(y=>y.revenueRate)
  return {
    label,firstCutYear,durationYears,
    fullyAt35Year:firstCutYear===null||durationYears===null?null:firstCutYear+durationYears-1,
    rate2030:rateAtYear(2030),rate2035:rateAtYear(2035),
    rate2040:rateAtYear(2040),rate2050:rateAtYear(2050),
    firstPrimarySurplusYear:ys.find(y=>y.primaryBalance>=0)?.year??null,
    firstThreeYearPrimarySurplus:year3Positive(sim),
    primary2030GDP:primary(2030),primary2035GDP:primary(2035),
    primary2040GDP:primary(2040),primary2050GDP:primary(2050),
    primary2095GDP:primary(2095),
    primaryDeficitYears2035to2055:ys.filter(y=>y.year>=2035&&y.year<=2055&&y.primaryBalance<0).length,
    peakDebtGDP:worst.endingDebtGDP,yearOfPeakDebt:worst.year,
    debt2035GDP:year(2035).endingDebtGDP,
    debt2050GDP:year(2050).endingDebtGDP,
    debt2075GDP:year(2075).endingDebtGDP,
    debt2095GDP:year(2095).endingDebtGDP,
    minimumAnnualRevenueRate:Math.min(...revenueRates),
    maximumAnnualRevenueRate:Math.max(...revenueRates),
    meets2035Primary:primary(2035)>=0,
    meets2095DebtTarget40:year(2095).endingDebtGDP<=.40000001,
    meetsPeakDebt150:worst.endingDebtGDP<=1.50000001,
    fiscalAdjustmentTo40GDP:score.additionalFiscalAdjustmentGDP,
  }
}
export function evaluateTaxGlides(
  policy:CombinedPolicy,
  starts:number[],durations:number[],
):GlideExperiment {
  const t=policy.tax
  if(Math.abs(t.rate-.45)>1e-9||t.progressiveWageBrackets?.length!==5||
     Math.abs(t.progressiveWageBrackets[4]!.rate-.45)>1e-9)
    throw new Error('Expected 45% business/top-wage base with five rate bands.')
  const score45=scoreCombined(policy)
  const constant45=toResult('Constant 45%',score45,()=>.45,null,null)
  const base35={...policy,tax:taxWithMatchedTopRate(t,.35)}
  const score35=scoreCombined(base35)
  const immediate35=toResult('Immediate permanent 35%',score35,()=>.35,null,null)
  const glides:GlideResult[]=[]
  for(const start of starts){
    for(const duration of durations){
      const rateForYear=(y:number)=>linearTopRate(y,start,duration)
      const annualTax=(y:number)=>taxWithMatchedTopRate(t,rateForYear(y))
      const score=scoreCombined(policy,'cpi',annualTax)
      glides.push(toResult(
        `First cut ${start}, ${duration}-year glide`,
        score,rateForYear,start,duration))
    }
  }
  return{
    constant45FirstPrimarySurplus:constant45.firstPrimarySurplusYear,
    constant45FirstThreeYearPrimarySurplus:constant45.firstThreeYearPrimarySurplus,
    constant45,immediate35,glides,
  }
}
