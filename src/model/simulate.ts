import {
  calculateEndowmentPerPerson,
  fundingPlanForAssumptions,
} from './endowment'
import { nonDefenseDiscretionaryBillions } from './budget'
import { currentLawDeliveryShares } from './currentLaw'
import {
  nominalGDPGrowth,
  nominalRateFromReal,
  realMarketRateTarget,
  updateEffectiveRate,
} from './debt'
import { medicareForYear } from './medicare'
import { socialSecurityForYear } from './socialSecurity'
import type {
  AnnualFundingPlan,
  CurrentLawBaselineMode,
  ModelAssumptions,
  PrimaryComponents,
  SimulationResult,
  SimulationYear,
} from './types'

export interface RevenueScheduleContext {
  nominalGDP: number
  totalPrimarySpending: number
  beginningDebt: number
  beginningDebtGDP: number
  netInterest: number
  totalFederalSpending: number
}

export type RevenueSchedule = (
  year: number,
  context: RevenueScheduleContext,
) => number

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
  currentLawBaselineMode?: CurrentLawBaselineMode,
): SimulationResult {
  const years: SimulationYear[] = []
  const socialSecurityByYear = new Map()
  const medicareByYear = new Map()
  const fundingPlan = currentLawBaselineMode
    ? null
    : fundingPlanForAssumptions(assumptions)
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
    const socialSecurity = currentLawBaselineMode
      ? socialSecurityForYear(year, assumptions, 'currentLaw')
      : socialSecurityForYear(
          year,
          assumptions,
          'reform',
          (retirementYear) => {
            const fundingYear =
              retirementYear -
              (assumptions.fullRetirementAge -
                assumptions.prefundingStartAge)
            return (
              fundingPlan?.get(fundingYear)
                ?.socialSecurityPrefundedShare ?? 0
            )
          },
        )
    const medicare = currentLawBaselineMode
      ? medicareForYear(year, assumptions, undefined, 'currentLaw')
      : medicareForYear(year, assumptions, (eligibilityYear) => {
          const fundingYear =
            eligibilityYear -
            (assumptions.medicareEligibilityAge -
              assumptions.prefundingStartAge)
          return fundingPlan?.get(fundingYear)?.medicarePrefundedShare ?? 0
        })
    let funding: AnnualFundingPlan
    if (currentLawBaselineMode) {
      funding = {
        year,
        fullSocialSecurityPrefundingCost: 0,
        socialSecurityPrefunding: 0,
        socialSecurityPrefundedShare: 0,
        fullMedicarePrefundingCost: 0,
        medicarePrefunding: 0,
        totalPrefunding: 0,
        avoidedSocialSecurityPaygo: 0,
        socialSecurityPrefundingDividend: 0,
        medicarePrefundedShare: 0,
        availableReformSavings: 0,
        unusedReformSavings: 0,
      }
    } else {
      const plannedFunding = fundingPlan?.get(year)
      if (!plannedFunding) throw new Error(`Missing funding plan for ${year}.`)
      funding = plannedFunding
    }
    const deliveryShares = currentLawDeliveryShares(
      year,
      assumptions,
      currentLawBaselineMode ?? 'scheduled',
    )
    socialSecurityByYear.set(year, socialSecurity)
    medicareByYear.set(year, medicare)

    const components: PrimaryComponents = {
      legacySocialSecurity:
        socialSecurity.legacyBillions * deliveryShares.socialSecurity,
      flatSocialSecurityPaygo: socialSecurity.flatPaygoBillions,
      otherOASDI: assumptions.otherOASDIGDP * nominalGDP,
      legacySeniorMedicare:
        medicare.legacyBillions * deliveryShares.seniorMedicare,
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
    const revenueRate = revenueSchedule(year, {
      nominalGDP,
      totalPrimarySpending,
      beginningDebt,
      beginningDebtGDP,
      netInterest,
      totalFederalSpending,
    })
    const revenue = revenueRate * nominalGDP
    const primaryBalance = revenue - totalPrimarySpending
    const primaryDeficit = -primaryBalance
    const overallDeficit = primaryDeficit + netInterest
    const endingDebt = beginningDebt + overallDeficit
    const endingDebtGDP = endingDebt / nominalGDP

    years.push({
      year,
      nominalGDP,
      socialSecurityPrefunding: funding.socialSecurityPrefunding,
      fullSocialSecurityPrefundingCost:
        funding.fullSocialSecurityPrefundingCost,
      socialSecurityPrefundedShare:
        funding.socialSecurityPrefundedShare,
      medicarePrefunding: funding.medicarePrefunding,
      fullMedicarePrefundingCost: funding.fullMedicarePrefundingCost,
      avoidedSocialSecurityPaygo: funding.avoidedSocialSecurityPaygo,
      socialSecurityPrefundingDividend:
        funding.socialSecurityPrefundingDividend,
      medicarePrefundedShare: funding.medicarePrefundedShare,
      availableReformSavings: funding.availableReformSavings,
      unusedReformSavings: funding.unusedReformSavings,
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

export function simulateCurrentLawConstantRevenue(
  assumptions: ModelAssumptions,
  mode: CurrentLawBaselineMode,
  revenueRate: number,
): SimulationResult {
  return simulate(assumptions, () => revenueRate, {}, mode)
}

export function simulateCurrentLaw(
  assumptions: ModelAssumptions,
  mode: CurrentLawBaselineMode,
  revenueSchedule: RevenueSchedule,
): SimulationResult {
  return simulate(assumptions, revenueSchedule, {}, mode)
}
