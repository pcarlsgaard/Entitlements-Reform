import { defaultPersonalAccountsPolicy, projectPersonalAccounts } from './personalAccounts'
import type { ModelAssumptions } from './types'
import type { PersonalAccountsYear } from './personalAccounts'

/** Research sweep for 1-, 5-, 10- and 20-year ramps, real returns, contribution rates and selected years. */
export interface PersonalAccountSensitivityRow {
  realReturn: number
  rampYears: number
  payrollRate: number
  year: number
  scheduledGDP: number
  redirectedGDP: number
  topupGDP: number
  taxLossGDP: number
  federalCostGDP: number
  fiscalSavingsGDP: number
  incomeGroups: PersonalAccountsYear['groups']
}

export function personalAccountSensitivityGrid(
  assumptions: ModelAssumptions,
  options: {
    realReturns?: readonly number[]
    ramps?: readonly number[]
    payrollRates?: readonly number[]
    years?: readonly number[]
  } = {},
): PersonalAccountSensitivityRow[] {
  const returns=options.realReturns??[.01,.025,.04,.055]
  const ramps=options.ramps??[1,5,10,20]
  const rates=options.payrollRates??[.062,.106,.124]
  const years=(options.years??[2035,2050,2075,2095])
    .filter(y=>y>=assumptions.reformYear&&y<=assumptions.endYear)
  if(years.length===0)return []
  const result:PersonalAccountSensitivityRow[]=[]
  for(const payrollRate of rates)
    for(const rampYears of ramps)
      for(const realReturn of returns){
        const policy={...defaultPersonalAccountsPolicy,payrollRate,rampYears,annualRealReturn:realReturn}
        const projection=projectPersonalAccounts(assumptions,policy,Math.max(...years))
        for(const year of years){
          const row=projection.find(r=>r.year===year)
          if(!row)continue
          const g=row.nominalGDPBillions
          result.push({realReturn,rampYears,payrollRate,year,
            scheduledGDP:row.scheduledOASIBillions/g,
            redirectedGDP:row.redirectedBillions/g,
            topupGDP:row.governmentTopupBillions/g,
            taxLossGDP:row.lostBenefitTaxesBillions/g,
            federalCostGDP:row.federalCostBillions/g,
            fiscalSavingsGDP:row.fiscalSavingsBillions/g,
            incomeGroups:row.groups})
        }
      }
  return result
}
