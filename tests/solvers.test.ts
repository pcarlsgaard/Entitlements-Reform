import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import { compareScenarios } from '../src/model/scenarios'
import {
  calculateMatureSystemYear,
  objectiveSatisfied,
  solvePermanentRevenueRate,
  solveTwoRateSchedule,
} from '../src/model/solveTax'

const shorter = withAssumptions({ endYear: 2160 })

describe('mature-system timing', () => {
  it('age-18 prefunding matures in 2118', () => {
    expect(
      calculateMatureSystemYear(
        withAssumptions({ prefundingEnabled: true, prefundingStartAge: 18 }),
      ),
    ).toBe(2118)
  })

  it('PAYGO 20-year phase-in matures in 2086', () => {
    expect(
      calculateMatureSystemYear(
        withAssumptions({
          prefundingEnabled: false,
          benefitPhaseInYears: 20,
          fullRetirementAge: 70,
          maxModeledAge: 110,
          medicareYearB: 2035,
        }),
      ),
    ).toBe(2086)
  })
})

describe('permanent revenue solver', () => {
  it('uses one identical revenue rate in every year', () => {
    const solution = solvePermanentRevenueRate(shorter)
    expect(solution.converged).toBe(true)
    expect(
      solution.simulation.years.every(
        (row) => Math.abs(row.revenueRate - solution.rate) < 1e-14,
      ),
    ).toBe(true)
  })

  it('satisfies its selected objective', () => {
    const assumptions = withAssumptions({
      fiscalObjective: 'returnToStartingDebt',
      endYear: 2160,
    })
    const solution = solvePermanentRevenueRate(assumptions)
    expect(solution.converged).toBe(true)
    expect(
      objectiveSatisfied(solution.simulation, assumptions.fiscalObjective, assumptions),
    ).toBe(true)
  })
})

describe('two-rate solver', () => {
  for (const prefundingEnabled of [false, true]) {
    it(`reaches the handoff target with prefunding ${prefundingEnabled ? 'ON' : 'OFF'}`, () => {
      const assumptions = withAssumptions({ prefundingEnabled, endYear: 2160 })
      const solution = solveTwoRateSchedule(assumptions)
      expect(solution.transitionConverged).toBe(true)
      expect(solution.handoffDebtGDP).toBeCloseTo(
        assumptions.matureDebtTargetGDP,
        5,
      )
    })

    it(`uses exactly two rates around the handoff with prefunding ${prefundingEnabled ? 'ON' : 'OFF'}`, () => {
      const solution = solveTwoRateSchedule(
        withAssumptions({ prefundingEnabled, endYear: 2160 }),
      )
      for (const row of solution.simulation.years) {
        expect(row.revenueRate).toBe(
          row.year < solution.matureSystemYear
            ? solution.transitionRate
            : solution.matureRate,
        )
      }
    })

    it(`produces a non-rising mature terminal debt path with prefunding ${prefundingEnabled ? 'ON' : 'OFF'}`, () => {
      const solution = solveTwoRateSchedule(
        withAssumptions({ prefundingEnabled, endYear: 2160 }),
      )
      expect(solution.matureConverged).toBe(true)
      const matureRows = solution.simulation.years.filter(
        (row) => row.year >= solution.matureSystemYear,
      )
      const last = matureRows.at(-1)!
      const prior = matureRows.at(-2)!
      expect(last.beginningDebtGDP - prior.beginningDebtGDP).toBeLessThanOrEqual(
        1e-6,
      )
    })
  }
})

describe('scenario comparison', () => {
  it('uses identical benefit assumptions except for the prefunding toggle', () => {
    const result = compareScenarios(shorter)
    const { prefundingEnabled: paygoToggle, ...paygo } = result.paygo.assumptions
    const { prefundingEnabled: prefundedToggle, ...prefunded } =
      result.prefunded.assumptions
    expect(paygoToggle).toBe(false)
    expect(prefundedToggle).toBe(true)
    expect(paygo).toEqual(prefunded)
  })

  it('prefunding changes financing timing without altering policy primitives', () => {
    const result = compareScenarios(shorter)
    expect(result.paygo.permanent.simulation.years[0]?.newCohortPrefunding).toBe(0)
    expect(
      result.prefunded.permanent.simulation.years[0]?.newCohortPrefunding,
    ).toBeGreaterThan(0)
    expect(result.paygo.assumptions.flatBenefitFPLMultiple).toBe(
      result.prefunded.assumptions.flatBenefitFPLMultiple,
    )
    expect(result.paygo.assumptions.premiumSupport2026).toBe(
      result.prefunded.assumptions.premiumSupport2026,
    )
  })
})
