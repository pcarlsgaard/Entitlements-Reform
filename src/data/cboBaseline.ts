/**
 * CBO, The Budget and Economic Outlook: 2026 to 2036 and the February 2026
 * Long-Term Budget Projections. Values are fiscal-year shares of GDP.
 *
 * The published long-term file runs through 2056. The simulator holds the
 * final published share after 2056; those later years are explicitly shown as
 * an actuarial stress-test extension rather than a CBO forecast.
 */

export const cboBaselineStartYear = 2026
export const cboBaselineEndYear = 2056

export const cbo2026RevenueGDP = 0.17541
export const cbo2026PrimarySpendingGDP = 0.20092
export const cbo2026NetInterestGDP = 0.03257
export const cbo2026TotalSpendingGDP = 0.23348
export const cbo2026DebtHeldByPublicGDP = 1.00605
export const cbo2026NominalGDPBillions = 31_902
export const cboCalibrationOtherOASDIGDP = 0.01
export const cboCalibrationUnder65MedicareGDP = 0.006

export function cboCalibrationNominalGDPBillions(year: number): number {
  const nominalGrowth = (1 + 0.018) * (1 + 0.02) - 1
  return (
    cbo2026NominalGDPBillions *
    (1 + nominalGrowth) ** (year - cboBaselineStartYear)
  )
}

const socialSecurityPercent = [
  5.222, 5.31, 5.409, 5.494, 5.57, 5.642, 5.706, 5.763, 5.809,
  5.847, 5.88, 5.869, 5.878, 5.861, 5.805, 5.77, 5.798, 5.778,
  5.778, 5.772, 5.774, 5.789, 5.799, 5.808, 5.801, 5.84, 5.897,
  5.889, 5.945, 5.968, 5.991,
] as const

const medicareNetPercent = [
  3.332, 3.422, 3.47, 3.57, 3.627, 3.702, 3.789, 3.919, 4.037,
  4.128, 4.216, 4.298, 4.392, 4.484, 4.565, 4.652, 4.732, 4.805,
  4.873, 4.937, 5.001, 5.056, 5.112, 5.165, 5.212, 5.261, 5.303,
  5.341, 5.376, 5.415, 5.454,
] as const

const medicaidChipMarketplacePercent = [
  2.64997, 2.537, 2.485, 2.428, 2.411, 2.397, 2.406, 2.418, 2.426,
  2.436, 2.452, 2.459, 2.471, 2.484, 2.496, 2.508, 2.52, 2.532,
  2.542, 2.55, 2.558, 2.568, 2.575, 2.584, 2.592, 2.597, 2.605,
  2.611, 2.617, 2.625, 2.631,
] as const

const otherMandatoryPercent = [
  2.994, 3.088, 2.732, 2.905, 2.767, 2.642, 2.587, 2.536, 2.541,
  2.509, 2.497, 2.484, 2.473, 2.456, 2.443, 2.433, 2.42, 2.41,
  2.398, 2.388, 2.378, 2.367, 2.358, 2.347, 2.338, 2.329, 2.32,
  2.312, 2.302, 2.294, 2.285,
] as const

const discretionaryPercent = [
  5.894, 5.648, 5.548, 5.426, 5.319, 5.216, 5.123, 5.035, 4.9497,
  4.874, 4.804, 4.738, 4.689, 4.657, 4.641, 4.641, 4.641, 4.641,
  4.641, 4.641, 4.641, 4.641, 4.641, 4.641, 4.641, 4.641, 4.641,
  4.641, 4.641, 4.641, 4.641,
] as const

// CBO publishes the defense/nondefense split through 2036. Thereafter the
// simulator applies the 2036 split to CBO's published total discretionary path.
const defensePercentThrough2036 = [
  2.773, 2.705, 2.677, 2.606, 2.583, 2.539, 2.499, 2.475, 2.422,
  2.373, 2.355,
] as const
const nondefensePercentThrough2036 = [
  3.121, 2.943, 2.886, 2.805, 2.736, 2.677, 2.624, 2.576, 2.528,
  2.486, 2.449,
] as const

function publishedShare(
  valuesPercent: readonly number[],
  year: number,
): number {
  const boundedYear = Math.min(
    cboBaselineEndYear,
    Math.max(cboBaselineStartYear, year),
  )
  return valuesPercent[boundedYear - cboBaselineStartYear]! / 100
}

export const cboSocialSecurityGDP = (year: number) =>
  publishedShare(socialSecurityPercent, year)

export const cboMedicareNetGDP = (year: number) =>
  publishedShare(medicareNetPercent, year)

export const cboMedicaidChipMarketplaceGDP = (year: number) =>
  publishedShare(medicaidChipMarketplacePercent, year)

export const cboOtherMandatoryGDP = (year: number) =>
  publishedShare(otherMandatoryPercent, year)

export const cboDiscretionaryGDP = (year: number) =>
  publishedShare(discretionaryPercent, year)

const defenseShareOfDiscretionary2036 =
  defensePercentThrough2036.at(-1)! / discretionaryPercent[2036 - 2026]!

export function cboDefenseDiscretionaryGDP(year: number): number {
  if (year <= 2036) {
    const boundedYear = Math.max(cboBaselineStartYear, year)
    return defensePercentThrough2036[boundedYear - cboBaselineStartYear]! / 100
  }
  return cboDiscretionaryGDP(year) * defenseShareOfDiscretionary2036
}

export function cboNondefenseDiscretionaryGDP(year: number): number {
  if (year <= 2036) {
    const boundedYear = Math.max(cboBaselineStartYear, year)
    return nondefensePercentThrough2036[boundedYear - cboBaselineStartYear]! / 100
  }
  return cboDiscretionaryGDP(year) * (1 - defenseShareOfDiscretionary2036)
}

export function cboPrimarySpendingGDP(year: number): number {
  return (
    cboSocialSecurityGDP(year) +
    cboMedicareNetGDP(year) +
    cboMedicaidChipMarketplaceGDP(year) +
    cboOtherMandatoryGDP(year) +
    cboDiscretionaryGDP(year)
  )
}
