import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../src/model/defaults'
import { projectedSurvival } from '../src/model/demographics'
import { relativeBenefitAtPercentile, socialSecurityBenefitBins } from '../src/model/socialSecurityDistribution'

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


import { calculateHousehold } from '../src/tax/model/household'
import { defaultCombinedPolicy } from '../src/model/combined'
import { realWageGrowthFactor } from '../src/model/taxProjection'

function accumulatedTaxGain(retirementYear: number, wage2026: number): number {
  let fv = 0
  for (let year = a.reformYear; year < retirementYear; year += 1) {
    const wage = wage2026 * realWageGrowthFactor(year, a)
    const gain = calculateHousehold(
      { filingStatus: 'single', cashWage: wage, children: 0 },
      defaultCombinedPolicy.tax,
      defaultCombinedPolicy.health.employerFicaPassThroughRate,
    ).dollarChange
    fv += gain * (1 + a.realEndowmentYield) ** (retirementYear - year - 1)
  }
  return fv
}

function workerRow(
  label: string,
  retirementYear: number,
  wage2026: number,
  relativeBenefit: number,
) {
  const transitionYears = 20
  const alpha = Math.max(0, Math.min(1, (retirementYear - a.reformYear) / transitionYears))
  const birthYear = retirementYear - 67
  const realAwardGrowth = (1 + a.currentLawSSBenefitRealGrowth) ** Math.max(0, retirementYear - a.reformYear)
  const current = a.currentLawSSBenefit2026 * relativeBenefit * realAwardGrowth
  const flat = a.individualFPL2026 * 2
  const reform = (1 - alpha) * current + alpha * flat
  const annualLoss = Math.max(0, current - reform)
  const pvLoss = annualLoss * annuityFactorAt67(birthYear)
  const accumWages = (() => {
    let fv = 0
    for (let year = a.reformYear; year < retirementYear; year += 1) {
      const wage = wage2026 * realWageGrowthFactor(year, a)
      fv += wage * (1 + a.realEndowmentYield) ** (retirementYear - year - 1)
    }
    return fv
  })()
  const saveRate = accumWages > 0 ? pvLoss / accumWages : 0
  const taxFV = accumulatedTaxGain(retirementYear, wage2026)
  const taxCoverage = pvLoss > 0 ? taxFV / pvLoss : null
  const taxGain2026 = calculateHousehold(
    { filingStatus: 'single', cashWage: wage2026, children: 0 },
    defaultCombinedPolicy.tax,
    defaultCombinedPolicy.health.employerFicaPassThroughRate,
  ).dollarChange
  return {
    label,
    retirementYear,
    yearsToRetirement: retirementYear - a.reformYear,
    wage2026,
    currentBenefit: current,
    reformBenefit: reform,
    benefitChange: reform / current - 1,
    saveRate,
    taxGain2026,
    taxGainShareWage2026: taxGain2026 / wage2026,
    taxCoverage,
    residualSaveRateApprox: saveRate - Math.max(0, taxGain2026 / wage2026),
  }
}

describe('200 percent FPL transition cohort table', () => {
  it('prints worker distribution across retirement cohorts', () => {
    const workers = [
      ['P10', annualEarningsAtPercentile(0.10), relativeBenefitAtPercentile(0.10)],
      ['P50', annualEarningsAtPercentile(0.50), relativeBenefitAtPercentile(0.50)],
      ['P75', annualEarningsAtPercentile(0.75), relativeBenefitAtPercentile(0.75)],
      ['P90', annualEarningsAtPercentile(0.90), relativeBenefitAtPercentile(0.90)],
      ['Maximum', 184500, (4152 * 12) / a.currentLawSSBenefit2026],
    ] as const
    const years = [2035, 2045, 2055, 2065, 2075]
    const report = years.flatMap(year =>
      workers.map(([label, wage, relative]) => workerRow(label, year, wage, relative)))
    console.log('FLAT_200_20_COHORT_TABLE=' + JSON.stringify(report))
    expect(report).toHaveLength(25)
  }, 30_000)
})


