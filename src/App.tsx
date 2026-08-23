import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { sources } from './data/sources'
import { defaultAssumptions } from './model/defaults'
import {
  fundingStrategies,
  fundingStrategyLabels,
} from './model/fundingStrategy'
import { reconciliationErrors } from './model/audit'
import { compareScenarios } from './model/scenarios'
import {
  centralMacroBudgetReference,
  hasNoncentralMacroBudgetAssumptions,
} from './model/sensitivity'
import { validateModelAssumptions } from './model/validation'
import type {
  FundingStrategy,
  ModelAssumptions,
  ScenarioResult,
  SimulationResult,
  SimulationYear,
} from './model/types'

type Tab = 'policy' | 'results' | 'audit' | 'sources'
type ScenarioChoice = FundingStrategy

const percent = (value: number, digits = 2) =>
  `${(value * 100).toFixed(digits)}%`
const percentagePointDelta = (value: number) =>
  `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)} pp`
const dollars = (billions: number) =>
  `$${billions >= 1_000 ? `${(billions / 1_000).toFixed(2)}T` : `${billions.toFixed(1)}B`}`
const personDollars = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

const termDefinitions = [
  ['Primary spending', 'All federal program outlays other than net interest. Reform prefunding deposits count as primary spending.'],
  ['Total federal spending', 'Primary spending plus net interest on debt held by the public.'],
  ['Nondefense discretionary (NDD)', 'Annually appropriated domestic and international programs outside national defense—for example education, transportation, housing, public health, research, justice, and foreign affairs. It excludes mandatory benefits such as Social Security, Medicare, and Medicaid.'],
  ['Other primary excluding NDD', 'The 2026 residual outside separately modeled Social Security, Medicare, and NDD. It includes defense, Medicaid/CHIP/ACA subsidies, income security, veterans and federal retirement, agriculture, other mandatory programs, and offsetting receipts.'],
  ['Constant revenue rate', 'The minimum single federal revenue share that would satisfy both the peak-debt ceiling and endpoint target if applied throughout the policy window. It is the opening-rate benchmark.'],
  ['Non-rising revenue path', 'Begins at the minimum constant-rate benchmark. If the peak ceiling binds before the endpoint, revenue begins a smooth decline as soon as it can do so without breaching the ceiling, and reaches the selected endpoint debt target without a later tax increase.'],
  ['Policy horizon', 'The years used to score the fiscal objective. The default is 70 fiscal years, 2026–2095; later years are an actuarial stress-test extension.'],
  ['Net interest', 'Budget outlays for servicing debt held by the public, using the model’s average effective nominal interest rate.'],
] as const

function TermDefinitions() {
  return (
    <details className="definitions-box">
      <summary>Definitions used in the charts and controls</summary>
      <dl>
        {termDefinitions.map(([term, definition]) => (
          <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>
        ))}
      </dl>
    </details>
  )
}

function NumericInput({
  label,
  value,
  onChange,
  step = 1,
  suffix,
  note,
  min,
  max,
  integer = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  suffix?: string
  note?: string
  min?: number
  max?: number
  integer?: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(String(value))
    setError(null)
  }, [value])

  const commit = () => {
    const parsed = Number(draft)
    let message: string | null = null
    if (draft.trim() === '' || !Number.isFinite(parsed)) message = 'Enter a number.'
    else if (integer && !Number.isInteger(parsed)) message = 'Enter a whole number.'
    else if (min !== undefined && parsed < min) message = `Minimum: ${min}.`
    else if (max !== undefined && parsed > max) message = `Maximum: ${max}.`

    if (message) {
      setError(message)
      return
    }
    setError(null)
    onChange(parsed)
  }

  return (
    <label className={`field${error ? ' invalid' : ''}`}>
      <span>{label}</span>
      <div className="input-wrap">
        <input
          type="number"
          value={draft}
          step={step}
          min={min}
          max={max}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(String(value))
              setError(null)
              event.currentTarget.blur()
            }
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      {error && <small className="field-error">{error} The model kept the last valid value.</small>}
      {note && <small>{note}</small>}
    </label>
  )
}

