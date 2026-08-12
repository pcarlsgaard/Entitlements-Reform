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
    relevantTable: '2026 headline budget totals, debt held by the public, and outlays by category',
    url: 'https://www.cbo.gov/publication/62105',
    notes: 'Calibrates starting debt at 101% GDP, nominal GDP near $31.8T, starting effective nominal rate as 3.3% GDP net interest divided by 101% GDP debt, and 2026 nondefense discretionary outlays at 3.1% of GDP.',
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
    id: 'entitlement-policy',
    kind: 'policy assumption',
    agency: 'Project specification',
    datasetOrReport: 'MODEL_SPEC.md and SCENARIO_AND_TAX_SOLVERS.md',
    publicationDate: 'repository current version',
    relevantTable: 'Policy defaults',
    url: 'https://github.com/pcarlsgaard/Entitlements-Reform',
    notes: 'Defines FPL multiple, FRA, vesting, premium support, transition years, prefunding ages, and the two tax presentations.',
  },
  {
    id: 'first-pass-calibrations',
    kind: 'modeling assumption',
    agency: 'Model implementation',
    datasetOrReport: 'Named first-pass calibrations',
    publicationDate: '2026-08-09',
    relevantTable: 'src/model/defaults.ts',
    url: 'https://github.com/pcarlsgaard/Entitlements-Reform',
    notes: 'Current-law SS benefit, legacy Medicare cost, cohort size/growth, other OASDI, under-65 Medicare, NDD growth, and other-primary-excluding-NDD share are exposed typed assumptions rather than hidden residuals. Central NDD real growth matches real GDP growth to preserve the previous baseline; it is not presented as CBO policy.',
  },
]
