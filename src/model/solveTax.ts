import {
  simulate,
  simulateConstantRevenue,
  type RevenueSchedule,
} from './simulate'
import { hasAnyPrefunding } from './fundingStrategy'
import { survivalProbability } from './mortality'
import type {
  FiscalObjective,
  AnnualRevenuePathSolution,
  ModelAssumptions,
  PermanentRateSolution,
  SimulationResult,
  SolverDiagnostics,
} from './types'

const MAX_ITERATIONS = 80
const RATE_TOLERANCE = 1e-13
const DEBT_TOLERANCE = 1e-11

export type ConstantRevenueSimulator = (
  revenueRate: number,
) => SimulationResult

export type ScheduledRevenueSimulator = (
  revenueSchedule: RevenueSchedule,
) => SimulationResult

export function policyHorizonEndYear(
  assumptions: ModelAssumptions,
): number {
  return assumptions.reformYear + assumptions.policyHorizonYears - 1
}

function finite(value: number): boolean {
  return Number.isFinite(value)
}

export function simulationDiagnostics(
  simulation: SimulationResult,
  rate: number,
  iterations: number,
  converged: boolean,
): SolverDiagnostics {
  const horizonEnd = Math.min(
    policyHorizonEndYear(simulation.assumptions),
    simulation.assumptions.endYear,
  )
  const rows = simulation.years.filter((row) => row.year <= horizonEnd)
  const last = rows.at(-1)
  const prior = rows.at(-2)
  if (!last || !prior) throw new Error('Simulation horizon is too short')
  const peak = rows.reduce((current, row) =>
    row.endingDebtGDP > current.endingDebtGDP ? row : current,
  )
  return {
    converged,
    iterations,
    rate,
    peakDebtGDP: peak.endingDebtGDP,
    peakYear: peak.year,
    terminalDebtGDP: last.endingDebtGDP,
    terminalAnnualDebtChange:
      last.endingDebtGDP - prior.endingDebtGDP,
    terminalNetInterestGDP: last.netInterest / last.nominalGDP,
    effectiveInterestRateAtPeak: peak.effectiveNominalInterestRate,
    terminalEffectiveInterestRate: last.effectiveNominalInterestRate,
  }
}

export function objectiveSatisfied(
  simulation: SimulationResult,
  objective: FiscalObjective,
  assumptions: ModelAssumptions,
): boolean {
  const diagnostics = simulationDiagnostics(simulation, 0, 0, false)
  if (
    !finite(diagnostics.terminalDebtGDP) ||
    !finite(diagnostics.terminalAnnualDebtChange) ||
    !finite(diagnostics.peakDebtGDP)
  ) {
    return false
  }
  const stable = diagnostics.terminalAnnualDebtChange <= DEBT_TOLERANCE
  const returned =
    diagnostics.terminalDebtGDP <=
    assumptions.startingDebtGDP + DEBT_TOLERANCE
  const belowPeak =
    diagnostics.peakDebtGDP <=
    assumptions.peakDebtCeilingGDP + DEBT_TOLERANCE
  switch (objective) {
    case 'targetDebtAtPolicyHorizon':
      return (
        diagnostics.terminalDebtGDP <=
        assumptions.policyHorizonDebtTargetGDP + DEBT_TOLERANCE
      )
    case 'stableTerminalDebt':
      return stable
    case 'returnToStartingDebt':
      return returned
    case 'peakDebtCeiling':
      return belowPeak
    case 'combinedStableAndPeak':
      return stable && belowPeak
  }
}

