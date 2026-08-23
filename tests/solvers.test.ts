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

    it(`holds debt at the endpoint target after the cutoff with ${fundingStrategy} financing`, () => {
      const solution = solveAnnualRevenuePath(
        withAssumptions({ fundingStrategy, endYear: 2160 }),
      )
      for (const row of solution.simulation.years.filter(
        (item) => item.year >= solution.policyHorizonEndYear,
      )) {
        expect(row.endingDebtGDP).toBeCloseTo(
          solution.endpointDebtTargetGDP,
          10,
        )
      }
      expect(
        solution.simulation.years.every((row) => row.endingDebtGDP >= 0),
      ).toBe(true)
    })
  }

  it('reports exact peak and minimum rates within the policy window', () => {
    const solution = solveAnnualRevenuePath(withAssumptions({ endYear: 2160 }))
    const policyRows = solution.simulation.years.filter(
      (row) => row.year <= solution.policyHorizonEndYear,
    )
    expect(solution.peakRevenueRate).toBe(
      Math.max(...policyRows.map((row) => row.revenueRate)),
    )
    expect(solution.minimumRevenueRate).toBe(
      Math.min(...policyRows.map((row) => row.revenueRate)),
    )
    expect(solution.peakRevenueRate).not.toBe(solution.minimumRevenueRate)
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
