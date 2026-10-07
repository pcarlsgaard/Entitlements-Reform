import {
  calculateEndowmentPerPerson,
  fundingPlanForAssumptions,
} from './endowment'
import { currentLawRetirementAge } from './defaults'
import {
  defenseDiscretionaryBillions,
  medicaidChipMarketplaceBillions,
  nonDefenseDiscretionaryBillions,
  otherMandatoryBillions,
} from './budget'
import { currentLawDeliveryShares } from './currentLaw'
import {
  nominalGDPGrowth,
  nominalRateFromReal,
  realMarketRateTarget,
  updateEffectiveRate,
} from './debt'
import { medicareForYear } from './medicare'
import { socialSecurityForYear } from './socialSecurity'
import {
  cboDefenseDiscretionaryGDP,
  cboNondefenseDiscretionaryGDP,
} from '../data/cboBaseline'
import { discretionaryPolicyBillions } from './otherSpending'
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

/** Optional independent benefit choices for the combined fiscal view. */
export interface BenefitPolicySelection {
  socialSecurityReform: boolean
  medicareReform: boolean
}

export interface FiscalBridge {
  /** Savings classified in other mandatory spending, as a share of GDP. */
  savingsScaleForYear?: (year: number) => number
  otherMandatorySavingsGDP: number
  medicaidMarketplaceSavingsGDP?: number
  /** Independent policy savings in other mandatory programs, held as a baseline-GDP share. */
  otherMandatoryPolicySavingsGDP?: number
  /** Undefined preserves the comparator spending path; otherwise this is annual nominal growth. */
  defenseDiscretionaryNominalGrowth?: number
  /** Undefined preserves the comparator spending path; otherwise this is annual nominal growth. */
  nonDefenseDiscretionaryNominalGrowth?: number
}

export function primaryComponentSum(components: PrimaryComponents): number {
  return (
    components.legacySocialSecurity +
    components.flatSocialSecurityPaygo +
    components.otherOASDI +
    components.legacySeniorMedicare +
    components.premiumSupportPaygo +
    components.under65Medicare +
    components.medicaidChipMarketplace +
    components.otherMandatory +
    components.defenseDiscretionary +
    components.nonDefenseDiscretionary +
    components.newCohortPrefunding
  )
}

