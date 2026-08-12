import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { sources } from './data/sources'
import { defaultAssumptions } from './model/defaults'
import { reconciliationErrors } from './model/audit'
import { compareScenarios } from './model/scenarios'
import {
  centralMacroBudgetReference,
  hasNoncentralMacroBudgetAssumptions,
} from './model/sensitivity'
import { validateModelAssumptions } from './model/validation'
import type {
  FiscalObjective,
  ModelAssumptions,
  ScenarioResult,
  SimulationResult,
  SimulationYear,
} from './model/types'

type Tab = 'policy' | 'results' | 'audit' | 'sources'
type ScenarioChoice = 'paygo' | 'prefunded'
type ScheduleChoice = 'permanent' | 'twoRate'

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
        <h2>New-cohort prefunding</h2>
        <label className="switch-row">
          <div>
            <strong>Prefund new cohorts</strong>
            <small>Controls the detailed scenario; comparison always calculates both.</small>
          </div>
          <input
            type="checkbox"
            checked={assumptions.prefundingEnabled}
            onChange={(event) =>
              update('prefundingEnabled', event.target.checked)
            }
          />
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
          Endowments are calculated from promised SS and Medicare streams. There is no arbitrary prefunding %GDP input.
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
        <h2>Fiscal objective</h2>
        <label className="field">
          <span>Permanent-rate objective</span>
          <select
            value={assumptions.fiscalObjective}
            onChange={(event) =>
              update('fiscalObjective', event.target.value as FiscalObjective)
            }
          >
            <option value="returnToStartingDebt">Return terminal debt to starting debt</option>
            <option value="stableTerminalDebt">Terminal debt no longer rising</option>
            <option value="peakDebtCeiling">Peak-debt ceiling</option>
            <option value="combinedStableAndPeak">Stable debt + peak ceiling</option>
          </select>
        </label>
        <NumericInput
          label="Starting debt"
          value={assumptions.startingDebtGDP * 100}
          onChange={(value) => update('startingDebtGDP', value / 100)}
          suffix="% GDP"
          min={0}
          max={500}
        />
        <NumericInput
          label="Handoff debt target"
          value={assumptions.matureDebtTargetGDP * 100}
          onChange={(value) => update('matureDebtTargetGDP', value / 100)}
          suffix="% GDP"
          min={1}
          max={500}
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
        <NumericInput
          label="Peak-debt ceiling"
          value={assumptions.peakDebtCeilingGDP * 100}
          onChange={(value) => update('peakDebtCeilingGDP', value / 100)}
          suffix="% GDP"
          min={1}
          max={1_000}
          note="Used by the peak-ceiling and combined permanent-rate objectives."
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
          note="Remaining first-pass primary-spending calibration; held at a constant GDP share."
        />
      </section>
    </div>
  )
}

