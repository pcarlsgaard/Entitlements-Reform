import { withAssumptions } from './defaults'
import { solvePermanentRevenueRate, solveTwoRateSchedule } from './solveTax'
import type {
  ModelAssumptions,
  ScenarioComparison,
  ScenarioResult,
} from './types'

function calculateScenario(
  assumptions: ModelAssumptions,
  prefundingEnabled: boolean,
): ScenarioResult {
  const scenarioAssumptions = withAssumptions({
    ...assumptions,
    prefundingEnabled,
  })
  const permanent = solvePermanentRevenueRate(scenarioAssumptions)
  const twoRate = solveTwoRateSchedule(scenarioAssumptions)
  const matureRow =
    twoRate.simulation.years.find(
      (row) => row.year === twoRate.matureSystemYear,
    ) ?? twoRate.simulation.years.at(-1)
  if (!matureRow) throw new Error('Scenario produced no simulation years')
  return {
    label: prefundingEnabled
      ? 'Prefunded benefit reform'
      : 'PAYGO benefit reform',
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
  }
}

export function compareScenarios(
  assumptions: ModelAssumptions,
): ScenarioComparison {
  const paygo = calculateScenario(assumptions, false)
  const prefunded = calculateScenario(assumptions, true)
  return {
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
