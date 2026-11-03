/**
 * Wage-anchored household lifetime earnings and SSA PIA calculation.
 *
 * Both the wage-tax timeline and private-account contributions should use
 * individualNominalEarnings; the same function builds the lifetime covered
 * earnings history for scheduled current-law Social Security.
 *
 * The 2026 observed wage calibrates the SSA median scaled worker age profile.
 * Only the past `creditedYears2026` are reconstructed; all earlier years are
 * zero, preventing a fictional 35-year pre-2026 career. That remains a
 * stylized approximation, not an observed SSA earnings record.
 */
import { currentLawClaimFactor } from './claiming'
import { averageIndexedMonthlyEarnings, nationalAverageWageIndex,
  primaryInsuranceAmount, projectedCOLA, projectedTaxableMaximum,
  scaledFactor } from './ssaScaledWorkers'
import type { CoveredEarning } from './ssaScaledWorkers'
import type { ModelAssumptions } from './types'

export interface IndividualWageScenario {
  age2026: number
  wage2026: number
  workThroughAge: number
  creditedYearsBefore2026: number
}

/** SSA published factors cover ages 21–64. Flat-shape extension for adjacent ages. */
function ageShape(age: number): number {
  return scaledFactor(Math.max(21,Math.min(64,age)),'medium')
}

/** Annual nominal cash wage, with AWI growth and an age-specific career pattern. */
export function individualNominalEarnings(
  worker: IndividualWageScenario, year: number, a: ModelAssumptions,
): number {
  const age=worker.age2026+year-2026
  if(worker.wage2026<=0||age<18||age>worker.workThroughAge)return 0
  const anchor=ageShape(worker.age2026)
  if(anchor<=0)return 0
  const award=worker.wage2026*
    nationalAverageWageIndex(year,a)/nationalAverageWageIndex(2026,a)*
    ageShape(age)/anchor
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
  for(let age=21;age<claimAge;age++){
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