function ComparisonTable({ paygo, prefunded }: { paygo: ScenarioResult; prefunded: ScenarioResult }) {
  const rows: Array<[string, string, string]> = [
    ['Permanent revenue rate', percent(paygo.permanent.rate), percent(prefunded.permanent.rate)],
    ['Transition revenue rate', percent(paygo.twoRate.transitionRate), percent(prefunded.twoRate.transitionRate)],
    ['Mature revenue rate', percent(paygo.twoRate.matureRate), percent(prefunded.twoRate.matureRate)],
    ['Peak debt / GDP', percent(paygo.permanent.peakDebtGDP, 1), percent(prefunded.permanent.peakDebtGDP, 1)],
    ['Peak year', String(paygo.permanent.peakYear), String(prefunded.permanent.peakYear)],
    ['Mature-system year', String(paygo.matureSystemYear), String(prefunded.matureSystemYear)],
    ['Handoff debt target', percent(paygo.twoRate.handoffDebtTargetGDP, 1), percent(prefunded.twoRate.handoffDebtTargetGDP, 1)],
    ['Mature primary spending', percent(paygo.maturePrimarySpendingGDP), percent(prefunded.maturePrimarySpendingGDP)],
    ['Mature net interest', percent(paygo.matureNetInterestGDP), percent(prefunded.matureNetInterestGDP)],
    ['Mature total spending', percent(paygo.matureTotalSpendingGDP), percent(prefunded.matureTotalSpendingGDP)],
    ['Combined endowment / person', '— · PAYGO', personDollars(prefunded.endowment.totalPV)],
    ['SS endowment / person', '— · PAYGO', personDollars(prefunded.endowment.socialSecurityPV)],
    ['Medicare endowment / person', '— · PAYGO', personDollars(prefunded.endowment.medicarePV)],
  ]
  return (
    <div className="table-scroll">
      <table className="comparison-table">
        <thead><tr><th>Metric</th><th>PAYGO reform</th><th>Prefunded reform</th></tr></thead>
        <tbody>{rows.map(([label, a, b]) => <tr key={label}><th>{label}</th><td>{a}</td><td>{b}</td></tr>)}</tbody>
      </table>
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
  const rows: Array<[string, number, number]> = [
    [
      'Permanent revenue rate',
      comparison.paygo.permanent.rate - referenceComparison.paygo.permanent.rate,
      comparison.prefunded.permanent.rate -
        referenceComparison.prefunded.permanent.rate,
    ],
    [
      'Transition revenue rate',
      comparison.paygo.twoRate.transitionRate -
        referenceComparison.paygo.twoRate.transitionRate,
      comparison.prefunded.twoRate.transitionRate -
        referenceComparison.prefunded.twoRate.transitionRate,
    ],
    [
      'Mature revenue rate',
      comparison.paygo.twoRate.matureRate -
        referenceComparison.paygo.twoRate.matureRate,
      comparison.prefunded.twoRate.matureRate -
        referenceComparison.prefunded.twoRate.matureRate,
    ],
  ]
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
          <thead><tr><th>Required-rate impact vs central</th><th>PAYGO reform</th><th>Prefunded reform</th></tr></thead>
          <tbody>{rows.map(([label, paygo, prefunded]) => (
            <tr key={label}>
              <th>{label}</th>
              <td className={paygo < 0 ? 'favorable' : paygo > 0 ? 'adverse' : ''}>{percentagePointDelta(paygo)}</td>
              <td className={prefunded < 0 ? 'favorable' : prefunded > 0 ? 'adverse' : ''}>{percentagePointDelta(prefunded)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="sensitivity-note">Negative values mean the selected assumptions reduce the required federal revenue rate. This is a fiscal sensitivity, not a general-equilibrium forecast.</p>
    </section>
  )
}

function ResultsPanel({ comparison, referenceComparison, macroBudgetChanged, scenarioChoice, setScenarioChoice, scheduleChoice, setScheduleChoice }: {
  comparison: ReturnType<typeof compareScenarios>
  referenceComparison: ReturnType<typeof compareScenarios>
  macroBudgetChanged: boolean
  scenarioChoice: ScenarioChoice
  setScenarioChoice: (value: ScenarioChoice) => void
  scheduleChoice: ScheduleChoice
  setScheduleChoice: (value: ScheduleChoice) => void
}) {
  const selected = comparison[scenarioChoice]
  const simulation = scheduleChoice === 'permanent' ? selected.permanent.simulation : selected.twoRate.simulation
  const chartData = simulation.years.filter((row, index) => index % 4 === 0 || row.year === selected.matureSystemYear).map((row) => ({
    year: row.year,
    debt: row.beginningDebtGDP * 100,
    primary: row.totalPrimarySpending / row.nominalGDP * 100,
    interest: row.netInterest / row.nominalGDP * 100,
    legacySS: row.legacySocialSecurity / row.nominalGDP * 100,
    flatSS: row.flatSocialSecurityPaygo / row.nominalGDP * 100,
    legacyMedicare: row.legacySeniorMedicare / row.nominalGDP * 100,
    premiumSupport: row.premiumSupportPaygo / row.nominalGDP * 100,
    prefunding: row.newCohortPrefunding / row.nominalGDP * 100,
    nonDefenseDiscretionary:
      row.nonDefenseDiscretionary / row.nominalGDP * 100,
    otherPrimary:
      (row.otherOASDI + row.under65Medicare + row.otherPrimarySpending) /
      row.nominalGDP * 100,
    targetRate: row.nominalTargetInterestRate * 100,
    effectiveRate: row.effectiveNominalInterestRate * 100,
  }))
  const effect = comparison.prefundingTransitionFinancingEffect
  return (
    <>
      <section className="card hero-card">
        <div><div className="eyebrow">Financing comparison</div><h2>Same benefit promise, two financing regimes</h2><p>The prefunding difference is primarily a timing and asset-funding requirement—not automatically a net economic resource cost.</p></div>
        <div className="effect-box"><span>Prefunding transition financing effect</span><strong>{percent(effect.transitionRateDifference)}</strong><small>transition-rate difference</small></div>
      </section>
      <MacroBudgetSensitivity comparison={comparison} referenceComparison={referenceComparison} changed={macroBudgetChanged} />
      <section className="card"><ComparisonTable paygo={comparison.paygo} prefunded={comparison.prefunded} /></section>
      <div className="view-controls">
        <div className="segmented"><button className={scenarioChoice === 'paygo' ? 'active' : ''} onClick={() => setScenarioChoice('paygo')}>PAYGO detail</button><button className={scenarioChoice === 'prefunded' ? 'active' : ''} onClick={() => setScenarioChoice('prefunded')}>Prefunded detail</button></div>
        <div className="segmented"><button className={scheduleChoice === 'permanent' ? 'active' : ''} onClick={() => setScheduleChoice('permanent')}>Permanent rate</button><button className={scheduleChoice === 'twoRate' ? 'active' : ''} onClick={() => setScheduleChoice('twoRate')}>Two-rate schedule</button></div>
      </div>
      <div className="chart-grid">
        <ChartCard title="Debt held by the public" note="Beginning-of-year debt as a share of current-year nominal GDP."><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Line type="monotone" dataKey="debt" name="Debt / GDP" stroke="#ef8354" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Primary spending decomposition" note="Net interest is intentionally excluded from this stack."><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><Area stackId="1" dataKey="legacySS" name="Legacy SS" fill="#6f7d94" stroke="#6f7d94" /><Area stackId="1" dataKey="flatSS" name="Flat SS PAYGO" fill="#3c91e6" stroke="#3c91e6" /><Area stackId="1" dataKey="legacyMedicare" name="Legacy Medicare" fill="#9f86c0" stroke="#9f86c0" /><Area stackId="1" dataKey="premiumSupport" name="Premium support PAYGO" fill="#56cfe1" stroke="#56cfe1" /><Area stackId="1" dataKey="prefunding" name="New-cohort prefunding" fill="#50b58a" stroke="#50b58a" /><Area stackId="1" dataKey="nonDefenseDiscretionary" name="Nondefense discretionary" fill="#f4b860" stroke="#d69639" /><Area stackId="1" dataKey="otherPrimary" name="Other primary" fill="#b8c1cc" stroke="#8794a3" /></AreaChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Interest spending and rates" note="Lambda moves the effective debt rate toward—not above—the debt-sensitive market target."><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><Line dataKey="interest" name="Net interest / GDP" stroke="#ef8354" dot={false} /><Line dataKey="targetRate" name="Target nominal rate" stroke="#9f86c0" dot={false} /><Line dataKey="effectiveRate" name="Effective nominal rate" stroke="#3c91e6" dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Legacy vs reformed system" note="Cohort mortality—not an aggregate phaseout—runs off legacy SS."><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Legend /><Line dataKey="legacySS" name="Legacy SS" stroke="#6f7d94" dot={false} /><Line dataKey="flatSS" name="Flat SS PAYGO" stroke="#3c91e6" dot={false} /><Line dataKey="legacyMedicare" name="Legacy Medicare" stroke="#9f86c0" dot={false} /><Line dataKey="premiumSupport" name="Premium support PAYGO" stroke="#56cfe1" dot={false} /></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Prefunding transition" note="Calculated new-cohort endowments as a share of GDP; exactly zero with prefunding off."><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis unit="%" /><Tooltip /><Area dataKey="prefunding" name="Annual prefunding / GDP" fill="#50b58a" stroke="#26845f" /></AreaChart></ResponsiveContainer></ChartCard>
      </div>
    </>
  )
}

const primaryAuditRows: Array<[keyof SimulationYear, string]> = [
  ['legacySocialSecurity', 'Legacy/current-law Social Security'], ['flatSocialSecurityPaygo', 'Flat Social Security PAYGO'], ['otherOASDI', 'Other OASDI outside reform'], ['legacySeniorMedicare', 'Legacy senior Medicare'], ['premiumSupportPaygo', 'Premium-support PAYGO'], ['under65Medicare', 'Under-65 Medicare'], ['nonDefenseDiscretionary', 'Nondefense discretionary'], ['newCohortPrefunding', 'New-cohort prefunding'], ['otherPrimarySpending', 'Other primary excluding NDD'], ['totalPrimarySpending', 'Total primary spending'],
]

function AuditValue({ value, gdp }: { value: number; gdp: number }) {
  return <><td>{dollars(value)}</td><td>{percent(value / gdp)}</td></>
}

function AuditPanel({ scenario, scheduleChoice }: { scenario: ScenarioResult; scheduleChoice: ScheduleChoice }) {
  const simulation: SimulationResult = scheduleChoice === 'permanent' ? scenario.permanent.simulation : scenario.twoRate.simulation
  const [auditYear, setAuditYear] = useState(2050)
  const [retirementYear, setRetirementYear] = useState(2036)
  const row = simulation.years.find((item) => item.year === auditYear) ?? simulation.years[0]!
  const ss = simulation.socialSecurityByYear.get(row.year)
  const cohort = ss?.cohorts.find((item) => item.retirementYear === retirementYear)
  const regime = scheduleChoice === 'permanent' ? 'single permanent rate' : row.year < scenario.matureSystemYear ? 'transition rate' : 'mature rate'
  const errors = reconciliationErrors(row)
  const maxError = Math.max(...Object.values(errors).map(Math.abs))
  return (
    <>
      <section className="card audit-header"><div><div className="eyebrow">{scenario.label}</div><h2>{row.year} decomposition audit</h2><p>{regime} · all values shown in nominal dollars and percent of current-year GDP</p></div><label className="year-picker">Audit year<input type="range" min={scenario.assumptions.reformYear} max={scenario.assumptions.endYear} value={row.year} onChange={(event) => setAuditYear(Number(event.target.value))} /><strong>{row.year}</strong></label></section>
      <div className="audit-grid">
        <section className="card"><div className="section-heading"><div><div className="eyebrow">Ledger 01</div><h3>Primary program spending</h3></div><span className="reconcile">Reconciled · max error {maxError.toExponential(1)}</span></div><table className="audit-table"><thead><tr><th>Component</th><th>Dollars</th><th>% GDP</th></tr></thead><tbody>{primaryAuditRows.map(([key, label]) => <tr key={key} className={key === 'totalPrimarySpending' ? 'total-row' : ''}><th>{label}</th><AuditValue value={row[key] as number} gdp={row.nominalGDP} /></tr>)}</tbody></table></section>
        <section className="card"><div className="section-heading"><div><div className="eyebrow">Ledger 02</div><h3>Financing & interest</h3></div></div><table className="audit-table"><thead><tr><th>Item</th><th>Dollars</th><th>% GDP / rate</th></tr></thead><tbody><tr><th>Revenue</th><AuditValue value={row.revenue} gdp={row.nominalGDP} /></tr><tr><th>Primary balance</th><AuditValue value={row.primaryBalance} gdp={row.nominalGDP} /></tr><tr><th>Beginning debt</th><AuditValue value={row.beginningDebt} gdp={row.nominalGDP} /></tr><tr><th>Target nominal interest rate</th><td>—</td><td>{percent(row.nominalTargetInterestRate)}</td></tr><tr><th>Effective nominal interest rate</th><td>—</td><td>{percent(row.effectiveNominalInterestRate)}</td></tr><tr><th>Net interest</th><AuditValue value={row.netInterest} gdp={row.nominalGDP} /></tr><tr className="total-row"><th>Total federal spending</th><AuditValue value={row.totalFederalSpending} gdp={row.nominalGDP} /></tr><tr><th>Overall deficit</th><AuditValue value={row.overallDeficit} gdp={row.nominalGDP} /></tr><tr><th>Ending debt</th><AuditValue value={row.endingDebt} gdp={row.nominalGDP} /></tr><tr><th>Debt / GDP</th><td>—</td><td>{percent(row.endingDebtGDP)}</td></tr></tbody></table></section>
      </div>
      <section className="card cohort-card"><div className="section-heading"><div><div className="eyebrow">Cohort inspector</div><h3>Social Security retirement cohort</h3></div><label>Retirement year <input type="number" min={row.year - 40} max={row.year} value={retirementYear} onChange={(event) => setRetirementYear(Number(event.target.value))} /></label></div>{cohort ? <div className="cohort-metrics"><div><span>Initial cohort</span><strong>{cohort.initialCohortMillions.toFixed(2)}M</strong></div><div><span>Surviving in {row.year}</span><strong>{cohort.survivingBeneficiariesMillions.toFixed(2)}M</strong></div><div><span>Survival fraction</span><strong>{percent(cohort.survivalFraction, 1)}</strong></div><div className="blend"><span>Locked benefit blend</span><strong>{percent(cohort.legacyShare, 0)} legacy / {percent(cohort.flatShare, 0)} flat</strong></div><div><span>Prefunded status</span><strong>{cohort.prefunded ? 'Flat sleeve funded' : 'PAYGO'}</strong></div><div><span>Legacy PAYGO</span><strong>{dollars(cohort.legacyPaygoBillions)}</strong></div><div><span>Flat PAYGO</span><strong>{dollars(cohort.flatPaygoBillions)}</strong></div><div><span>Total cohort SS</span><strong>{dollars(cohort.totalCohortSSSpendingBillions)}</strong></div></div> : <p>No modeled retirement cohort matches that year in the selected audit year.</p>}<div className="cohort-proof">A 2036 retiree remains 50% legacy / 50% flat in every later audit year. Only the surviving headcount changes.</div></section>
    </>
  )
}

function SourcesPanel() {
  return <><section className="card hero-card"><div><div className="eyebrow">Model & sources</div><h2>Inputs have names, provenance, and limits</h2><p>Official inputs, policy choices, modeling assumptions, and outputs remain distinct. The mortality table is period mortality; it does not claim cohort longevity improvement.</p></div></section><section className="card"><div className="conflict"><strong>Specification conflict recorded</strong><p><code>AGENTS.md</code> and <code>MODEL_SPEC.md</code> prohibit separate transition/mature rates. <code>SCENARIO_AND_TAX_SOLVERS.md</code> explicitly extends the spec and requires both. This implementation retains the permanent rate and adds the two-rate analytical comparison under the addendum’s unique handoff rule.</p></div><div className="source-list">{sources.map((source) => <article key={source.id}><span className={`source-kind ${source.kind.replace(' ', '-')}`}>{source.kind}</span><h3>{source.agency}</h3><a href={source.url} target="_blank" rel="noreferrer">{source.datasetOrReport}</a><p><strong>{source.relevantTable}</strong> · {source.publicationDate}</p><p>{source.notes}</p></article>)}</div></section></>
}

export default function App() {
  const [assumptions, setAssumptions] = useState(defaultAssumptions)
  const [tab, setTab] = useState<Tab>('results')
  const [scenarioChoice, setScenarioChoice] = useState<ScenarioChoice>(assumptions.prefundingEnabled ? 'prefunded' : 'paygo')
  const [scheduleChoice, setScheduleChoice] = useState<ScheduleChoice>('permanent')
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
    if (key === 'prefundingEnabled') setScenarioChoice(value ? 'prefunded' : 'paygo')
  }
  const apply = (overrides: Partial<ModelAssumptions>) => {
    setAssumptions((current) => ({ ...current, ...overrides }))
    if (overrides.prefundingEnabled !== undefined) {
      setScenarioChoice(overrides.prefundingEnabled ? 'prefunded' : 'paygo')
    }
  }
  const selectedScenario = comparison[scenarioChoice]

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><div className="brand-mark">ER</div><div><strong>Entitlements Reform</strong><span>Cohort fiscal simulator · 2026 reform</span></div></div><nav>{(['policy', 'results', 'audit', 'sources'] as Tab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'sources' ? 'Model & Sources' : item}</button>)}</nav><div aria-live="polite" className={`solver-status ${!calculating && comparison.paygo.permanent.converged && comparison.prefunded.permanent.converged && comparison.paygo.twoRate.converged && comparison.prefunded.twoRate.converged ? 'ok' : 'warn'}`}><span />{calculating ? 'Calculating…' : comparison.paygo.twoRate.converged && comparison.prefunded.twoRate.converged ? 'Solvers converged' : 'Check solver bounds'}</div></header>
      <main>
        {comparisonAttempt.error && <section className="card model-error"><strong>Those assumptions could not be calculated.</strong><span>{comparisonAttempt.error} Showing the last valid results.</span></section>}
        {tab === 'policy' && <PolicyPanel assumptions={assumptions} update={update} apply={apply} />}
        {tab === 'results' && <ResultsPanel comparison={comparison} referenceComparison={referenceComparison} macroBudgetChanged={macroBudgetChanged} scenarioChoice={scenarioChoice} setScenarioChoice={setScenarioChoice} scheduleChoice={scheduleChoice} setScheduleChoice={setScheduleChoice} />}
        {tab === 'audit' && <AuditPanel scenario={selectedScenario} scheduleChoice={scheduleChoice} />}
        {tab === 'sources' && <SourcesPanel />}
      </main>
      <footer><span>All calculations run client-side.</span><span>Primary spending excludes net interest.</span><span>SSA 2023 period life table · 2026 Trustees framework.</span></footer>
    </div>
  )
}
