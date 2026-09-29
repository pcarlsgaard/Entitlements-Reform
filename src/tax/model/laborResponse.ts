import snapshotJson from '../data/labor_response_microdata_2025.json'
import baseline from '../data/baseline_2025.json'
import microdataJson from '../data/microdata_2025.json'
import currentLawJson from '../data/current_law_2025.json'
import { calculateChildCredit } from './childCredits'
import {
  calculateAdultCredit,
  calculateCurrentLaw,
  calculateReformWageTax,
} from './household'
import type { FilingStatus, HouseholdInput, ReformSettings, TaxBreakdown } from './types'

type LaborCell = [
  primaryCashWage: number,
  secondaryCashWage: number,
  scheduleAdults: number,
  creditAdults: number,
  childrenUnder18: number,
  childrenUnder6: number,
  taxUnitWeight: number,
]

interface CurrentPoint {
  totalCashWage: number
  employerCompensation: number
  employerHealthInsurance: number
  employerPensionOtherInsurance: number
  incomeTaxBeforeCredits: number
  currentCredits: number
  employeePayrollTax: number
  employerPayrollTax: number
  totalFederalTax: number
}

interface EarnerPrepared {
  down: CurrentPoint
  up: CurrentPoint
  currentMarginalRate: number
  laborWeight: number
}

interface PreparedCell {
  primaryCashWage: number
  secondaryCashWage: number
  filingStatus: FilingStatus
  creditAdults: number
  children: number
  under6: number
  taxUnitWeight: number
  primary: EarnerPrepared | null
  secondary: EarnerPrepared | null
}

export interface LaborResponseResult {
  sourceTaxUnits: number
  compressedCells: number
  positiveEarnerObservations: number
  weightedCurrentMarginalRate: number
  weightedReformMarginalRate: number
  netWageLogChange: number
  primaryNetWageLogChange: number
  secondaryNetWageLogChange: number
  primaryLaborWeightShare: number
  boundedLaborWeightShare: number
}

const snapshot = snapshotJson as unknown as {
  sample: { taxUnits: number }
  distribution: LaborCell[]
}

const HALF_WINDOW = 500
const cashScale = microdataJson.calibration.cashWageScaleToBea2025
const controls = microdataJson.compensationControlsBillions
const healthInsurancePerCashDollar =
  baseline.compensationComponents.employerHealthInsurance / controls.cashWagesAndSalaries
const pensionOtherInsurancePerCashDollar =
  baseline.compensationComponents.employerPensionAndOtherInsurance / controls.cashWagesAndSalaries
const payroll = currentLawJson.payroll
let preparedCache: PreparedCell[] | null = null

