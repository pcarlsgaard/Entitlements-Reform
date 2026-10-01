import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../src/model/defaults'
import { projectedSurvival } from '../src/model/demographics'
import { socialSecurityBenefitBins } from '../src/model/socialSecurityDistribution'

const a = defaultAssumptions

// SSA MINT projected covered earnings distribution (2024 dollars), taxpayers age 31+.
// We use log interpolation between the published 10th, median, and 90th percentiles.
// This is only a wage denominator for the replacement-saving-rate experiment.
function annualEarningsAtPercentile(p: number): number {
  const points = [
    [0.10, 9225],
    [0.50, 53210],
    [0.90, 152084],
  ] as const
  const [p1, w1, p2, w2] = p <= 0.50
    ? [points[0][0], points[0][1], points[1][0], points[1][1]]
    : [points[1][0], points[1][1], points[2][0], points[2][1]]
  const t = (p - p1) / (p2 - p1)
  return Math.exp(Math.log(w1) + t * (Math.log(w2) - Math.log(w1)))
}

function annuityFactorAt67(birthYear: number): number {
  let pv = 0
  for (let age = 67; age <= a.maxModeledAge; age += 1) {
    pv += projectedSurvival(67, age, birthYear) /
      (1 + a.actuarialDiscountRate) ** (age - 67)
  }
  return pv
}

function accumulationFactor(retirementYear: number, percentile: number): number {
  if (retirementYear <= a.reformYear) return 0
  const wage2026 = annualEarningsAtPercentile(percentile)
  let fv = 0
  for (let year = a.reformYear; year < retirementYear; year += 1) {
    const realWage = wage2026 *
      (1 + a.currentLawSSBenefitRealGrowth) ** (year - a.reformYear)
    fv += realWage *
      (1 + a.realEndowmentYield) ** (retirementYear - year - 1)
  }
  return fv
}

function row(targetFPL: number, transitionYears: number, retirementYear: number) {
  const alpha = Math.max(0, Math.min(1, (retirementYear - a.reformYear) / transitionYears))
  const birthYear = retirementYear - 67
  const currentLawReferenceYear = retirementYear
  const realAwardGrowth = (1 + a.currentLawSSBenefitRealGrowth) **
    Math.max(0, currentLawReferenceYear - a.reformYear)
  const flat = a.individualFPL2026 * targetFPL
  const annuity = annuityFactorAt67(birthYear)

  let losingShare = 0
  let weightedSaverRate = 0
  let saverWeight = 0
  let weightedBenefitLoss = 0
  const detail: Record<string, number | null> = {}

  for (const bin of socialSecurityBenefitBins) {
    const current = a.currentLawSSBenefit2026 * bin.relativeBenefit *
      realAwardGrowth
    const reformed = (1 - alpha) * current + alpha * flat
    const annualLoss = Math.max(0, current - reformed)
    if (annualLoss > 0) {
      losingShare += bin.share
      const pvLoss = annualLoss * annuity
      const accum = accumulationFactor(retirementYear, bin.percentileMidpoint)
      const rate = accum > 0 ? pvLoss / accum : null
      if (rate !== null) {
        weightedSaverRate += bin.share * rate
        saverWeight += bin.share
      }
      weightedBenefitLoss += bin.share * annualLoss / current
    }
  }

  for (const p of [0.50, 0.75, 0.90] as const) {
    const bin = socialSecurityBenefitBins.find(b => b.percentileMidpoint >= p) ?? socialSecurityBenefitBins.at(-1)!
    const current = a.currentLawSSBenefit2026 * bin.relativeBenefit *
      realAwardGrowth
    const reformed = (1 - alpha) * current + alpha * flat
    const annualLoss = Math.max(0, current - reformed)
    const pvLoss = annualLoss * annuity
    const accum = accumulationFactor(retirementYear, p)
    detail['saveRateP' + Math.round(p * 100)] = accum > 0 ? pvLoss / accum : null
    detail['benefitLossP' + Math.round(p * 100)] = current > 0 ? annualLoss / current : null
  }

  return {
    targetFPL,
    transitionYears,
    retirementYear,
    alpha,
    losingShare,
    avgSaverRateAmongLosers: saverWeight > 0 ? weightedSaverRate / saverWeight : 0,
    avgAnnualBenefitLossAmongPopulation: weightedBenefitLoss,
    ...detail,
  }
}

describe('flat transition replacement-saving experiment', () => {
  it('prints transition incidence and replacement saving rates', () => {
    const designs = [
      [1.25, 40],
      [1.25, 30],
      [1.50, 30],
      [1.75, 20],
      [2.00, 20],
      [2.00, 15],
      [2.00, 10],
    ] as const
    const years = [2035, 2045, 2055, 2065]
    const report = designs.flatMap(([target, transition]) =>
      years.map(year => row(target, transition, year)))
    console.log('FLAT_SAVINGS_EXPERIMENT=' + JSON.stringify(report))
    expect(report.length).toBe(designs.length * years.length)
  }, 30_000)
})