function PolicyPanel({
  assumptions,
  update,
  apply,
}: {
  assumptions: ModelAssumptions
  update: <K extends keyof ModelAssumptions>(
    key: K,
    value: ModelAssumptions[K],
  ) => void
  apply: (overrides: Partial<ModelAssumptions>) => void
}) {
  return (
    <div className="panel-grid">
      <section className="card edit-note">
        <strong>Edit freely, then press Enter or leave the field.</strong>
        <span>The simulator validates the entry and runs the full comparison once—not once per digit.</span>
      </section>
      <section className="card policy-card">
        <div className="eyebrow">Social Security</div>
        <h2>Retirement-cohort benefit design</h2>
        <NumericInput
          label="Benefit phase-in"
          value={assumptions.benefitPhaseInYears}
          onChange={(value) => update('benefitPhaseInYears', value)}
          suffix="years"
          min={1}
          max={100}
          integer
        />
        <NumericInput
          label="Flat benefit"
          value={assumptions.flatBenefitFPLMultiple * 100}
          onChange={(value) => update('flatBenefitFPLMultiple', value / 100)}
          suffix="% FPL"
          min={0}
          max={1_000}
        />
        <NumericInput
          label="Full retirement age"
          value={assumptions.fullRetirementAge}
          onChange={(value) => update('fullRetirementAge', value)}
          suffix="years"
          min={50}
          max={90}
          integer
        />
        <NumericInput
          label="Vesting"
          value={assumptions.vestingYears}
          onChange={(value) => update('vestingYears', value)}
          suffix="years"
          min={0}
          max={60}
          integer
          note="The first-pass fiscal score assumes participants are fully vested."
        />
        <div className="locked-row">
          <span>2026 individual FPL</span><strong>{personDollars(assumptions.individualFPL2026)}</strong>
        </div>
        <div className="locked-row">
          <span>Real FPL growth</span><strong>0.00% · fixed</strong>
        </div>
      </section>

      <section className="card policy-card">
        <div className="eyebrow">Financing</div>
        <h2>Program financing strategy</h2>
        <label className="field">
          <span>Detailed scenario</span>
          <select
            value={assumptions.fundingStrategy}
            onChange={(event) =>
              update(
                'fundingStrategy',
                event.target.value as FundingStrategy,
              )
            }
          >
            {fundingStrategies.map((strategy) => (
              <option key={strategy} value={strategy}>
                {fundingStrategyLabels[strategy]}
              </option>
            ))}
          </select>
          <small>Results always calculate all six strategies using the same benefit promise.</small>
        </label>
        <label className="field">
          <span>Funding age</span>
          <select
            value={assumptions.prefundingStartAge}
            onChange={(event) =>
              update('prefundingStartAge', Number(event.target.value) as 0 | 18)
            }
          >
            <option value={18}>Age 18</option>
            <option value={0}>Birth</option>
          </select>
        </label>
        <NumericInput
          label="Real endowment yield"
          value={assumptions.realEndowmentYield * 100}
          onChange={(value) => update('realEndowmentYield', value / 100)}
          step={0.1}
          suffix="%"
          min={-5}
          max={15}
        />
        <div className="callout quiet">
          SS-first uses only a positive annual Social Security prefunding dividend for Medicare. Savings-funded sequencing instead caps total deposits at that year’s benefit-design savings versus scheduled current law, buying Social Security first and then Medicare. Partial funding follows the cohort into retirement.
        </div>
      </section>

      <section className="card policy-card">
        <div className="eyebrow">Medicare</div>
        <h2>Gross premium support</h2>
        <NumericInput
          label="2026 benefit"
          value={assumptions.premiumSupport2026}
          onChange={(value) => update('premiumSupport2026', value)}
          step={500}
          suffix="$/person"
          min={0}
          max={100_000}
        />
        <NumericInput
          label="Real benefit growth"
          value={assumptions.premiumSupportRealGrowth * 100}
          onChange={(value) => update('premiumSupportRealGrowth', value / 100)}
          step={0.1}
          suffix="%"
          min={-5}
          max={10}
        />
        <NumericInput
          label="Year A · all new entrants"
          value={assumptions.medicareYearA}
          onChange={(value) => update('medicareYearA', value)}
          min={assumptions.reformYear}
          max={assumptions.medicareYearB}
          integer
        />
        <NumericInput
          label="Year B · all seniors"
          value={assumptions.medicareYearB}
          onChange={(value) => update('medicareYearB', value)}
          min={assumptions.medicareYearA}
          max={assumptions.endYear}
          integer
        />
        <small className="block-note">The $19,000 default is gross and includes expected risk adjustment, community rating, and reinsurance.</small>
      </section>

      <section className="card policy-card">
        <div className="eyebrow">Debt & revenue</div>
        <h2>Debt limits</h2>
        <NumericInput
          label="Starting debt"
          value={assumptions.startingDebtGDP * 100}
          onChange={(value) => update('startingDebtGDP', value / 100)}
          suffix="% GDP"
          min={0}
          max={500}
        />
        <NumericInput
          label="Fiscal scoring horizon"
          value={assumptions.policyHorizonYears}
          onChange={(value) => update('policyHorizonYears', value)}
          suffix="years"
          min={10}
          max={assumptions.endYear - assumptions.reformYear + 1}
          integer
          note={`Default cutoff: ${assumptions.reformYear + assumptions.policyHorizonYears - 1}. Later chart years are a stress-test extension.`}
        />
        <NumericInput
          label="Peak-debt ceiling"
          value={assumptions.peakDebtCeilingGDP * 100}
          onChange={(value) => update('peakDebtCeilingGDP', value / 100)}
          suffix="% GDP"
          min={assumptions.startingDebtGDP * 100}
          max={1_000}
          note="Debt may touch but cannot exceed this level before the policy endpoint."
        />
        <NumericInput
          label="Debt target at policy endpoint"
          value={assumptions.policyHorizonDebtTargetGDP * 100}
          onChange={(value) => update('policyHorizonDebtTargetGDP', value / 100)}
          suffix="% GDP"
          min={0}
          max={assumptions.peakDebtCeilingGDP * 100}
          note="May equal the peak ceiling for stable debt or be lower for a declining debt path."
        />
        <NumericInput
          label="Debt-rate pass-through"
          value={assumptions.debtRatePassThrough * 100}
          onChange={(value) => update('debtRatePassThrough', value / 100)}
          suffix="%/year"
          min={0}
          max={100}
          note="Refinancing speed: the share of the remaining target-rate gap closed each year."
        />
      </section>

      <section className="card policy-card">
        <div className="eyebrow">Macroeconomy & debt service</div>
        <h2>Growth and financing assumptions</h2>
        <div className="preset-row">
          <button onClick={() => apply(centralMacroBudgetReference(assumptions))}>Central defaults</button>
          <button onClick={() => apply({ realGDPGrowth: defaultAssumptions.realGDPGrowth + 0.001 })}>GDP growth +0.1 pp</button>
        </div>
        <NumericInput
          label="Real GDP growth"
          value={assumptions.realGDPGrowth * 100}
          onChange={(value) => update('realGDPGrowth', value / 100)}
          step={0.1}
          suffix="%/year"
          min={-5}
          max={10}
        />
        <NumericInput
          label="Inflation"
          value={assumptions.inflation * 100}
          onChange={(value) => update('inflation', value / 100)}
          step={0.1}
          suffix="%/year"
          min={-5}
          max={15}
          note="Applied consistently to benefit dollars, NDD spending, GDP, and nominal rate targets."
        />
        <NumericInput
          label="Cohort-size growth"
          value={assumptions.cohortSizeGrowth * 100}
          onChange={(value) => update('cohortSizeGrowth', value / 100)}
          step={0.1}
          suffix="%/year"
          min={-5}
          max={5}
        />
        <NumericInput
          label="Baseline real market rate"
          value={assumptions.baselineRealMarketRate * 100}
          onChange={(value) => update('baselineRealMarketRate', value / 100)}
          step={0.1}
          suffix="%"
          min={-5}
          max={15}
        />
        <NumericInput
          label="Starting effective nominal rate"
          value={assumptions.startingEffectiveNominalRate * 100}
          onChange={(value) => update('startingEffectiveNominalRate', value / 100)}
          step={0.1}
          suffix="%"
          min={0}
          max={20}
        />
        <NumericInput
          label="Debt sensitivity"
          value={assumptions.debtSensitivity * 100}
          onChange={(value) => update('debtSensitivity', value / 100)}
          step={0.5}
          suffix="bp per +1% GDP debt"
          min={0}
          max={20}
        />
      </section>

      <section className="card policy-card">
        <div className="eyebrow">Broader federal budget</div>
        <h2>Spending outside the reform</h2>
        <div className="preset-row">
          <button onClick={() => apply({ nonDefenseDiscretionaryRealGrowth: 0.01 })}>NDD 1% real growth</button>
          <button onClick={() => apply({ nonDefenseDiscretionaryRealGrowth: 0 })}>NDD real freeze</button>
        </div>
        <NumericInput
          label="Current-law SS benefit growth"
          value={assumptions.currentLawSSBenefitRealGrowth * 100}
          onChange={(value) => update('currentLawSSBenefitRealGrowth', value / 100)}
          step={0.1}
          suffix="% real/year"
          min={-5}
          max={10}
        />
        <NumericInput
          label="Legacy Medicare cost growth"
          value={assumptions.legacyMedicareRealGrowth * 100}
          onChange={(value) => update('legacyMedicareRealGrowth', value / 100)}
          step={0.1}
          suffix="% real/year"
          min={-5}
          max={10}
          note="Applies to the all-in current-law Parts A, B, D, and Medicare Advantage benefit."
        />
        <NumericInput
          label="2026 nondefense discretionary"
          value={assumptions.nonDefenseDiscretionaryGDP2026 * 100}
          onChange={(value) => update('nonDefenseDiscretionaryGDP2026', value / 100)}
          step={0.1}
          suffix="% GDP"
          min={0}
          max={20}
          note="CBO February 2026 baseline: 3.1% of GDP."
        />
        <NumericInput
          label="NDD spending growth"
          value={assumptions.nonDefenseDiscretionaryRealGrowth * 100}
          onChange={(value) => update('nonDefenseDiscretionaryRealGrowth', value / 100)}
          step={0.1}
          suffix="% real/year"
          min={-10}
          max={10}
          note="An independent dollar path; below GDP growth makes NDD decline as a share of GDP."
        />
        <NumericInput
          label="Other OASDI"
          value={assumptions.otherOASDIGDP * 100}
          onChange={(value) => update('otherOASDIGDP', value / 100)}
          step={0.1}
          suffix="% GDP"
          min={0}
          max={20}
        />
        <NumericInput
          label="Under-65 Medicare"
          value={assumptions.under65MedicareGDP * 100}
          onChange={(value) => update('under65MedicareGDP', value / 100)}
          step={0.1}
          suffix="% GDP"
          min={0}
          max={20}
        />
        <NumericInput
          label="Other primary excluding NDD"
          value={assumptions.otherPrimaryGDP * 100}
          onChange={(value) => update('otherPrimaryGDP', value / 100)}
          step={0.1}
          suffix="% GDP"
          min={0}
          max={30}
          note="Named residual calibrated so scheduled-current-law 2026 primary spending totals 20.0% of GDP; held at a constant GDP share thereafter."
        />
        <TermDefinitions />
      </section>
    </div>
  )
}

