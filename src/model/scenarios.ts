import { withAssumptions } from './defaults'
import {
  fundingStrategies,
  fundingStrategyLabels,
} from './fundingStrategy'
import { solvePermanentRevenueRate, solveTwoRateSchedule } from './solveTax'
import type {
  FundingStrategy,
  ModelAssumptions,
  ScenarioComparison,
  ScenarioResult,
} from './types'

function calculateScenario(
  assumptions: ModelAssumptions,
  fundingStrategy: FundingStrategy,
): ScenarioResult {
  const scenarioAssumptions = withAssumptions({
    ...assumptions,
    fundingStrategy,
  })
  const permanent = solvePermanentRevenueRate(scenarioAssumptions)
  const twoRate = solveTwoRateSchedule(scenarioAssumptions)
  const matureRow =
    twoRate.simulation.years.find(
      (row) => row.year === twoRate.matureSystemYear,
    ) ?? twoRate.simulation.years.at(-1)
  if (!matureRow) throw new Error('Scenario produced no simulation years')
  const fundingRows = permanent.simulation.years
  const firstMedicarePrefundingYear =
    fundingRows.find((row) => row.medicarePrefunding > 1e-9)?.year ?? null
  return {
    label: fundingStrategyLabels[fundingStrategy],
    assumptions: scenarioAssumptions,
    permanent,
    twoRate,
    matureSystemYear: twoRate.matureSystemYear,
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

export function compareScenarios(
  assumptions: ModelAssumptions,
): ScenarioComparison {
  const scenarios = Object.fromEntries(
    fundingStrategies.map((strategy) => [
      strategy,
      calculateScenario(assumptions, strategy),
    ]),
  ) as Record<FundingStrategy, ScenarioResult>
  const paygo = scenarios.paygo
  const prefunded = scenarios.both
  return {
    scenarios,
    paygo,
    prefunded,
    prefundingTransitionFinancingEffect: {
      permanentRateDifference:
        prefunded.permanent.rate - paygo.permanent.rate,
      transitionRateDifference:
        prefunded.twoRate.transitionRate - paygo.twoRate.transitionRate,
      matureRateDifference:
        prefunded.twoRate.matureRate - paygo.twoRate.matureRate,
    },
  }
}
