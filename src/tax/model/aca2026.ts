/**
 * 2026 ACA benchmark premium-tax-credit approximation.
 *
 * Uses calendar 2025 HHS FPL thresholds for plan-year 2026 in the 48
 * contiguous states and D.C. Only household MAGI, family size and benchmark
 * premium are supplied: exchange enrollment, citizenship, Medicaid/CHIP,
 * affordable ESI offers, married filing rules and full ACA MAGI adjustments
 * must be tested by a real eligibility engine before this is used as a
 * person-level entitlement determination.
 *
 * 2026 IRS Rev. Proc. 2025-25: https://www.irs.gov/irb/2025-32_IRB
 * https://www.irs.gov/affordable-care-act/individuals-and-families/questions-and-answers-on-the-premium-tax-credit
 */
export function povertyGuideline2025Contiguous(familySize: number): number {
  return 15_650 + 5_500 * Math.max(0, Math.floor(familySize) - 1)
}
/** Returns null outside the statutory 100–400% FPL income window. */
export function acaApplicableRate2026(income: number, familySize: number): number | null {
  if (!Number.isFinite(income) || !Number.isFinite(familySize) || familySize < 1) return null
  const fplRatio = 100 * Math.max(0, income) / povertyGuideline2025Contiguous(familySize)
  if(fplRatio < 100 || fplRatio > 400) return null
  if(fplRatio < 133) return .021
  if(fplRatio < 150) return .0314+(.0419-.0314)*(fplRatio-133)/17
  if(fplRatio < 200) return .0419+(.066-.0419)*(fplRatio-150)/50
  if(fplRatio < 250) return .066+(.0844-.066)*(fplRatio-200)/50
  if(fplRatio < 300) return .0844+(.0996-.0844)*(fplRatio-250)/50
  return .0996
}
export function acaPremiumTaxCredit2026(income:number,familySize:number,benchmark:number):number{
  const rate=acaApplicableRate2026(income,familySize)
  return rate===null?0:Math.min(Math.max(0,benchmark),
    Math.max(0,Math.max(0,benchmark)-Math.max(0,income)*rate))
}
/** Never pay both full ACA and universal credits against the same policy. */
export function greaterOfAcaUniversal(
  acaCredit: number, universalCredit: number, benchmark: number,
): {allowed:number,topUpOverUniversal:number} {
  const premium=Math.max(0,benchmark)
  const flat=Math.min(premium,Math.max(0,universalCredit))
  const aca=Math.min(premium,Math.max(0,acaCredit))
  const allowed=Math.max(flat,aca)
  return {allowed,topUpOverUniversal:allowed-flat}
}

/**
 * Counterfactual: extend the enhanced 2024 ACA premium-tax-credit schedule
 * (ARPA/IRA) into 2026 and beyond while continuing to use the 2025 poverty
 * guidelines applicable to 2026 plans. The ARPA enhancements eliminate the
 * 400%-of-FPL eligibility cap and set the benchmark contribution to zero
 * for otherwise eligible households with 100-150% FPL income.
 * IRS Rev. Proc. 2023-29, 2023-37 IRB, section 2.01.
 */
export function acaApplicableRateRestored2024(income:number,familySize:number):number|null{
  if(!Number.isFinite(income)||!Number.isFinite(familySize)||familySize<1)return null
  const ratio=100*Math.max(0,income)/povertyGuideline2025Contiguous(familySize)
  if(ratio<100)return null
  if(ratio<150)return 0
  if(ratio<200)return .02*(ratio-150)/50
  if(ratio<250)return .02+.02*(ratio-200)/50
  if(ratio<300)return .04+.02*(ratio-250)/50
  if(ratio<400)return .06+.025*(ratio-300)/100
  return .085
}
export function acaPremiumTaxCreditRestored2024(
  income:number,familySize:number,benchmark:number
):number{
  const rate=acaApplicableRateRestored2024(income,familySize)
  return rate===null?0:Math.min(Math.max(0,benchmark),
    Math.max(0,Math.max(0,benchmark)-Math.max(0,income)*rate))
}
