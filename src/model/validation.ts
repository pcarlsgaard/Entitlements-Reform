import type { ModelAssumptions } from './types'
import { fundingStrategies } from './fundingStrategy'

export interface AssumptionValidationIssue {
  key: keyof ModelAssumptions
  message: string
}

const numericKeys = [
  'reformYear',
  'endYear',
  'maxModeledAge',
  'benefitPhaseInYears',
  'flatBenefitFPLMultiple',
  'individualFPL2026',
  'realFPLGrowth',
  'fullRetirementAge',
  'vestingYears',
  'currentLawSSBenefit2026',
  'currentLawSSBenefitRealGrowth',
  'prefundingStartAge',
  'realEndowmentYield',
  'medicareEligibilityAge',
  'premiumSupport2026',
  'premiumSupportRealGrowth',
  'legacyMedicareCost2026',
  'legacyMedicareRealGrowth',
  'legacyMedicareHIShare2026',
  'medicareYearA',
  'medicareYearB',
  'cohortSizeMillions2026',
  'cohortSizeGrowth',
  'startingNominalGDPBillions',
  'realGDPGrowth',
  'inflation',
  'startingDebtGDP',
  'baselineRealMarketRate',
  'startingEffectiveNominalRate',
  'debtSensitivity',
  'debtRatePassThrough',
  'otherOASDIGDP',
  'under65MedicareGDP',
  'nonDefenseDiscretionaryGDP2026',
  'nonDefenseDiscretionaryRealGrowth',
  'otherPrimaryGDP',
  'policyHorizonYears',
  'policyHorizonDebtTargetGDP',
  'peakDebtCeilingGDP',
] as const satisfies readonly (keyof ModelAssumptions)[]

export function validateModelAssumptions(
  assumptions: ModelAssumptions,
): AssumptionValidationIssue[] {
  const issues: AssumptionValidationIssue[] = []
  const add = (key: keyof ModelAssumptions, message: string) =>
    issues.push({ key, message })

  for (const key of numericKeys) {
    if (!Number.isFinite(assumptions[key])) add(key, 'Enter a finite number.')
  }
  if (issues.length > 0) return issues

  if (!fundingStrategies.includes(assumptions.fundingStrategy)) {
    add('fundingStrategy', 'Select a recognized financing strategy.')
  }

  if (assumptions.endYear <= assumptions.reformYear) {
    add('endYear', 'The simulation end year must follow the reform year.')
  }
  if (
    !Number.isInteger(assumptions.policyHorizonYears) ||
    assumptions.policyHorizonYears < 2 ||
    assumptions.reformYear + assumptions.policyHorizonYears - 1 >
      assumptions.endYear
  ) {
    add(
      'policyHorizonYears',
      'The policy horizon must be a whole number of years within the simulation.',
    )
  }
  if (assumptions.benefitPhaseInYears <= 0) {
    add('benefitPhaseInYears', 'The phase-in must be at least one year.')
  }
  if (assumptions.fullRetirementAge < 0 || assumptions.fullRetirementAge >= assumptions.maxModeledAge) {
    add('fullRetirementAge', 'Retirement age must be below the maximum modeled age.')
  }
  if (assumptions.medicareEligibilityAge < 0 || assumptions.medicareEligibilityAge >= assumptions.maxModeledAge) {
    add('medicareEligibilityAge', 'Medicare eligibility age must be below the maximum modeled age.')
  }
  if (assumptions.medicareYearA < assumptions.reformYear) {
    add('medicareYearA', 'Year A cannot precede the reform year.')
  }
  if (assumptions.medicareYearB < assumptions.medicareYearA) {
    add('medicareYearB', 'Year B must be the same as or later than Year A.')
  }
  if (assumptions.medicareYearB > assumptions.endYear) {
    add('medicareYearB', 'Year B must fall within the simulation horizon.')
  }
  if (assumptions.realEndowmentYield <= -1) {
    add('realEndowmentYield', 'The real endowment yield must be greater than -100%.')
  }
  if (assumptions.realGDPGrowth <= -1) {
    add('realGDPGrowth', 'Real GDP growth must be greater than -100%.')
  }
  if (assumptions.inflation <= -1) {
    add('inflation', 'Inflation must be greater than -100%.')
  }
  if (assumptions.cohortSizeGrowth <= -1) {
    add('cohortSizeGrowth', 'Cohort-size growth must be greater than -100%.')
  }
  if (assumptions.currentLawSSBenefitRealGrowth <= -1) {
    add(
      'currentLawSSBenefitRealGrowth',
      'Current-law Social Security benefit growth must be greater than -100%.',
    )
  }
  if (assumptions.premiumSupportRealGrowth <= -1) {
    add('premiumSupportRealGrowth', 'Real premium-support growth must be greater than -100%.')
  }
  if (assumptions.legacyMedicareRealGrowth <= -1) {
    add(
      'legacyMedicareRealGrowth',
      'Legacy Medicare cost growth must be greater than -100%.',
    )
  }
  if (
    assumptions.legacyMedicareHIShare2026 < 0 ||
    assumptions.legacyMedicareHIShare2026 > 1
  ) {
    add(
      'legacyMedicareHIShare2026',
      'The Medicare Part A share must be between 0% and 100%.',
    )
  }
  if (assumptions.nonDefenseDiscretionaryRealGrowth <= -1) {
    add(
      'nonDefenseDiscretionaryRealGrowth',
      'Real nondefense discretionary growth must be greater than -100%.',
    )
  }
  if (assumptions.debtRatePassThrough < 0 || assumptions.debtRatePassThrough > 1) {
    add('debtRatePassThrough', 'Refinancing speed must be between 0% and 100%.')
  }
  if (assumptions.flatBenefitFPLMultiple < 0) {
    add('flatBenefitFPLMultiple', 'The flat benefit cannot be negative.')
  }
  if (assumptions.premiumSupport2026 < 0) {
    add('premiumSupport2026', 'Premium support cannot be negative.')
  }
  if (assumptions.startingNominalGDPBillions <= 0) {
    add('startingNominalGDPBillions', 'Starting nominal GDP must be positive.')
  }
  if (assumptions.startingDebtGDP < 0) {
    add('startingDebtGDP', 'Starting debt cannot be negative.')
  }
  if (assumptions.policyHorizonDebtTargetGDP < 0) {
    add(
      'policyHorizonDebtTargetGDP',
      'The policy-horizon debt target cannot be negative.',
    )
  }
  if (assumptions.otherOASDIGDP < 0)
    add('otherOASDIGDP', 'The other-OASDI share cannot be negative.')
  if (assumptions.under65MedicareGDP < 0)
    add('under65MedicareGDP', 'The under-65 Medicare share cannot be negative.')
  if (assumptions.nonDefenseDiscretionaryGDP2026 < 0)
    add(
      'nonDefenseDiscretionaryGDP2026',
      'The nondefense discretionary share cannot be negative.',
    )
  if (assumptions.otherPrimaryGDP < 0)
    add('otherPrimaryGDP', 'The other-primary share cannot be negative.')

  return issues
}