function yearOrDash(value: number | null): string {
  return value === null ? 'Not by horizon' : String(value)
}

function ComparisonTable({ comparison }: { comparison: ReturnType<typeof compareScenarios> }) {
  const policyEnd = comparison.paygo.revenuePath.policyHorizonEndYear
  return (
    <div className="table-scroll">
      <table className="comparison-table">
        <thead><tr><th>Financing strategy</th><th>Opening / single rate</th><th>Lowest visible rate</th><th>Peak debt</th><th>{policyEnd} debt</th><th>Mature primary spending</th><th>95% runoff</th><th>Medicare deposits begin</th><th>First 100%-funded Medicare cohort</th></tr></thead>
        <tbody>{fundingStrategies.map((strategy) => {
          const scenario = comparison.scenarios[strategy]
          return (
            <tr key={strategy}>
              <th>{scenario.label}</th>
              <td>{percent(scenario.revenuePath.startingRevenueRate)}<br /><small>2026</small></td>
              <td>{percent(scenario.revenuePath.minimumRevenueRate)}<br /><small>{scenario.revenuePath.revenueDeclineYear === null ? 'never falls' : `falls ${scenario.revenuePath.revenueDeclineYear} · min ${scenario.revenuePath.minimumRevenueYear}`}</small></td>
              <td>{percent(scenario.revenuePath.peakDebtGDP, 1)}<br /><small>{scenario.revenuePath.peakDebtYear}</small></td>
              <td>{percent(scenario.revenuePath.endpointDebtGDP, 1)}</td>
              <td>{percent(scenario.maturePrimarySpendingGDP, 1)}<br /><small>{scenario.matureSystemYear}</small></td>
              <td>{scenario.transitionRunoffYears.ninetyFivePercent}</td>
              <td>{yearOrDash(scenario.firstMedicarePrefundingYear)}</td>
              <td>{yearOrDash(scenario.firstFullMedicarePrefundingYear)}</td>
            </tr>
          )
        })}</tbody>
      </table>
      <p className="baseline-note">The opening rate is the minimum single rate that satisfies both debt limits. If the peak ceiling binds early, the operational rate begins falling at the earliest year a smooth decline can still respect the ceiling and reach the {policyEnd} endpoint target.</p>
    </div>
  )
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="card chart-card"><div><h3>{title}</h3>{note && <p>{note}</p>}</div><div className="chart-frame">{children}</div></section>
}

