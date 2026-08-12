import {
  calculateEndowmentPerPerson,
  fundingPlanForAssumptions,
} from './endowment'
import { nonDefenseDiscretionaryBillions } from './budget'
import {
  nominalGDPGrowth,
  nominalRateFromReal,
  realMarketRateTarget,
  updateEffectiveRate,
} from './debt'
import { medicareForYear } from './medicare'
import { socialSecurityForYear } from './socialSecurity'
import type {
  ModelAssumptions,
  PrimaryComponents,
  SimulationResult,
  SimulationYear,
} from './types'

export type RevenueSchedule = (year: number) => number

export interface InitialFiscalState {
  beginningDebtBillions?: number
  effectiveNominalInterestRate?: number
}

export function primaryComponentSum(components: PrimaryComponents): number {
  return (
    components.legacySocialSecurity +
    components.flatSocialSecurityPaygo +
    components.otherOASDI +
    components.legacySeniorMedicare +
    components.premiumSupportPaygo +
    components.under65Medicare +
    components.nonDefenseDiscretionary +
    components.newCohortPrefunding +
    components.otherPrimarySpending
  )
}

export function simulate(
  assumptions: ModelAssumptions,
  revenueSchedule: RevenueSchedule,
  initialState: InitialFiscalState = {},
): SimulationResult {
  const years: SimulationYear[] = []
  const socialSecurityByYear = new Map()
  const medicareByYear = new Map()
  const fundingPlan = fundingPlanForAssumptions(assumptions)
  const gdpGrowth = nominalGDPGrowth(assumptions)
  let nominalGDP = assumptions.startingNominalGDPBillions
  let beginningDebt =
    initialState.beginningDebtBillions ??
    assumptions.startingDebtGDP * nominalGDP
  let previousEffectiveRate =
    initialState.effectiveNominalInterestRate ??
    assumptions.startingEffectiveNominalRate

  for (
    let year = assumptions.reformYear;
    year <= assumptions.endYear;
    year += 1
  ) {
    const socialSecurity = socialSecurityForYear(year, assumptions)
    const medicare = medicareForYear(
      year,
      assumptions,
      (eligibilityYear) => {
        const fundingYear =
          eligibilityYear -
          (assumptions.medicareEligibilityAge -
            assumptions.prefundingStartAge)
        return fundingPlan.get(fundingYear)?.medicarePrefundedShare ?? 0
      },
    )
    const funding = fundingPlan.get(year)
    if (!funding) throw new Error(`Missing funding plan for ${year}.`)
    socialSecurityByYear.set(year, socialSecurity)
    medicareByYear.set(year, medicare)

    const components: PrimaryComponents = {
      legacySocialSecurity: socialSecurity.legacyBillions,
      flatSocialSecurityPaygo: socialSecurity.flatPaygoBillions,
      otherOASDI: assumptions.otherOASDIGDP * nominalGDP,
      legacySeniorMedicare: medicare.legacyBillions,
      premiumSupportPaygo: medicare.premiumSupportPaygoBillions,
      under65Medicare: assumptions.under65MedicareGDP * nominalGDP,
      nonDefenseDiscretionary: nonDefenseDiscretionaryBillions(
        year,
        assumptions,
      ),
      newCohortPrefunding: funding.totalPrefunding,
      otherPrimarySpending: assumptions.otherPrimaryGDP * nominalGDP,
    }
    const totalPrimarySpending = primaryComponentSum(components)
    const revenueRate = revenueSchedule(year)
    const revenue = revenueRate * nominalGDP
    const primaryBalance = revenue - totalPrimarySpending
    const primaryDeficit = -primaryBalance
    const beginningDebtGDP = beginningDebt / nominalGDP
    const realTargetInterestRate = realMarketRateTarget(
      beginningDebtGDP,
      assumptions,
    )
    const nominalTargetInterestRate = nominalRateFromReal(
      realTargetInterestRate,
      assumptions.inflation,
    )
    const effectiveNominalInterestRate =
      year === assumptions.reformYear
        ? previousEffectiveRate
        : updateEffectiveRate(
            previousEffectiveRate,
            nominalTargetInterestRate,
            assumptions.debtRatePassThrough,
          )
    const netInterest = effectiveNominalInterestRate * beginningDebt
    const totalFederalSpending = totalPrimarySpending + netInterest
    const overallDeficit = primaryDeficit + netInterest
    const endingDebt = beginningDebt + overallDeficit
    const endingDebtGDP = endingDebt / nominalGDP

    years.push({
      year,
      nominalGDP,
      socialSecurityPrefunding: funding.socialSecurityPrefunding,
      medicarePrefunding: funding.medicarePrefunding,
      fullMedicarePrefundingCost: funding.fullMedicarePrefundingCost,
      avoidedSocialSecurityPaygo: funding.avoidedSocialSecurityPaygo,
      socialSecurityPrefundingDividend:
        funding.socialSecurityPrefundingDividend,
      medicarePrefundedShare: funding.medicarePrefundedShare,
      ...components,
      totalPrimarySpending,
      revenue,
      revenueRate,
      primaryBalance,
      primaryDeficit,
      realTargetInterestRate,
      nominalTargetInterestRate,
      effectiveNominalInterestRate,
      netInterest,
      totalFederalSpending,
      overallDeficit,
      beginningDebt,
      endingDebt,
      beginningDebtGDP,
      endingDebtGDP,
      debtGDP: beginningDebtGDP,
    })

    beginningDebt = endingDebt
    previousEffectiveRate = effectiveNominalInterestRate
    nominalGDP *= 1 + gdpGrowth
  }

  return {
    assumptions,
    years,
    socialSecurityByYear,
    medicareByYear,
    endowment2026: calculateEndowmentPerPerson(assumptions),
    cumulativePrefundingBillions: years.reduce(
      (sum, row) => sum + row.newCohortPrefunding,
      0,
    ),
    cumulativeSocialSecurityPrefundingBillions: years.reduce(
      (sum, row) => sum + row.socialSecurityPrefunding,
      0,
    ),
    cumulativeMedicarePrefundingBillions: years.reduce(
      (sum, row) => sum + row.medicarePrefunding,
      0,
    ),
  }
}

export function simulateConstantRevenue(
  assumptions: ModelAssumptions,
  revenueRate: number,
): SimulationResult {
  return simulate(assumptions, () => revenueRate)
}
