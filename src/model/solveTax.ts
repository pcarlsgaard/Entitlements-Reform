import { simulate, simulateConstantRevenue } from './simulate'
import { hasAnyPrefunding } from './fundingStrategy'
import type {
  FiscalObjective,
  ModelAssumptions,
  PermanentRateSolution,
  SimulationResult,
  SolverDiagnostics,
  TwoRateSolution,
} from './types'

const MAX_ITERATIONS = 80
const RATE_TOLERANCE = 1e-10
const DEBT_TOLERANCE = 1e-7

function finite(value: number): boolean {
  return Number.isFinite(value)
}

export function simulationDiagnostics(
  simulation: SimulationResult,
  rate: number,
  iterations: number,
  converged: boolean,
): SolverDiagnostics {
  const rows = simulation.years
  const last = rows.at(-1)
  const prior = rows.at(-2)
  if (!last || !prior) throw new Error('Simulation horizon is too short')
  const peak = rows.reduce((current, row) =>
    row.beginningDebtGDP > current.beginningDebtGDP ? row : current,
  )
  return {
    converged,
    iterations,
    rate,
    peakDebtGDP: peak.beginningDebtGDP,
    peakYear: peak.year,
    terminalDebtGDP: last.beginningDebtGDP,
    terminalAnnualDebtChange:
      last.beginningDebtGDP - prior.beginningDebtGDP,
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

export function solvePermanentRevenueRate(
  assumptions: ModelAssumptions,
  lowerBound = 0,
  upperBound = 0.6,
): PermanentRateSolution {
  const upperSimulation = simulateConstantRevenue(assumptions, upperBound)
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
    const candidate = simulateConstantRevenue(assumptions, midpoint)
    if (
      objectiveSatisfied(candidate, assumptions.fiscalObjective, assumptions)
    ) {
      high = midpoint
    } else {
      low = midpoint
    }
    iterations += 1
  }
  const simulation = simulateConstantRevenue(assumptions, high)
  return {
    ...simulationDiagnostics(simulation, high, iterations, true),
    simulation,
  }
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

function handoffDebtGDP(
  assumptions: ModelAssumptions,
  matureSystemYear: number,
  transitionRate: number,
): number {
  const simulation = simulate(assumptions, (year) =>
    year < matureSystemYear ? transitionRate : 0,
  )
  return (
    simulation.years.find((row) => row.year === matureSystemYear)
      ?.beginningDebtGDP ?? Number.NaN
  )
}

function solveTransitionRate(
  assumptions: ModelAssumptions,
  matureSystemYear: number,
  lowerBound = 0,
  upperBound = 0.6,
): { rate: number; converged: boolean } {
  const target = assumptions.matureDebtTargetGDP
  const lowDebt = handoffDebtGDP(assumptions, matureSystemYear, lowerBound)
  const highDebt = handoffDebtGDP(assumptions, matureSystemYear, upperBound)
  const lowEndpointIsAboveTarget = !finite(lowDebt) || lowDebt >= target
  const highEndpointIsBelowTarget = finite(highDebt) && highDebt <= target
  if (!lowEndpointIsAboveTarget || !highEndpointIsBelowTarget) {
    return { rate: upperBound, converged: false }
  }
  let low = lowerBound
  let high = upperBound
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const midpoint = (low + high) / 2
    const debt = handoffDebtGDP(assumptions, matureSystemYear, midpoint)
    if (Math.abs(debt - target) <= DEBT_TOLERANCE) {
      return { rate: midpoint, converged: true }
    }
    if (debt > target || !finite(debt)) low = midpoint
    else high = midpoint
  }
  return { rate: (low + high) / 2, converged: true }
}

function maturePathIsStable(
  simulation: SimulationResult,
  matureSystemYear: number,
  target: number,
): boolean {
  const matureRows = simulation.years.filter(
    (row) => row.year >= matureSystemYear,
  )
  const last = matureRows.at(-1)
  const prior = matureRows.at(-2)
  if (!last || !prior) return false
  const maximum = Math.max(...matureRows.map((row) => row.beginningDebtGDP))
  return (
    finite(maximum) &&
    maximum <= target + DEBT_TOLERANCE &&
    last.beginningDebtGDP - prior.beginningDebtGDP <= DEBT_TOLERANCE
  )
}

function solveMatureRate(
  assumptions: ModelAssumptions,
  matureSystemYear: number,
  transitionRate: number,
  lowerBound = 0,
  upperBound = 0.6,
): { rate: number; converged: boolean } {
  const makeSimulation = (matureRate: number) =>
    simulate(assumptions, (year) =>
      year < matureSystemYear ? transitionRate : matureRate,
    )
  if (
    !maturePathIsStable(
      makeSimulation(upperBound),
      matureSystemYear,
      assumptions.matureDebtTargetGDP,
    )
  ) {
    return { rate: upperBound, converged: false }
  }
  let low = lowerBound
  let high = upperBound
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const midpoint = (low + high) / 2
    if (
      maturePathIsStable(
        makeSimulation(midpoint),
        matureSystemYear,
        assumptions.matureDebtTargetGDP,
      )
    ) {
      high = midpoint
    } else {
      low = midpoint
    }
    if (high - low <= RATE_TOLERANCE) break
  }
  return { rate: high, converged: true }
}

export function solveTwoRateSchedule(
  assumptions: ModelAssumptions,
): TwoRateSolution {
  const matureSystemYear = calculateMatureSystemYear(assumptions)
  const transition = solveTransitionRate(assumptions, matureSystemYear)
  const mature = solveMatureRate(
    assumptions,
    matureSystemYear,
    transition.rate,
  )
  const simulation = simulate(assumptions, (year) =>
    year < matureSystemYear ? transition.rate : mature.rate,
  )
  const handoff = simulation.years.find(
    (row) => row.year === matureSystemYear,
  )
  return {
    converged: transition.converged && mature.converged,
    transitionConverged: transition.converged,
    matureConverged: mature.converged,
    transitionRate: transition.rate,
    matureRate: mature.rate,
    matureSystemYear,
    handoffDebtTargetGDP: assumptions.matureDebtTargetGDP,
    handoffDebtGDP: handoff?.beginningDebtGDP ?? Number.NaN,
    simulation,
  }
}
