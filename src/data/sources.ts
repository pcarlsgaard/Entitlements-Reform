export type InputKind =
  | 'empirical input'
  | 'policy assumption'
  | 'modeling assumption'
  | 'derived output'

export interface SourceRecord {
  id: string
  kind: InputKind
  agency: string
  datasetOrReport: string
  publicationDate: string
  relevantTable: string
  url: string
  notes: string
}

export const sources: readonly SourceRecord[] = [
  {
    id: 'ssa-life-table-2023',
    kind: 'empirical input',
    agency: 'Social Security Administration',
    datasetOrReport: 'Period Life Table, 2023, as used in the 2026 Trustees Report',
    publicationDate: '2026',
    relevantTable: 'Actuarial Life Table, l_x (number of lives) by exact age and sex',
    url: 'https://www.ssa.gov/oact/STATS/table4c6.html',
    notes: 'Initial model uses the simple mean of male and female l_x. This is a period table, not cohort mortality; ages 0, 18, and 65-110 are stored.',
  },
  {
    id: 'cbo-budget-2026',
    kind: 'empirical input',
    agency: 'Congressional Budget Office',
    datasetOrReport: 'The Budget and Economic Outlook: 2026 to 2036',
    publicationDate: '2026-02-11',
    relevantTable: 'February 2026 10-year and long-term machine-readable budget data',
    url: 'https://www.cbo.gov/publication/62105',
    notes: 'Imports exact fiscal-year GDP shares for Social Security, net Medicare, Medicaid/CHIP/marketplace subsidies, other mandatory spending, and total discretionary spending through 2056. The defense/NDD split is published through 2036 and held at its 2036 proportion thereafter. Exact 2026 anchors are $31.902T GDP; 17.541% revenue; 20.092% primary spending; 3.257% net interest; 23.348% total outlays; and 100.605% debt held by the public. Published 2056 shares are held after CBO\'s data horizon as an explicitly labeled stress-test extension.',
  },
  {
    id: 'hhs-fpl-2026',
    kind: 'empirical input',
    agency: 'Department of Health and Human Services, ASPE',
    datasetOrReport: '2026 Poverty Guidelines',
    publicationDate: '2026-01',
    relevantTable: '48 contiguous states and D.C., household size 1',
    url: 'https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines',
    notes: 'Individual guideline is $15,960; policy fixes its real growth at exactly zero.',
  },
  {
    id: 'cms-enrollment',
    kind: 'empirical input',
    agency: 'Centers for Medicare & Medicaid Services',
    datasetOrReport: 'Medicare Monthly Enrollment',
    publicationDate: 'updated monthly',
    relevantTable: 'Total enrollment and age 65+ share',
    url: 'https://data.cms.gov/summary-statistics-on-beneficiary-enrollment/medicare-and-medicaid-reports/medicare-monthly-enrollment',
    notes: 'Used as a reasonableness check for the explicitly named annual-cohort-size calibration; the first pass does not ingest a monthly enrollment path.',
  },
  {
    id: 'ssa-trustees-payable-2026',
    kind: 'empirical input',
    agency: 'Social Security Administration',
    datasetOrReport: '2026 Social Security Trustees Report Summary',
    publicationDate: '2026-06-09',
    relevantTable: 'Table 1 and Table 8, OASI and DI trust-fund adequacy',
    url: 'https://www.ssa.gov/oact/trsum/',
    notes: 'Current-law payable benchmark uses OASI depletion in Q4 2032, 78% payable at depletion, and 62% in 2100. The annual simulator applies a partial-year depletion approximation and linear interpolation, holds 62% after 2100, applies the factor only to the modeled old-age stream, and leaves the separate other-OASDI calibration scheduled. DI remains fully payable through 2100.',
  },
  {
    id: 'medicare-trustees-payable-2026',
    kind: 'empirical input',
    agency: 'Centers for Medicare & Medicaid Services',
    datasetOrReport: '2026 Medicare Trustees Report',
    publicationDate: '2026-06-09',
    relevantTable: 'HI depletion summary, Table III.B7, and Table II.B1 per-enrollee benefits',
    url: 'https://www.cms.gov/oact/tr/2026',
    notes: 'Current-law payable benchmark uses HI depletion in Q2 2033 and the published 89%/85%/93% payable points for 2033/2050/2100. The all-in senior Medicare factor applies those reductions only to the 34.0% Part A share calibrated from per-enrollee Part A, B, and D benefits; Parts B and D remain fully financed. Published points are linearly interpolated and the 2100 value is held thereafter.',
  },
  {
    id: 'entitlement-policy',
    kind: 'policy assumption',
    agency: 'Project specification',
    datasetOrReport: 'MODEL_SPEC.md and SCENARIO_AND_TAX_SOLVERS.md',
    publicationDate: 'repository current version',
    relevantTable: 'Policy defaults',
    url: 'https://github.com/pcarlsgaard/Entitlements-Reform',
    notes: 'Defines FPL multiple, FRA, vesting, premium support, transition years, prefunding ages, six program-financing strategies including two sequencing rules, 30/50/70-year policy scores, transition-runoff milestones, a constant-rate benchmark, and an annual debt-target revenue path.',
  },
  {
    id: 'cohort-calibrations',
    kind: 'modeling assumption',
    agency: 'Model implementation',
    datasetOrReport: 'Named cohort-to-budget calibrations',
    publicationDate: '2026-08-26',
    relevantTable: 'src/data/cboBaseline.ts and src/model/defaults.ts',
    url: 'https://github.com/pcarlsgaard/Entitlements-Reform',
    notes: 'Eligibility populations apply SSA survival from birth. Current-law-formula old-age Social Security is scaled by year so it plus the separately displayed 1.0%-of-GDP other-Social-Security component equals CBO total Social Security. Legacy senior Medicare is scaled so it plus the separately displayed 0.6%-of-GDP under-65/offsetting-receipts component equals CBO net Medicare. Flat Social Security and gross premium support remain policy promises and are not rescaled. No unexplained other-primary residual remains.',
  },
]
