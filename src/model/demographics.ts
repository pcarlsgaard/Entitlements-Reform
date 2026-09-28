import data from '../data/ssaProjections.json'
import type { ModelAssumptions } from './types'

const index = (year: number) => Math.max(0, Math.min(data.endYear - data.startYear, year - data.startYear))
const populationCache = new Map<number, number[]>()
/** SSA July population. Its 100+ cell is split using projected survival weights. */
function populationRow(year: number): number[] {
  const y = Math.max(2026, Math.min(2100, year))
  const cached = populationCache.get(y)
  if (cached) return cached
  const raw = data.population[index(y)]!
  const row = raw.slice(0, 100)
  const weights = [1]
  for (let a = 101; a <= 110; a++) {
    const q = (data.maleQ[index(y)]![a - 1]! + data.femaleQ[index(y)]![a - 1]!) / 2
    weights.push(weights.at(-1)! * (1 - q))
  }
  const sum = weights.reduce((s, w) => s + w, 0)
  row.push(...weights.map(w => raw[100]! * w / sum))
  populationCache.set(y, row)
  return row
}
/** Growth control is an annual deviation from SSA's central population path. */
export function populationMillions(year: number, age: number, a: ModelAssumptions): number {
  if (age < 0 || age > a.maxModeledAge) return 0
  const extension = Math.max(0, year - 2100) + Math.min(0, year - 2026)
  return populationRow(year)[age]! / 1e6 * (a.cohortSizeMillions2026 / 4.2) *
    (1 + a.cohortSizeGrowth - 0.002) ** (year - 2026) * (1.002 ** extension)
}
export function eligiblePopulationMillions(year: number, age: number, a: ModelAssumptions): number {
  let total = 0
  for (let i = age; i <= a.maxModeledAge; i++) total += populationMillions(year, i, a)
  return total
}
const survivalCache = new Map<string, number>()
/** 50/50 male/female conditional survival; projected qx follows cohort calendar years.
 * Outside 2026–2100, qx is held at the nearest published year (explicit extension).
 */
export function projectedSurvival(fromAge: number, toAge: number, birthYear: number): number {
  if (toAge < fromAge) throw new RangeError('Conditional survival requires toAge >= fromAge')
  const key = `${fromAge}:${toAge}:${birthYear}`
  const cached = survivalCache.get(key)
  if (cached !== undefined) return cached
  let male = 1, female = 1
  for (let age = fromAge; age < toAge; age++) {
    male *= 1 - (data.maleQ[index(birthYear + age)]?.[age] ?? 1)
    female *= 1 - (data.femaleQ[index(birthYear + age)]?.[age] ?? 1)
  }
  const result = (male + female) / 2
  survivalCache.set(key, result)
  return result
}
