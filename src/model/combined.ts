import { currentLawRevenueGDP, replacedRevenueDriftGDP } from './revenueBaseline'
import { taxRevenueChangePath, realGDPPerCapitaGrowthFactor } from './taxProjection'
import type { TaxIndexingMode } from './taxProjection'
import { cbo2026RevenueGDP } from '../data/cboBaseline'
import { calculateMacro, defaultSettings } from '../tax/model/macro'
import { calculateHousehold } from '../tax/model/household'
import { calculateLaborResponse } from '../tax/model/laborResponse'
import { calculateHealthAnalysis, defaultHealthPolicySettings } from '../tax/model/health'
import type { HealthPolicySettings } from '../tax/model/health'
import { calculateFederalProgramSavings, defaultTransferReplacementSettings } from '../tax/model/transfers'
import type { TransferReplacementSettings } from '../tax/model/types'
import type { HouseholdInput, ReformSettings } from '../tax/model/types'
import { currentLawRetirementAge, defaultAssumptions } from './defaults'
import { simulate } from './simulate'
import type { BenefitPolicySelection } from './simulate'
import type { CurrentLawBaselineMode, ModelAssumptions, SimulationResult } from './types'

export interface CombinedPolicy {
  taxEnabled: boolean
  tax: ReformSettings
  health: HealthPolicySettings
  transfers: TransferReplacementSettings
  benefits: BenefitPolicySelection
  assumptions: ModelAssumptions
  baselineMode: CurrentLawBaselineMode
  dynamic: {
    enabled: boolean
    /** Hours supplied per percentage change in the after-tax marginal wage. */
    laborElasticity: number
    /** Illustrative fraction of GDP exposed to the labor-hours response. */
    laborShareGDP: number
    /** Years from enactment until the new GDP level is reached. */
    phaseInYears: number
    /** Long-run GDP level from cash-flow treatment at the 21% reference rate. */
    capitalGDPLevelAtReference: number
    /** Fractional response of capital effect to proportional rate changes. */
    capitalRateSensitivity: number
    capitalPhaseInYears: number
  }
}

export const defaultCombinedPolicy: CombinedPolicy = {
  taxEnabled: true,
  tax: {
    ...defaultSettings,
    rate: 0.35,
    wageTaxMode: 'progressive',
    progressiveZeroBracketPerAdult: 0,
    progressiveMiddleRate: 0.25,
    progressiveIntermediateStartPerAdult: 75_000,
    progressiveIntermediateRate: 0.30,
    progressiveTopBracketPerAdult: 150_000,
    adultCredit: 2_000,
    adultCreditEarningsBase: 'compensation',
    adultCreditPhaseInRate: 0.10,
    adultCreditPhaseOutRate: 0,
    childCredit: 12_000,
    noncomplianceRate: 0.10,
  },
  health: { ...defaultHealthPolicySettings, adultHealthCredit: 3000, childHealthCredit: 1500, replaceAcaAptc: true },
  transfers: defaultTransferReplacementSettings,
  benefits: { socialSecurityReform: false, medicareReform: false },
  // A zero debt-risk premium keeps the unsolved 70-year debt paths interpretable;
  // the entitlement solver's separate default still uses its 2 bp sensitivity.
  assumptions: { ...defaultAssumptions, fundingStrategy: 'paygo', endYear: 2095, debtSensitivity: 0 },
  baselineMode: 'scheduled',
  dynamic: { enabled: false, laborElasticity: 0.15, laborShareGDP: 0.60, phaseInYears: 10,
    capitalGDPLevelAtReference: 0.014, capitalRateSensitivity: 0.15, capitalPhaseInYears: 15 },
}

export interface PeriodScore {
  from: number
  through: number
  /** Nominal sum over the window, in billions; not a present value. */
  cumulativeDeficitBillions: number
  cumulativeDeficitGDP: number
  fiscalImprovementBillions: number
  /** Improvement divided by the sum of nominal GDP over the window. */
  fiscalImprovementGDP: number
  terminalDebtGDP: number
  baselineTerminalDebtGDP: number
  peakDebtGDP: number
}

