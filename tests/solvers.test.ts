import { describe, expect, it } from 'vitest'
import { withAssumptions } from '../src/model/defaults'
import {
  comparePolicyHorizons,
  compareScenarios,
} from '../src/model/scenarios'
import { fundingStrategies } from '../src/model/fundingStrategy'
import {
  calculateMatureSystemYear,
  calculateTransitionRunoffYears,
  objectiveSatisfied,
  solveAnnualRevenuePath,
  solvePermanentRevenueRate,
} from '../src/model/solveTax'

const shorter = withAssumptions({ endYear: 2160 })

describe('mature-system timing', () => {
  it('age-18 prefunding matures in 2118', () => {
    expect(
      calculateMatureSystemYear(
        withAssumptions({ fundingStrategy: 'both', prefundingStartAge: 18 }),
      ),
    ).toBe(2118)
  })

  it('PAYGO 20-year phase-in matures in 2086', () => {
    expect(
      calculateMatureSystemYear(
        withAssumptions({
          fundingStrategy: 'paygo',
          benefitPhaseInYears: 20,
          fullRetirementAge: 70,
          maxModeledAge: 110,
          medicareYearB: 2035,
        }),
      ),
    ).toBe(2086)
  })

  it('reports conservative 90/95/99 transition runoff milestones', () => {
    expect(
      calculateTransitionRunoffYears(
        withAssumptions({
          fundingStrategy: 'both',
          prefundingStartAge: 18,
        }),
      ),
    ).toEqual({
      ninetyPercent: 2102,
      ninetyFivePercent: 2105,
      ninetyNinePercent: 2109,
    })
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

  it('satisfies both the selected peak ceiling and endpoint target', () => {
    const assumptions = withAssumptions({
      peakDebtCeilingGDP: 1.2,
      policyHorizonDebtTargetGDP: 1.01,
      endYear: 2160,
    })
    const solution = solvePermanentRevenueRate(assumptions)
    expect(solution.converged).toBe(true)
    expect(objectiveSatisfied(solution.simulation, assumptions)).toBe(true)
    expect(solution.peakDebtGDP).toBeLessThanOrEqual(1.2 + 1e-10)
    expect(solution.terminalDebtGDP).toBeLessThanOrEqual(1.01 + 1e-10)
  })
})

describe('annual required-revenue path', () => {
  for (const fundingStrategy of fundingStrategies) {
    it(`reaches the 70-year debt target with ${fundingStrategy} financing`, () => {
      const assumptions = withAssumptions({ fundingStrategy, endYear: 2160 })
      const solution = solveAnnualRevenuePath(assumptions)
      expect(solution.converged).toBe(true)
      expect(solution.policyHorizonEndYear).toBe(2095)
      expect(solution.endpointDebtGDP).toBeCloseTo(
        assumptions.policyHorizonDebtTargetGDP,
        10,
      )
    })

    it(`starts at the single rate and never rises with ${fundingStrategy} financing`, () => {
      const assumptions = withAssumptions({ fundingStrategy, endYear: 2160 })
      const permanent = solvePermanentRevenueRate(assumptions)
      const solution = solveAnnualRevenuePath(assumptions, permanent)
      expect(solution.startingRevenueRate).toBeCloseTo(permanent.rate, 12)
      expect(solution.startingRevenueRate).toBeLessThanOrEqual(
        permanent.rate + 1e-12,
      )
      expect(solution.nonIncreasing).toBe(true)
      for (let index = 1; index < solution.simulation.years.length; index += 1) {
        expect(solution.simulation.years[index]!.revenueRate).toBeLessThanOrEqual(
          solution.simulation.years[index - 1]!.revenueRate + 1e-12,
        )
      }
      expect(
        solution.simulation.years.every((row) => row.endingDebtGDP >= 0),
      ).toBe(true)
    })
  }

  it('reports the opening peak and exact minimum across the visible path', () => {
    const solution = solveAnnualRevenuePath(withAssumptions({ endYear: 2160 }))
    const visibleRows = solution.simulation.years
    expect(solution.peakRevenueRate).toBe(
      Math.max(...visibleRows.map((row) => row.revenueRate)),
    )
    expect(solution.peakRevenueRate).toBe(solution.startingRevenueRate)
    expect(solution.peakRevenueYear).toBe(2026)
    expect(solution.minimumRevenueRate).toBe(
      Math.min(...visibleRows.map((row) => row.revenueRate)),
    )
    expect(solution.minimumRevenueRate).toBeLessThanOrEqual(
      solution.startingRevenueRate,
    )
  })

  it('lowers revenue before the endpoint when an early peak ceiling binds', () => {
    const assumptions = withAssumptions({
      fundingStrategy: 'both',
      peakDebtCeilingGDP: 1.2,
      policyHorizonDebtTargetGDP: 1.01,
      endYear: 2160,
    })
    const solution = solveAnnualRevenuePath(assumptions)
    expect(solution.converged).toBe(true)
    expect(solution.revenueDeclineYear).not.toBeNull()
    expect(solution.revenueDeclineYear!).toBeLessThan(
      solution.policyHorizonEndYear,
    )
    expect(solution.peakDebtGDP).toBeLessThanOrEqual(1.2 + 1e-7)
    expect(solution.endpointDebtGDP).toBeCloseTo(1.01, 7)
    expect(solution.endpointRevenueRate).toBeLessThan(
      solution.startingRevenueRate,
    )
    expect(solution.nonIncreasing).toBe(true)
  })

  it('can stabilize endpoint debt at the same level as the peak ceiling', () => {
    const assumptions = withAssumptions({
      fundingStrategy: 'paygo',
      peakDebtCeilingGDP: 1.2,
      policyHorizonDebtTargetGDP: 1.2,
      endYear: 2160,
    })
    const solution = solveAnnualRevenuePath(assumptions)
    expect(solution.converged).toBe(true)
    expect(solution.revenueDeclineYear).not.toBeNull()
    expect(solution.revenueDeclineYear!).toBeLessThan(
      solution.policyHorizonEndYear,
    )
    expect(solution.peakDebtGDP).toBeLessThanOrEqual(1.2 + 1e-7)
    expect(solution.endpointDebtGDP).toBeCloseTo(1.2, 7)
    expect(solution.nonIncreasing).toBe(true)
  })
})

describe('scenario comparison', () => {
  it('uses 2095 as the central 70-year endpoint and keeps the extension visible', () => {
    expect(withAssumptions({}).endYear).toBe(2160)
    expect(withAssumptions({}).policyHorizonYears).toBe(70)
    const horizons = comparePolicyHorizons(withAssumptions({}))
    expect(horizons.map((horizon) => horizon.endYear)).toEqual([
      2055,
      2075,
      2095,
    ])
    expect(
      horizons.every((horizon) =>
        fundingStrategies.every(
          (strategy) => horizon.scenarios[strategy].converged,
        ),
      ),
    ).toBe(true)
  })

  it('uses identical benefit assumptions except for the funding strategy', () => {
    const result = compareScenarios(shorter)
    const { fundingStrategy: paygoStrategy, ...paygo } = result.paygo.assumptions
    const { fundingStrategy: prefundedStrategy, ...prefunded } =
      result.prefunded.assumptions
    expect(paygoStrategy).toBe('paygo')
    expect(prefundedStrategy).toBe('both')
    expect(paygo).toEqual(prefunded)
  })

  it('funding strategy changes timing without altering policy primitives', () => {
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
    const sequential = result.scenarios.socialSecurityFirst
    expect(sequential.firstPositiveSocialSecurityDividendYear).toBe(2081)
    expect(sequential.firstMedicarePrefundingYear).toBe(2081)
    expect(sequential.firstMedicarePrefundedEligibilityYear).toBe(2128)
    expect(sequential.firstFullMedicarePrefundingYear).toBeNull()
  })
})