function accumulationAtReturn(retirementYear: number, percentile: number, realReturn: number): number {
  if (retirementYear <= a.reformYear) return 0
  const wage2026 = annualEarningsAtPercentile(percentile)
  let fv = 0
  for (let year = a.reformYear; year < retirementYear; year += 1) {
    const wage = wage2026 * realWageGrowthFactor(year, a)
    fv += wage * (1 + realReturn) ** (retirementYear - year - 1)
  }
  return fv
}

function accumulatedTaxGainAtReturn(retirementYear: number, wage2026: number, realReturn: number): number {
  let fv = 0
  for (let year = a.reformYear; year < retirementYear; year += 1) {
    const wage = wage2026 * realWageGrowthFactor(year, a)
    const gain = calculateHousehold(
      { filingStatus: 'single', cashWage: wage, children: 0 },
      defaultCombinedPolicy.tax,
      defaultCombinedPolicy.health.employerFicaPassThroughRate,
    ).dollarChange
    fv += gain * (1 + realReturn) ** (retirementYear - year - 1)
  }
  return fv
}

function workerReturnRow(
  label: string,
  percentile: number | null,
  retirementYear: number,
  wage2026: number,
  relativeBenefit: number,
  realReturn: number,
) {
  const transitionYears = 20
  const alpha = Math.max(0, Math.min(1, (retirementYear - a.reformYear) / transitionYears))
  const birthYear = retirementYear - 67
  const realAwardGrowth = (1 + a.currentLawSSBenefitRealGrowth) ** Math.max(0, retirementYear - a.reformYear)
  const current = a.currentLawSSBenefit2026 * relativeBenefit * realAwardGrowth
  const flat = a.individualFPL2026 * 2
  const reform = (1 - alpha) * current + alpha * flat
  const annualLoss = Math.max(0, current - reform)
  const pvLoss = annualLoss * annuityFactorAt67(birthYear)
  let accumWages = 0
  for (let year = a.reformYear; year < retirementYear; year += 1) {
    const wage = wage2026 * realWageGrowthFactor(year, a)
    accumWages += wage * (1 + realReturn) ** (retirementYear - year - 1)
  }
  const saveRate = accumWages > 0 ? pvLoss / accumWages : 0
  const taxFV = accumulatedTaxGainAtReturn(retirementYear, wage2026, realReturn)
  return {
    label,
    retirementYear,
    currentBenefit: current,
    reformBenefit: reform,
    benefitChange: reform / current - 1,
    saveRate,
    taxCoverage: pvLoss > 0 ? taxFV / pvLoss : null,
    residualSaveRate: pvLoss > 0 ? Math.max(0, (pvLoss - taxFV) / accumWages) : 0,
  }
}

describe('200 percent FPL cohort table at 3.5 percent real return', () => {
  it('prints replacement saving rates', () => {
    const workers = [
      ['P10', 0.10, annualEarningsAtPercentile(0.10), relativeBenefitAtPercentile(0.10)],
      ['P50', 0.50, annualEarningsAtPercentile(0.50), relativeBenefitAtPercentile(0.50)],
      ['P75', 0.75, annualEarningsAtPercentile(0.75), relativeBenefitAtPercentile(0.75)],
      ['P90', 0.90, annualEarningsAtPercentile(0.90), relativeBenefitAtPercentile(0.90)],
      ['Maximum', null, 184500, (4152 * 12) / a.currentLawSSBenefit2026],
    ] as const
    const years = [2035, 2045, 2055, 2065, 2075]
    const report = years.flatMap(year =>
      workers.map(([label, percentile, wage, relative]) =>
        workerReturnRow(label, percentile, year, wage, relative, 0.035)))
    console.log('FLAT_200_20_RETURN_35=' + JSON.stringify(report))
    expect(report).toHaveLength(25)
  }, 30_000)
})
