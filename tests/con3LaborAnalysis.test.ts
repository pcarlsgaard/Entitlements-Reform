import { describe, it, expect } from 'vitest'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import type { ReformSettings } from '../src/tax/model/types'

const tax: ReformSettings = {
  rate: 0.35,
  wageTaxMode: 'progressive',
  progressiveZeroBracketPerAdult: 0,
  progressiveTopBracketPerAdult: 150000,
  progressiveMiddleRate: 0.25,
  progressiveIntermediateStartPerAdult: 75000,
  progressiveIntermediateRate: 0.30,
  adultCredit: 2000,
  adultCreditMode: 'earned',
  adultCreditPhaseInRate: 0.10,
  adultCreditPhaseOutStartPerAdult: 50000,
  adultCreditPhaseOutRate: 0,
  adultCreditTakeUpRate: 1,
  childCredit: 6000,
  noncomplianceRate: 0.075,
  exemptionShare: 0,
  cashWageExemptionShare: 0,
  employerSocialInsuranceExemptionShare: 0,
  employerHealthInsuranceExemptionShare: 0,
  employerPensionOtherInsuranceExemptionShare: 0,
  replacedTaxes: { individualIncome: true, payroll: true, corporateIncome: true, customs: true },
  adultCreditEarningsBase: 'compensation',
  under6ChildCredit: 6000,
  childCreditBaselineRefundableShare: 0.5,
  childCreditPhaseInRate: 0.25,
}

describe('uploaded Con_3_paygo labor response', () => {
  it('prints CPS weighted labor diagnostics', () => {
    const r = calculateLaborResponse(tax, 1)
    const laborElasticity = 0.02
    const laborShareGDP = 0.60
    const impliedLaborHours = r.netWageLogChange * laborElasticity
    const impliedGDP = impliedLaborHours * laborShareGDP
    console.log('CON3_LABOR=' + JSON.stringify({...r, impliedLaborHours, impliedGDP}))
    expect(Number.isFinite(impliedGDP)).toBe(true)
  })
})
