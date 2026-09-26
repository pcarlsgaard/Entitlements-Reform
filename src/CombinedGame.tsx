import { useDeferredValue, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { defaultCombinedPolicy, scoreCombined } from './model/combined'
import type { CombinedPolicy } from './model/combined'
import './combined.css'

const percent = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`
const pp = (fraction: number) => `${fraction < 0 ? '−' : '+'}${Math.abs(fraction * 100).toFixed(2)} pp`
const money = (billions: number) => Math.abs(billions) > 1e9 ? 'Debt spiral' :
  `${billions < 0 ? '−' : '+'}$${Math.abs(billions / 1_000).toFixed(2)}T`
const debt = (ratio: number) => ratio > 10 ? '>1,000%' : percent(ratio, 0)
const chartDebt = (ratio: number) => Math.max(-100, Math.min(1_000, ratio * 100))

function NumberControl({ label, value, unit, min = 0, max, step = 1, onCommit }: {
  label: string; value: number; unit?: string; min?: number; max?: number; step?: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() && Number.isFinite(parsed) && parsed >= min && (max === undefined || parsed <= max)) {
      onCommit(parsed)
    } else setDraft(String(value))
    setEditing(false)
  }
  return <label className="game-field"><span>{label}</span><span className="game-number">
    <input aria-label={label} type="number" min={min} max={max} step={step}
      value={editing ? draft : value} onFocus={() => { setEditing(true); setDraft(String(value)) }}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    {unit && <small>{unit}</small>}
  </span></label>
}

export default function CombinedGame() {
  const [policy, setPolicy] = useState<CombinedPolicy>(defaultCombinedPolicy)
  const deferred = useDeferredValue(policy)
  const score = useMemo(() => scoreCombined(deferred), [deferred])
  const setTax = (patch: Partial<CombinedPolicy['tax']>) => setPolicy((p) => ({ ...p, tax: { ...p.tax, ...patch } }))
  const setBenefits = (patch: Partial<CombinedPolicy['benefits']>) => setPolicy((p) => ({ ...p, benefits: { ...p.benefits, ...patch } }))
  const setAssumptions = (patch: Partial<CombinedPolicy['assumptions']>) => setPolicy((p) => ({ ...p, assumptions: { ...p.assumptions, ...patch } }))
  const [decade, horizon] = score.periods as [typeof score.periods[number], typeof score.periods[number]]
  const chart = score.combined.years.filter((row) => row.year === 2026 || row.year % 5 === 0 || row.year === 2095)
    .map((row) => {
      const index = row.year - 2026
      return { year: row.year,
        'Current law': chartDebt(score.baseline.years[index]!.endingDebtGDP),
        'Tax only': chartDebt(score.taxOnly.years[index]!.endingDebtGDP),
        'Benefits only': chartDebt(score.benefitsOnly.years[index]!.endingDebtGDP),
        'Combined': chartDebt(row.endingDebtGDP),
      }
    })
  const preset = (choice: 'baseline' | 'tax' | 'benefits' | 'both') => setPolicy((p) => ({
    ...p,
    taxEnabled: choice === 'tax' || choice === 'both',
    benefits: {
      socialSecurityReform: choice === 'benefits' || choice === 'both',
      medicareReform: choice === 'benefits' || choice === 'both',
    },
  }))

  return <div className="game">
    <div className="game-title"><div><div className="eyebrow">Federal policy sandbox</div><h1>Build a fiscal future</h1>
      <p>Choose taxes and old-age benefits together. Scores update against {policy.baselineMode} current-law benefits.</p></div>
      <span className="game-badge">2026–2095 · static tax share</span></div>
    <div className="game-presets" aria-label="Scenario presets">
      <button onClick={() => preset('baseline')}>Current law</button><button onClick={() => preset('tax')}>Tax only</button>
      <button onClick={() => preset('benefits')}>Benefits only</button><button onClick={() => preset('both')}>Both reforms</button>
    </div>
    <div className="game-layout">
      <div className="game-controls">
        <section className="game-card"><h2>1 · Tax and credits</h2>
          <label className="game-toggle"><span>Apply X tax</span><input type="checkbox" checked={policy.taxEnabled} onChange={(e) => setPolicy((p) => ({ ...p, taxEnabled: e.target.checked }))} /></label>
          <fieldset disabled={!policy.taxEnabled}>
            <label className="game-field"><span>Wage schedule</span><select value={policy.tax.wageTaxMode} onChange={(e) => setTax({ wageTaxMode: e.target.value as 'flat' | 'progressive' })}><option value="progressive">Progressive</option><option value="flat">Flat</option></select></label>
            <NumberControl label="Business / top rate" value={policy.tax.rate * 100} unit="%" max={60} step={0.5} onCommit={(n) => setTax({ rate: n / 100 })} />
            {policy.tax.wageTaxMode === 'progressive' && <>
              <NumberControl label="Middle wage rate" value={policy.tax.progressiveMiddleRate * 100} unit="%" max={policy.tax.rate * 100} step={0.5} onCommit={(n) => setTax({ progressiveMiddleRate: n / 100 })} />
              <NumberControl label="Middle bracket starts" value={policy.tax.progressiveZeroBracketPerAdult} unit="$/adult" max={100_000} step={1000} onCommit={(n) => setTax({ progressiveZeroBracketPerAdult: n })} />
              <NumberControl label="Top bracket starts" value={policy.tax.progressiveTopBracketPerAdult} unit="$/adult" min={policy.tax.progressiveZeroBracketPerAdult} max={1_000_000} step={5000} onCommit={(n) => setTax({ progressiveTopBracketPerAdult: n })} />
            </>}
            <NumberControl label="Child credit" value={policy.tax.childCredit} unit="$/child" max={25_000} step={500} onCommit={(n) => setTax({ childCredit: n })} />
            <NumberControl label="Adult credit" value={policy.tax.adultCredit} unit="$/adult" max={15_000} step={500} onCommit={(n) => setTax({ adultCredit: n })} />
            <NumberControl label="Noncompliance" value={policy.tax.noncomplianceRate * 100} unit="%" max={50} step={0.5} onCommit={(n) => setTax({ noncomplianceRate: n / 100 })} />
            <NumberControl label="Insurance credits, total" value={policy.insuranceCreditCostBillions2025} unit="$B" max={2_000} step={25} onCommit={(n) => setPolicy((p) => ({ ...p, insuranceCreditCostBillions2025: n }))} />
          </fieldset>
          <details className="game-more"><summary>Which taxes are replaced?</summary>{(['individualIncome', 'payroll', 'corporateIncome', 'customs'] as const).map((key) => <label key={key} className="game-toggle"><span>{({ individualIncome: 'Individual income', payroll: 'Payroll', corporateIncome: 'Corporate income', customs: 'Customs' })[key]}</span><input type="checkbox" checked={policy.tax.replacedTaxes[key]} onChange={(e) => setTax({ replacedTaxes: { ...policy.tax.replacedTaxes, [key]: e.target.checked } })} /></label>)}</details>
        </section>
        <section className="game-card"><h2>2 · Old-age benefits</h2>
          <label className="game-toggle"><span>Reform Social Security</span><input type="checkbox" checked={policy.benefits.socialSecurityReform} onChange={(e) => setBenefits({ socialSecurityReform: e.target.checked })} /></label>
          <fieldset disabled={!policy.benefits.socialSecurityReform}>
            <NumberControl label="Flat benefit floor" value={policy.assumptions.flatBenefitFPLMultiple * 100} unit="% of FPL" max={300} step={5} onCommit={(n) => setAssumptions({ flatBenefitFPLMultiple: n / 100 })} />
            <NumberControl label="Cohort phase-in" value={policy.assumptions.benefitPhaseInYears} unit="years" min={1} max={60} onCommit={(n) => setAssumptions({ benefitPhaseInYears: n })} />
          </fieldset>
          <label className="game-toggle"><span>Reform Medicare</span><input type="checkbox" checked={policy.benefits.medicareReform} onChange={(e) => setBenefits({ medicareReform: e.target.checked })} /></label>
          <fieldset disabled={!policy.benefits.medicareReform}>
            <NumberControl label="Annual premium support" value={policy.assumptions.premiumSupport2026} unit="$ / person" max={50_000} step={500} onCommit={(n) => setAssumptions({ premiumSupport2026: n })} />
            <NumberControl label="All seniors converted by" value={policy.assumptions.medicareYearB} min={policy.assumptions.medicareYearA} max={2100} onCommit={(n) => setAssumptions({ medicareYearB: n })} />
          </fieldset>
          <label className="game-field"><span>Current-law comparator</span><select value={policy.baselineMode} onChange={(e) => setPolicy((p) => ({ ...p, baselineMode: e.target.value as CombinedPolicy['baselineMode'] }))}><option value="scheduled">Scheduled</option><option value="payable">Trust-fund payable</option></select></label>
        </section>
      </div>
      <div className="game-results" aria-live="polite">
        <section className="game-card game-goal"><div><span>Challenge · stabilize debt by 2095, keep its peak under 150% of GDP</span><strong>{score.additionalFiscalAdjustmentGDP > 0.00001 ? `${(score.additionalFiscalAdjustmentGDP * 100).toFixed(2)} pp GDP still needed each year` : `Goal met · ${Math.abs(score.additionalFiscalAdjustmentGDP * 100).toFixed(2)} pp GDP headroom`}</strong></div><small>Permanent additional revenue or equivalent spending cuts from 2026; headroom means the fiscal policy can be relaxed by that amount and still meet the goal.</small></section>
        <div className="game-score-grid">
          <article className="game-card game-score"><span>2026–2035 fiscal improvement</span><strong className={decade.fiscalImprovementBillions >= 0 ? 'good' : 'bad'}>{money(decade.fiscalImprovementBillions)}</strong><small>Nominal sum versus {policy.baselineMode} current law</small></article>
          <article className="game-card game-score"><span>2035 debt / GDP</span><strong>{debt(decade.terminalDebtGDP)}</strong><small>Current law {debt(decade.baselineTerminalDebtGDP)}</small></article>
          <article className="game-card game-score"><span>2095 debt / GDP</span><strong>{debt(horizon.terminalDebtGDP)}</strong><small>Current law {debt(horizon.baselineTerminalDebtGDP)}</small></article>
          <article className="game-card game-score"><span>70-year fiscal improvement</span><strong className={horizon.fiscalImprovementGDP >= 0 ? 'good' : 'bad'}>{pp(horizon.fiscalImprovementGDP)}</strong><small>Annual GDP-weighted average; includes interest</small></article>
        </div>
        <section className="game-card game-chart"><div className="game-chart-heading"><div><h2>Debt held by the public</h2><p>Four paths share the same 2026 debt, GDP, and spending baseline.</p></div><span>Percent of GDP</span></div>
          <div className="game-chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 10, right: 24, left: 2, bottom: 0 }}><CartesianGrid stroke="#e7ecf1" vertical={false} /><XAxis dataKey="year" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={60} tickFormatter={(n: number) => `${n}%`} /><Tooltip formatter={(n) => `${Number(n).toFixed(1)}%`} /><Legend />
            <Line type="monotone" dataKey="Current law" stroke="#8897a9" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Tax only" stroke="#4e80bf" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Benefits only" stroke="#bc8a39" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Combined" stroke="#17795d" strokeWidth={3} dot={false} />
          </LineChart></ResponsiveContainer></div>
        </section>
        <div className="game-detail-grid">
          <section className="game-card"><h2>Fiscal bridge · 2026</h2><dl className="game-ledger">
            <div><dt>Current-law federal receipts</dt><dd>{percent(score.baseline.years[0]!.revenueRate, 2)} GDP</dd></div>
            <div><dt>Tax receipts after credits − replaced receipts</dt><dd>{pp(score.netTaxRevenueChangeGDP)}</dd></div>
            <div><dt>Refundable credit outlay savings</dt><dd>{pp(score.outlaySavingsGDP)}</dd></div>
            <div className="game-total"><dt>Opening fiscal improvement</dt><dd>{pp(score.openingFiscalImprovementGDP)}</dd></div>
          </dl><small>2025 tax score is held fixed as a GDP share in 2026–2095. The 2025 and 2026 baselines have different source years.</small></section>
          <section className="game-card"><h2>People · illustrative</h2><p>Annual household cash change from the tax schedule alone, including assumed employer payroll-tax pass-through.</p><dl className="game-ledger">{score.household.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.difference >= 0 ? 'good' : 'bad'}>{item.difference < 0 ? '−' : '+'}${Math.abs(item.difference).toLocaleString('en-US', { maximumFractionDigits: 0 })}</dd></div>)}
            {policy.benefits.socialSecurityReform && <div><dt>Fully reformed SS cohort floor (2026 dollars)</dt><dd>${(policy.assumptions.flatBenefitFPLMultiple * policy.assumptions.individualFPL2026).toLocaleString()}</dd></div>}
            {policy.benefits.medicareReform && <div><dt>Medicare support / senior (2026 dollars)</dt><dd>${policy.assumptions.premiumSupport2026.toLocaleString()}</dd></div>}
          </dl><small>Benefit figures are payment amounts, not household welfare or insurance value. The wage examples exclude premiums, lifetime benefits, prices, and behavioral responses. No aggregate welfare score is estimated.</small></section>
        </div>
        <p className="game-caveat">The 70-year extension holds the tax score constant as a GDP share, keeps the market interest-rate target independent of debt, and extends CBO category shares beyond their published window. Chart lines are capped at 1,000% of GDP when debt spirals. Treat long-run differences as scenarios, not forecasts. Financing here is PAYGO; the separate Results view retains the prefunding experiments.</p>
      </div>
    </div>
  </div>
}
