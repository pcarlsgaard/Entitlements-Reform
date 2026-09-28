import { projectedSurvival } from './demographics'
import type { ModelAssumptions } from './types'

export const earliestClaimAge = 62
export function annualWorkCredit(realEarnings: number, qualifyingEarnings2026: number): number {
  return Math.min(1, Math.max(0, realEarnings) / Math.max(1, qualifyingEarnings2026))
}
export function workCreditFraction(creditedYears: number, a: ModelAssumptions): number {
  return Math.min(1, Math.max(0, creditedYears) / Math.max(1, a.vestingYears))
}
export function representativeWorkCredits(a: ModelAssumptions): number {
  return a.averageWorkingYears * annualWorkCredit(a.averageAnnualEarnings2026, a.qualifyingEarnings2026)
}
const cache = new Map<string, number>()
/** Expected real payments discounted to age 62, including survival to claim age. */
export function claimAnnuity(birthYear: number, claimAge: number, a: ModelAssumptions): number {
  const key = [birthYear, claimAge, a.maxModeledAge, a.actuarialDiscountRate, a.realFPLGrowth].join(':')
  const found = cache.get(key)
  if (found !== undefined) return found
  let value = 0
  for (let age = claimAge; age <= a.maxModeledAge; age++) {
    value += projectedSurvival(62, age, birthYear) *
      ((1 + a.realFPLGrowth) / (1 + a.actuarialDiscountRate)) ** (age - 62)
  }
  cache.set(key, value)
  return value
}
export function actuarialClaimFactor(birthYear: number, claimAge: number, a: ModelAssumptions): number {
  if (claimAge < earliestClaimAge) return 0
  return claimAnnuity(birthYear, a.fullRetirementAge, a) / claimAnnuity(birthYear, claimAge, a)
}
/** Simplified current-law FRA-67 reduction and delayed credit, capped at age 70. */
export function currentLawClaimFactor(age: number): number {
  if (age < 62) return 0
  const earlyMonths = Math.max(0, (67 - age) * 12)
  return age < 67 ? 1 - Math.min(36, earlyMonths) * (5 / 900) - Math.max(0, earlyMonths - 36) * (5 / 1200)
    : 1 + Math.max(0, Math.min(70, age) - 67) * 0.08
}
