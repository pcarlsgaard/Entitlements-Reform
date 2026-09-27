import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { exampleHouseholds, scoreExampleHousehold } from './model/householdScenario'
import type { ExampleHousehold } from './model/householdScenario'
import type { CombinedPolicy } from './model/combined'
import { scoreCombined } from './model/combined'
import { transferPrograms } from './tax/model/transfers'
import type { TransferProgramId } from './tax/model/types'

const currency = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const signed = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
function ToggleDollars({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="game-toggle"><span>Show in 2026 dollars<small className="field-hint">Removes assumed inflation from future annual amounts.</small></span>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>
}

function Field({ label, value, onChange, min = 0, max = 1_000_000, step = 1, suffix }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  return <label className="game-field"><span>{label}</span><span className="game-number"><input aria-label={label} type="number" min={min} max={max} step={step}
    value={focused ? draft : value} onFocus={() => { setDraft(String(value)); setFocused(true) }} onChange={e => setDraft(e.target.value)}
    onBlur={() => { const n = Number(draft); if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n); setFocused(false) }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />{suffix && <small>{suffix}</small>}</span></label>
}

export default function HouseholdsTab({ policy, score, year, setYear, profiles, setProfiles, selectedId, setSelectedId }: {
  policy: CombinedPolicy; score: ReturnType<typeof scoreCombined>; year: number; setYear: Dispatch<SetStateAction<number>>
  profiles: ExampleHousehold[]; setProfiles: Dispatch<SetStateAction<ExampleHousehold[]>>
  selectedId: string; setSelectedId: Dispatch<SetStateAction<string>>
}) {
  const [constantDollars, setConstantDollars] = useState(true)
  const displayFactor = constantDollars ? (1 + policy.assumptions.inflation) ** (year - 2026) : 1
  const money = (n: number) => currency(n / displayFactor)
  const change = (n: number) => signed(n / displayFactor)
  const profile = profiles.find(item => item.id === selectedId)!
  const update = (patch: Partial<ExampleHousehold>) => setProfiles(previous => previous.map(item =>
    item.id === selectedId ? { ...item, ...patch } : item))
  const snapshot = useMemo(() => scoreExampleHousehold(profile, year, policy, score.baseline, score.combined),
    [profile, year, policy, score])
  const path = useMemo(() => Array.from({ length: 70 }, (_, index) => policy.assumptions.reformYear + index)
    .map(at => scoreExampleHousehold(profile, at, policy, score.baseline, score.combined))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .filter(row => row.year === 2026 || row.year % 2 === 1 || row.year === 2095)
    .map(row => { const factor = constantDollars ? (1 + policy.assumptions.inflation) ** (row.year - 2026) : 1
      return { year: row.year, 'Cash and near-cash': Math.round(row.cashChange / factor),
        'Tax and credits': Math.round(row.taxCashChange / factor), 'Social Security': Math.round(row.socialSecurityChange / factor),
        'Replaced transfers': Math.round(row.cashTransferChange / factor) } }), [profile, policy, score, constantDollars])

  return <div className="households-tab">
    <section className="game-card"><div className="household-heading"><div><h2>Who experiences the reform?</h2><p>Choose an illustrative household and a year. Its ages and child count advance automatically; wages grow with the real GDP assumption until the selected work stop age.</p></div><span className="game-badge">Annual snapshot · {constantDollars ? '2026 dollars' : 'nominal dollars'}</span></div>
      <div className="household-presets" aria-label="Example households">{profiles.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={selectedId === item.id ? 'active' : ''} aria-pressed={selectedId === item.id}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
      <div className="household-year"><strong>Year {year}</strong><input aria-label="Household year" type="range" min="2026" max="2095" value={year} onChange={e => setYear(Number(e.target.value))} />
        <Field label="Year" value={year} min={2026} max={2095} onChange={setYear} />
      </div><div className="household-years">{[2026, 2035, 2050, 2075, 2095].map(at => <button key={at} className={year === at ? 'active' : ''} onClick={() => setYear(at)}>{at}</button>)}</div>
      <ToggleDollars checked={constantDollars} onChange={setConstantDollars} />
    </section>
    <div className="game-two-col household-content"><div className="game-column"><section className="game-card"><div className="household-heading"><h2>Household details</h2><button className="game-reset" onClick={() => { const original = exampleHouseholds.find(item => item.id === selectedId)!; update({ ...original, childAges2026: [...original.childAges2026], receives: { ...original.receives }, manualAnnualBenefits2026: { ...original.manualAnnualBenefits2026 } }) }}>Reset example</button></div>
      <label className="game-field"><span>Filing status</span><select value={profile.filingStatus} onChange={e => update({ filingStatus: e.target.value as ExampleHousehold['filingStatus'] })}><option value="single">Single</option><option value="married">Married</option></select></label>
      <Field label="First adult age in 2026" value={profile.primaryAge2026} min={18} max={105} onChange={primaryAge2026 => update({primaryAge2026})} suffix="years" />
      <Field label="First adult wages in 2026" value={profile.primaryWage2026} step={1000} onChange={primaryWage2026 => update({primaryWage2026})} suffix="$" />
      {profile.filingStatus === 'married' && <><Field label="Spouse age in 2026" value={profile.spouseAge2026} min={18} max={105} onChange={spouseAge2026 => update({spouseAge2026})} suffix="years" />
        <Field label="Spouse wages in 2026" value={profile.spouseWage2026} step={1000} onChange={spouseWage2026 => update({spouseWage2026})} suffix="$" /></>}
      <Field label="Wages stop after age" value={profile.workThroughAge} min={18} max={80} onChange={workThroughAge => update({workThroughAge})} suffix="years" />
      <Field label="Legacy SS benefit vs cohort average" value={Math.round(profile.legacyBenefitMultiplier * 100)} min={0} max={300} step={5} onChange={n => update({legacyBenefitMultiplier:n/100})} suffix="%" />
      <div className="household-children"><div className="household-heading"><strong>Children’s ages in 2026</strong><button onClick={() => update({childAges2026:[...profile.childAges2026,0]})} disabled={profile.childAges2026.length >= 4}>Add child</button></div>
        {profile.childAges2026.length === 0 && <small>No children in this example.</small>}{profile.childAges2026.map((age,index) => <div key={index} className="household-child"><Field label={`Child ${index+1} age`} value={age} min={0} max={17} onChange={n => update({childAges2026:profile.childAges2026.map((old,i) => i === index ? n : old)})} suffix="years" /><button aria-label={`Remove child ${index+1}`} onClick={() => update({childAges2026:profile.childAges2026.filter((_,i) => i !== index)})}>Remove</button></div>)}</div>
    </section><section className="game-card"><h2>Coverage and transfer receipts</h2><label className="game-field"><span>Under-65 coverage in this example</span><select value={profile.coverage} onChange={e => update({coverage:e.target.value as ExampleHousehold['coverage']})}><option value="esi">Employer coverage</option><option value="nongroup">Individual market</option><option value="uninsured">Uninsured</option><option value="public">Public coverage / no purchase credit</option></select></label>
      <Field label="Monthly shelter cost (2026 dollars)" value={profile.monthlyShelterCost2026} step={50} onChange={monthlyShelterCost2026 => update({monthlyShelterCost2026})} suffix="$" />
      <Field label="Monthly dependent care (2026 dollars)" value={profile.monthlyDependentCareExpense2026} step={50} onChange={monthlyDependentCareExpense2026 => update({monthlyDependentCareExpense2026})} suffix="$" />
      <Field label="In-kind value of government outlay" value={Math.round(profile.inKindValuationFactor * 100)} min={0} max={100} onChange={n => update({inKindValuationFactor:n/100})} suffix="%" />
      <details className="game-more" open><summary>Program participation</summary>{transferPrograms.map(program => <div key={program.id} className="household-program"><label className="game-toggle"><span>{program.shortName}{policy.taxEnabled && policy.transfers.replacedPrograms[program.id] && <small className="field-hint">Replaced by selected policy</small>}</span><input type="checkbox" checked={profile.receives[program.id]} onChange={e => update({receives:{...profile.receives,[program.id]:e.target.checked}})} /></label>
        {profile.receives[program.id] && !(['snap','schoolMeals','summerEbt'] as TransferProgramId[]).includes(program.id) && <Field label={`${program.shortName} annual amount (2026 dollars)`} value={profile.manualAnnualBenefits2026[program.id] ?? 0} step={100} onChange={n => update({manualAnnualBenefits2026:{...profile.manualAnnualBenefits2026,[program.id]:n}})} suffix="$" />}</div>)}</details>
    </section></div>
    <div className="game-column">{snapshot ? <><div className="household-headline"><article className="game-card"><span>Cash and near-cash change · {year}</span><strong className={snapshot.cashChange>=0?'good':'bad'}>{change(snapshot.cashChange)}</strong><small>Baseline {money(snapshot.currentCash)} → reform {money(snapshot.reformCash)}</small></article><article className="game-card"><span>Medicare federal payment change</span><strong>{change(snapshot.medicarePaymentChange)}</strong><small>Not household cash or insurance value</small></article></div>
      <section className="game-card"><h2>Where the annual difference comes from</h2><dl className="game-ledger"><div><dt>Income, payroll and X-tax cash change</dt><dd>{change(snapshot.taxCashChange)}</dd></div><div><dt>Replaced cash and near-cash transfers</dt><dd>{change(snapshot.cashTransferChange)}</dd></div><div><dt>Social Security paid to household</dt><dd>{change(snapshot.socialSecurityChange)}</dd></div><div className="game-total"><dt>Cash and near-cash change</dt><dd>{change(snapshot.cashChange)}</dd></div></dl>
        <p className="household-separator">Shown separately from cash</p><dl className="game-ledger"><div><dt>Gross health purchase credit</dt><dd>{money(snapshot.healthCreditGross)}</dd></div><div><dt>Lost value of in-kind transfers</dt><dd>{change(snapshot.inKindTransferChange)}</dd></div><div><dt>Medicare gross federal payment change</dt><dd>{change(snapshot.medicarePaymentChange)}</dd></div></dl><small>Health credits are potential purchase support before existing ACA subsidies or insurance premiums. Medicare figures are federal payments, not cash to the household.</small></section>
      <section className="game-card"><h2>Who receives what in {year}?</h2><p>Ages {snapshot.ages.join(' and ')}{snapshot.childAges.length ? ` · children ${snapshot.childAges.join(' and ')}` : ''} · estimated wages {money(snapshot.annualWages)} ({constantDollars ? '2026 dollars' : 'nominal dollars'})</p><div className="game-table-wrap"><table className="game-table"><thead><tr><th>Person</th><th>Current-law SS</th><th>Reform SS</th><th>Current-law Medicare</th><th>Reform Medicare</th></tr></thead><tbody>{snapshot.adults.map((adult,index) => <tr key={index}><th>Adult {index+1}, age {adult.age}</th><td>{money(adult.baselineSS)}</td><td>{money(adult.reformSS)}</td><td>{money(adult.baselineMedicare)}</td><td>{money(adult.reformMedicare)}</td></tr>)}</tbody></table></div><small>Retired-worker payments use each model cohort’s average legacy benefit, multiplied by the selected benefit factor; the flat floor is uniform. Spousal and survivor benefits are not modeled.</small></section>
      {snapshot.programs.some(row => row.receives && row.annualGovernmentBenefit > 0) && <section className="game-card"><h2>Current program benefits</h2><dl className="game-ledger">{snapshot.programs.filter(row => row.receives && row.annualGovernmentBenefit > 0).map(row => <div key={row.program.id}><dt>{row.program.shortName}{policy.taxEnabled && policy.transfers.replacedPrograms[row.program.id] ? ' · replaced' : ''}</dt><dd>{money(row.annualGovernmentBenefit * (1+policy.assumptions.inflation)**(year-2026))}</dd></div>)}</dl><small>SNAP and meal estimates reuse the source tax app’s simplified FY2025 rules. Manual benefits are example amounts; public eligibility is not inferred for those programs.</small></section>}</> : <section className="game-card"><h2>This example is beyond the modeled age range</h2><p>At least one adult would be older than {policy.assumptions.maxModeledAge} in {year}. Choose another household or an earlier year.</p></section>}</div></div>
    <section className="game-card game-chart"><div className="game-chart-heading"><div><h2>How this example changes over time</h2><p>Annual cash and near-cash difference against current law, with tax, transfer, and Social Security components. The curve ends at modeled age {policy.assumptions.maxModeledAge}.</p></div><span>{constantDollars ? '2026 dollars' : 'Nominal dollars'} / year</span></div><div className="game-chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={path} margin={{top:10,right:20,left:5,bottom:0}}><CartesianGrid stroke="#e7ecf1" vertical={false} /><XAxis dataKey="year" tick={{fontSize:11}} /><YAxis width={85} tick={{fontSize:11}} tickFormatter={n => `$${Math.round(n/1000)}k`} /><Tooltip formatter={n => currency(Number(n))} /><Legend /><Line type="linear" dataKey="Cash and near-cash" stroke="#168565" strokeWidth={3} dot={false} /><Line type="linear" dataKey="Tax and credits" stroke="#477fb8" dot={false} /><Line type="linear" dataKey="Social Security" stroke="#c58a3d" dot={false} /><Line type="linear" dataKey="Replaced transfers" stroke="#ac6880" dot={false} /></LineChart></ResponsiveContainer></div></section>
    <p className="game-caveat">These are illustrative annual snapshots, not a lifetime welfare score. The copied 2025 tax and transfer rules are held fixed in 2026-dollar terms; wages grow with assumed real GDP. The display can remove the assumed inflation from future nominal values. The calculation does not model Social Security taxation, nonwage income, insurance premiums or employer health benefits, existing ACA subsidies by household, mortality, spousal/survivor benefits, behavior, or the household incidence of prefunding contributions. Some transfer participation and amounts are illustrative rather than eligibility determinations. Aggregate dynamic GDP effects are not assigned to individual households.</p>
  </div>
}
