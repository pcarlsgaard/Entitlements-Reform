import cbo from '../data/cboOfficial.json'
import type { ReformSettings } from '../tax/model/types'

function row(year: number) {
  return cbo.rows.find(r => r.year === Math.max(2026, Math.min(2056, year)))!
}
/** Published receipt shares through 2056; explicit constant-share extension afterward. */
export function currentLawRevenueGDP(year: number): number {
  return row(year).lt_rev_total_gdp_share / 100
}
export function replacedRevenueGDP(year: number, tax: ReformSettings): number {
  const r = row(year), t = tax.replacedTaxes
  return ((t.individualIncome ? r.lt_rev_individual_income_gdp_share : 0) +
    (t.corporateIncome ? r.lt_rev_corporate_income_gdp_share : 0) +
    (t.payroll ? r.lt_rev_payroll_gdp_share : 0) +
    (t.customs ? r.lt_rev_customs_gdp_share : 0)) / 100
}
/** Preserve the imported model's opening bridge, but remove subsequent changes in
 * replaced receipts. Otherwise CBO current-law bracket creep would be collected
 * even after the tax generating it had been repealed. */
export function replacedRevenueDriftGDP(year: number, tax: ReformSettings): number {
  return replacedRevenueGDP(year, tax) - replacedRevenueGDP(2026, tax)
}
