import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../src/model/defaults'
import {
  accountAnnualAnnuityAtRetirement,
  defaultPersonalAccountsPolicy,
  payrollDiversionShare,
  projectPersonalAccounts,
  redirectedPayrollBillions,
} from '../src/model/personalAccounts'
import { personalAccountSensitivityGrid } from '../src/model/personalAccountsSensitivity'

const a={...defaultAssumptions,endYear:2095}

describe('scheduled-benefit personal accounts',()=>{
  it('phases in tax diversion exactly once',()=>{
    const p=defaultPersonalAccountsPolicy
    expect(payrollDiversionShare(2025,p)).toBe(0)
    expect(payrollDiversionShare(2026,p)).toBeCloseTo(.1)
    expect(payrollDiversionShare(2035,p)).toBeCloseTo(1)
    const annual=redirectedPayrollBillions(2026,a,p)
    expect(annual/a.startingNominalGDPBillions).toBeCloseTo(.35*.124*.1)
  })
  it('does not give legacy retirees retroactive capital',()=>{
    const row=projectPersonalAccounts(a,defaultPersonalAccountsPolicy,2026)[0]!
    expect(row.governmentTopupBillions).toBeCloseTo(row.scheduledOASIBillions,5)
    expect(row.privateTowardPromiseBillions).toBe(0)
    expect(row.fiscalSavingsBillions).toBeCloseTo(-row.redirectedBillions,5)
  })
  it('the scheduled floor is preserved and group allocations reconcile',()=>{
    const row=projectPersonalAccounts(a,defaultPersonalAccountsPolicy,2070).at(-1)!
    expect(row.governmentTopupBillions+row.privateTowardPromiseBillions)
      .toBeCloseTo(row.scheduledOASIBillions,5)
    expect(row.groups.reduce((n,g)=>n+g.scheduledBillions,0))
      .toBeCloseTo(row.scheduledOASIBillions,5)
    expect(row.fiscalSavingsBillions).toBeCloseTo(row.scheduledOASIBillions-
      row.redirectedBillions-row.governmentTopupBillions-row.lostBenefitTaxesBillions,5)
    expect(row.groups.every(g=>g.governmentTopupBillions>=0)).toBe(true)
  })
  it('zero redirection exactly restores scheduled public cost',()=>{
    const p={...defaultPersonalAccountsPolicy,redirectShare:0}
    expect(accountAnnualAnnuityAtRetirement(2060,1,a,p)).toBe(0)
    const row=projectPersonalAccounts(a,p,2070).at(-1)!
    expect(row.federalCostBillions).toBeCloseTo(row.scheduledOASIBillions,5)
    expect(row.fiscalSavingsBillions).toBeCloseTo(0,5)
  })
  it('better asset accumulation reduces topups without changing redirection',()=>{
    const lo=projectPersonalAccounts(a,{...defaultPersonalAccountsPolicy,annualRealReturn:.01},2070).at(-1)!
    const hi=projectPersonalAccounts(a,{...defaultPersonalAccountsPolicy,annualRealReturn:.06},2070).at(-1)!
    expect(hi.governmentTopupBillions).toBeLessThanOrEqual(lo.governmentTopupBillions)
    expect(hi.redirectedBillions).toBeCloseTo(lo.redirectedBillions)
  })
  it('a negative real-return shock is reflected in retirement assets',()=>{
    const base=accountAnnualAnnuityAtRetirement(2055,1,a,defaultPersonalAccountsPolicy)
    const shocked=accountAnnualAnnuityAtRetirement(2055,1,a,{
      ...defaultPersonalAccountsPolicy,realReturnByYear:{2054:-.35},
    })
    expect(shocked).toBeLessThan(base)
  })
  it('the external grid reports the requested transitions and sensitivities',()=>{
    const grid=personalAccountSensitivityGrid(a,{realReturns:[.01,.04],ramps:[1,10],
      payrollRates:[.062,.124],years:[2050]})
    expect(grid).toHaveLength(8)
    expect(grid.every(r=>r.year===2050&&r.federalCostGDP>=r.topupGDP)).toBe(true)
  })
})