function period(sim: SimulationResult, baseline: SimulationResult, through: number): PeriodScore {
  const rows = sim.years.filter((row) => row.year <= through)
  const comparator = baseline.years.filter((row) => row.year <= through)
  const cumulativeDeficitBillions = rows.reduce((sum, row) => sum + row.overallDeficit, 0)
  const baselineDeficit = comparator.reduce((sum, row) => sum + row.overallDeficit, 0)
  const gdpYears = rows.reduce((sum, row) => sum + row.nominalGDP, 0)
  return {
    from: rows[0]!.year,
    through,
    cumulativeDeficitBillions,
    cumulativeDeficitGDP: cumulativeDeficitBillions / gdpYears,
    fiscalImprovementBillions: baselineDeficit - cumulativeDeficitBillions,
    fiscalImprovementGDP: (baselineDeficit - cumulativeDeficitBillions) / gdpYears,
    terminalDebtGDP: rows.at(-1)!.endingDebtGDP,
    baselineTerminalDebtGDP: comparator.at(-1)!.endingDebtGDP,
    peakDebtGDP: Math.max(...rows.map((row) => row.endingDebtGDP)),
  }
}

function debtGoalMet(sim: SimulationResult, target: number, peakCeiling: number): boolean {
  return sim.years.at(-1)!.endingDebtGDP <= target + 1e-8 &&
    sim.years.every((row) => row.endingDebtGDP <= peakCeiling + 1e-8)
}

const householdExamples: { label: string; input: HouseholdInput }[] = [
  { label: 'Single · $35k', input: { filingStatus: 'single', cashWage: 35_000, children: 0 } },
  { label: 'Single · $75k', input: { filingStatus: 'single', cashWage: 75_000, children: 0 } },
  { label: 'Family · $100k + 2 children', input: { filingStatus: 'married', cashWage: 65_000, secondaryCashWage: 35_000, children: 2 } },
];

