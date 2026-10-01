import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import type { CombinedPolicy } from '../src/model/combined'

const currentLaw: CombinedPolicy = {
  ...defaultCombinedPolicy,
  taxEnabled: false,
  benefits: { socialSecurityReform: false, medicareReform: false },
  assumptions: { ...defaultCombinedPolicy.assumptions, fundingStrategy: 'paygo' },
}

const flat: CombinedPolicy = {
  ...defaultCombinedPolicy,
  taxEnabled: false,
  benefits: { socialSecurityReform: true, medicareReform: false },
  assumptions: {
    ...defaultCombinedPolicy.assumptions,
    fundingStrategy: 'paygo',
    socialSecurityInitialBenefitMode: 'flatTransition',
    socialSecurityCOLAMode: 'current',
    socialSecurityDollarCOLACapPercentile: null,
    socialSecurityBenefitCap2026: null,
  },
}

function ppi(protectedPercentile: 0.50 | 0.75): CombinedPolicy {
  return {
    ...defaultCombinedPolicy,
    taxEnabled: false,
    benefits: { socialSecurityReform: true, medicareReform: false },
    assumptions: {
      ...defaultCombinedPolicy.assumptions,
      fundingStrategy: 'paygo',
      socialSecurityInitialBenefitMode: 'progressivePriceIndexing',
      socialSecurityPPIProtectedPercentile: protectedPercentile,
      socialSecurityReformFRA: 68,
      socialSecurityClaimAge: 67,
      socialSecurityCOLAMode: 'chainedCpi',
      socialSecurityDollarCOLACapPercentile: 0.75,
      socialSecurityBenefitCap2026: null,
    },
  }
}

function summarize(label: string, policy: CombinedPolicy) {
  const score = scoreCombined(policy)
  const years = [2050, 2075, 2095].map(year => {
    const row = score.combined.years.find(r => r.year === year)!
    const baseline = score.baseline.years.find(r => r.year === year)!
    const ss = row.legacySocialSecurity + row.flatSocialSecurityPaygo + row.otherOASDI
    const baseSS = baseline.legacySocialSecurity + baseline.flatSocialSecurityPaygo + baseline.otherOASDI
    return {
      year,
      ssGDP: ss / row.nominalGDP,
      baselineSSGDP: baseSS / baseline.nominalGDP,
      annualSSSavingsGDP: baseSS / baseline.nominalGDP - ss / row.nominalGDP,
      debtGDP: row.endingDebtGDP,
      baselineDebtGDP: baseline.endingDebtGDP,
    }
  })
  const baseRows = score.baseline.years
  const rows = score.combined.years
  const gdpSum = rows.reduce((s, r) => s + r.nominalGDP, 0)
  const primarySSSavings = rows.reduce((s, r, i) => {
    const b = baseRows[i]!
    const ss = r.legacySocialSecurity + r.flatSocialSecurityPaygo + r.otherOASDI
    const baseSS = b.legacySocialSecurity + b.flatSocialSecurityPaygo + b.otherOASDI
    return s + (baseSS - ss)
  }, 0)
  return {
    label,
    years,
    avgPrimarySSSavingsGDP: primarySSSavings / gdpSum,
    avgTotalFiscalImprovementGDP: score.periods[1]!.fiscalImprovementGDP,
    terminalDebtGDP: score.periods[1]!.terminalDebtGDP,
  }
}

describe('Social Security package comparison report', () => {
  it('prints isolated Social Security package comparisons', () => {
    const report = [
      summarize('Current law', currentLaw),
      summarize('Flat transition', flat),
      summarize('PPI50 + FRA68 + chained CPI + 75th dollar COLA cap', ppi(0.50)),
      summarize('PPI75 + FRA68 + chained CPI + 75th dollar COLA cap', ppi(0.75)),
    ]
    console.log('SS_PACKAGE_COMPARISON=' + JSON.stringify(report))
    expect(report).toHaveLength(4)
  }, 30_000)
})
