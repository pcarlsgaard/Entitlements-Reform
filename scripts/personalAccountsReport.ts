/** Run with: npx vite-node scripts/personalAccountsReport.ts */
import { defaultAssumptions } from '../src/model/defaults'
import { personalAccountSensitivityGrid } from '../src/model/personalAccountsSensitivity'
import { defaultPersonalAccountsPolicy, projectPersonalAccounts } from '../src/model/personalAccounts'

const assumptions={...defaultAssumptions,endYear:2095}
const years=[2026,2035,2050,2075,2095]
const baseline=projectPersonalAccounts(assumptions,defaultPersonalAccountsPolicy,2095)

console.log('PERSONAL ACCOUNTS: 12.4% OASDI diversion, 10-year ramp, 4% gross real accumulation')
console.log('All figures below in percent of GDP; private annuities are not federal spending.')
console.table(years.map(year=>{
  const x=baseline.find(r=>r.year===year)!
  const g=x.nominalGDPBillions/100
  return {year,scheduled_OASI:(x.scheduledOASIBillions/g).toFixed(2),
    payroll_redirect:(x.redirectedBillions/g).toFixed(2),
    public_topup:(x.governmentTopupBillions/g).toFixed(2),
    lost_benefit_tax:(x.lostBenefitTaxesBillions/g).toFixed(2),
    fiscal_savings:(x.fiscalSavingsBillions/g).toFixed(2)}
}))
console.log('Income group public top-ups for retirees (percent of GDP):')
for(const year of [2050,2095]){
  const x=baseline.find(r=>r.year===year)!
  console.table(x.groups.map(group=>({year,group:group.name,
    scheduled:(100*group.scheduledBillions/x.nominalGDPBillions).toFixed(2),
    government_topup:(100*group.governmentTopupBillions/x.nominalGDPBillions).toFixed(2)})))
}
const matrix=personalAccountSensitivityGrid(assumptions,{
  realReturns:[.01,.025,.04,.055],ramps:[1,5,10,20],
  payrollRates:[.062,.106,.124],years:[2050,2075,2095],
})
console.log('Sensitivity matrix; percent of GDP:')
console.table(matrix.map(r=>({year:r.year,
  real_return:(100*r.realReturn).toFixed(1),
  ramp_years:r.rampYears,
  payroll_rate:(100*r.payrollRate).toFixed(1),
  topup:(100*r.topupGDP).toFixed(2),
  redirect:(100*r.redirectedGDP).toFixed(2),
  fiscal_savings:(100*r.fiscalSavingsGDP).toFixed(2)})))
