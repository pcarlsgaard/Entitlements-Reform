import { withAssumptions } from './defaults'
import {
  fundingStrategies,
  fundingStrategyLabels,
} from './fundingStrategy'
import {
  simulateCurrentLaw,
  simulateCurrentLawConstantRevenue,
} from './simulate'
import {
  solveAnnualRevenuePath,
  solveAnnualRevenuePathUsing,
  solvePermanentRevenueRate,
  solvePermanentRevenueRateWithSimulator,
  calculateMatureSystemYear,
  calculateTransitionRunoffYears,
} from './solveTax'
import type {
  CurrentLawBaselineMode,
  CurrentLawBaselineResult,
  FundingStrategy,
  ModelAssumptions,
  PolicyHorizonResult,
  ScenarioComparison,
  ScenarioResult,
} from './types'

const currentLawBaselineModes = [
  'scheduled',
  'payable',
] as const satisfies readonly CurrentLawBaselineMode[]

const currentLawBaselineLabels: Record<CurrentLawBaselineMode, string> = {
  scheduled: 'Current law — scheduled benefits',
  payable: 'Current law — payable benefits',
}

function calculateScenario(
  assumptions: ModelAssumptions,
  fundingStrategy: FundingStrategy,
): ScenarioResult {
  const scenarioAssumptions = withAssumptions({
    ...assumptions,
    fundingStrategy,
  })
  const permanent = solvePermanentRevenueRate(scenarioAssumptions)
  const revenuePath = solveAnnualRevenuePath(
    scenarioAssumptions,
    permanent,
  )
  const matureSystemYear = calculateMatureSystemYear(scenarioAssumptions)
  const matureRow =
    revenuePath.simulation.years.find(
      (row) => row.year === matureSystemYear,
    ) ?? revenuePath.simulation.years.at(-1)
  if (!matureRow) throw new Error('Scenario produced no simulation years')
  const fundingRows = revenuePath.simulation.years
  const firstMedicarePrefundingYear =
    fundingRows.find((row) => row.medicarePrefunding > 1e-9)?.year ?? null
  return {
    label: fundingStrategyLabels[fundingStrategy],
    assumptions: scenarioAssumptions,
    permanent,
    revenuePath,
    matureSystemYear,
    transitionRunoffYears:
      calculateTransitionRunoffYears(scenarioAssumptions),
    maturePrimarySpendingGDP:
      matureRow.totalPrimarySpending / matureRow.nominalGDP,
    matureNetInterestGDP: matureRow.netInterest / matureRow.nominalGDP,
    matureTotalSpendingGDP:
      matureRow.totalFederalSpending / matureRow.nominalGDP,
    endowment: permanent.simulation.endowment2026,
    firstPositiveSocialSecurityDividendYear:
      fundingRows.find(
        (row) => row.socialSecurityPrefundingDividend > 1e-9,
      )?.year ?? null,
    firstMedicarePrefundingYear,
    firstMedicarePrefundedEligibilityYear:
      firstMedicarePrefundingYear === null
        ? null
        : firstMedicarePrefundingYear +
          scenarioAssumptions.medicareEligibilityAge -
          scenarioAssumptions.prefundingStartAge,
    firstFullMedicarePrefundingYear:
      fundingRows.find((row) => row.medicarePrefundedShare >= 1 - 1e-9)
        ?.year ?? null,
  }
}

const policyHorizonYears = [30, 50, 70] as const

export function comparePolicyHorizons(
  assumptions: ModelAssumptions,
): PolicyHorizonResult[] {
  return policyHorizonYears.map((years) => {
    const horizonAssumptions = withAssumptions({
      ...assumptions,
      policyHorizonYears: years,
      endYear: assumptions.reformYear + years - 1,
    })
    const scenarios = Object.fromEntries(
      fundingStrategies.map((strategy) => {
        const scenarioAssumptions = withAssumptions({
          ...horizonAssumptions,
          fundingStrategy: strategy,
        })
        return [strategy, solvePermanentRevenueRate(scenarioAssumptions)]
      }),
    ) as Record<FundingStrategy, PolicyHorizonResult['scenarios'][FundingStrategy]>
    const baselines = Object.fromEntries(
      currentLawBaselineModes.map((mode) => [
        mode,
        calculateCurrentLawBaseline(horizonAssumptions, mode).permanent,
      ]),
    ) as PolicyHorizonResult['baselines']
    return {
      years,
      endYear: horizonAssumptions.endYear,
      scenarios,
      baselines,
    }
  })
}

function calculateCurrentLawBaseline(
  assumptions: ModelAssumptions,
  mode: CurrentLawBaselineMode,
): CurrentLawBaselineResult {
  const baselineAssumptions = withAssumptions({
    ...assumptions,
    fundingStrategy: 'paygo',
  })
  const permanent = solvePermanentRevenueRateWithSimulator(
    baselineAssumptions,
    (rate) =>
      simulateCurrentLawConstantRevenue(
        baselineAssumptions,
        mode,
        rate,
      ),
  )
  const revenuePath = solveAnnualRevenuePathUsing(
    baselineAssumptions,
    (schedule) =>
      simulateCurrentLaw(baselineAssumptions, mode, schedule),
    permanent,
  )
  return {
    mode,
    label: currentLawBaselineLabels[mode],
    assumptions: baselineAssumptions,
    permanent,
    revenuePath,
  }
}

export function compareScenarios(
  assumptions: ModelAssumptions,
): ScenarioComparison {
  const scenarios = Object.fromEntries(
    fundingStrategies.map((strategy) => [
      strategy,
      calculateScenario(assumptions, strategy),
    ]),
  ) as Record<FundingStrategy, ScenarioResult>
  const baselines = Object.fromEntries(
    currentLawBaselineModes.map((mode) => [
      mode,
      calculateCurrentLawBaseline(assumptions, mode),
    ]),
  ) as Record<CurrentLawBaselineMode, CurrentLawBaselineResult>
  const paygo = scenarios.paygo
  const prefunded = scenarios.both
  return {
    scenarios,
    baselines,
    paygo,
    prefunded,
    prefundingTransitionFinancingEffect: {
      permanentRateDifference:
        prefunded.permanent.rate - paygo.permanent.rate,
      peakRevenueRateDifference:
        prefunded.revenuePath.peakRevenueRate -
        paygo.revenuePath.peakRevenueRate,
      minimumRevenueRateDifference:
        prefunded.revenuePath.minimumRevenueRate -
        paygo.revenuePath.minimumRevenueRate,
    },
  }
}
