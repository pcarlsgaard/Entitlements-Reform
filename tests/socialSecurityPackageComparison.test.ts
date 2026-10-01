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


function flatScenario(label: string, fplMultiple: number, phaseInYears: number): { label: string; policy: CombinedPolicy } {
  return {
    label,
    policy: {
      ...defaultCombinedPolicy,
      taxEnabled: false,
      benefits: { socialSecurityReform: true, medicareReform: false },
      assumptions: {
        ...defaultCombinedPolicy.assumptions,
        fundingStrategy: 'paygo',
        socialSecurityInitialBenefitMode: 'flatTransition',
        flatBenefitFPLMultiple: fplMultiple,
        benefitPhaseInYears: phaseInYears,
        socialSecurityCOLAMode: 'current',
        socialSecurityDollarCOLACapPercentile: null,
        socialSecurityBenefitCap2026: null,
        fullRetirementAge: 67,
        socialSecurityClaimAge: 67,
      },
    },
  }
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
      socialSecurityReformFRA: 67,
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
    const flatScenarios = [
      flatScenario('125% FPL / 20y', 1.25, 20),
      flatScenario('125% FPL / 30y', 1.25, 30),
      flatScenario('125% FPL / 40y', 1.25, 40),
      flatScenario('200% FPL / 10y', 2.00, 10),
      flatScenario('200% FPL / 15y', 2.00, 15),
      flatScenario('200% FPL / 20y', 2.00, 20),
      flatScenario('200% FPL / 30y', 2.00, 30),
    ]
    const report = [
      summarize('Current law', currentLaw),
      ...flatScenarios.map(item => summarize(item.label, item.policy)),
      summarize('PPI50 + chained CPI + 75th dollar COLA cap', ppi(0.50)),
      summarize('PPI75 + chained CPI + 75th dollar COLA cap', ppi(0.75)),
    ]
    console.log('SS_PACKAGE_COMPARISON=' + JSON.stringify(report))
    expect(report).toHaveLength(10)
  }, 30_000)
})
