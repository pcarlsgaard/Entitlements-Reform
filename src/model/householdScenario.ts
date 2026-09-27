import { currentLawDeliveryShares } from './currentLaw'
import { defaultAssumptions } from './defaults'
import { calculateTransferAnalysis } from '../tax/model/transfers'
import type { TransferHouseholdInput, TransferProgramId, TransferProgramResult } from '../tax/model/types'
import type { CombinedPolicy } from './combined'
import type { SimulationResult } from './types'

export interface ExampleHousehold {
  id: string
  label: string
  description: string
  filingStatus: 'single' | 'married'
  primaryAge2026: number
  spouseAge2026: number
  childAges2026: number[]
  primaryWage2026: number
  spouseWage2026: number
  workThroughAge: number
  legacyBenefitMultiplier: number
  coverage: 'esi' | 'nongroup' | 'uninsured' | 'public'
  monthlyShelterCost2026: number
  monthlyDependentCareExpense2026: number
  inKindValuationFactor: number
  receives: Record<TransferProgramId, boolean>
  manualAnnualBenefits2026: Partial<Record<TransferProgramId, number>>
}

const receives = (ids: TransferProgramId[] = []): Record<TransferProgramId, boolean> => ({
  snap: ids.includes('snap'), wic: ids.includes('wic'), schoolMeals: ids.includes('schoolMeals'),
  summerEbt: ids.includes('summerEbt'), tanf: ids.includes('tanf'), liheap: ids.includes('liheap'),
  housing: ids.includes('housing'),
})

export const exampleHouseholds: ExampleHousehold[] = [
  { id: 'single-parent', label: 'Single parent', description: 'Low wages · two children · SNAP and school meals',
    filingStatus: 'single', primaryAge2026: 31, spouseAge2026: 31, childAges2026: [3, 8], primaryWage2026: 25_000,
    spouseWage2026: 0, workThroughAge: 67, legacyBenefitMultiplier: 0.7, coverage: 'public',
    monthlyShelterCost2026: 1250, monthlyDependentCareExpense2026: 350, inKindValuationFactor: 0.75,
    receives: receives(['snap', 'wic', 'schoolMeals', 'summerEbt', 'liheap']), manualAnnualBenefits2026: { wic: 900, liheap: 600 } },
  { id: 'two-earner', label: 'Two-earner family', description: 'Two wages · two children · employer coverage',
    filingStatus: 'married', primaryAge2026: 38, spouseAge2026: 36, childAges2026: [2, 9], primaryWage2026: 65_000,
    spouseWage2026: 35_000, workThroughAge: 67, legacyBenefitMultiplier: 1, coverage: 'esi',
    monthlyShelterCost2026: 1600, monthlyDependentCareExpense2026: 500, inKindValuationFactor: 0.75,
    receives: receives(), manualAnnualBenefits2026: {} },
  { id: 'near-retiree', label: 'Near retiree', description: 'Age 64 in 2026 · compare retirement ages',
    filingStatus: 'single', primaryAge2026: 64, spouseAge2026: 64, childAges2026: [], primaryWage2026: 55_000,
    spouseWage2026: 0, workThroughAge: 67, legacyBenefitMultiplier: 1, coverage: 'nongroup',
    monthlyShelterCost2026: 1400, monthlyDependentCareExpense2026: 0, inKindValuationFactor: 0.75,
    receives: receives(), manualAnnualBenefits2026: {} },
  { id: 'retired-couple', label: 'Retired couple', description: 'Ages 72 and 70 · Social Security and Medicare',
    filingStatus: 'married', primaryAge2026: 72, spouseAge2026: 70, childAges2026: [], primaryWage2026: 0,
    spouseWage2026: 0, workThroughAge: 67, legacyBenefitMultiplier: 1, coverage: 'public',
    monthlyShelterCost2026: 1200, monthlyDependentCareExpense2026: 0, inKindValuationFactor: 0.75,
    receives: receives(), manualAnnualBenefits2026: {} },
  { id: 'younger-worker', label: 'Young worker', description: 'Age 26 · longer horizon · no children',
    filingStatus: 'single', primaryAge2026: 26, spouseAge2026: 26, childAges2026: [], primaryWage2026: 42_000,
    spouseWage2026: 0, workThroughAge: 67, legacyBenefitMultiplier: 0.9, coverage: 'uninsured',
    monthlyShelterCost2026: 1100, monthlyDependentCareExpense2026: 0, inKindValuationFactor: 0.75,
    receives: receives(), manualAnnualBenefits2026: {} },
]