export function scoreCombined(policy: CombinedPolicy, taxIndexingMode: TaxIndexingMode = 'cpi') {
  const assumptions: ModelAssumptions = {
    ...policy.assumptions,
    fullRetirementAge: policy.benefits.socialSecurityReform
      ? policy.assumptions.fullRetirementAge : currentLawRetirementAge,
    medicareEligibilityAge: policy.benefits.medicareReform
      ? policy.assumptions.medicareEligibilityAge : defaultAssumptions.medicareEligibilityAge,
    socialSecurityBenefitCap2026: policy.benefits.socialSecurityReform
      ? policy.assumptions.socialSecurityBenefitCap2026 : null,
    fundingStrategy: policy.benefits.socialSecurityReform && policy.benefits.medicareReform &&
      policy.assumptions.socialSecurityBenefitCap2026 === null
      ? policy.assumptions.fundingStrategy : 'paygo',
    endYear: policy.assumptions.reformYear + 69,
  }
  const comparatorAssumptions = {
    ...assumptions, fundingStrategy: 'paygo' as const,
    fullRetirementAge: currentLawRetirementAge,
    medicareEligibilityAge: defaultAssumptions.medicareEligibilityAge,
    socialSecurityBenefitCap2026: null,
  }
  const health = calculateHealthAnalysis(policy.tax, policy.health)
  const programSavingsBillions = calculateFederalProgramSavings(policy.transfers)
  const tax = calculateMacro(policy.tax, {
    insuranceCreditCost: health.totalHealthCreditCostBillions,
    federalTransferSavings: programSavingsBillions + health.estimatedExistingAptcSavingsBillions,
  })
  // CPI-indexed dollar rules are rescored annually as real incomes change.
  // Receipts and refundable credit outlay savings remain separate in the ledger.
  const netTaxRevenueChangeGDP = policy.taxEnabled
    ? (tax.netRevenue - tax.targetRevenue) / tax.gdp : 0
  const annualTaxDelta = policy.taxEnabled
    ? taxRevenueChangePath(policy.tax, assumptions, health.totalHealthCreditCostBillions, taxIndexingMode) : new Map<number, number>()
  const revenueDelta = (year: number) => policy.taxEnabled ?
    (annualTaxDelta.get(year) ?? 0) - replacedRevenueDriftGDP(year, policy.tax) : 0
  const outlaySavingsGDP = policy.taxEnabled
    ? tax.totalFederalSavings / tax.gdp : 0
  const fiscalBridge = {
    savingsScaleForYear: (year: number) => 1 / realGDPPerCapitaGrowthFactor(year, assumptions),
    otherMandatorySavingsGDP: policy.taxEnabled ? (tax.refundableTaxCreditOutlaySavings + programSavingsBillions) / tax.gdp : 0,
    medicaidMarketplaceSavingsGDP: policy.taxEnabled ? health.estimatedExistingAptcSavingsBillions / tax.gdp : 0,
  }
  const laborResponse = policy.taxEnabled && policy.dynamic.enabled
    ? calculateLaborResponse(policy.tax, policy.health.employerFicaPassThroughRate)
    : null
  const netWageLogChange = laborResponse?.netWageLogChange ?? 0
  const steadyGDPLevelChange = Math.max(-0.05, Math.min(0.05,
    netWageLogChange * policy.dynamic.laborElasticity * policy.dynamic.laborShareGDP))
  // The Tax Foundation's 21% DBCFT estimate replaces both corporate and
  // pass-through business taxation. These two switches jointly proxy that
  // change in tax base; the X-tax rate changes its capital response only mildly.
  const capitalBaseReplaced = policy.taxEnabled && policy.dynamic.enabled &&
    policy.tax.replacedTaxes.corporateIncome && policy.tax.replacedTaxes.individualIncome
  const capitalRateFactor = Math.max(0, Math.min(2,
    1 + policy.dynamic.capitalRateSensitivity * (policy.tax.rate / 0.21 - 1)))
  const steadyCapitalGDPLevelChange = capitalBaseReplaced ?
    Math.max(-0.03, Math.min(0.03, policy.dynamic.capitalGDPLevelAtReference * capitalRateFactor)) : 0
  const steadyCapitalStockChange = steadyCapitalGDPLevelChange * (0.026 / 0.014)
  const steadyCapitalWageChange = steadyCapitalGDPLevelChange * (0.013 / 0.014)
  const dynamicGDP = policy.taxEnabled && policy.dynamic.enabled ? (year: number) =>
    1 + steadyGDPLevelChange * Math.min(1,
      Math.max(0, (year - assumptions.reformYear) / Math.max(1, policy.dynamic.phaseInYears))) +
      steadyCapitalGDPLevelChange * Math.min(1,
        Math.max(0, (year - assumptions.reformYear) / Math.max(1, policy.dynamic.capitalPhaseInYears))) : undefined
  const baseline = simulate(comparatorAssumptions, (year) => currentLawRevenueGDP(year), {}, policy.baselineMode)
  const taxOnly = simulate(
    comparatorAssumptions,
    (year) => currentLawRevenueGDP(year) + revenueDelta(year),
    {}, policy.baselineMode, undefined,
    fiscalBridge, dynamicGDP,
  )
  const benefitsOnly = simulate(assumptions, (year) => currentLawRevenueGDP(year), {}, policy.baselineMode, policy.benefits)
  const staticCombined = simulate(
    assumptions,
    (year) => currentLawRevenueGDP(year) + revenueDelta(year),
    {}, policy.baselineMode, policy.benefits,
    fiscalBridge,
  )
  const combined = dynamicGDP ? simulate(
    assumptions,
    (year) => currentLawRevenueGDP(year) + revenueDelta(year),
    {}, policy.baselineMode, policy.benefits, fiscalBridge, dynamicGDP,
  ) : staticCombined
  const goal = (extraRevenueGDP: number) => simulate(
    assumptions,
    (year) => currentLawRevenueGDP(year) + revenueDelta(year) + extraRevenueGDP,
    {}, policy.baselineMode, policy.benefits, fiscalBridge, dynamicGDP,
  )
  // Minimum permanent fiscal adjustment that satisfies both debt constraints.
  // This is an equivalent revenue rate; spending cuts could supply the same amount.
  let low = -0.5
  let high = 0.5
  const goalWithinRange = debtGoalMet(goal(high), assumptions.policyHorizonDebtTargetGDP, assumptions.peakDebtCeilingGDP)
  for (let i = 0; i < 28 && goalWithinRange; i += 1) {
    const middle = (low + high) / 2
    if (debtGoalMet(goal(middle), assumptions.policyHorizonDebtTargetGDP, assumptions.peakDebtCeilingGDP)) high = middle
    else low = middle
  }
  const additionalFiscalAdjustmentGDP = goalWithinRange ? high : Number.NaN
  const household = householdExamples.map(({ label, input }) => ({
    label,
    difference: policy.taxEnabled ? calculateHousehold(input, policy.tax).dollarChange : 0,
  }))
  return {
    tax,
    health,
    programSavingsBillions,
    baseline,
    taxOnly,
    benefitsOnly,
    combined,
    staticCombined,
    laborResponse,
    netWageLogChange,
    steadyGDPLevelChange,
    steadyCapitalGDPLevelChange,
    steadyCapitalStockChange,
    steadyCapitalWageChange,
    periods: [period(combined, baseline, assumptions.reformYear + 9),
      period(combined, baseline, assumptions.reformYear + 69)],
    netTaxRevenueChangeGDP,
    annualTaxDelta,
    outlaySavingsGDP,
    household,
    combinedOpeningRevenueGDP: cbo2026RevenueGDP + netTaxRevenueChangeGDP,
    openingFiscalImprovementGDP: netTaxRevenueChangeGDP + outlaySavingsGDP,
    additionalFiscalAdjustmentGDP,
  }
}