function solvePermanentRevenueRateUsing(
  assumptions: ModelAssumptions,
  makeSimulation: ConstantRevenueSimulator,
  lowerBound = 0,
  upperBound = 0.6,
): PermanentRateSolution {
  const upperSimulation = makeSimulation(upperBound)
  if (
    !objectiveSatisfied(
      upperSimulation,
      assumptions.fiscalObjective,
      assumptions,
    )
  ) {
    return {
      ...simulationDiagnostics(upperSimulation, upperBound, 0, false),
      simulation: upperSimulation,
    }
  }

  let low = lowerBound
  let high = upperBound
  let iterations = 0
  while (iterations < MAX_ITERATIONS && high - low > RATE_TOLERANCE) {
    const midpoint = (low + high) / 2
    const candidate = makeSimulation(midpoint)
    if (
      objectiveSatisfied(candidate, assumptions.fiscalObjective, assumptions)
    ) {
      high = midpoint
    } else {
      low = midpoint
    }
    iterations += 1
  }
  const simulation = makeSimulation(high)
  return {
    ...simulationDiagnostics(simulation, high, iterations, true),
    simulation,
  }
}

export function solvePermanentRevenueRate(
  assumptions: ModelAssumptions,
  lowerBound = 0,
  upperBound = 0.6,
): PermanentRateSolution {
  return solvePermanentRevenueRateUsing(
    assumptions,
    (rate) => simulateConstantRevenue(assumptions, rate),
    lowerBound,
    upperBound,
  )
}

export function solvePermanentRevenueRateWithSimulator(
  assumptions: ModelAssumptions,
  makeSimulation: ConstantRevenueSimulator,
  lowerBound = 0,
  upperBound = 0.6,
): PermanentRateSolution {
  return solvePermanentRevenueRateUsing(
    assumptions,
    makeSimulation,
    lowerBound,
    upperBound,
  )
}

export function calculateMatureSystemYear(
  assumptions: ModelAssumptions,
): number {
  if (hasAnyPrefunding(assumptions.fundingStrategy)) {
    const youngestUnfundedAgeAtEnactment = assumptions.prefundingStartAge + 1
    return (
      assumptions.reformYear +
      (assumptions.maxModeledAge - youngestUnfundedAgeAtEnactment) +
      1
    )
  }
  const lastBlendedRetirementYear =
    assumptions.reformYear + assumptions.benefitPhaseInYears - 1
  const lastBlendedExitYear =
    lastBlendedRetirementYear +
    (assumptions.maxModeledAge - assumptions.fullRetirementAge)
  return Math.max(lastBlendedExitYear + 1, assumptions.medicareYearB + 1)
}

function firstRunoffYear(
  startingYear: number,
  startingAge: number,
  remainingShare: number,
  assumptions: ModelAssumptions,
): number {
  for (
    let age = startingAge;
    age <= assumptions.maxModeledAge;
    age += 1
  ) {
    if (survivalProbability(startingAge, age) <= remainingShare) {
      return startingYear + age - startingAge
    }
  }
  return (
    startingYear + assumptions.maxModeledAge - startingAge + 1
  )
}

export function calculateTransitionRunoffYears(
  assumptions: ModelAssumptions,
): {
  ninetyPercent: number
  ninetyFivePercent: number
  ninetyNinePercent: number
} {
  const prefundingTransition = hasAnyPrefunding(
    assumptions.fundingStrategy,
  )
  const startingAge = prefundingTransition
    ? assumptions.prefundingStartAge + 1
    : assumptions.fullRetirementAge
  const startingYear = prefundingTransition
    ? assumptions.reformYear
    : assumptions.reformYear + assumptions.benefitPhaseInYears - 1
  return {
    ninetyPercent: firstRunoffYear(
      startingYear,
      startingAge,
      0.1,
      assumptions,
    ),
    ninetyFivePercent: firstRunoffYear(
      startingYear,
      startingAge,
      0.05,
      assumptions,
    ),
    ninetyNinePercent: firstRunoffYear(
      startingYear,
      startingAge,
      0.01,
      assumptions,
    ),
  }
}

