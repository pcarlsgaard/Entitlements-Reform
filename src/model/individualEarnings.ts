/**
 * Wage-anchored household lifetime earnings and SSA PIA calculation.
 *
 * Both the wage-tax timeline and private-account contributions should use
 * individualNominalEarnings; the same function builds the lifetime covered
 * earnings history for scheduled current-law Social Security.
 *
 * Each worker's entered 2026 wage is held at a fixed proportion of the
 * national Average Wage Index (AWI), forward and backward in time.
 * Pre-2026 wages are reconstructed only for the entered past credited years,
 * avoiding a fictional full career. All post-2026 annual wages, personal
 * account contributions, and the AIME/PIA history therefore come from the
 * same function. No SSA age-specific wage profile is applied yet.
 */
import { currentLawClaimFactor } from './claiming'
import { averageIndexedMonthlyEarnings, nationalAverageWageIndex,
  primaryInsuranceAmount, projectedCOLA, projectedTaxableMaximum } from './ssaScaledWorkers'
import type { CoveredEarning } from './ssaScaledWorkers'
import type { ModelAssumptions } from './types'

export interface IndividualWageScenario {
  age2026: number
  wage2026: number
  workThroughAge: number
  creditedYearsBefore2026: number
}

/** Annual nominal cash wage at the same proportion of AWI as in 2026. */
export function individualNominalEarnings(
  worker: IndividualWageScenario, year: number, a: ModelAssumptions,
): number {
  const age=worker.age2026+year-2026
  if(worker.wage2026<=0||age<18||age>worker.workThroughAge)return 0
  const award=worker.wage2026*
    nationalAverageWageIndex(year,a)/nationalAverageWageIndex(2026,a)
  if(year<2026){
    const n=Math.max(0,worker.creditedYearsBefore2026)
    const firstYear=2026-Math.ceil(n)
    if(year<firstYear||n===0)return 0
    if(year===firstYear&&n%1!==0)return award*(n%1)
  }
  return award
}

export function individualCoveredEarnings(
  worker: IndividualWageScenario, birthYear: number, claimAge: number,
  a: ModelAssumptions,
): CoveredEarning[] {
  const history:CoveredEarning[]=[]
  for(let age=18;age<claimAge;age++){
    const year=birthYear+age
    history.push({
      age,year,
      coveredEarnings:Math.min(
        Math.max(0,individualNominalEarnings(worker,year,a)),
        projectedTaxableMaximum(year,a)),
    })
  }
  return history
}

export interface IndividualSSBenefit {
  aime:number
  eligibilityPIA:number
  scheduledAnnualNominal:number
}

/** Scheduled own-record retired-worker benefit, including COLA and claiming factor.
 * Full benefit recomputation after claiming and spousal/survivor rules are omitted.
 */
export function individualScheduledSocialSecurity(
  worker: IndividualWageScenario, claimAge:number, paymentYear:number,
  a:ModelAssumptions,
):IndividualSSBenefit {
  const birthYear=2026-worker.age2026
  if(paymentYear<birthYear+claimAge)return {aime:0,eligibilityPIA:0,scheduledAnnualNominal:0}
  const earnings=individualCoveredEarnings(worker,birthYear,claimAge,a)
  const aime=averageIndexedMonthlyEarnings(earnings,birthYear,a)
  const eligibilityYear=birthYear+62
  const eligibilityPIA=primaryInsuranceAmount(aime,eligibilityYear,a)
  let pia=eligibilityPIA
  for(let year=eligibilityYear+1;year<=paymentYear;year++)
    pia*=1+projectedCOLA(year,a)
  return {aime,eligibilityPIA,
    scheduledAnnualNominal:pia*12*currentLawClaimFactor(claimAge)}
}