function clampShare(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function currentCredits(current: TaxBreakdown): number {
  return current.nonrefundableCtc + current.refundableCtc + current.eitc
}

function currentPoint(
  primaryCashWage: number,
  secondaryCashWage: number,
  filingStatus: FilingStatus,
  children: number,
  fixedEmployerHealthInsurance: number,
): CurrentPoint {
  const input: HouseholdInput = {
    filingStatus,
    children,
    cashWage: Math.max(0, primaryCashWage),
    secondaryCashWage: filingStatus === 'married' ? Math.max(0, secondaryCashWage) : 0,
  }
  const current = calculateCurrentLaw(input)
  const totalCashWage = input.cashWage + (input.secondaryCashWage ?? 0)
  const employerPensionOtherInsurance = totalCashWage * pensionOtherInsurancePerCashDollar
  return {
    totalCashWage,
    // Health insurance is treated as fixed for a local earnings change. Pension
    // compensation and statutory employer payroll taxes move with earnings.
    employerCompensation:
      totalCashWage + current.employerPayrollTax
      + employerPensionOtherInsurance + fixedEmployerHealthInsurance,
    employerHealthInsurance: fixedEmployerHealthInsurance,
    employerPensionOtherInsurance,
    incomeTaxBeforeCredits: current.incomeTaxBeforeCredits,
    currentCredits: currentCredits(current),
    employeePayrollTax: current.employeePayrollTax,
    employerPayrollTax: current.employerPayrollTax,
    totalFederalTax: current.totalFederalTax,
  }
}

function employerPayrollTaxForEarner(cashWage: number): number {
  if (cashWage <= 0) return 0
  return Math.min(cashWage, payroll.socialSecurityWageCap) * payroll.socialSecurityRateEach
    + cashWage * payroll.medicareRateEach
}

function marginalEmployerCompensationForEarner(cashWage: number): number {
  if (cashWage <= 0) return 0
  return cashWage
    + employerPayrollTaxForEarner(cashWage)
    + cashWage * pensionOtherInsurancePerCashDollar
}

function prepareEarner(
  primaryCashWage: number,
  secondaryCashWage: number,
  filingStatus: FilingStatus,
  children: number,
  varySecondary: boolean,
  taxUnitWeight: number,
  fixedEmployerHealthInsurance: number,
): EarnerPrepared | null {
  const earnerWage = varySecondary ? secondaryCashWage : primaryCashWage
  if (earnerWage <= 0) return null
  const downPrimary = varySecondary ? primaryCashWage : Math.max(0, primaryCashWage - HALF_WINDOW)
  const upPrimary = varySecondary ? primaryCashWage : primaryCashWage + HALF_WINDOW
  const downSecondary = varySecondary ? Math.max(0, secondaryCashWage - HALF_WINDOW) : secondaryCashWage
  const upSecondary = varySecondary ? secondaryCashWage + HALF_WINDOW : secondaryCashWage
  const down = currentPoint(
    downPrimary, downSecondary, filingStatus, children, fixedEmployerHealthInsurance,
  )
  const up = currentPoint(
    upPrimary, upSecondary, filingStatus, children, fixedEmployerHealthInsurance,
  )
  const deltaCompensation = up.employerCompensation - down.employerCompensation
  if (deltaCompensation <= 0) return null
  return {
    down,
    up,
    currentMarginalRate: (up.totalFederalTax - down.totalFederalTax) / deltaCompensation,
    laborWeight: taxUnitWeight * marginalEmployerCompensationForEarner(earnerWage),
  }
}

function preparedCells(): PreparedCell[] {
  if (preparedCache) return preparedCache
  preparedCache = snapshot.distribution.map((row) => {
    const [rawPrimaryCashWage, rawSecondaryCashWage, scheduleAdults, creditAdults,
      children, under6, taxUnitWeight] = row
    const primaryCashWage = rawPrimaryCashWage * cashScale
    const secondaryCashWage = rawSecondaryCashWage * cashScale
    const filingStatus: FilingStatus = scheduleAdults >= 2 ? 'married' : 'single'
    // Allocate the observed ESI level from the central tax-unit wage, but hold
    // that dollar amount fixed across the +/- $500 marginal-wage perturbation.
    const fixedEmployerHealthInsurance =
      (primaryCashWage + secondaryCashWage) * healthInsurancePerCashDollar
    return {
      primaryCashWage,
      secondaryCashWage,
      filingStatus,
      creditAdults,
      children,
      under6,
      taxUnitWeight,
      primary: prepareEarner(
        primaryCashWage, secondaryCashWage, filingStatus, children, false, taxUnitWeight,
        fixedEmployerHealthInsurance,
      ),
      secondary: filingStatus === 'married'
        ? prepareEarner(
          primaryCashWage, secondaryCashWage, filingStatus, children, true, taxUnitWeight,
          fixedEmployerHealthInsurance,
        )
        : null,
    }
  })
  return preparedCache
}

function reformTax(
  point: CurrentPoint,
  cell: PreparedCell,
  settings: ReformSettings,
  employerFicaPassThroughRate: number,
): number {
  const payrollIsReplaced = settings.replacedTaxes.payroll
  const individualIncomeIsReplaced = settings.replacedTaxes.individualIncome
  const employerFicaPassThrough = payrollIsReplaced
    ? point.employerPayrollTax * clampShare(employerFicaPassThroughRate)
    : 0
  const grossReformCompensation =
    point.totalCashWage + employerFicaPassThrough
    + point.employerHealthInsurance + point.employerPensionOtherInsurance
  const taxableWageBase = (
    point.totalCashWage * (1 - clampShare(settings.cashWageExemptionShare))
    + employerFicaPassThrough
      * (1 - clampShare(settings.employerSocialInsuranceExemptionShare))
    + point.employerHealthInsurance
      * (1 - clampShare(settings.employerHealthInsuranceExemptionShare))
    + point.employerPensionOtherInsurance
      * (1 - clampShare(settings.employerPensionOtherInsuranceExemptionShare))
  ) * (1 - clampShare(settings.exemptionShare))
  const adultCreditBase = settings.adultCreditEarningsBase === 'cash'
    ? point.totalCashWage + employerFicaPassThrough
    : grossReformCompensation
  const reformCredits =
    calculateAdultCredit(adultCreditBase, cell.creditAdults, settings)
    + calculateChildCredit(grossReformCompensation, cell.children, cell.under6, settings)
  const retainedTaxBeforeCredits =
    (individualIncomeIsReplaced ? 0 : point.incomeTaxBeforeCredits)
    + (payrollIsReplaced ? 0 : point.employeePayrollTax + point.employerPayrollTax)
  const retainedCredits = individualIncomeIsReplaced ? 0 : point.currentCredits
  return calculateReformWageTax(taxableWageBase, cell.filingStatus, settings)
    + retainedTaxBeforeCredits - reformCredits - retainedCredits
}

function safeNetOfTaxRate(marginalRate: number): { value: number, bounded: boolean } {
  const raw = 1 - marginalRate
  if (raw <= 0.01) return { value: 0.01, bounded: true }
  if (raw >= 2) return { value: 2, bounded: true }
  return { value: raw, bounded: false }
}

interface Accumulator {
  weight: number
  currentMtr: number
  reformMtr: number
  logChange: number
  boundedWeight: number
  observations: number
}

function emptyAccumulator(): Accumulator {
  return { weight: 0, currentMtr: 0, reformMtr: 0, logChange: 0, boundedWeight: 0, observations: 0 }
}

function addEarner(
  accumulator: Accumulator,
  cell: PreparedCell,
  earner: EarnerPrepared | null,
  settings: ReformSettings,
  employerFicaPassThroughRate: number,
): void {
  if (!earner || earner.laborWeight <= 0) return
  const deltaCompensation = earner.up.employerCompensation - earner.down.employerCompensation
  if (deltaCompensation <= 0) return
  const reformMarginalRate =
    (reformTax(earner.up, cell, settings, employerFicaPassThroughRate)
      - reformTax(earner.down, cell, settings, employerFicaPassThroughRate))
    / deltaCompensation
  const currentNet = safeNetOfTaxRate(earner.currentMarginalRate)
  const reformNet = safeNetOfTaxRate(reformMarginalRate)
  const weight = earner.laborWeight
  accumulator.weight += weight
  accumulator.currentMtr += weight * earner.currentMarginalRate
  accumulator.reformMtr += weight * reformMarginalRate
  accumulator.logChange += weight * Math.log(reformNet.value / currentNet.value)
  if (currentNet.bounded || reformNet.bounded) accumulator.boundedWeight += weight
  accumulator.observations += 1
}

function average(value: number, weight: number): number {
  return weight > 0 ? value / weight : 0
}

/**
 * CPS-weighted change in the marginal return to work under the selected reform.
 *
 * CPS cash wages are first scaled to the same 2025 BEA wage control used by the
 * macro scorer. Local labor-cost changes include statutory employer FICA and
 * earnings-linked pension/other-retirement compensation. Employer health
 * insurance is allocated at the central tax-unit wage but held fixed across the
 * local wage perturbation, reflecting its largely per-employee rather than
 * per-dollar structure. Repealed employer FICA pass-through uses the actual
 * statutory employer payroll tax, including the Social Security wage cap.
 * Current-law finite differences are prepared once and cached. Reform-side
 * marginal wedges are then cheap arithmetic over the compressed tax-unit cells.
 * Health credits are flat amounts with no income phaseout, so they do not change
 * the local marginal wage wedge and are intentionally absent here.
 */
export function calculateLaborResponse(
  settings: ReformSettings,
  employerFicaPassThroughRate = 1,
): LaborResponseResult {
  const all = emptyAccumulator()
  const primary = emptyAccumulator()
  const secondary = emptyAccumulator()
  for (const cell of preparedCells()) {
    addEarner(all, cell, cell.primary, settings, employerFicaPassThroughRate)
    addEarner(primary, cell, cell.primary, settings, employerFicaPassThroughRate)
    addEarner(all, cell, cell.secondary, settings, employerFicaPassThroughRate)
    addEarner(secondary, cell, cell.secondary, settings, employerFicaPassThroughRate)
  }
  return {
    sourceTaxUnits: snapshot.sample.taxUnits,
    compressedCells: snapshot.distribution.length,
    positiveEarnerObservations: all.observations,
    weightedCurrentMarginalRate: average(all.currentMtr, all.weight),
    weightedReformMarginalRate: average(all.reformMtr, all.weight),
    netWageLogChange: average(all.logChange, all.weight),
    primaryNetWageLogChange: average(primary.logChange, primary.weight),
    secondaryNetWageLogChange: average(secondary.logChange, secondary.weight),
    primaryLaborWeightShare: all.weight > 0 ? primary.weight / all.weight : 0,
    boundedLaborWeightShare: all.weight > 0 ? all.boundedWeight / all.weight : 0,
  }
}