function endpointDebtTargetForObjective(
  assumptions: ModelAssumptions,
  permanent: PermanentRateSolution,
): number {
  switch (assumptions.fiscalObjective) {
    case 'targetDebtAtPolicyHorizon':
      return assumptions.policyHorizonDebtTargetGDP
    case 'returnToStartingDebt':
      return assumptions.startingDebtGDP
    case 'stableTerminalDebt':
    case 'peakDebtCeiling':
    case 'combinedStableAndPeak':
      return permanent.terminalDebtGDP
  }
}

/**
 * Construct the minimum-opening, nonincreasing revenue path.
 *
 * Through the scored policy window, the minimum opening rate that can meet
 * the same fiscal objective without ever increasing later is exactly the
 * constant-rate solution. Any lower opening rate would cap every later rate
 * below the already-minimal constant solution and therefore miss the target.
 *
 * After the cutoff, revenue may fall to the amount needed to hold the target
 * debt ratio, but it may never rise above the prior year's rate. This keeps
 * the visible actuarial extension from manufacturing negative debt while
 * preserving the user's no-future-tax-increase constraint.
 */
export function solveAnnualRevenuePathUsing(
  assumptions: ModelAssumptions,
  makeSimulation: ScheduledRevenueSimulator,
  permanent: PermanentRateSolution,
): AnnualRevenuePathSolution {
  const horizonEnd = policyHorizonEndYear(assumptions)
  const target = endpointDebtTargetForObjective(assumptions, permanent)
  let previousRate = permanent.rate
  const schedule: RevenueSchedule = (year, context) => {
    if (year <= horizonEnd) return permanent.rate

    const targetEndingDebt = target * context.nominalGDP
    const maintenanceRate =
      (context.totalFederalSpending +
        context.beginningDebt -
        targetEndingDebt) /
      context.nominalGDP
    const rate = Math.max(0, Math.min(previousRate, maintenanceRate))
    previousRate = rate
    return rate
  }
  const simulation = makeSimulation(schedule)
  const policyRows = simulation.years.filter((row) => row.year <= horizonEnd)
  const visibleRows = simulation.years
  const endpoint = policyRows.at(-1)
  if (!endpoint || policyRows.length === 0) {
    throw new Error('Annual revenue path has no policy-horizon rows.')
  }
  const peakRevenue = visibleRows.reduce((current, row) =>
    row.revenueRate > current.revenueRate ? row : current,
  )
  const minimumRevenue = visibleRows.reduce((current, row) =>
    row.revenueRate < current.revenueRate ? row : current,
  )
  const peakDebt = policyRows.reduce((current, row) =>
    row.endingDebtGDP > current.endingDebtGDP ? row : current,
  )
  const nonIncreasing = visibleRows.every(
    (row, index) =>
      index === 0 ||
      row.revenueRate <= visibleRows[index - 1]!.revenueRate + RATE_TOLERANCE,
  )
  return {
    converged:
      Math.abs(endpoint.endingDebtGDP - target) <= DEBT_TOLERANCE &&
      nonIncreasing,
    policyHorizonEndYear: horizonEnd,
    endpointDebtTargetGDP: target,
    endpointDebtGDP: endpoint.endingDebtGDP,
    startingRevenueRate: visibleRows[0]!.revenueRate,
    nonIncreasing,
    peakRevenueRate: peakRevenue.revenueRate,
    peakRevenueYear: peakRevenue.year,
    minimumRevenueRate: minimumRevenue.revenueRate,
    minimumRevenueYear: minimumRevenue.year,
    endpointRevenueRate: endpoint.revenueRate,
    peakDebtGDP: peakDebt.endingDebtGDP,
    peakDebtYear: peakDebt.year,
    simulation,
  }
}

export function solveAnnualRevenuePath(
  assumptions: ModelAssumptions,
  permanent = solvePermanentRevenueRate(assumptions),
): AnnualRevenuePathSolution {
  return solveAnnualRevenuePathUsing(
    assumptions,
    (schedule) => simulate(assumptions, schedule),
    permanent,
  )
}