function annualSocialSecurity(simulation: SimulationResult, year: number, age: number, factor: number,
  mode: CombinedPolicy['baselineMode']): number {
  const assumptions = simulation.assumptions
  if (age < assumptions.fullRetirementAge || age > assumptions.maxModeledAge) return 0
  const cohort = simulation.socialSecurityByYear.get(year)?.cohorts.find(row =>
    row.retirementYear === year - (age - assumptions.fullRetirementAge))
  if (!cohort || cohort.survivingBeneficiariesMillions <= 0) return 0
  const delivery = currentLawDeliveryShares(year, assumptions, mode).socialSecurity
  const legacy = cohort.legacyPaygoBillions * 1000 / cohort.survivingBeneficiariesMillions * factor * delivery
  const flat = cohort.flatBenefitBillions * 1000 / cohort.survivingBeneficiariesMillions
  const nominalCap = assumptions.socialSecurityBenefitCap2026 === null ? Infinity :
    assumptions.socialSecurityBenefitCap2026 * (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  return Math.min(legacy + flat, nominalCap)
}

function annualMedicarePayment(simulation: SimulationResult, year: number, age: number,
  mode: CombinedPolicy['baselineMode']): number {
  const assumptions = simulation.assumptions
  if (age < assumptions.medicareEligibilityAge || age > assumptions.maxModeledAge) return 0
  const cohort = simulation.medicareByYear.get(year)?.cohorts.find(row =>
    row.eligibilityYear === year - (age - assumptions.medicareEligibilityAge))
  if (!cohort || cohort.survivingBeneficiariesMillions <= 0) return 0
  const legacy = cohort.legacyBillions * 1000 / cohort.survivingBeneficiariesMillions *
    currentLawDeliveryShares(year, assumptions, mode).seniorMedicare
  // Prefunded support is still a benefit payment, though it is absent from PAYGO spending.
  const support = cohort.premiumSupportShare * assumptions.premiumSupport2026 *
    (1 + assumptions.premiumSupportRealGrowth) ** (year - assumptions.reformYear) *
    (1 + assumptions.inflation) ** (year - assumptions.reformYear)
  return legacy + support
}

export interface HouseholdYearScore {
  year: number
  ages: number[]
  childAges: number[]
  annualWages: number
  currentCash: number
  reformCash: number
  cashChange: number
  taxCashChange: number
  cashTransferChange: number
  socialSecurityChange: number
  baselineSocialSecurity: number
  reformSocialSecurity: number
  inKindTransferChange: number
  baselineInKindTransferValue: number
  reformInKindTransferValue: number
  healthCreditGross: number
  baselineMedicarePayment: number
  reformMedicarePayment: number
  medicarePaymentChange: number
  programs: TransferProgramResult[]
  adults: { age: number; baselineSS: number; reformSS: number; baselineMedicare: number; reformMedicare: number }[]
}

/** Annual illustration; tax and transfer parameters are held in 2026-dollar units. */
export function scoreExampleHousehold(profile: ExampleHousehold, year: number, policy: CombinedPolicy,
  baseline: SimulationResult, combined: SimulationResult): HouseholdYearScore | null {
  if (!Number.isInteger(year) || year < policy.assumptions.reformYear || year > policy.assumptions.reformYear + 69) return null
  const elapsed = year - policy.assumptions.reformYear
  const ages = [profile.primaryAge2026, ...(profile.filingStatus === 'married' ? [profile.spouseAge2026] : [])].map(age => age + elapsed)
  if (ages.some(age => age > policy.assumptions.maxModeledAge)) return null
  const childAges = profile.childAges2026.map(age => age + elapsed).filter(age => age < 18)
  const realWageFactor = (1 + policy.assumptions.realGDPGrowth) ** elapsed
  const inflationFactor = (1 + policy.assumptions.inflation) ** elapsed
  const wages = [profile.primaryWage2026, profile.spouseWage2026].map((wage, index) =>
    (ages[index] ?? 999) <= profile.workThroughAge ? wage * realWageFactor : 0)
  const householdInput: TransferHouseholdInput = {
    household: { filingStatus: profile.filingStatus, cashWage: wages[0]!, secondaryCashWage: wages[1]!,
      children: childAges.length, childrenUnder6: childAges.filter(age => age < 6).length },
    employerFicaPassThroughRate: policy.health.employerFicaPassThroughRate,
    preschoolChildren: childAges.filter(age => age < 6).length,
    schoolAgeChildren: childAges.filter(age => age >= 6).length,
    monthlyShelterCost: profile.monthlyShelterCost2026,
    monthlyDependentCareExpense: childAges.length ? profile.monthlyDependentCareExpense2026 : 0,
    inKindValuationFactor: profile.inKindValuationFactor,
    receives: profile.receives,
    manualAnnualBenefits: profile.manualAnnualBenefits2026,
  }
  const analysis = calculateTransferAnalysis(householdInput, policy.tax, policy.transfers)
  const taxCashChange = policy.taxEnabled ?
    (analysis.reformRetained.annual - analysis.currentLaw.annual) * inflationFactor : 0
  const cashTransfers = analysis.programs.filter(row => row.program.kind !== 'in_kind')
  const inKindTransfers = analysis.programs.filter(row => row.program.kind === 'in_kind')
  const replaced = (row: TransferProgramResult) => policy.taxEnabled && policy.transfers.replacedPrograms[row.program.id]
  const baselineCashTransfers = cashTransfers.reduce((total, row) => total + row.annualGovernmentBenefit, 0) * inflationFactor
  const cashTransferLoss = cashTransfers.reduce((total, row) => total + (replaced(row) ? row.annualGovernmentBenefit : 0), 0) * inflationFactor
  const cashTransferChange = cashTransferLoss ? -cashTransferLoss : 0
  const baselineInKindTransferValue = inKindTransfers.reduce((total, row) => total + row.resourceEquivalentValue, 0) * inflationFactor
  const inKindTransferLoss = inKindTransfers.reduce((total, row) => total + (replaced(row) ? row.resourceEquivalentValue : 0), 0) * inflationFactor
  const inKindTransferChange = inKindTransferLoss ? -inKindTransferLoss : 0
  const adults = ages.map(age => ({
    age,
    baselineSS: annualSocialSecurity(baseline, year, age, profile.legacyBenefitMultiplier, policy.baselineMode),
    reformSS: annualSocialSecurity(combined, year, age, profile.legacyBenefitMultiplier, policy.baselineMode),
    baselineMedicare: annualMedicarePayment(baseline, year, age, policy.baselineMode),
    reformMedicare: annualMedicarePayment(combined, year, age, policy.baselineMode),
  }))
  const baselineSocialSecurity = adults.reduce((sum, adult) => sum + adult.baselineSS, 0)
  const reformSocialSecurity = adults.reduce((sum, adult) => sum + adult.reformSS, 0)
  const baselineMedicarePayment = adults.reduce((sum, adult) => sum + adult.baselineMedicare, 0)
  const reformMedicarePayment = adults.reduce((sum, adult) => sum + adult.reformMedicare, 0)
  const socialSecurityChange = reformSocialSecurity - baselineSocialSecurity
  const baselineAfterTaxWages = (analysis.currentGrossResources - analysis.currentPreCreditTaxLiability +
    analysis.currentTaxCredits) * inflationFactor
  const currentCash = baselineAfterTaxWages + baselineCashTransfers + baselineSocialSecurity
  const cashChange = taxCashChange + cashTransferChange + socialSecurityChange
  // Imported health snapshot scores under-65 coverage; do not credit someone
  // who already receives Medicare under an earlier policy eligibility age.
  const healthUpperAge = Math.min(defaultAssumptions.medicareEligibilityAge,
    combined.assumptions.medicareEligibilityAge)
  const eligiblePeople = [...ages, ...childAges].filter(age => age < healthUpperAge)
  const healthTakeUp = profile.coverage === 'public' ? 0 : profile.coverage === 'uninsured' ?
    policy.health.uninsuredTakeUpRate : 1
  const healthCreditGross = policy.taxEnabled ? healthTakeUp * (
    ages.filter(age => age < healthUpperAge).length * policy.health.adultHealthCredit +
    childAges.length * policy.health.childHealthCredit) * inflationFactor : 0
  return {
    year, ages, childAges, annualWages: (wages[0]! + wages[1]!) * inflationFactor,
    currentCash, reformCash: currentCash + cashChange, cashChange, taxCashChange, cashTransferChange,
    socialSecurityChange, baselineSocialSecurity, reformSocialSecurity,
    inKindTransferChange, baselineInKindTransferValue,
    reformInKindTransferValue: baselineInKindTransferValue + inKindTransferChange,
    healthCreditGross: eligiblePeople.length ? healthCreditGross : 0,
    baselineMedicarePayment, reformMedicarePayment,
    medicarePaymentChange: reformMedicarePayment - baselineMedicarePayment,
    programs: analysis.programs, adults,
  }
}
