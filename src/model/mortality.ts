import { ssaPeriodLifeTable } from '../data/ssaLifeTable'

export function lifeTableSurvivors(age: number): number {
  if (age < 0) throw new RangeError('Age cannot be negative')
  const exact = ssaPeriodLifeTable.find((point) => point.age === age)
  if (exact) return exact.unisexLx
  if (age > (ssaPeriodLifeTable.at(-1)?.age ?? 0)) return 0

  const upperIndex = ssaPeriodLifeTable.findIndex((point) => point.age > age)
  if (upperIndex <= 0) return ssaPeriodLifeTable[0]?.unisexLx ?? 0
  const lower = ssaPeriodLifeTable[upperIndex - 1]
  const upper = ssaPeriodLifeTable[upperIndex]
  if (!lower || !upper) return 0
  const weight = (age - lower.age) / (upper.age - lower.age)
  return lower.unisexLx + weight * (upper.unisexLx - lower.unisexLx)
}

export function survivalProbability(fromAge: number, toAge: number): number {
  if (toAge < fromAge) {
    throw new RangeError('Conditional survival requires toAge >= fromAge')
  }
  const denominator = lifeTableSurvivors(fromAge)
  if (denominator <= 0) return 0
  return lifeTableSurvivors(toAge) / denominator
}
