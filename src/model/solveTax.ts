import {
  simulate,
  simulateConstantRevenue,
  type RevenueSchedule,
} from './simulate'
import { cbo2026RevenueGDP } from '../data/cboBaseline'
import { hasAnyPrefunding } from './fundingStrategy'
import { survivalProbability } from './mortality'
import type {
  AnnualRevenuePathSolution,
  ModelAssumptions,
  PermanentRateSolution,
  SimulationResult,
  SolverDiagnostics,
} from './types'

const MAX_ITERATIONS = 80
const PATH_MAX_ITERATIONS = 48
const RATE_TOLERANCE = 1e-13
const DEBT_TOLERANCE = 1e-11
const PATH_DEBT_TOLERANCE = 1e-8

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
  const belowPeak =
    diagnostics.peakDebtGDP <=
    assumptions.peakDebtCeilingGDP + DEBT_TOLERANCE
  const belowEndpoint =
    diagnostics.terminalDebtGDP <=
    assumptions.policyHorizonDebtTargetGDP + DEBT_TOLERANCE
  return belowPeak && belowEndpoint
}

function solvePermanentRevenueRateUsing(
  assumptions: ModelAssumptions,
  makeSimulation: ConstantRevenueSimulator,
  lowerBound = 0,
  upperBound = 0.6,
): PermanentRateSolution {
  const upperSimulation = makeSimulation(upperBound)
  if (!objectiveSatisfied(upperSimulation, assumptions)) {
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
    if (objectiveSatisfied(candidate, assumptions)) {
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

/**
 * Construct the minimum-opening, nonincreasing revenue path.
 *
 * The opening rate is the minimum constant rate that satisfies both the peak
 * ceiling and endpoint target. If the endpoint constraint binds, that rate is
 * held through the cutoff. If the peak ceiling binds earlier and leaves the
 * constant path below the endpoint target, revenue declines linearly from the
 * earliest safe year to an end rate solved to hit the endpoint exactly. The
 * hold-through year is delayed only when an earlier decline would create a
 * second peak above the selected ceiling.
 */
export function solveAnnualRevenuePathUsing(
  assumptions: ModelAssumptions,
  makeSimulation: ScheduledRevenueSimulator,
  permanent: PermanentRateSolution,
): AnnualRevenuePathSolution {
  const horizonEnd = policyHorizonEndYear(assumptions)
  const target = assumptions.policyHorizonDebtTargetGDP
  const ceiling = assumptions.peakDebtCeilingGDP

  const makePathSimulation = (
    holdThroughYear: number,
    endpointRate: number,
  ): SimulationResult => {
    let previousRate = endpointRate
    const schedule: RevenueSchedule = (year, context) => {
      if (year <= holdThroughYear) return permanent.rate
      if (year <= horizonEnd) {
        const progress =
          (year - holdThroughYear) / (horizonEnd - holdThroughYear)
        return permanent.rate + progress * (endpointRate - permanent.rate)
      }

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
    return makeSimulation(schedule)
  }

  let simulation = makePathSimulation(horizonEnd, permanent.rate)

  if (permanent.terminalDebtGDP < target - PATH_DEBT_TOLERANCE) {
    const firstCandidateYear = Math.min(permanent.peakYear, horizonEnd - 1)
    for (
      let candidateYear = firstCandidateYear;
      candidateYear < horizonEnd;
      candidateYear += 1
    ) {
      const zeroRateSimulation = makePathSimulation(candidateYear, 0)
      const zeroRateEndpoint = zeroRateSimulation.years.find(
        (row) => row.year === horizonEnd,
      )
      if (!zeroRateEndpoint || zeroRateEndpoint.endingDebtGDP < target) {
        break
      }

      let low = 0
      let high = permanent.rate
      let candidateSimulation = zeroRateSimulation
      for (let iteration = 0; iteration < PATH_MAX_ITERATIONS; iteration += 1) {
        const midpoint = (low + high) / 2
        candidateSimulation = makePathSimulation(candidateYear, midpoint)
        const endpoint = candidateSimulation.years.find(
          (row) => row.year === horizonEnd,
        )
        if (!endpoint) throw new Error('Revenue-path endpoint is missing.')
        if (endpoint.endingDebtGDP > target) low = midpoint
        else high = midpoint
      }
      candidateSimulation = makePathSimulation(candidateYear, high)
      const candidateRows = candidateSimulation.years.filter(
        (row) => row.year <= horizonEnd,
      )
      const candidatePeak = Math.max(
        ...candidateRows.map((row) => row.endingDebtGDP),
      )
      if (candidatePeak <= ceiling + PATH_DEBT_TOLERANCE) {
        simulation = candidateSimulation
        break
      }
    }
  }

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
  const revenueDecline = visibleRows.find(
    (row) => row.revenueRate < permanent.rate - RATE_TOLERANCE,
  )
  return {
    converged:
      Math.abs(endpoint.endingDebtGDP - target) <= PATH_DEBT_TOLERANCE &&
      peakDebt.endingDebtGDP <= ceiling + PATH_DEBT_TOLERANCE &&
      nonIncreasing,
    policyHorizonEndYear: horizonEnd,
    endpointDebtTargetGDP: target,
    endpointDebtGDP: endpoint.endingDebtGDP,
    startingRevenueRate: visibleRows[0]!.revenueRate,
    openingFiscalAdjustmentGDP:
      visibleRows[0]!.revenueRate - cbo2026RevenueGDP,
    revenueDeclineYear: revenueDecline?.year ?? null,
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
