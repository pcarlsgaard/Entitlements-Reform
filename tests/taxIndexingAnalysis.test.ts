import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy, scoreCombined } from '../src/model/combined'
import { defaultAssumptions } from '../src/model/defaults'
import type { CombinedPolicy } from '../src/model/combined'
import type { TaxIndexingMode } from '../src/model/taxProjection'

const policy: CombinedPolicy = {
  ...defaultCombinedPolicy,
  taxEnabled: true,
  tax: {
    ...defaultCombinedPolicy.tax,
    rate: 0.35,
    wageTaxMode: 'progressive',
    progressiveZeroBracketPerAdult: 0,
    progressiveTopBracketPerAdult: 150_000,
    progressiveMiddleRate: 0.25,
    progressiveIntermediateStartPerAdult: 75_000,
    progressiveIntermediateRate: 0.30,
    adultCredit: 2_000,
    adultCreditMode: 'earned',
    adultCreditPhaseInRate: 0.10,
    adultCreditPhaseOutStartPerAdult: 50_000,
    adultCreditPhaseOutRate: 0,
    adultCreditTakeUpRate: 1,
    childCredit: 6_000,
    under6ChildCredit: 6_000,
    childCreditBaselineRefundableShare: 0.50,
    childCreditPhaseInRate: 0.25,
    noncomplianceRate: 0.075,
    exemptionShare: 0,
    cashWageExemptionShare: 0,
    employerSocialInsuranceExemptionShare: 0,
    employerHealthInsuranceExemptionShare: 0,
    employerPensionOtherInsuranceExemptionShare: 0,
    adultCreditEarningsBase: 'compensation',
    replacedTaxes: {
      individualIncome: true,
      payroll: true,
      corporateIncome: true,
      customs: true,
    },
  },
  health: {
    ...defaultCombinedPolicy.health,
    adultHealthCredit: 3_000,
    childHealthCredit: 1_500,
    uninsuredTakeUpRate: 0.85,
    employerHealthPassThroughRate: 1,
    employerFicaPassThroughRate: 1,
    employeePremiumPreTaxShare: 1,
    benchmarkPremiumScale: 1.03,
    replaceAcaAptc: false,
    redistributionRule: 'nationalEqual',
    recipientScope: 'policyholders',
  },
  transfers: {
    replacedPrograms: {
      snap: false, wic: false, schoolMeals: false, summerEbt: false,
      tanf: false, liheap: false, housing: false,
    },
  },
  benefits: { socialSecurityReform: true, medicareReform: true },
  assumptions: {
    ...defaultAssumptions,
    reformYear: 2026,
    endYear: 2095,
    benefitPhaseInYears: 40,
    flatBenefitFPLMultiple: 1.5,
    individualFPL2026: 15_960,
    realFPLGrowth: 0,
    fullRetirementAge: 68,
    socialSecurityBenefitCap2026: null,
    vestingYears: 35,
    socialSecurityClaimAge: 70,
    qualifyingEarnings2026: 18_000,
    averageWorkingYears: 35,
    averageAnnualEarnings2026: 50_000,
    actuarialDiscountRate: 0.023,
    medicareFundingMode: 'perPerson',
    currentLawSSBenefit2026: 24_500,
    currentLawSSBenefitRealGrowth: 0.0114,
    fundingStrategy: 'paygo',
    medicareEligibilityAge: 65,
    premiumSupport2026: 19_000,
    premiumSupportRealGrowth: 0.018,
    legacyMedicareCost2026: 19_000,
    legacyMedicareRealGrowth: 0.015,
    cohortSizeMillions2026: 4.2,
    cohortSizeGrowth: 0.002,
    realGDPGrowth: 0.018,
    realWageGrowthDeviation: 0,
    inflation: 0.02,
    baselineRealMarketRate: 0.023,
    debtSensitivity: 0.0002,
    debtRatePassThrough: 0.15,
    policyHorizonYears: 70,
    policyHorizonDebtTargetGDP: 1.01,
    peakDebtCeilingGDP: 1.5,
    debtPaydownTargetGDP: 0.4,
    debtPaydownSurplusCapGDP: 0,
  },
  baselineMode: 'scheduled',
  dynamic: {
    enabled: true,
    laborElasticity: 0.02,
    laborShareGDP: 0.6,
    phaseInYears: 10,
    capitalGDPLevelAtReference: 0.014,
    capitalRateSensitivity: 0.15,
    capitalPhaseInYears: 15,
  },
}

const modes: { mode: TaxIndexingMode, label: string }[] = [
  { mode: 'cpi', label: 'CPI brackets + CPI credits' },
  { mode: 'wageBrackets', label: 'Wage-index brackets only' },
  { mode: 'wageCredits', label: 'Wage-index credits only' },
  { mode: 'wageBoth', label: 'Wage-index brackets + credits' },
]

function yearRow(result: ReturnType<typeof scoreCombined>, year: number) {
  return result.combined.years.find(row => row.year === year)!
}

describe('Con_3_paygo tax-indexing sensitivity', () => {
  it('prints the four-way indexing decomposition', () => {
    const rows = modes.map(({ mode, label }) => {
      const result = scoreCombined(policy, mode)
      const primary = result.combined.years.find(row => row.primaryDeficit <= 1e-6)
      const total = result.combined.years.find(row => row.overallDeficit <= 1e-6)
      const debtTarget = result.combined.years.find(row => row.endingDebtGDP <= policy.assumptions.debtPaydownTargetGDP + 1e-9)
      const y2036 = yearRow(result, 2036)
      const y2050 = yearRow(result, 2050)
      const y2055 = yearRow(result, 2055)
      const y2095 = yearRow(result, 2095)
      return {
        mode,
        label,
        debt2036: y2036.endingDebtGDP,
        debt2050: y2050.endingDebtGDP,
        debt2055: y2055.endingDebtGDP,
        debt2095: y2095.endingDebtGDP,
        primaryBalanceYear: primary?.year ?? null,
        totalBalanceYear: total?.year ?? null,
        debtTargetYear: debtTarget?.year ?? null,
        balanceRevenueGDP: total ? total.revenue / total.nominalGDP : null,
        balanceSpendingGDP: total ? total.totalFederalSpending / total.nominalGDP : null,
        taxDelta2036: result.annualTaxDelta.get(2036) ?? null,
        taxDelta2050: result.annualTaxDelta.get(2050) ?? null,
        taxDelta2055: result.annualTaxDelta.get(2055) ?? null,
        taxDelta2095: result.annualTaxDelta.get(2095) ?? null,
        fiscalImprovement70yrGDP: result.periods[1]!.fiscalImprovementGDP,
      }
    })
    console.log('INDEXING_ANALYSIS=' + JSON.stringify(rows))
    expect(rows).toHaveLength(4)
    expect(rows[0]!.debt2095).toBeLessThanOrEqual(rows[3]!.debt2095 + 1e-9)
  }, 30_000)
})
