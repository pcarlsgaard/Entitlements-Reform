import cboOfficial from '../src/data/cboOfficial.json'
import { describe, expect, it } from 'vitest'
import {
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
import {
  cmsMedicareEnrollmentMillions,
  cmsMedicareGrossGDP,
  ssaOasdiCostGDP,
  ssaRetiredWorkerMillions,
} from '../src/data/trustees2026'
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

  it('keeps official CBO projections separate from the custom entitlement forecast', () => {
    expect(cboOfficial.rows.find(r => r.year === 2036)!.lt_mand_social_security_gdp_share / 100).toBeCloseTo(cboSocialSecurityGDP(2036), 10)
    expect(cboOfficial.rows.find(r => r.year === 2056)!.lt_debt_held_by_public_gdp_share).toBeGreaterThan(100)
    expect(Math.max(...cboOfficial.rows.map(r => r.year))).toBe(2056)
  })

  it('matches CBO entitlement shares through 2056 and uses Trustees-shaped extensions afterward', () => {
    const sim = simulateCurrentLawConstantRevenue(defaultAssumptions, 'scheduled', 0.22)
    const row = (year: number) => sim.years.find(item => item.year === year)!
    for (const year of [2026, 2035, 2056]) {
      const r = row(year)
      expect((r.legacySocialSecurity + r.otherOASDI) / r.nominalGDP).toBeCloseTo(cboSocialSecurityGDP(year), 9)
      expect((r.legacySeniorMedicare + r.under65Medicare) / r.nominalGDP).toBeCloseTo(cboMedicareNetGDP(year), 9)
    }
    const ss2095 = cboSocialSecurityGDP(2056) * ssaOasdiCostGDP(2095) / ssaOasdiCostGDP(2056)
    const med2095 = cboMedicareNetGDP(2056) * cmsMedicareGrossGDP(2095) / cmsMedicareGrossGDP(2056)
    expect((row(2095).legacySocialSecurity + row(2095).otherOASDI) / row(2095).nominalGDP).toBeCloseTo(ss2095, 9)
    expect((row(2095).legacySeniorMedicare + row(2095).under65Medicare) / row(2095).nominalGDP).toBeCloseTo(med2095, 9)
  })

  it('keeps modeled beneficiary growth close to the Trustees reference series', () => {
    for (const year of [2026, 2035, 2056, 2095]) {
      const ss = socialSecurityForYear(year, defaultAssumptions, 'currentLaw')
      const modeled = ss.cohorts.reduce((sum, cohort) => sum + cohort.survivingBeneficiariesMillions, 0)
      expect(modeled / ssaRetiredWorkerMillions(year)).toBeGreaterThan(0.98)
      expect(modeled / ssaRetiredWorkerMillions(year)).toBeLessThan(1.02)
    }

    const base = medicareForYear(2026, defaultAssumptions, undefined, 'currentLaw')
      .cohorts.reduce((sum, cohort) => sum + cohort.survivingBeneficiariesMillions, 0)
    for (const year of [2035, 2055, 2095]) {
      const med = medicareForYear(year, defaultAssumptions, undefined, 'currentLaw')
      const modeledIndex = med.cohorts.reduce((sum, cohort) => sum + cohort.survivingBeneficiariesMillions, 0) / base
      const trusteesIndex = cmsMedicareEnrollmentMillions(year) / cmsMedicareEnrollmentMillions(2026)
      expect(modeledIndex).toBeCloseTo(trusteesIndex, 8)
    }
  })

  it('keeps individual legacy award indexing explicit beneath the aggregate calibration', () => {
    const ss56 = socialSecurityForYear(2056, defaultAssumptions, 'currentLaw')
    const ss57 = socialSecurityForYear(2057, defaultAssumptions, 'currentLaw')
    const cohort56 = ss56.cohorts.find(c => c.retirementYear === 2056)!
    const same57 = ss57.cohorts.find(c => c.retirementYear === 2056)!
    const entrant57 = ss57.cohorts.find(c => c.retirementYear === 2057)!
    expect(same57.legacyBenefitPerPerson / cohort56.legacyBenefitPerPerson).toBeCloseTo(1.02, 10)
    expect(entrant57.legacyBenefitPerPerson / cohort56.legacyBenefitPerPerson).toBeCloseTo(
      (1 + defaultAssumptions.currentLawSSBenefitRealGrowth) * (1 + defaultAssumptions.inflation), 10)
  })
})
