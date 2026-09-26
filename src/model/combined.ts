import { cbo2026RevenueGDP } from '../data/cboBaseline'
import { calculateMacro, defaultSettings } from '../tax/model/macro'
import { calculateHousehold } from '../tax/model/household'
import { calculateHealthAnalysis, defaultHealthPolicySettings } from '../tax/model/health'
import type { HealthPolicySettings } from '../tax/model/health'
import { calculateFederalProgramSavings, defaultTransferReplacementSettings } from '../tax/model/transfers'
import type { TransferReplacementSettings } from '../tax/model/types'
import type { HouseholdInput, ReformSettings } from '../tax/model/types'
import { defaultAssumptions } from './defaults'
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

export function scoreCombined(policy: CombinedPolicy) {
  const assumptions: ModelAssumptions = {
    ...policy.assumptions,
    fundingStrategy: policy.benefits.socialSecurityReform && policy.benefits.medicareReform &&
      policy.assumptions.socialSecurityBenefitCap2026 === null
      ? policy.assumptions.fundingStrategy : 'paygo',
    endYear: policy.assumptions.reformYear + 69,
  }
  const comparatorAssumptions = {
    ...assumptions, fundingStrategy: 'paygo' as const,
    fullRetirementAge: defaultAssumptions.fullRetirementAge,
    medicareEligibilityAge: defaultAssumptions.medicareEligibilityAge,
    socialSecurityBenefitCap2026: null,
  }
  const health = calculateHealthAnalysis(policy.tax, policy.health)
  const programSavingsBillions = calculateFederalProgramSavings(policy.transfers)
  const tax = calculateMacro(policy.tax, {
    insuranceCreditCost: health.totalHealthCreditCostBillions,
    federalTransferSavings: programSavingsBillions + health.estimatedExistingAptcSavingsBillions,
  })
  // The 2025 static tax estimate is carried forward as a fixed GDP share.
  // Receipts and refundable credit outlay savings remain separate in the ledger.
  const netTaxRevenueChangeGDP = policy.taxEnabled
    ? (tax.netRevenue - tax.targetRevenue) / tax.gdp : 0
  const outlaySavingsGDP = policy.taxEnabled
    ? tax.totalFederalSavings / tax.gdp : 0
  const fiscalBridge = {
    otherMandatorySavingsGDP: policy.taxEnabled ? (tax.refundableTaxCreditOutlaySavings + programSavingsBillions) / tax.gdp : 0,
    medicaidMarketplaceSavingsGDP: policy.taxEnabled ? health.estimatedExistingAptcSavingsBillions / tax.gdp : 0,
  }
  const baseline = simulate(comparatorAssumptions, () => cbo2026RevenueGDP, {}, policy.baselineMode)
  const taxOnly = simulate(
    comparatorAssumptions,
    () => cbo2026RevenueGDP + netTaxRevenueChangeGDP,
    {}, policy.baselineMode, undefined,
    fiscalBridge,
  )
  const benefitsOnly = simulate(assumptions, () => cbo2026RevenueGDP, {}, policy.baselineMode, policy.benefits)
  const combined = simulate(
    assumptions,
    () => cbo2026RevenueGDP + netTaxRevenueChangeGDP,
    {}, policy.baselineMode, policy.benefits,
    fiscalBridge,
  )
  const goal = (extraRevenueGDP: number) => simulate(
    assumptions,
    () => cbo2026RevenueGDP + netTaxRevenueChangeGDP + extraRevenueGDP,
    {}, policy.baselineMode, policy.benefits, fiscalBridge,
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
    periods: [period(combined, baseline, assumptions.reformYear + 9),
      period(combined, baseline, assumptions.reformYear + 69)],
    netTaxRevenueChangeGDP,
    outlaySavingsGDP,
    household,
    combinedOpeningRevenueGDP: cbo2026RevenueGDP + netTaxRevenueChangeGDP,
    openingFiscalImprovementGDP: netTaxRevenueChangeGDP + outlaySavingsGDP,
    additionalFiscalAdjustmentGDP,
  }
}
