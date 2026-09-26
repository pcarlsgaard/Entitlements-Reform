import { useDeferredValue, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { defaultCombinedPolicy, scoreCombined } from './model/combined'
import type { CombinedPolicy } from './model/combined'
import { defaultAssumptions } from './model/defaults'
import { transferPrograms } from './tax/model/transfers'
import type { ReformSettings } from './tax/model/types'
import type { HealthPolicySettings } from './tax/model/health'
import type { ModelAssumptions } from './model/types'
import './combined.css'

type Tab = 'economic' | 'tax' | 'entitlements' | 'results'
const tabs: { id: Tab; label: string }[] = [
  { id: 'economic', label: 'Economic assumptions' }, { id: 'tax', label: 'Tax reform' },
  { id: 'entitlements', label: 'Entitlement reform' }, { id: 'results', label: 'Detailed results' },
]
const pct = (n: number, digits = 1) => Number.isFinite(n) && Math.abs(n) < 100 ? `${(n * 100).toFixed(digits)}%` : '>10,000%'
const pp = (n: number) => !Number.isFinite(n) ? 'unstable' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(2)} pp`
const dollars = (n: number) => !Number.isFinite(n) ? 'Debt spiral' : `${n < 0 ? '−' : '+'}$${Math.abs(n / 1000).toFixed(2)}T`
const ratio = (n: number) => !Number.isFinite(n) ? 'unstable' : n > 10 ? '>1,000%' : pct(n, 0)
const safe = (n: number) => Number.isFinite(n) ? Math.max(-100, Math.min(1000, n * 100)) : 1000

function NumberField({ label, value, onChange, min = 0, max, step = 1, suffix, note }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string; note?: string
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const commit = () => {
    const n = Number(draft)
    if (draft.trim() && Number.isFinite(n) && n >= min && (max === undefined || n <= max)) onChange(n)
    setFocused(false)
  }
  return <label className="game-field"><span>{label}{note && <small className="field-hint">{note}</small>}</span>
    <span className="game-number"><input aria-label={label} type="number" min={min} max={max} step={step}
      value={focused ? draft : value} onFocus={() => { setDraft(String(value)); setFocused(true) }}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />{suffix && <small>{suffix}</small>}</span></label>
}
function Toggle({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: (v: boolean) => void; note?: string }) {
  return <label className="game-toggle"><span>{label}{note && <small className="field-hint">{note}</small>}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <label className="game-field"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select></label>
}
function Chart({ title, data, lines, stacked = false, note, unit = '% of GDP' }: { title: string; data: Record<string, number>[]; lines: { key: string; color: string }[]; stacked?: boolean; note?: string; unit?: string }) {
  const Graph = stacked ? ComposedChart : LineChart
  return <section className="game-card game-chart"><div className="game-chart-heading"><div><h2>{title}</h2>{note && <p>{note}</p>}</div><span>{unit}</span></div>
    <div className="game-chart-area"><ResponsiveContainer width="100%" height="100%"><Graph data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7ecf1" vertical={false} /><XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={n => `${n}%`} /><Tooltip formatter={n => `${Number(n).toFixed(1)}%`} /><Legend />
      {lines.map(({ key, color }) => stacked ? <Area key={key} type="monotone" dataKey={key} stackId="total" fill={color} fillOpacity={.8} stroke={color} dot={false} /> : <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={key === 'Combined' ? 3 : 2} dot={false} />)}
    </Graph></ResponsiveContainer></div></section>
}

export default function CombinedGame() {
  const [tab, setTab] = useState<Tab>('economic')
  const [policy, setPolicy] = useState<CombinedPolicy>(defaultCombinedPolicy)
  const deferred = useDeferredValue(policy)
  const score = useMemo(() => scoreCombined(deferred), [deferred])
  const setTax = (patch: Partial<ReformSettings>) => setPolicy(p => ({ ...p, tax: { ...p.tax, ...patch } }))
  const setHealth = (patch: Partial<HealthPolicySettings>) => setPolicy(p => ({ ...p, health: { ...p.health, ...patch } }))
  const setA = (patch: Partial<ModelAssumptions>) => setPolicy(p => ({ ...p, assumptions: { ...p.assumptions, ...patch } }))
  const setBenefits = (patch: Partial<CombinedPolicy['benefits']>) => setPolicy(p => ({ ...p, benefits: { ...p.benefits, ...patch } }))
  const a = policy.assumptions, t = policy.tax, h = policy.health
  const numA = (key: keyof ModelAssumptions, label: string, multiplier = 1, min = 0, max?: number, step = 0.1, suffix?: string, note?: string) =>
    <NumberField key={key} label={label} value={Math.round(Number(a[key]) * multiplier * 1000) / 1000} onChange={n => setA({ [key]: n / multiplier })} min={min} max={max} step={step} suffix={suffix} note={note} />
  const numT = (key: keyof ReformSettings, label: string, multiplier = 1, min = 0, max?: number, step = 1, suffix?: string) =>
    <NumberField key={key} label={label} value={Math.round(Number(t[key] ?? 0) * multiplier * 1000) / 1000} onChange={n => setTax({ [key]: n / multiplier })} min={min} max={max} step={step} suffix={suffix} />
  const numH = (key: keyof HealthPolicySettings, label: string, multiplier = 1, min = 0, max?: number, step = 1, suffix?: string) =>
    <NumberField key={key} label={label} value={Math.round(Number(h[key]) * multiplier * 1000) / 1000} onChange={n => setHealth({ [key]: n / multiplier })} min={min} max={max} step={step} suffix={suffix} />
  const [decade, horizon] = score.periods as [typeof score.periods[number], typeof score.periods[number]]
  const sampled = score.combined.years.filter(row => row.year === 2026 || row.year % 5 === 0 || row.year === 2095)
  const graph = sampled.map(row => {
    const index = row.year - a.reformYear, b = score.baseline.years[index]!, tx = score.taxOnly.years[index]!, en = score.benefitsOnly.years[index]!
    const gdp = row.nominalGDP
    return { year: row.year, 'Current law': safe(b.endingDebtGDP), 'Tax only': safe(tx.endingDebtGDP), 'Benefits only': safe(en.endingDebtGDP), 'Combined': safe(row.endingDebtGDP),
      Receipts: row.revenue / gdp * 100, 'Primary spending': row.totalPrimarySpending / gdp * 100, Interest: row.netInterest / gdp * 100,
      'Social Security': (row.legacySocialSecurity + row.flatSocialSecurityPaygo + row.otherOASDI) / gdp * 100,
      Medicare: (row.legacySeniorMedicare + row.premiumSupportPaygo + row.under65Medicare) / gdp * 100,
      'Other mandatory': (row.medicaidChipMarketplace + row.otherMandatory) / gdp * 100,
      Discretionary: (row.defenseDiscretionary + row.nonDefenseDiscretionary) / gdp * 100,
      Prefunding: row.newCohortPrefunding / gdp * 100,
      'Legacy SS': row.legacySocialSecurity / gdp * 100, 'Flat SS': row.flatSocialSecurityPaygo / gdp * 100,
      'Legacy Medicare': row.legacySeniorMedicare / gdp * 100, 'Premium support': row.premiumSupportPaygo / gdp * 100,
      'Effective rate': row.effectiveNominalInterestRate * 100, 'Market rate': row.nominalTargetInterestRate * 100,
      'SS deposits': row.socialSecurityPrefunding / gdp * 100, 'Medicare deposits': row.medicarePrefunding / gdp * 100, 'Avoided SS PAYGO': row.avoidedSocialSecurityPaygo / gdp * 100,
      'Baseline SS': b.legacySocialSecurity / gdp * 100, 'Baseline Medicare': b.legacySeniorMedicare / gdp * 100,
    }
  })
  const baselinePreset = (choice: 'baseline'|'tax'|'benefits'|'both') => setPolicy(p => ({ ...p,
    taxEnabled: choice === 'tax' || choice === 'both',
    benefits: { socialSecurityReform: choice === 'benefits' || choice === 'both', medicareReform: choice === 'benefits' || choice === 'both' },
  }))
  const fundingAllowed = policy.benefits.socialSecurityReform && policy.benefits.medicareReform && a.socialSecurityBenefitCap2026 === null

  return <div className="game app-shell">
    <header className="game-sticky"><div className="game-brand"><span className="eyebrow">Federal policy sandbox · 2026–2095</span><strong>Build a fiscal future</strong></div>
      <div className="game-header-score" aria-live="polite"><div><small>10-year fiscal improvement</small><strong className={decade.fiscalImprovementBillions >= 0 ? 'good' : 'bad'}>{dollars(decade.fiscalImprovementBillions)}</strong></div><div><small>2095 debt / GDP</small><strong>{ratio(horizon.terminalDebtGDP)}</strong></div><div><small>70-year fiscal improvement</small><strong>{pp(horizon.fiscalImprovementGDP)}</strong></div></div></header>
    <main className="game-main"><div className="game-title"><div><h1>Design a fiscal scenario</h1><p>Set assumptions and policy, then compare the decade and the 70-year path against the same current-law economy.</p></div><button className="game-reset" onClick={() => setPolicy(defaultCombinedPolicy)}>Reset scenario</button></div>
      <nav className="game-tabs" aria-label="Simulator tabs">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <div className="game-presets" aria-label="Scenario presets"><span>Quick scenarios</span>{(['baseline','tax','benefits','both'] as const).map((choice, i) => <button key={choice} onClick={() => baselinePreset(choice)}>{['Current law', 'Tax only', 'Benefits only', 'Both reforms'][i]}</button>)}</div>
      {tab === 'economic' && <div className="game-two-col">
        <section className="game-card"><h2>Growth and demographics</h2><p>Economic paths apply to both the scenario and its current-law comparator. Move a lever to see its full fiscal effect.</p>
          {numA('realGDPGrowth','Real GDP growth',100,-2,6,.1,'%')}{numA('inflation','Inflation',100,0,8,.1,'%')}{numA('cohortSizeGrowth','Cohort growth',100,-2,4,.1,'%')}
          {numA('currentLawSSBenefitRealGrowth','Legacy Social Security benefit growth',100,-1,5,.1,'%')}{numA('legacyMedicareRealGrowth','Real Medicare benefit growth',100,-2,8,.1,'%', 'Per enrollee, above inflation. A key long-run cost driver.')}
          {numA('nonDefenseDiscretionaryRealGrowth','Real nondefense discretionary growth',100,-2,8,.1,'%')}</section>
        <div className="game-column"><section className="game-card"><h2>Interest and debt</h2>
          {numA('baselineRealMarketRate','Real market interest rate',100,0,10,.1,'%')}{numA('debtSensitivity','Debt premium sensitivity',100,0,2,.1,'%')}{numA('debtRatePassThrough','Debt refinancing pass-through',100,0,100,1,'%')}
          {numA('policyHorizonDebtTargetGDP','2095 debt target',100,0,300,1,'% GDP')}{numA('peakDebtCeilingGDP','Peak debt ceiling',100,20,500,1,'% GDP')}</section>
          <section className="game-card"><h2>Source and interpretation</h2><p>Federal budget anchors and published category projections use the <a href="https://www.cbo.gov/publication/62105" target="_blank" rel="noreferrer">CBO Budget and Economic Outlook (2026–2036)</a>. The Medicare enrollee anchor uses the Medicare Trustees report. The editable 1.8% real GDP growth and 1.5% real Medicare cost growth are stylized continuation assumptions, not quoted CBO forecasts.</p><p>CBO category shares are extended beyond their published window. A static 2025 tax score is carried forward as a share of GDP. Long-run results are conditional scenarios.</p></section></div>
      </div>}
      {tab === 'tax' && <div className="game-two-col">
        <div className="game-column"><section className="game-card"><h2>Consumption tax and wage schedule</h2><Toggle label="Apply X tax" checked={policy.taxEnabled} onChange={v => setPolicy(p => ({ ...p, taxEnabled: v }))} />
          <fieldset disabled={!policy.taxEnabled}><Select label="Wage tax schedule" value={t.wageTaxMode} options={[{value:'progressive',label:'Progressive'},{value:'flat',label:'Flat'}]} onChange={v => setTax({ wageTaxMode: v as ReformSettings['wageTaxMode'] })} />
          {numT('rate','Business and top wage rate',100,0,70,.5,'%')}{t.wageTaxMode === 'progressive' && <>
            {numT('progressiveZeroBracketPerAdult','Middle bracket starts / adult',1,0,250000,1000,'$')}{numT('progressiveMiddleRate','Middle wage rate',100,0,70,.5,'%')}
            <Toggle label="Use intermediate bracket" checked={t.progressiveIntermediateStartPerAdult !== null} onChange={v => setTax({ progressiveIntermediateStartPerAdult: v ? 75000 : null })} />
            {t.progressiveIntermediateStartPerAdult !== null && <><NumberField label="Intermediate bracket starts / adult" value={t.progressiveIntermediateStartPerAdult} min={t.progressiveZeroBracketPerAdult} max={t.progressiveTopBracketPerAdult} step={1000} suffix="$" onChange={n => setTax({progressiveIntermediateStartPerAdult:n})} />{numT('progressiveIntermediateRate','Intermediate rate',100,0,70,.5,'%')}</>}
            {numT('progressiveTopBracketPerAdult','Top bracket starts / adult',1,t.progressiveIntermediateStartPerAdult ?? t.progressiveZeroBracketPerAdult,1000000,5000,'$')}
          </>}{numT('noncomplianceRate','Noncompliance',100,0,70,.5,'%')}{numT('exemptionShare','Broad exemption',100,0,95,1,'%')}
          <details className="game-more"><summary>Compensation exemptions</summary>{(['cashWageExemptionShare','employerSocialInsuranceExemptionShare','employerHealthInsuranceExemptionShare','employerPensionOtherInsuranceExemptionShare'] as const).map((key,i) => numT(key,(['Cash wages','Employer social insurance','Employer health insurance','Employer pensions / other insurance'][i] ?? 'Compensation'),100,0,100,1,'%'))}</details></fieldset></section>
        <section className="game-card"><h2>Credits</h2><fieldset disabled={!policy.taxEnabled}>
          <Select label="Adult credit eligibility" value={t.adultCreditMode} options={[{value:'earned',label:'Earned'},{value:'universal',label:'Universal'}]} onChange={v => setTax({adultCreditMode:v as ReformSettings['adultCreditMode']})} />
          {numT('adultCredit','Adult credit',1,0,30000,100,'$')}{t.adultCreditMode === 'earned' && <><Select label="Earnings base" value={t.adultCreditEarningsBase ?? 'cash'} options={[{value:'cash',label:'Cash wages'},{value:'compensation',label:'Compensation'}]} onChange={v => setTax({adultCreditEarningsBase:v as 'cash'|'compensation'})} />{numT('adultCreditPhaseInRate','Adult credit phase-in',100,0,100,1,'%')}{numT('adultCreditPhaseOutStartPerAdult','Adult phase-out starts / adult',1,0,500000,1000,'$')}{numT('adultCreditPhaseOutRate','Adult phase-out rate',100,0,100,1,'%')}{numT('adultCreditTakeUpRate','Adult credit take-up',100,0,100,1,'%')}</>}
          {numT('childCredit','Child credit',1,0,30000,100,'$')}{numT('under6ChildCredit','Additional under-six credit',1,0,30000,100,'$')}{numT('childCreditBaselineRefundableShare','Child credit refundable share',100,0,100,1,'%')}{numT('childCreditPhaseInRate','Child credit phase-in',100,0,100,1,'%')}</fieldset></section></div>
        <div className="game-column"><section className="game-card"><h2>Health coverage credits</h2><fieldset disabled={!policy.taxEnabled}>
          {numH('adultHealthCredit','Adult health credit',1,0,20000,100,'$')}{numH('childHealthCredit','Child health credit',1,0,20000,100,'$')}{numH('uninsuredTakeUpRate','Uninsured take-up',100,0,100,1,'%')}
          <Toggle label="Replace ACA premium tax credits" checked={Boolean(h.replaceAcaAptc)} onChange={v=>setHealth({replaceAcaAptc:v})} />
          <details className="game-more"><summary>Health incidence assumptions</summary>{numH('employerHealthPassThroughRate','Employer health pass-through',100,0,100,1,'%')}{numH('employerFicaPassThroughRate','Employer FICA pass-through',100,0,100,1,'%')}{numH('employeePremiumPreTaxShare','Pre-tax employee premiums',100,0,100,1,'%')}{numH('benchmarkPremiumScale','Benchmark premium scale',100,0,300,1,'%')}
            <Select label="Employer pool redistribution" value={h.redistributionRule} options={[{value:'nationalEqual',label:'National equal'},{value:'employerCellEqual',label:'Employer cell equal'},{value:'ownContribution',label:'Own contribution'}]} onChange={v=>setHealth({redistributionRule:v as HealthPolicySettings['redistributionRule']})} />
            <Select label="Credit recipients" value={h.recipientScope} options={[{value:'policyholders',label:'Policyholders'},{value:'coveredWorkers',label:'Covered workers'}]} onChange={v=>setHealth({recipientScope:v as HealthPolicySettings['recipientScope']})} /></details></fieldset></section>
          <section className="game-card"><h2>Replace federal transfers</h2><p>These program outlays enter the fiscal ledger separately from tax receipts.</p><fieldset disabled={!policy.taxEnabled}>{transferPrograms.map(program => <Toggle key={program.id} label={`${program.shortName} · $${program.federalFiscalAmountBillions.toFixed(1)}B`} checked={policy.transfers.replacedPrograms[program.id]} onChange={v=>setPolicy(p=>({...p,transfers:{replacedPrograms:{...p.transfers.replacedPrograms,[program.id]:v}}}))} />)}</fieldset></section>
          <section className="game-card"><h2>Taxes replaced</h2><fieldset disabled={!policy.taxEnabled}>{(['individualIncome','payroll','corporateIncome','customs'] as const).map((key,i)=><Toggle key={key} label={(['Individual income','Payroll','Corporate income','Customs'][i] ?? key)} checked={t.replacedTaxes[key]} onChange={v=>setTax({replacedTaxes:{...t.replacedTaxes,[key]:v}})} />)}</fieldset></section>
          <section className="game-card"><h2>Opening tax ledger · 2025 basis</h2><dl className="game-ledger"><div><dt>Gross X tax receipts</dt><dd>${score.tax.grossRevenue.toFixed(0)}B</dd></div><div><dt>Adult and child tax credits</dt><dd>−${(score.tax.adultCreditCost+score.tax.childCreditCost).toFixed(0)}B</dd></div><div><dt>Health credits</dt><dd>−${score.health.totalHealthCreditCostBillions.toFixed(0)}B</dd></div><div><dt>Replaced receipts</dt><dd>−${score.tax.targetRevenue.toFixed(0)}B</dd></div><div><dt>Transfers and ACA credit savings</dt><dd>+${score.tax.federalTransferSavings.toFixed(0)}B</dd></div><div><dt>Refundable tax credit outlay savings</dt><dd>+${score.tax.refundableTaxCreditOutlaySavings.toFixed(0)}B</dd></div><div className="game-total"><dt>Net fiscal improvement if enabled</dt><dd>{dollars(score.tax.deficitReduction)}</dd></div></dl><small>Tax receipts and outlay savings occupy separate federal budget lines. The tax score is held fixed as a GDP share.</small></section>
        </div></div>}
      {tab === 'entitlements' && <div className="game-two-col"><div className="game-column"><section className="game-card"><h2>Social Security</h2><Toggle label="Reform Social Security" checked={policy.benefits.socialSecurityReform} onChange={v=>setBenefits({socialSecurityReform:v})} /><fieldset disabled={!policy.benefits.socialSecurityReform}>
        {numA('flatBenefitFPLMultiple','Flat benefit floor',100,0,400,5,'% FPL')}{numA('benefitPhaseInYears','Cohort transition',1,1,70,1,'years')}{numA('fullRetirementAge','Retirement age',1,62,80,1,'years',`Current-law comparator uses age ${defaultAssumptions.fullRetirementAge} in this model.`)}
        <Toggle label="Cap annual retired-worker benefits" checked={a.socialSecurityBenefitCap2026 !== null} onChange={v=>setA({socialSecurityBenefitCap2026:v?36000:null,fundingStrategy:'paygo'})} />{a.socialSecurityBenefitCap2026 !== null && <NumberField label="Annual cap (2026 dollars)" value={a.socialSecurityBenefitCap2026} min={1000} max={200000} step={1000} suffix="$" onChange={n=>setA({socialSecurityBenefitCap2026:n})} />}
        {numA('realFPLGrowth','Real flat benefit growth',100,-2,6,.1,'%')}</fieldset><small>The cap applies to each reformed cohort’s total retired-worker benefit after legacy calibration. It rises with inflation; prefunding is unavailable with a cap.</small></section>
        <section className="game-card"><h2>Medicare</h2><Toggle label="Reform Medicare" checked={policy.benefits.medicareReform} onChange={v=>setBenefits({medicareReform:v})} /><fieldset disabled={!policy.benefits.medicareReform}>
          {numA('premiumSupport2026','Premium support / senior',1,0,60000,500,'$')}{numA('premiumSupportRealGrowth','Real support growth',100,-2,8,.1,'%')}{numA('medicareEligibilityAge','Medicare eligibility age',1,60,80,1,'years')}
          <NumberField label="New entrants convert in" value={a.medicareYearA} min={2026} max={2095} step={1} onChange={n=>setA({medicareYearA:n,medicareYearB:Math.max(n,a.medicareYearB)})} />{numA('medicareYearB','All seniors convert by',1,a.medicareYearA,2095,1)}</fieldset></section></div>
        <div className="game-column"><section className="game-card"><h2>Financing and comparator</h2><Select label="Current-law benefit comparator" value={policy.baselineMode} options={[{value:'scheduled',label:'Scheduled benefits'},{value:'payable',label:'Trust-fund payable'}]} onChange={v=>setPolicy(p=>({...p,baselineMode:v as CombinedPolicy['baselineMode']}))} />
          <fieldset disabled={!fundingAllowed}><Select label="Benefit financing" value={fundingAllowed?a.fundingStrategy:'paygo'} options={[{value:'paygo',label:'PAYGO'},{value:'socialSecurityOnly',label:'Prefund Social Security'},{value:'medicareOnly',label:'Prefund Medicare'},{value:'both',label:'Prefund both'},{value:'socialSecurityFirst',label:'Social Security first'},{value:'savingsFundedSequential',label:'Savings-funded sequence'}]} onChange={v=>setA({fundingStrategy:v as ModelAssumptions['fundingStrategy']})} />
          <Select label="Prefunding starts at age" value={String(a.prefundingStartAge)} options={[{value:'0',label:'Birth'},{value:'18',label:'18'}]} onChange={v=>setA({prefundingStartAge:Number(v) as 0|18})} />{numA('realEndowmentYield','Real endowment yield',100,0,12,.1,'%')}</fieldset><small>Financing strategies activate when both benefit reforms are enabled and the benefit cap is off. Otherwise PAYGO is used in the calculation.</small></section>
        <section className="game-card"><h2>People · illustrative</h2><dl className="game-ledger">{score.household.map(item=><div key={item.label}><dt>{item.label} annual tax change</dt><dd>{item.difference<0?'−':'+'}${Math.abs(item.difference).toLocaleString('en-US',{maximumFractionDigits:0})}</dd></div>)}<div><dt>Fully reformed SS floor (2026 dollars)</dt><dd>${(a.flatBenefitFPLMultiple*a.individualFPL2026).toLocaleString()}</dd></div><div><dt>Medicare support / senior (2026 dollars)</dt><dd>${a.premiumSupport2026.toLocaleString()}</dd></div></dl><small>Payment amounts and illustrative tax changes are not a welfare measure. Insurance value, household lifetime incidence, and behavioral effects are not estimated.</small></section></div></div>}
      {tab === 'results' && <div className="game-results"><div className="game-score-grid"><article className="game-card game-score"><span>2026–2035 budget improvement</span><strong className={decade.fiscalImprovementBillions>=0?'good':'bad'}>{dollars(decade.fiscalImprovementBillions)}</strong><small>Nominal sum versus current law</small></article><article className="game-card game-score"><span>2035 debt / GDP</span><strong>{ratio(decade.terminalDebtGDP)}</strong><small>Current law {ratio(decade.baselineTerminalDebtGDP)}</small></article><article className="game-card game-score"><span>2095 debt / GDP</span><strong>{ratio(horizon.terminalDebtGDP)}</strong><small>Current law {ratio(horizon.baselineTerminalDebtGDP)}</small></article><article className="game-card game-score"><span>70-year budget improvement</span><strong>{pp(horizon.fiscalImprovementGDP)}</strong><small>GDP-weighted annual average, includes interest</small></article></div>
        <section className="game-card game-goal"><div><span>Debt challenge · {pct(a.policyHorizonDebtTargetGDP,0)} in 2095 and peak under {pct(a.peakDebtCeilingGDP,0)}</span><strong>{!Number.isFinite(score.additionalFiscalAdjustmentGDP) ? 'Debt goal outside the modeled adjustment range' : score.additionalFiscalAdjustmentGDP>0.00001?`${pp(score.additionalFiscalAdjustmentGDP)} GDP more annual fiscal adjustment needed`:`Goal met · ${pp(-score.additionalFiscalAdjustmentGDP)} GDP headroom`}</strong></div><small>Equivalent permanent revenue or spending adjustment from 2026.</small></section>
        <div className="game-plots"><Chart title="Debt held by the public" note="Four policy combinations against a common economic path." data={graph} lines={[{key:'Current law',color:'#8292a6'},{key:'Tax only',color:'#477fb8'},{key:'Benefits only',color:'#c58a3d'},{key:'Combined',color:'#168565'}]} />
          <Chart title="Receipts and spending" data={graph} lines={[{key:'Receipts',color:'#168565'},{key:'Primary spending',color:'#c58a3d'},{key:'Interest',color:'#6678aa'}]} />
          <Chart title="What the federal government spends" data={graph} stacked lines={[{key:'Social Security',color:'#4890a2'},{key:'Medicare',color:'#8ac4ad'},{key:'Other mandatory',color:'#a7add3'},{key:'Discretionary',color:'#d9bb78'},{key:'Prefunding',color:'#63a27b'},{key:'Interest',color:'#d58375'}]} />
          <Chart title="Social Security: legacy and flat benefits" data={graph} lines={[{key:'Baseline SS',color:'#8292a6'},{key:'Legacy SS',color:'#4584ad'},{key:'Flat SS',color:'#168565'}]} />
          <Chart title="Medicare: legacy and premium support" data={graph} lines={[{key:'Baseline Medicare',color:'#8292a6'},{key:'Legacy Medicare',color:'#c58a3d'},{key:'Premium support',color:'#168565'}]} />
          <Chart title="Prefunding flows" note="Cohort deposits and avoided PAYGO, when selected." data={graph} lines={[{key:'SS deposits',color:'#4584ad'},{key:'Medicare deposits',color:'#168565'},{key:'Avoided SS PAYGO',color:'#c58a3d'}]} />
          <Chart title="Interest rates" unit="Annual percent" data={graph} lines={[{key:'Market rate',color:'#7089b5'},{key:'Effective rate',color:'#cf8c69'}]} />
        </div><section className="game-card"><h2>Budget ledger · selected years</h2><div className="game-table-wrap"><table className="game-table"><thead><tr><th>Year</th><th>Receipts</th><th>SS</th><th>Medicare</th><th>Other primary</th><th>Interest</th><th>Deficit</th><th>Debt / GDP</th></tr></thead><tbody>{score.combined.years.filter(row=>[2026,2035,2050,2075,2095].includes(row.year)).map(row=>{const d=row.nominalGDP;return <tr key={row.year}><th>{row.year}</th><td>{pct(row.revenue/d)}</td><td>{pct((row.legacySocialSecurity+row.flatSocialSecurityPaygo+row.otherOASDI)/d)}</td><td>{pct((row.legacySeniorMedicare+row.premiumSupportPaygo+row.under65Medicare)/d)}</td><td>{pct((row.totalPrimarySpending-row.legacySocialSecurity-row.flatSocialSecurityPaygo-row.otherOASDI-row.legacySeniorMedicare-row.premiumSupportPaygo-row.under65Medicare)/d)}</td><td>{pct(row.netInterest/d)}</td><td>{pct(row.overallDeficit/d)}</td><td>{ratio(row.endingDebtGDP)}</td></tr>})}</tbody></table></div></section><p className="game-caveat">Scores measure budget and debt, not net welfare. This model keeps the 2025 static tax estimate constant as a GDP share, uses a simplified old-age cohort model, and extends CBO spending shares beyond their published horizon. The debt plot clips paths beyond 1,000% of GDP; exact values remain in the ledger. Results depend strongly on growth and benefit assumptions.</p></div>}
    </main></div>
}
