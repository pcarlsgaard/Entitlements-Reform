import { describe, expect, it } from 'vitest'
import {
  cboCalibrationNominalGDPBillions,
  cboCalibrationOtherOASDIGDP,
  cboCalibrationUnder65MedicareGDP,
  cboDefenseDiscretionaryGDP,
  cboDiscretionaryGDP,
  cboMedicaidChipMarketplaceGDP,
  cboMedicareNetGDP,
  cboNondefenseDiscretionaryGDP,
  cboOtherMandatoryGDP,
  cboPrimarySpendingGDP,
  cboSocialSecurityGDP,
} from '../src/data/cboBaseline'
import { defaultAssumptions } from '../src/model/defaults'
import { medicareForYear } from '../src/model/medicare'
import { socialSecurityForYear } from '../src/model/socialSecurity'
import { simulateCurrentLawConstantRevenue } from '../src/model/simulate'

describe('CBO February 2026 baseline calibration', () => {
  it('loads the published 2026 category shares without a residual bucket', () => {
    expect(cboSocialSecurityGDP(2026)).toBeCloseTo(0.05222, 10)
    expect(cboMedicareNetGDP(2026)).toBeCloseTo(0.03332, 10)
    expect(cboMedicaidChipMarketplaceGDP(2026)).toBeCloseTo(0.0264997, 10)
    expect(cboOtherMandatoryGDP(2026)).toBeCloseTo(0.02994, 10)
    expect(cboDefenseDiscretionaryGDP(2026)).toBeCloseTo(0.02773, 10)
    expect(cboNondefenseDiscretionaryGDP(2026)).toBeCloseTo(0.03121, 10)
    expect(cboDiscretionaryGDP(2026)).toBeCloseTo(0.05894, 10)
    expect(cboPrimarySpendingGDP(2026)).toBeCloseTo(0.2009197, 10)
  })

  it('keeps Social Security components separate while matching CBO total Social Security', () => {
    const row = simulateCurrentLawConstantRevenue(
      defaultAssumptions,
      'scheduled',
      0.22,
    ).years[0]!
    const socialSecuritySubtotal =
      row.legacySocialSecurity +
      row.flatSocialSecurityPaygo +
      row.otherOASDI

    expect(row.flatSocialSecurityPaygo).toBe(0)
    expect(row.legacySocialSecurity / row.nominalGDP).toBeCloseTo(0.04222, 10)
    expect(row.otherOASDI / row.nominalGDP).toBeCloseTo(0.01, 10)
    expect(socialSecuritySubtotal / row.nominalGDP).toBeCloseTo(
      cboSocialSecurityGDP(2026),
      10,
    )
  })

  it('matches the CBO Medicare subtotal and every broader-budget component', () => {
    const row = simulateCurrentLawConstantRevenue(
      defaultAssumptions,
      'scheduled',
      0.22,
    ).years[0]!
    const medicareSubtotal =
      row.legacySeniorMedicare +
      row.premiumSupportPaygo +
      row.under65Medicare

    expect(medicareSubtotal / row.nominalGDP).toBeCloseTo(
      cboMedicareNetGDP(2026),
      10,
    )
    expect(row.medicaidChipMarketplace / row.nominalGDP).toBeCloseTo(
      cboMedicaidChipMarketplaceGDP(2026),
      10,
    )
    expect(row.otherMandatory / row.nominalGDP).toBeCloseTo(
      cboOtherMandatoryGDP(2026),
      10,
    )
    expect(row.defenseDiscretionary / row.nominalGDP).toBeCloseTo(
      cboDefenseDiscretionaryGDP(2026),
      10,
    )
    expect(row.nonDefenseDiscretionary / row.nominalGDP).toBeCloseTo(
      cboNondefenseDiscretionaryGDP(2026),
      10,
    )
    expect(row.totalPrimarySpending / row.nominalGDP).toBeCloseTo(
      cboPrimarySpendingGDP(2026),
      10,
    )
  })

  it('matches the published 2036 entitlement path under current law', () => {
    const row = simulateCurrentLawConstantRevenue(
      defaultAssumptions,
      'scheduled',
      0.22,
    ).years.find((item) => item.year === 2036)!
    const socialSecuritySubtotal =
      row.legacySocialSecurity +
      row.flatSocialSecurityPaygo +
      row.otherOASDI
    const medicareSubtotal =
      row.legacySeniorMedicare +
      row.premiumSupportPaygo +
      row.under65Medicare

    expect(socialSecuritySubtotal / row.nominalGDP).toBeCloseTo(
      cboSocialSecurityGDP(2036),
      10,
    )
    expect(medicareSubtotal / row.nominalGDP).toBeCloseTo(
      cboMedicareNetGDP(2036),
      10,
    )
  })

  it('ends CBO calibration in 2056 and follows explicit per-person growth afterward', () => {
    const ss56 = socialSecurityForYear(2056, defaultAssumptions, 'currentLaw')
    const ss57 = socialSecurityForYear(2057, defaultAssumptions, 'currentLaw')
    const med56 = medicareForYear(2056, defaultAssumptions, undefined, 'currentLaw')
    const med57 = medicareForYear(2057, defaultAssumptions, undefined, 'currentLaw')
    expect(ss56.legacyBillions).toBeCloseTo(
      (cboSocialSecurityGDP(2056) - cboCalibrationOtherOASDIGDP) * cboCalibrationNominalGDPBillions(2056), 6)
    expect(med56.legacyBillions).toBeCloseTo(
      (cboMedicareNetGDP(2056) - cboCalibrationUnder65MedicareGDP) * cboCalibrationNominalGDPBillions(2056), 6)
    const average = (result: typeof ss56 | typeof med56) => result.legacyBillions * 1000 /
      result.cohorts.reduce((sum, cohort) => sum + cohort.survivingBeneficiariesMillions, 0)
    // Fixed calibration after 2056; individual existing awards receive COLAs,
    // while real growth applies to the starting award of each new cohort.
    const cohort56 = ss56.cohorts.find(c => c.retirementYear === 2056)!
    const same57 = ss57.cohorts.find(c => c.retirementYear === 2056)!
    const entrant57 = ss57.cohorts.find(c => c.retirementYear === 2057)!
    expect(same57.legacyBenefitPerPerson / cohort56.legacyBenefitPerPerson).toBeCloseTo(1.02, 10)
    expect(entrant57.legacyBenefitPerPerson / cohort56.legacyBenefitPerPerson).toBeCloseTo(1.005 * 1.02, 10)
    expect(average(med57) / average(med56)).toBeCloseTo(
      (1 + defaultAssumptions.legacyMedicareRealGrowth) * (1 + defaultAssumptions.inflation), 8)
  })
})
