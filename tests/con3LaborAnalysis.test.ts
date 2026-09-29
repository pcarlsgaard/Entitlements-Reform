import { describe, it } from 'vitest'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import { defaultCombinedPolicy } from '../src/model/combined'

describe('uploaded Con_3_paygo labor response', () => {
  it('prints exact CPS-weighted labor diagnostics', () => {
    const tax = {
      ...defaultCombinedPolicy.tax,
      rate: 0.35,
      wageTaxMode: 'progressive' as const,
      progressiveZeroBracketPerAdult: 0,
      progressiveTopBracketPerAdult: 150000,
      progressiveMiddleRate: 0.25,
      progressiveIntermediateStartPerAdult: 75000,
      progressiveIntermediateRate: 0.30,
      adultCredit: 2000,
      adultCreditMode: 'earned' as const,
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
      replacedTaxes: {
        individualIncome: true,
        payroll: true,
        corporateIncome: true,
        customs: true,
      },
      adultCreditEarningsBase: 'compensation' as const,
      under6ChildCredit: 6000,
      childCreditBaselineRefundableShare: 0.5,
      childCreditPhaseInRate: 0.25,
    }
    const r = calculateLaborResponse(tax, 1)
    const laborElasticity = 0.02
    const laborShareGDP = 0.60
    const gdp = Math.max(-0.05, Math.min(0.05, r.netWageLogChange * laborElasticity * laborShareGDP))
    console.log('CON3_LABOR=' + JSON.stringify({...r, steadyLaborGDPLevelChange:gdp}))
  })
})
