import { primaryComponentSum } from './simulate'
import type { PrimaryComponents, SimulationYear } from './types'

export function primaryComponentsFromYear(
  row: SimulationYear,
): PrimaryComponents {
  return {
    legacySocialSecurity: row.legacySocialSecurity,
    flatSocialSecurityPaygo: row.flatSocialSecurityPaygo,
    otherOASDI: row.otherOASDI,
    legacySeniorMedicare: row.legacySeniorMedicare,
    premiumSupportPaygo: row.premiumSupportPaygo,
    under65Medicare: row.under65Medicare,
    newCohortPrefunding: row.newCohortPrefunding,
    otherPrimarySpending: row.otherPrimarySpending,
  }
}

export function reconciliationErrors(row: SimulationYear) {
  const componentSum = primaryComponentSum(primaryComponentsFromYear(row))
  return {
    primaryComponents:
      componentSum - row.totalPrimarySpending,
    totalSpending:
      row.totalPrimarySpending + row.netInterest - row.totalFederalSpending,
    primaryDeficit:
      row.totalPrimarySpending - row.revenue - row.primaryDeficit,
    overallDeficit:
      row.primaryDeficit + row.netInterest - row.overallDeficit,
    spendingLessRevenue:
      row.totalFederalSpending - row.revenue - row.overallDeficit,
    debtRollForward:
      row.beginningDebt + row.overallDeficit - row.endingDebt,
  }
}