export function simulate(
  assumptions: ModelAssumptions,
  revenueSchedule: RevenueSchedule,
  initialState: InitialFiscalState = {},
  currentLawBaselineMode?: CurrentLawBaselineMode,
  selection?: BenefitPolicySelection,
  fiscalBridge?: FiscalBridge,
  /** Optional policy-induced GDP level path, relative to the baseline economy. */
  gdpLevelFactorForYear?: (year: number) => number,
): SimulationResult {
  if (selection ? !selection.socialSecurityReform : Boolean(currentLawBaselineMode)) {
    assumptions = { ...assumptions, fullRetirementAge: currentLawRetirementAge, socialSecurityClaimAge: currentLawRetirementAge, socialSecurityBenefitCap2026: null }
  }
  if (selection && assumptions.fundingStrategy !== 'paygo' &&
    (!selection.socialSecurityReform || !selection.medicareReform)) {
    throw new Error('Independent benefit switches require PAYGO financing.')
  }
  if (assumptions.socialSecurityBenefitCap2026 !== null &&
    assumptions.fundingStrategy !== 'paygo' && selection?.socialSecurityReform) {
    throw new Error('The retiree benefit cap requires PAYGO financing.')
  }
  const years: SimulationYear[] = []
  const socialSecurityByYear = new Map()
  const medicareByYear = new Map()
  const fundingPlan = (selection
    ? !selection.socialSecurityReform && !selection.medicareReform
    : Boolean(currentLawBaselineMode))
    ? null
    : fundingPlanForAssumptions(assumptions, gdpLevelFactorForYear)
  const gdpGrowth = nominalGDPGrowth(assumptions)
  let baselineNominalGDP = assumptions.startingNominalGDPBillions
  let beginningDebt = Math.max(
    0,
    initialState.beginningDebtBillions ??
      assumptions.startingDebtGDP * baselineNominalGDP,
  )
  let previousEffectiveRate =
    initialState.effectiveNominalInterestRate ??
    assumptions.startingEffectiveNominalRate
  let fiscalBalanceReached = false

  for (
    let year = assumptions.reformYear;
    year <= assumptions.endYear;
    year += 1
  ) {
    const gdpLevelFactor = gdpLevelFactorForYear?.(year) ?? 1
    if (!Number.isFinite(gdpLevelFactor) || gdpLevelFactor <= 0) {
      throw new Error('Policy GDP factor must be finite and positive.')
    }
    const nominalGDP = baselineNominalGDP * gdpLevelFactor
    const socialSecurity = (selection ? !selection.socialSecurityReform : Boolean(currentLawBaselineMode))
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
    const medicare = (selection ? !selection.medicareReform : Boolean(currentLawBaselineMode))
      ? medicareForYear(year, assumptions, undefined, 'currentLaw')
      : medicareForYear(year, assumptions, (eligibilityYear) => {
          const fundingYear =
            eligibilityYear -
            (assumptions.medicareEligibilityAge -
              assumptions.prefundingStartAge)
          return fundingPlan?.get(fundingYear)?.medicarePrefundedShare ?? 0
        })
    // GDP-linked support shares the policy-induced GDP change; other benefits do not.
    if (assumptions.medicareFundingMode === 'gdpShare' && gdpLevelFactor !== 1) {
      medicare.premiumSupportPaygoBillions *= gdpLevelFactor
      medicare.cohorts = medicare.cohorts.map(c => ({ ...c,
        premiumSupportPaygoBillions: c.premiumSupportPaygoBillions * gdpLevelFactor }))
    }
    let funding: AnnualFundingPlan
    if (!fundingPlan) {
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
      otherOASDI: assumptions.otherOASDIGDP * baselineNominalGDP,
      legacySeniorMedicare:
        medicare.legacyBillions * deliveryShares.seniorMedicare,
      premiumSupportPaygo: medicare.premiumSupportPaygoBillions,
      under65Medicare: assumptions.under65MedicareGDP * baselineNominalGDP,
      medicaidChipMarketplace: medicaidChipMarketplaceBillions(
        year,
        assumptions,
      ) - (fiscalBridge?.medicaidMarketplaceSavingsGDP ?? 0) * baselineNominalGDP * (fiscalBridge?.savingsScaleForYear?.(year) ?? 1),
      otherMandatory: otherMandatoryBillions(year, assumptions) -
        (fiscalBridge?.otherMandatorySavingsGDP ?? 0) * baselineNominalGDP * (fiscalBridge?.savingsScaleForYear?.(year) ?? 1) -
        (fiscalBridge?.otherMandatoryPolicySavingsGDP ?? 0) * baselineNominalGDP,
      defenseDiscretionary:
        fiscalBridge?.defenseDiscretionaryNominalGrowth === undefined
          ? defenseDiscretionaryBillions(year, assumptions)
          : discretionaryPolicyBillions(
              year,
              cboDefenseDiscretionaryGDP(assumptions.reformYear),
              fiscalBridge.defenseDiscretionaryNominalGrowth,
              assumptions,
            ),
      nonDefenseDiscretionary:
        fiscalBridge?.nonDefenseDiscretionaryNominalGrowth === undefined
          ? nonDefenseDiscretionaryBillions(year, assumptions)
          : discretionaryPolicyBillions(
              year,
              cboNondefenseDiscretionaryGDP(assumptions.reformYear),
              fiscalBridge.nonDefenseDiscretionaryNominalGrowth,
              assumptions,
            ),
      newCohortPrefunding: funding.totalPrefunding,
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
    const scheduledRevenueRate = revenueSchedule(year, {
      nominalGDP,
      totalPrimarySpending,
      beginningDebt,
      beginningDebtGDP,
      netInterest,
      totalFederalSpending,
    })
    const scheduledRevenue = scheduledRevenueRate * nominalGDP
    // The scheduled tax policy runs until it first closes the overall deficit.
    // From that point onward the budget remains at least balanced. Any additional
    // surplus used for debt reduction is capped explicitly as a share of GDP.
    // Once the selected debt/GDP target is reached, the surplus falls to zero:
    // receipts equal total outlays, nominal debt is held constant, and growth
    // continues to reduce debt/GDP.
    if (!fiscalBalanceReached &&
      scheduledRevenue >= totalFederalSpending - 1e-9) {
      fiscalBalanceReached = true
    }
    const atDebtTarget =
      beginningDebtGDP <= assumptions.debtPaydownTargetGDP + 1e-12
    const targetDebt = assumptions.debtPaydownTargetGDP * nominalGDP
    const maximumRevenueToTarget =
      beginningDebt + totalFederalSpending - targetDebt
    let revenue = scheduledRevenue
    if (fiscalBalanceReached) {
      const scheduledSurplus = Math.max(
        0,
        scheduledRevenue - totalFederalSpending,
      )
      const allowedSurplus = atDebtTarget
        ? 0
        : Math.min(
            scheduledSurplus,
            assumptions.debtPaydownSurplusCapGDP * nominalGDP,
          )
      revenue = totalFederalSpending + allowedSurplus
      if (!atDebtTarget) {
        revenue = Math.min(revenue, maximumRevenueToTarget)
      }
    }
    const revenueAdjusted = Math.abs(revenue - scheduledRevenue) > 1e-9
    const revenueRate = revenueAdjusted ? revenue / nominalGDP : scheduledRevenueRate
    const primaryBalance = revenue - totalPrimarySpending
    const primaryDeficit = -primaryBalance
    const overallDeficit = primaryDeficit + netInterest
    const rawEndingDebt = beginningDebt + overallDeficit
    const endingDebt = Math.max(0, rawEndingDebt)
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
    baselineNominalGDP *= 1 + gdpGrowth
  }

  return {
    assumptions,
    years,
    socialSecurityByYear,
    medicareByYear,
    endowment2026: calculateEndowmentPerPerson(assumptions, assumptions.reformYear, gdpLevelFactorForYear),
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