function MacroBudgetSensitivity({
  comparison,
  referenceComparison,
  changed,
}: {
  comparison: ReturnType<typeof compareScenarios>
  referenceComparison: ReturnType<typeof compareScenarios>
  changed: boolean
}) {
  const assumptions = comparison.paygo.assumptions
  const reference = referenceComparison.paygo.assumptions
  const displayYear = Math.min(2050, assumptions.endYear)
  const currentBudgetRow = comparison.paygo.permanent.simulation.years.find(
    (row) => row.year === displayYear,
  )
  const referenceBudgetRow =
    referenceComparison.paygo.permanent.simulation.years.find(
      (row) => row.year === displayYear,
    )
  const nddShare = currentBudgetRow
    ? currentBudgetRow.nonDefenseDiscretionary / currentBudgetRow.nominalGDP
    : Number.NaN
  const referenceNddShare = referenceBudgetRow
    ? referenceBudgetRow.nonDefenseDiscretionary / referenceBudgetRow.nominalGDP
    : Number.NaN
  const rows = fundingStrategies.map((strategy) => {
    const scenario = comparison.scenarios[strategy]
    const baseline = referenceComparison.scenarios[strategy]
    return {
      strategy,
      starting:
        scenario.revenuePath.startingRevenueRate -
        baseline.revenuePath.startingRevenueRate,
      minimum:
        scenario.revenuePath.minimumRevenueRate -
        baseline.revenuePath.minimumRevenueRate,
    }
  })
  return (
    <section className="card sensitivity-card">
      <div className="sensitivity-heading">
        <div>
          <div className="eyebrow">Ceteris-paribus sensitivity</div>
          <h2>Macro & broader-budget effect</h2>
          <p>
            Current macro and broader-budget inputs versus central defaults,
            holding benefit design, prefunding rules, and fiscal objectives fixed.
          </p>
        </div>
        <span className={`scenario-state ${changed ? 'changed' : ''}`}>
          {changed ? 'Custom assumptions active' : 'At central defaults'}
        </span>
      </div>
      <div className="assumption-strip">
        <div><span>Real GDP growth</span><strong>{percent(assumptions.realGDPGrowth)}</strong><small>central {percent(reference.realGDPGrowth)}</small></div>
        <div><span>NDD real growth</span><strong>{percent(assumptions.nonDefenseDiscretionaryRealGrowth)}</strong><small>central {percent(reference.nonDefenseDiscretionaryRealGrowth)}</small></div>
        <div><span>{displayYear} NDD / GDP</span><strong>{percent(nddShare)}</strong><small>central {percent(referenceNddShare)}</small></div>
        <div><span>Baseline real rate</span><strong>{percent(assumptions.baselineRealMarketRate)}</strong><small>central {percent(reference.baselineRealMarketRate)}</small></div>
      </div>
      <div className="table-scroll">
        <table className="comparison-table sensitivity-table">
          <thead><tr><th>Required-rate impact vs central</th><th>Opening / single rate</th><th>Lowest visible rate</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.strategy}>
              <th>{fundingStrategyLabels[row.strategy]}</th>
              {[row.starting, row.minimum].map((value, index) => (
                <td key={index} className={value < 0 ? 'favorable' : value > 0 ? 'adverse' : ''}>{percentagePointDelta(value)}</td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="sensitivity-note">Negative values mean the selected assumptions reduce the required federal revenue rate. This is a fiscal sensitivity, not a general-equilibrium forecast.</p>
    </section>
  )
}

function ResultsPanel({ comparison, referenceComparison, macroBudgetChanged, scenarioChoice, setScenarioChoice }: {
  comparison: ReturnType<typeof compareScenarios>
  referenceComparison: ReturnType<typeof compareScenarios>
  macroBudgetChanged: boolean
  scenarioChoice: ScenarioChoice
  setScenarioChoice: (value: ScenarioChoice) => void
}) {
  const selected = comparison.scenarios[scenarioChoice]
  const simulation = selected.revenuePath.simulation
  const policyEnd = selected.revenuePath.policyHorizonEndYear
  const cutoffLabel = `${selected.assumptions.policyHorizonYears}-year cutoff`
  const chartData = simulation.years.filter(
    (row, index) =>
      index % 4 === 0 ||
      row.year === policyEnd ||
      row.year === selected.revenuePath.revenueDeclineYear ||
      row.year === selected.assumptions.endYear,
  ).map((row) => ({
    year: row.year,
    debt: row.endingDebtGDP * 100,
    primary: row.totalPrimarySpending / row.nominalGDP * 100,
    interest: row.netInterest / row.nominalGDP * 100,
    totalSpending: row.totalFederalSpending / row.nominalGDP * 100,
    revenue: row.revenueRate * 100,
    legacySS: row.legacySocialSecurity / row.nominalGDP * 100,
    flatSS: row.flatSocialSecurityPaygo / row.nominalGDP * 100,
    legacyMedicare: row.legacySeniorMedicare / row.nominalGDP * 100,
    premiumSupport: row.premiumSupportPaygo / row.nominalGDP * 100,
    ssPrefunding: row.socialSecurityPrefunding / row.nominalGDP * 100,
    medicarePrefunding: row.medicarePrefunding / row.nominalGDP * 100,
    ssDividend:
      row.socialSecurityPrefundingDividend / row.nominalGDP * 100,
    availableSavings: row.availableReformSavings / row.nominalGDP * 100,
    ssFundedShare: row.socialSecurityPrefundedShare * 100,
    medicareFundedShare: row.medicarePrefundedShare * 100,
    nonDefenseDiscretionary:
      row.nonDefenseDiscretionary / row.nominalGDP * 100,
    otherPrimary:
      (row.otherOASDI + row.under65Medicare + row.otherPrimarySpending) /
      row.nominalGDP * 100,
    targetRate: row.nominalTargetInterestRate * 100,
    effectiveRate: row.effectiveNominalInterestRate * 100,
  }))
  return (
    <>
      <section className="card hero-card">
        <div><div className="eyebrow">Financing comparison</div><h2>Same benefit promise, six financing strategies</h2><p>Each path begins at the minimum rate that satisfies both the peak ceiling and endpoint debt target without a later tax increase. The longer actuarial path stays visible, with the {policyEnd} cutoff marked on every chart.</p></div>
        <div className="effect-box"><span>Selected opening revenue</span><strong>{percent(selected.revenuePath.startingRevenueRate)}</strong><small>{selected.revenuePath.revenueDeclineYear === null ? 'rate does not fall in the visible period' : `first falls in ${selected.revenuePath.revenueDeclineYear}`} · lowest visible {percent(selected.revenuePath.minimumRevenueRate)} in {selected.revenuePath.minimumRevenueYear}</small></div>
      </section>
      <MacroBudgetSensitivity comparison={comparison} referenceComparison={referenceComparison} changed={macroBudgetChanged} />
      <section className="card strategy-card"><div className="section-heading"><div><div className="eyebrow">Strategy matrix</div><h3>Revenue burden, mature spending, and sequencing</h3></div><span>{personDollars(comparison.prefunded.endowment.socialSecurityPV)} SS + {personDollars(comparison.prefunded.endowment.medicarePV)} Medicare per fully funded entrant</span></div><ComparisonTable comparison={comparison} /></section>
      <TermDefinitions />
      <div className="view-controls">
        <div className="segmented strategy-segmented">{fundingStrategies.map((strategy) => <button key={strategy} className={scenarioChoice === strategy ? 'active' : ''} onClick={() => setScenarioChoice(strategy)}>{fundingStrategyLabels[strategy]}</button>)}</div>
      </div>
      <div className="chart-grid">
        <ChartCard title="Debt held by the public" note={`Debt cannot exceed ${percent(selected.assumptions.peakDebtCeilingGDP, 0)} before ${policyEnd} and must reach ${percent(selected.assumptions.policyHorizonDebtTargetGDP, 0)} at the cutoff.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><ReferenceLine y={selected.assumptions.peakDebtCeilingGDP * 100} stroke="#d96c4a" strokeDasharray="3 3" label="Peak ceiling" />{Math.abs(selected.assumptions.policyHorizonDebtTargetGDP - selected.assumptions.peakDebtCeilingGDP) > 1e-9 && <ReferenceLine y={selected.assumptions.policyHorizonDebtTargetGDP * 100} stroke="#3c91e6" strokeDasharray="3 3" label="Endpoint target" />}<ReferenceLine x={policyEnd} stroke="#253b56" strokeDasharray="5 4" label={cutoffLabel} /><Line type="monotone" dataKey="debt" name="Debt / GDP" stroke="#ef8354" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Federal revenue path" note={`Starts at ${percent(selected.revenuePath.startingRevenueRate)} and never rises. ${selected.revenuePath.revenueDeclineYear === null ? 'It does not fall in the visible period.' : `It first falls in ${selected.revenuePath.revenueDeclineYear}, once the debt ceiling permits.`} Lowest visible rate: ${percent(selected.revenuePath.minimumRevenueRate)} in ${selected.revenuePath.minimumRevenueYear}.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><ReferenceLine x={policyEnd} stroke="#253b56" strokeDasharray="5 4" label={cutoffLabel} />{selected.revenuePath.revenueDeclineYear !== null && selected.revenuePath.revenueDeclineYear < policyEnd && <ReferenceLine x={selected.revenuePath.revenueDeclineYear} stroke="#26845f" strokeDasharray="3 3" label="Rate declines" />}<Line type="monotone" dataKey="revenue" name="Required revenue / GDP" stroke="#26845f" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Total federal spending decomposition" note="The stacked areas now include net interest; the dark line is their explicit sum."><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><ReferenceLine x={policyEnd} stroke="#253b56" strokeDasharray="5 4" label={cutoffLabel} /><Area stackId="1" dataKey="legacySS" name="Legacy SS" fill="#6f7d94" stroke="#6f7d94" /><Area stackId="1" dataKey="flatSS" name="Flat SS PAYGO" fill="#3c91e6" stroke="#3c91e6" /><Area stackId="1" dataKey="legacyMedicare" name="Legacy Medicare" fill="#9f86c0" stroke="#9f86c0" /><Area stackId="1" dataKey="premiumSupport" name="Premium support PAYGO" fill="#56cfe1" stroke="#56cfe1" /><Area stackId="1" dataKey="ssPrefunding" name="SS prefunding" fill="#50b58a" stroke="#26845f" /><Area stackId="1" dataKey="medicarePrefunding" name="Medicare prefunding" fill="#8ad4b5" stroke="#4aa784" /><Area stackId="1" dataKey="nonDefenseDiscretionary" name="Nondefense discretionary" fill="#f4b860" stroke="#d69639" /><Area stackId="1" dataKey="otherPrimary" name="Other primary" fill="#b8c1cc" stroke="#8794a3" /><Area stackId="1" dataKey="interest" name="Net interest" fill="#ef9a7a" stroke="#d96c4a" /><Line type="monotone" dataKey="totalSpending" name="Total federal spending" stroke="#172033" strokeWidth={2.5} dot={false} /></ComposedChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Interest spending and rates" note="Lambda moves the effective debt rate toward—not above—the debt-sensitive market target."><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><ReferenceLine x={policyEnd} stroke="#253b56" strokeDasharray="5 4" label={cutoffLabel} /><Line dataKey="interest" name="Net interest / GDP" stroke="#ef8354" dot={false} /><Line dataKey="targetRate" name="Target nominal rate" stroke="#9f86c0" dot={false} /><Line dataKey="effectiveRate" name="Effective nominal rate" stroke="#3c91e6" dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Legacy vs reformed system" note="Cohort mortality—not an aggregate phaseout—runs off legacy SS."><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><ReferenceLine x={policyEnd} stroke="#253b56" strokeDasharray="5 4" label={cutoffLabel} /><Line dataKey="legacySS" name="Legacy SS" stroke="#6f7d94" dot={false} /><Line dataKey="flatSS" name="Flat SS PAYGO" stroke="#3c91e6" dot={false} /><Line dataKey="legacyMedicare" name="Legacy Medicare" stroke="#9f86c0" dot={false} /><Line dataKey="premiumSupport" name="Premium support PAYGO" stroke="#56cfe1" dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title={scenarioChoice === 'savingsFundedSequential' ? 'Savings-funded sequence' : 'Sequential funding gate'} note={scenarioChoice === 'savingsFundedSequential' ? 'Scheduled-current-law benefit savings buy the new cohort’s SS sleeve first, then Medicare; deposits cannot exceed those exogenous savings.' : 'The SS-first strategy can use a positive Social Security dividend for the new cohort’s Medicare sleeve.'}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><ReferenceLine x={policyEnd} stroke="#253b56" strokeDasharray="5 4" label={cutoffLabel} />{scenarioChoice === 'savingsFundedSequential' ? <Line dataKey="availableSavings" name="Available reform savings / GDP" stroke="#26845f" dot={false} /> : <Line dataKey="ssDividend" name="SS dividend / GDP" stroke="#26845f" dot={false} />}<Line dataKey="ssFundedShare" name="New SS cohort funded %" stroke="#3c91e6" dot={false} /><Line dataKey="medicareFundedShare" name="New Medicare cohort funded %" stroke="#9f86c0" dot={false} /></LineChart></ResponsiveContainer></ChartCard>
      </div>
    </>
  )
}

const primaryAuditRows: Array<[keyof SimulationYear, string]> = [
  ['legacySocialSecurity', 'Legacy/current-law Social Security'], ['flatSocialSecurityPaygo', 'Flat Social Security PAYGO'], ['otherOASDI', 'Other OASDI outside reform'], ['legacySeniorMedicare', 'Legacy senior Medicare'], ['premiumSupportPaygo', 'Premium-support PAYGO'], ['under65Medicare', 'Under-65 Medicare'], ['nonDefenseDiscretionary', 'Nondefense discretionary'], ['socialSecurityPrefunding', 'Social Security prefunding'], ['medicarePrefunding', 'Medicare prefunding'], ['otherPrimarySpending', 'Other primary excluding NDD'], ['totalPrimarySpending', 'Total primary spending'],
]

function AuditValue({ value, gdp }: { value: number; gdp: number }) {
  return <><td>{dollars(value)}</td><td>{percent(value / gdp)}</td></>
}

function AuditPanel({ scenario }: { scenario: ScenarioResult }) {
  const simulation: SimulationResult = scenario.revenuePath.simulation
  const [auditYear, setAuditYear] = useState(2050)
  const [retirementYear, setRetirementYear] = useState(2036)
  const row = simulation.years.find((item) => item.year === auditYear) ?? simulation.years[0]!
  const ss = simulation.socialSecurityByYear.get(row.year)
  const cohort = ss?.cohorts.find((item) => item.retirementYear === retirementYear)
  const declineYear = scenario.revenuePath.revenueDeclineYear
  const regime = row.year > scenario.revenuePath.policyHorizonEndYear
    ? 'post-cutoff non-rising debt-maintenance path'
    : declineYear !== null && row.year >= declineYear
      ? 'policy-window revenue decline after the debt ceiling releases'
      : 'minimum opening revenue rate'
  const isSavingsFunded =
    scenario.assumptions.fundingStrategy === 'savingsFundedSequential'
  const errors = reconciliationErrors(row)
  const maxError = Math.max(...Object.values(errors).map(Math.abs))
  return (
    <>
      <section className="card audit-header"><div><div className="eyebrow">{scenario.label}</div><h2>{row.year} decomposition audit</h2><p>{regime} · all values shown in nominal dollars and percent of current-year GDP</p></div><label className="year-picker">Audit year<input type="range" min={scenario.assumptions.reformYear} max={scenario.assumptions.endYear} value={row.year} onChange={(event) => setAuditYear(Number(event.target.value))} /><strong>{row.year}</strong></label></section>
      <div className="audit-grid">
        <section className="card"><div className="section-heading"><div><div className="eyebrow">Ledger 01</div><h3>Primary program spending</h3></div><span className="reconcile">Reconciled · max error {maxError.toExponential(1)}</span></div><table className="audit-table"><thead><tr><th>Component</th><th>Dollars</th><th>% GDP</th></tr></thead><tbody>{primaryAuditRows.map(([key, label]) => <tr key={key} className={key === 'totalPrimarySpending' ? 'total-row' : ''}><th>{label}</th><AuditValue value={row[key] as number} gdp={row.nominalGDP} /></tr>)}</tbody></table></section>
        <section className="card"><div className="section-heading"><div><div className="eyebrow">Ledger 02</div><h3>Financing & interest</h3></div></div><table className="audit-table"><thead><tr><th>Item</th><th>Dollars</th><th>% GDP / rate</th></tr></thead><tbody><tr><th>Revenue</th><AuditValue value={row.revenue} gdp={row.nominalGDP} /></tr><tr><th>Primary balance</th><AuditValue value={row.primaryBalance} gdp={row.nominalGDP} /></tr><tr><th>Beginning debt</th><AuditValue value={row.beginningDebt} gdp={row.nominalGDP} /></tr><tr><th>Target nominal interest rate</th><td>—</td><td>{percent(row.nominalTargetInterestRate)}</td></tr><tr><th>Effective nominal interest rate</th><td>—</td><td>{percent(row.effectiveNominalInterestRate)}</td></tr><tr><th>Net interest</th><AuditValue value={row.netInterest} gdp={row.nominalGDP} /></tr><tr className="total-row"><th>Total federal spending</th><AuditValue value={row.totalFederalSpending} gdp={row.nominalGDP} /></tr><tr><th>Overall deficit</th><AuditValue value={row.overallDeficit} gdp={row.nominalGDP} /></tr><tr><th>Ending debt</th><AuditValue value={row.endingDebt} gdp={row.nominalGDP} /></tr><tr><th>Debt / GDP</th><td>—</td><td>{percent(row.endingDebtGDP)}</td></tr></tbody></table></section>
      </div>
      <section className="card cohort-card">
        <div className="section-heading">
          <div><div className="eyebrow">Sequencing ledger</div><h3>{isSavingsFunded ? 'Benefit-design savings → SS → Medicare' : 'Social Security dividend → Medicare funding'}</h3></div>
          <span>Selected funding cohort: {row.year}</span>
        </div>
        <div className="cohort-metrics">
          {isSavingsFunded && <div><span>Available reform savings</span><strong>{dollars(row.availableReformSavings)}</strong></div>}
          <div><span>Full SS sleeve cost</span><strong>{dollars(row.fullSocialSecurityPrefundingCost)}</strong></div>
          <div><span>SS prefunding deposit</span><strong>{dollars(row.socialSecurityPrefunding)}</strong></div>
          <div><span>SS cohort funded</span><strong>{percent(row.socialSecurityPrefundedShare, 1)}</strong></div>
          {!isSavingsFunded && <div><span>Avoided SS PAYGO</span><strong>{dollars(row.avoidedSocialSecurityPaygo)}</strong></div>}
          {!isSavingsFunded && <div><span>Net SS dividend</span><strong>{dollars(row.socialSecurityPrefundingDividend)}</strong></div>}
          <div><span>Full Medicare sleeve cost</span><strong>{dollars(row.fullMedicarePrefundingCost)}</strong></div>
          <div><span>Medicare deposit</span><strong>{dollars(row.medicarePrefunding)}</strong></div>
          <div><span>Medicare cohort funded</span><strong>{percent(row.medicarePrefundedShare, 1)}</strong></div>
          <div><span>Total prefunding</span><strong>{dollars(row.newCohortPrefunding)}</strong></div>
          {isSavingsFunded && <div><span>Unused reform savings</span><strong>{dollars(row.unusedReformSavings)}</strong></div>}
        </div>
        <div className="cohort-proof">{isSavingsFunded ? 'Available savings are the positive difference between scheduled current-law SS plus senior Medicare benefits and the same year’s reformed benefits under PAYGO. They buy SS first, then Medicare; prefunding deposits and endowment returns never enlarge the savings budget.' : 'The Medicare deposit equals the smaller of the positive SS dividend and the full Medicare sleeve cost. A negative SS dividend contributes nothing to Medicare.'}</div>
      </section>
      <section className="card cohort-card"><div className="section-heading"><div><div className="eyebrow">Cohort inspector</div><h3>Social Security retirement cohort</h3></div><label>Retirement year <input type="number" min={row.year - 40} max={row.year} value={retirementYear} onChange={(event) => setRetirementYear(Number(event.target.value))} /></label></div>{cohort ? <div className="cohort-metrics"><div><span>Initial cohort</span><strong>{cohort.initialCohortMillions.toFixed(2)}M</strong></div><div><span>Surviving in {row.year}</span><strong>{cohort.survivingBeneficiariesMillions.toFixed(2)}M</strong></div><div><span>Survival fraction</span><strong>{percent(cohort.survivalFraction, 1)}</strong></div><div className="blend"><span>Locked benefit blend</span><strong>{percent(cohort.legacyShare, 0)} legacy / {percent(cohort.flatShare, 0)} flat</strong></div><div><span>Flat sleeve funded</span><strong>{percent(cohort.prefundedShare, 1)}</strong></div><div><span>Legacy PAYGO</span><strong>{dollars(cohort.legacyPaygoBillions)}</strong></div><div><span>Flat PAYGO</span><strong>{dollars(cohort.flatPaygoBillions)}</strong></div><div><span>Total cohort SS</span><strong>{dollars(cohort.totalCohortSSSpendingBillions)}</strong></div></div> : <p>No modeled retirement cohort matches that year in the selected audit year.</p>}<div className="cohort-proof">A 2036 retiree remains 50% legacy / 50% flat in every later audit year. The cohort’s prefunded percentage is also locked; only the surviving headcount changes.</div></section>
    </>
  )
}

function SourcesPanel() {
  return <><section className="card hero-card"><div><div className="eyebrow">Model & sources</div><h2>Inputs have names, provenance, and limits</h2><p>Official inputs, policy choices, modeling assumptions, and outputs remain distinct. The mortality table is period mortality; it does not claim cohort longevity improvement.</p></div></section><TermDefinitions /><section className="card"><div className="conflict"><strong>Revenue-path convention</strong><p>The operational path begins at the minimum constant rate that satisfies both the selected peak-debt ceiling and endpoint target. It cannot begin lower while also promising no later increase. When the ceiling binds before the endpoint, the rate begins a smooth decline in the earliest safe year; otherwise it remains at the opening rate through the cutoff. After the cutoff, it may decline further to maintain the endpoint debt ratio, but it never rises.</p></div><div className="source-list">{sources.map((source) => <article key={source.id}><span className={`source-kind ${source.kind.replace(' ', '-')}`}>{source.kind}</span><h3>{source.agency}</h3><a href={source.url} target="_blank" rel="noreferrer">{source.datasetOrReport}</a><p><strong>{source.relevantTable}</strong> · {source.publicationDate}</p><p>{source.notes}</p></article>)}</div></section></>
}

export default function App() {
  const [assumptions, setAssumptions] = useState(defaultAssumptions)
  const [tab, setTab] = useState<Tab>('results')
  const [scenarioChoice, setScenarioChoice] = useState<ScenarioChoice>(assumptions.fundingStrategy)
  const deferredAssumptions = useDeferredValue(assumptions)
  const calculating = deferredAssumptions !== assumptions
  const comparisonAttempt = useMemo(() => {
    const validationIssues = validateModelAssumptions(deferredAssumptions)
    if (validationIssues.length > 0) {
      return {
        comparison: null,
        referenceComparison: null,
        macroBudgetChanged: null,
        error: validationIssues[0]!.message,
      }
    }
    try {
      const comparison = compareScenarios(deferredAssumptions)
      const macroBudgetChanged = hasNoncentralMacroBudgetAssumptions(
        deferredAssumptions,
      )
      const referenceComparison = macroBudgetChanged
        ? compareScenarios(
            centralMacroBudgetReference(deferredAssumptions),
          )
        : comparison
      return {
        comparison,
        referenceComparison,
        macroBudgetChanged,
        error: null,
      }
    } catch (error) {
      return {
        comparison: null,
        referenceComparison: null,
        macroBudgetChanged: null,
        error: error instanceof Error ? error.message : 'The model could not evaluate those assumptions.',
      }
    }
  }, [deferredAssumptions])
  const lastValidComparison = useRef(comparisonAttempt.comparison)
  const lastValidReferenceComparison = useRef(
    comparisonAttempt.referenceComparison,
  )
  const lastValidMacroBudgetChanged = useRef(
    comparisonAttempt.macroBudgetChanged,
  )
  if (comparisonAttempt.comparison && comparisonAttempt.referenceComparison) {
    lastValidComparison.current = comparisonAttempt.comparison
    lastValidReferenceComparison.current =
      comparisonAttempt.referenceComparison
    lastValidMacroBudgetChanged.current =
      comparisonAttempt.macroBudgetChanged
  }
  const comparison = comparisonAttempt.comparison ?? lastValidComparison.current
  const referenceComparison =
    comparisonAttempt.referenceComparison ??
    lastValidReferenceComparison.current
  const macroBudgetChanged =
    comparisonAttempt.macroBudgetChanged ??
    lastValidMacroBudgetChanged.current ??
    false
  if (!comparison || !referenceComparison) {
    throw new Error('Default assumptions did not produce a scenario comparison.')
  }
  const update = <K extends keyof ModelAssumptions>(key: K, value: ModelAssumptions[K]) => {
    setAssumptions((current) => ({ ...current, [key]: value }))
    if (key === 'fundingStrategy') setScenarioChoice(value as FundingStrategy)
  }
  const apply = (overrides: Partial<ModelAssumptions>) => {
    setAssumptions((current) => ({ ...current, ...overrides }))
    if (overrides.fundingStrategy !== undefined) {
      setScenarioChoice(overrides.fundingStrategy)
    }
  }
  const selectedScenario = comparison.scenarios[scenarioChoice]
  const allSolversConverged =
    fundingStrategies.every((strategy) => {
      const scenario = comparison.scenarios[strategy]
      return scenario.permanent.converged && scenario.revenuePath.converged
    }) &&
    comparison.baselines.scheduled.permanent.converged &&
    comparison.baselines.scheduled.revenuePath.converged &&
    comparison.baselines.payable.permanent.converged &&
    comparison.baselines.payable.revenuePath.converged

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><div className="brand-mark">ER</div><div><strong>Entitlements Reform</strong><span>Cohort fiscal simulator · 2026 reform</span></div></div><nav>{(['policy', 'results', 'audit', 'sources'] as Tab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'sources' ? 'Model & Sources' : item}</button>)}</nav><div aria-live="polite" className={`solver-status ${!calculating && allSolversConverged ? 'ok' : 'warn'}`}><span />{calculating ? 'Calculating…' : allSolversConverged ? 'All strategy solvers converged' : 'Check solver bounds'}</div></header>
      <main>
        {comparisonAttempt.error && <section className="card model-error"><strong>Those assumptions could not be calculated.</strong><span>{comparisonAttempt.error} Showing the last valid results.</span></section>}
        {tab === 'policy' && <PolicyPanel assumptions={assumptions} update={update} apply={apply} />}
        {tab === 'results' && <ResultsPanel comparison={comparison} referenceComparison={referenceComparison} macroBudgetChanged={macroBudgetChanged} scenarioChoice={scenarioChoice} setScenarioChoice={setScenarioChoice} />}
        {tab === 'audit' && <AuditPanel scenario={selectedScenario} />}
        {tab === 'sources' && <SourcesPanel />}
      </main>
      <footer><span>All calculations run client-side.</span><span>Total spending includes net interest.</span><span>{assumptions.policyHorizonYears}-year fiscal cutoff · later years are an actuarial extension.</span></footer>
    </div>
  )
}
