import cboOfficial from './data/cboOfficial.json'
import taxBaseline2025 from './tax/data/baseline_2025.json'
import { premiumSupportPerPersonNominal } from './model/medicare'
import { useDeferredValue, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { defaultCombinedPolicy, scoreCombined } from './model/combined'
import HouseholdsTab from './HouseholdsTab'
import SavedConfigurationsPanel from './SavedConfigurationsPanel'
import type { ScenarioState } from './model/savedConfigurations'
import { exampleHouseholds, lastHouseholdYear } from './model/householdScenario'
import type { ExampleHousehold } from './model/householdScenario'
import type { CombinedPolicy } from './model/combined'
import { transferPrograms } from './tax/model/transfers'
import type { ReformSettings } from './tax/model/types'
import type { HealthPolicySettings } from './tax/model/health'
import type { ModelAssumptions } from './model/types'
import './combined.css'

type Tab = 'economic' | 'tax' | 'entitlements' | 'households' | 'results'
const tabs: { id: Tab; label: string }[] = [
  { id: 'economic', label: 'Economic assumptions' }, { id: 'tax', label: 'Tax reform' },
  { id: 'entitlements', label: 'Entitlement reform' }, { id: 'households', label: 'Households' },
  { id: 'results', label: 'Detailed results' },
]
const pct = (n: number, digits = 1) => Number.isFinite(n) && Math.abs(n) < 100 ? `${(n * 100).toFixed(digits)}%` : '>10,000%'
const pp = (n: number) => !Number.isFinite(n) ? 'unstable' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(2)} pp`
const dollars = (n: number) => !Number.isFinite(n) ? 'Debt spiral' : `${n < 0 ? '−' : '+'}$${Math.abs(n / 1000).toFixed(2)}T`
const ratio = (n: number) => !Number.isFinite(n) ? 'unstable' : n > 10 ? '>1,000%' : pct(n, 0)
const safe = (n: number) => Number.isFinite(n) ? Math.max(-1000, Math.min(1000, n * 100)) : 1000

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
function Chart({ title, data, lines, stacked = false, note, unit = '% of GDP' }: { title: string; data: Record<string, number | undefined>[]; lines: { key: string; color: string }[]; stacked?: boolean; note?: string; unit?: string }) {
  const Graph = stacked ? ComposedChart : LineChart
  return <section className="game-card game-chart"><div className="game-chart-heading"><div><h2>{title}</h2>{note && <p>{note}</p>}</div><span>{unit}</span></div>
    <div className="game-chart-area"><ResponsiveContainer width="100%" height="100%"><Graph data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7ecf1" vertical={false} /><XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={n => `${n}%`} /><Tooltip formatter={n => `${Number(n).toFixed(1)}%`} /><Legend />
      {lines.map(({ key, color }) => stacked ? <Area key={key} type="monotone" dataKey={key} stackId="total" fill={color} fillOpacity={.8} stroke={color} dot={false} /> : <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={key === 'Combined' ? 3 : 2} dot={false} />)}
    </Graph></ResponsiveContainer></div></section>
}

export default function CombinedGame() {
  const [showCBO, setShowCBO] = useState(true)
  const [tab, setTab] = useState<Tab>('economic')
  const [householdYear, setHouseholdYear] = useState(2035)
  const [householdSelectedId, setHouseholdSelectedId] = useState(exampleHouseholds[0]!.id)
  const [householdProfiles, setHouseholdProfiles] = useState<ExampleHousehold[]>(() => exampleHouseholds.map(item => ({
    ...item, childAges2026: [...item.childAges2026], receives: { ...item.receives },
    manualAnnualBenefits2026: { ...item.manualAnnualBenefits2026 },
  })))
  const [policy, setPolicy] = useState<CombinedPolicy>(defaultCombinedPolicy)
  const deferred = useDeferredValue(policy)
  const score = useMemo(() => scoreCombined(deferred), [deferred])
  const setTax = (patch: Partial<ReformSettings>) => setPolicy(p => ({ ...p, tax: { ...p.tax, ...patch } }))
  const setHealth = (patch: Partial<HealthPolicySettings>) => setPolicy(p => ({ ...p, health: { ...p.health, ...patch } }))
  const setA = (patch: Partial<ModelAssumptions>) => setPolicy(p => ({ ...p, assumptions: { ...p.assumptions, ...patch } }))
  const setDynamic = (patch: Partial<CombinedPolicy['dynamic']>) => setPolicy(p => ({ ...p, dynamic: { ...p.dynamic, ...patch } }))
  const setBenefits = (patch: Partial<CombinedPolicy['benefits']>) => setPolicy(p => ({ ...p, benefits: { ...p.benefits, ...patch } }))
  const loadScenario = (scenario: ScenarioState) => {
    setPolicy(scenario.policy)
    setHouseholdProfiles(scenario.householdProfiles)
    const selected = scenario.householdProfiles.find(item => item.id === scenario.householdSelectedId)!
    setHouseholdYear(Math.min(scenario.householdYear, lastHouseholdYear(selected, scenario.policy)))
    setHouseholdSelectedId(scenario.householdSelectedId)
  }
  const a = policy.assumptions, t = policy.tax, h = policy.health
  const numA = (key: keyof ModelAssumptions, label: string, multiplier = 1, min = 0, max?: number, step = 0.1, suffix?: string, note?: string) =>
    <NumberField key={key} label={label} value={Math.round(Number(a[key]) * multiplier * 1000) / 1000} onChange={n => setA({ [key]: n / multiplier })} min={min} max={max} step={step} suffix={suffix} note={note} />
  const numT = (key: keyof ReformSettings, label: string, multiplier = 1, min = 0, max?: number, step = 1, suffix?: string) =>
    <NumberField key={key} label={label} value={Math.round(Number(t[key] ?? 0) * multiplier * 1000) / 1000} onChange={n => setTax({ [key]: n / multiplier })} min={min} max={max} step={step} suffix={suffix} />
  const numH = (key: keyof HealthPolicySettings, label: string, multiplier = 1, min = 0, max?: number, step = 1, suffix?: string) =>
    <NumberField key={key} label={label} value={Math.round(Number(h[key]) * multiplier * 1000) / 1000} onChange={n => setHealth({ [key]: n / multiplier })} min={min} max={max} step={step} suffix={suffix} />
  const [decade, horizon] = score.periods as [typeof score.periods[number], typeof score.periods[number]]
  const debt2036 = score.combined.years.find(row => row.year === 2036)?.endingDebtGDP ?? Number.NaN
  const debt2050 = score.combined.years.find(row => row.year === 2050)?.endingDebtGDP ?? Number.NaN
  const primaryBalanceYear = score.combined.years.find(row => row.primaryDeficit <= 1e-6)?.year
  const totalBalanceRow = score.combined.years.find(row => row.overallDeficit <= 1e-6)
  const totalBalanceYear = totalBalanceRow?.year
  const balanceYearSpendingGDP = totalBalanceRow
    ? totalBalanceRow.totalFederalSpending / totalBalanceRow.nominalGDP
    : Number.NaN
  const balanceYearRevenueGDP = totalBalanceRow
    ? totalBalanceRow.revenue / totalBalanceRow.nominalGDP
    : Number.NaN
  const debtTargetYear = score.combined.years.find(
    row => row.endingDebtGDP <= a.debtPaydownTargetGDP + 1e-9,
  )?.year
  const milestoneYear = (year: number | undefined) => year ?? `>${a.endYear}`
  const taxBillionsGDP = (billions: number, sign: ''|'+'|'−' = '') =>
    `${sign}${Math.abs(billions).toFixed(0)}B · ${pct(Math.abs(billions) / score.tax.gdp, 2)} GDP`
  const dynamicReady = deferred.dynamic.enabled && deferred.taxEnabled
  const staticDecadeDeficit = score.staticCombined.years.slice(0, 10).reduce((sum, row) => sum + row.overallDeficit, 0)
  const dynamicDecadeDeficit = score.combined.years.slice(0, 10).reduce((sum, row) => sum + row.overallDeficit, 0)
  const sampled = score.combined.years.filter(row => row.year === 2026 || row.year % 5 === 0 || row.year === 2056 || row.year === 2095)
  const graph = sampled.map(row => {
    const index = row.year - a.reformYear, b = score.baseline.years[index]!, tx = score.taxOnly.years[index]!, en = score.benefitsOnly.years[index]!
    const gdp = row.nominalGDP
    return { year: row.year, ...(showCBO && row.year <= 2056 ? { 'Official CBO': cboOfficial.rows.find(c => c.year === row.year)!.lt_debt_held_by_public_gdp_share } : {}), 'Current law': safe(b.endingDebtGDP), 'Tax only': safe(tx.endingDebtGDP), 'Benefits only': safe(en.endingDebtGDP), 'Combined': safe(row.endingDebtGDP),
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
      'Static combined': safe(score.staticCombined.years[index]!.endingDebtGDP),
      'GDP level effect': (gdp / score.staticCombined.years[index]!.nominalGDP - 1) * 100,
      'Static deficit': score.staticCombined.years[index]!.overallDeficit / score.staticCombined.years[index]!.nominalGDP * 100,
      'Scored deficit': row.overallDeficit / gdp * 100,
    }
  })
  const baselinePreset = (choice: 'baseline'|'tax'|'benefits'|'both') => setPolicy(p => ({ ...p,
    taxEnabled: choice === 'tax' || choice === 'both',
    benefits: { socialSecurityReform: choice === 'benefits' || choice === 'both', medicareReform: choice === 'benefits' || choice === 'both' },
  }))
  const fundingAllowed = policy.benefits.socialSecurityReform && policy.benefits.medicareReform && a.socialSecurityBenefitCap2026 === null

  return <div className="game app-shell">
    <header className="game-sticky"><div className="game-brand"><span className="eyebrow">Federal policy sandbox · 2026–2095</span><strong>Build a fiscal future{policy.dynamic.enabled && policy.taxEnabled ? ' · dynamic' : ''}</strong></div>
      <div className="game-header-score" aria-live="polite"><div className="secondary-metric"><small>10-year fiscal improvement</small><strong className={decade.fiscalImprovementBillions >= 0 ? 'good' : 'bad'}>{dollars(decade.fiscalImprovementBillions)}</strong></div><div><small>2036 debt / GDP · goal ≤100%</small><strong className={debt2036 <= 1 ? 'good' : 'bad'}>{ratio(debt2036)}</strong></div><div><small>2050 debt / GDP · goal ≤60%</small><strong className={debt2050 <= .6 ? 'good' : 'bad'}>{ratio(debt2050)}</strong></div><div><small>2095 debt / GDP</small><strong>{ratio(horizon.terminalDebtGDP)}</strong></div><div className="milestone-metric"><small>Primary deficit closes</small><strong className={primaryBalanceYear ? 'good' : 'bad'}>{milestoneYear(primaryBalanceYear)}</strong></div><div className="milestone-metric"><small>Total deficit closes</small><strong className={totalBalanceYear ? 'good' : 'bad'}>{milestoneYear(totalBalanceYear)}</strong></div><div className="milestone-metric"><small>Balance-year spend / revenue</small><strong>{totalBalanceRow ? `${pct(balanceYearSpendingGDP)} / ${pct(balanceYearRevenueGDP)}` : '—'}</strong></div><div className="milestone-metric"><small>{pct(a.debtPaydownTargetGDP,0)} debt target met</small><strong className={debtTargetYear ? 'good' : 'bad'}>{milestoneYear(debtTargetYear)}</strong></div><div className="secondary-metric"><small>70-year fiscal improvement</small><strong>{pp(horizon.fiscalImprovementGDP)}</strong></div></div></header>
    <main className="game-main"><div className="game-title"><div><h1>Design a fiscal scenario</h1><p>Set assumptions and policy, then compare the decade and the 70-year path against the same current-law economy.</p></div><button className="game-reset" onClick={() => setPolicy(defaultCombinedPolicy)}>Reset scenario</button></div>
      <SavedConfigurationsPanel scenario={{ policy, householdProfiles, householdYear, householdSelectedId }} onLoad={loadScenario} />
      <nav className="game-tabs" aria-label="Simulator tabs">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <div className="game-presets" aria-label="Scenario presets"><span>Quick scenarios</span>{(['baseline','tax','benefits','both'] as const).map((choice, i) => <button key={choice} onClick={() => baselinePreset(choice)}>{['Current law', 'Tax only', 'Benefits only', 'Both reforms'][i]}</button>)}</div>
      {tab === 'economic' && <div className="game-two-col">
        <section className="game-card"><h2>Growth and demographics</h2><p>Economic paths apply to both the scenario and its current-law comparator. Move a lever to see its full fiscal effect.</p>
          {numA('realGDPGrowth','Real GDP growth',100,-2,6,.1,'%')}{numA('realWageGrowthDeviation','Real wage growth deviation',100,-3,3,.1,'pp', 'Adds this many percentage points to each year of the 2026 SSA Trustees intermediate real covered-wage path. Zero uses the Trustees path directly.')}{numA('inflation','Inflation',100,0,8,.1,'%')}{numA('cohortSizeGrowth','Population growth adjustment',100,-2,4,.1,'%', '0.2% reproduces SSA central population; deviations shift its annual growth. Survival uses SSA projected age-specific mortality.')}
          {numA('currentLawSSBenefitRealGrowth','Real growth of new legacy SS awards',100,-1,5,.1,'%', 'Sensitivity around the official current-law spending calibration; 1.14% is the Trustees long-run real covered-wage assumption.')}{numA('legacyMedicareRealGrowth','Real Medicare benefit growth',100,-2,8,.1,'%', 'Per enrollee, above inflation. A sensitivity around the CBO/Trustees-calibrated current-law path.')}
          <Select label="Nondefense spending path" value={a.nonDefenseDiscretionaryMode} options={[{value:'cbo',label:'CBO shares'},{value:'growth',label:'Own real growth'}]} onChange={v=>setA({nonDefenseDiscretionaryMode:v as ModelAssumptions['nonDefenseDiscretionaryMode']})} />{a.nonDefenseDiscretionaryMode === 'growth' && numA('nonDefenseDiscretionaryRealGrowth','Real nondefense discretionary growth',100,-2,8,.1,'%')}</section>
        <div className="game-column"><section className="game-card"><h2>Interest and debt</h2>
          {numA('baselineRealMarketRate','Real market interest rate',100,0,10,.1,'%')}{numA('debtSensitivity','Debt premium sensitivity',100,0,2,.1,'%')}{numA('debtRatePassThrough','Debt refinancing pass-through',100,0,100,1,'%')}
          {numA('policyHorizonDebtTargetGDP','2095 debt target',100,0,300,1,'% GDP')}{numA('debtPaydownSurplusCapGDP','Debt-paydown surplus cap',100,0,10,.1,'% GDP','Maximum annual overall surplus used to retire debt after the total deficit first closes. At 0%, the budget balances and GDP growth alone reduces debt/GDP.')}{numA('debtPaydownTargetGDP','Long-run debt paydown target',100,0,100,1,'% GDP','Debt-reduction surpluses stop at this ratio; thereafter receipts equal total outlays.')}{numA('peakDebtCeilingGDP','Peak debt ceiling',100,20,500,1,'% GDP')}</section>
          <section className="game-card"><h2>Illustrative dynamic scoring</h2><Toggle label="Allow labor and capital response" checked={policy.dynamic.enabled} onChange={enabled => setDynamic({enabled})} note="Responds to the X-tax's wage incentives and switch to business cash-flow taxation. Starts at the same 2026 GDP." />
            <fieldset disabled={!policy.dynamic.enabled || !policy.taxEnabled}><NumberField label="Labor supply elasticity" value={policy.dynamic.laborElasticity} min={0} max={0.6} step={0.05} onChange={laborElasticity => setDynamic({laborElasticity})} />
              <NumberField label="Labor share of GDP" value={Math.round(policy.dynamic.laborShareGDP*100)} min={0} max={100} step={5} suffix="%" onChange={n => setDynamic({laborShareGDP:n/100})} />
              <NumberField label="Labor GDP phase-in" value={policy.dynamic.phaseInYears} min={1} max={30} step={1} suffix="years" onChange={phaseInYears => setDynamic({phaseInYears})} />
              <NumberField label="Cash-flow capital GDP at 21%" value={Math.round(policy.dynamic.capitalGDPLevelAtReference*1000)/10} min={0} max={3} step={0.1} suffix="%" onChange={n => setDynamic({capitalGDPLevelAtReference:n/100})} />
              <NumberField label="Capital effect sensitivity to rate" value={Math.round(policy.dynamic.capitalRateSensitivity*100)} min={0} max={50} step={5} suffix="%" onChange={n => setDynamic({capitalRateSensitivity:n/100})} />
              <NumberField label="Capital GDP phase-in" value={policy.dynamic.capitalPhaseInYears} min={1} max={30} step={1} suffix="years" onChange={capitalPhaseInYears => setDynamic({capitalPhaseInYears})} /></fieldset>
            {dynamicReady && <dl className="game-ledger"><div><dt>Illustrative net-of-tax wage change (log)</dt><dd>{pct(score.netWageLogChange,2)}</dd></div><div><dt>Long-run labor GDP level</dt><dd>{pct(score.steadyGDPLevelChange,2)}</dd></div><div><dt>Long-run capital GDP level</dt><dd>{pct(score.steadyCapitalGDPLevelChange,2)}</dd></div><div><dt>Implied capital stock / wage level</dt><dd>{pct(score.steadyCapitalStockChange,2)} / {pct(score.steadyCapitalWageChange,2)}</dd></div><div className="game-total"><dt>10-year deficit feedback versus static</dt><dd>{dollars(staticDecadeDeficit-dynamicDecadeDeficit)}</dd></div></dl>}
            <small>Capital channel activates when both corporate and individual income taxes are replaced. The 21% reference is Tax Foundation's separate DBCFT estimate; the rate adjustment here is deliberately small. These are additive long-run GDP level effects, not permanent changes to growth rates or a general equilibrium solution.</small></section>
          <section className="game-card"><h2>Source and interpretation</h2><p>Federal budget anchors and published category projections use the <a href="https://www.cbo.gov/publication/62105" target="_blank" rel="noreferrer">CBO Budget and Economic Outlook (2026–2036)</a> and February 2026 long-term data. Age-specific population and projected survival use SSA’s 2026 Trustees Alternative II files. Current-law Social Security and Medicare match CBO program shares through 2056; after that horizon their central paths follow the 2026 Social Security and Medicare Trustees projections through 2100.</p><p>The real-wage baseline follows the 2026 OASDI Trustees intermediate annual covered-wage path, normalized to the simulator's 2026 opening year; the wage control is an additive annual percentage-point deviation. It is separate from real GDP growth: progressive wage-tax brackets are rescored against wages, while the flat X-tax gross base remains tied to the aggregate macro base. The editable Medicare and legacy-benefit growth controls are sensitivities around the official central calibration. Official CBO debt remains a separate reference through 2056 in Detailed results.</p></section></div>
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
          {numT('childCredit','Child credit',1,0,30000,100,'$')}{numT('under6ChildCredit','Additional under-six credit',1,0,30000,100,'$')}{numT('childCreditBaselineRefundableShare','Credit available at $0 earnings',100,0,100,1,'%')}{numT('childCreditPhaseInRate','Child credit phase-in',100,0,100,1,'%')}</fieldset></section></div>
        <div className="game-column"><section className="game-card"><h2>Health coverage credits</h2><fieldset disabled={!policy.taxEnabled}>
          {numH('adultHealthCredit','Adult health credit',1,0,20000,100,'$')}{numH('childHealthCredit','Child health credit',1,0,20000,100,'$')}{numH('uninsuredTakeUpRate','Uninsured take-up',100,0,100,1,'%')}
          <Toggle label="Replace ACA premium tax credits" checked={Boolean(h.replaceAcaAptc)} onChange={v=>setHealth({replaceAcaAptc:v})} />
          <details className="game-more"><summary>Health incidence assumptions</summary>{numH('employerHealthPassThroughRate','Employer health pass-through',100,0,100,1,'%')}{numH('employerFicaPassThroughRate','Employer FICA pass-through',100,0,100,1,'%')}{numH('employeePremiumPreTaxShare','Pre-tax employee premiums',100,0,100,1,'%')}{numH('benchmarkPremiumScale','Benchmark premium scale',100,0,300,1,'%')}
            <Select label="Employer pool redistribution" value={h.redistributionRule} options={[{value:'nationalEqual',label:'National equal'},{value:'employerCellEqual',label:'Employer cell equal'},{value:'ownContribution',label:'Own contribution'}]} onChange={v=>setHealth({redistributionRule:v as HealthPolicySettings['redistributionRule']})} />
            <Select label="Credit recipients" value={h.recipientScope} options={[{value:'policyholders',label:'Policyholders'},{value:'coveredWorkers',label:'Covered workers'}]} onChange={v=>setHealth({recipientScope:v as HealthPolicySettings['recipientScope']})} /></details></fieldset></section>
          <section className="game-card"><h2>Replace federal transfers</h2><p>These program outlays enter the fiscal ledger separately from tax receipts.</p><fieldset disabled={!policy.taxEnabled}>{transferPrograms.map(program => <Toggle key={program.id} label={`${program.shortName} · ${program.federalFiscalAmountBillions.toFixed(1)}B · ${pct(program.federalFiscalAmountBillions / score.tax.gdp, 2)} GDP`} checked={policy.transfers.replacedPrograms[program.id]} onChange={v=>setPolicy(p=>({...p,transfers:{replacedPrograms:{...p.transfers.replacedPrograms,[program.id]:v}}}))} />)}</fieldset></section>
          <section className="game-card"><h2>Taxes replaced</h2><fieldset disabled={!policy.taxEnabled}>{(['individualIncome','payroll','corporateIncome','customs'] as const).map((key,i)=>{const amount=taxBaseline2025.federalReceipts[key];return <Toggle key={key} label={`${(['Individual income','Payroll','Corporate income','Customs'][i] ?? key)} · ${amount.toFixed(0)}B · ${pct(amount / score.tax.gdp,2)} GDP`} checked={t.replacedTaxes[key]} onChange={v=>setTax({replacedTaxes:{...t.replacedTaxes,[key]:v}})} />})}</fieldset></section>
          <section className="game-card"><h2>Opening tax ledger · 2025 basis</h2><dl className="game-ledger"><div><dt>Gross X tax receipts</dt><dd>{taxBillionsGDP(score.tax.grossRevenue)}</dd></div><div><dt>Adult and child tax credits</dt><dd>{taxBillionsGDP(score.tax.adultCreditCost+score.tax.childCreditCost,'−')}</dd></div><div><dt>Health credits</dt><dd>{taxBillionsGDP(score.health.totalHealthCreditCostBillions,'−')}</dd></div><div><dt>Replaced receipts</dt><dd>{taxBillionsGDP(score.tax.targetRevenue,'−')}</dd></div><div><dt>Transfers and ACA credit savings</dt><dd>{taxBillionsGDP(score.tax.federalTransferSavings,'+')}</dd></div><div><dt>Refundable tax credit outlay savings</dt><dd>{taxBillionsGDP(score.tax.refundableTaxCreditOutlaySavings,'+')}</dd></div><div className="game-total"><dt>Net fiscal improvement if enabled</dt><dd>{taxBillionsGDP(score.tax.deficitReduction,score.tax.deficitReduction>=0?'+':'−')}</dd></div></dl><small>Aggregate federal dollar amounts also show their share of opening GDP. Per-person credits and bracket thresholds remain in dollars because they are household policy parameters, not federal aggregates. This is the opening 2025-basis score; long-run progressive wage-tax receipts are rescored against the Trustees real-wage path, while the flat X-tax gross base remains tied to the aggregate macro base.</small></section>
        </div></div>}
      {tab === 'entitlements' && <div className="game-two-col"><div className="game-column"><section className="game-card"><h2>Social Security</h2><Toggle label="Reform Social Security" checked={policy.benefits.socialSecurityReform} onChange={v=>setBenefits({socialSecurityReform:v})} /><fieldset disabled={!policy.benefits.socialSecurityReform}>
        {numA('flatBenefitFPLMultiple','Flat benefit floor',100,0,400,5,'% FPL')}{numA('benefitPhaseInYears','Cohort transition',1,1,70,1,'years')}{numA('fullRetirementAge','Full-benefit reference age',1,62,80,1,'years', 'The cohort blend is locked at this reference age. Claiming earlier or later adjusts the flat benefit using projected survival.')}
        {numA('socialSecurityClaimAge','Representative claiming age',1,62,80,1,'years')}
        {numA('vestingYears','Credited years for full benefit',1,1,60,1,'years')}
        {numA('qualifyingEarnings2026','Earnings for one credited year',1,1,100000,100,'$', '2026 dollars, CPI indexed. Half this earnings level earns half a year; maximum one credit-year per year.')}
        {numA('averageWorkingYears','Representative years worked',1,0,60,.5,'years')}
        {numA('averageAnnualEarnings2026','Representative annual earnings',1,0,1000000,1000,'$', 'Illustrative aggregate work record, not an estimated national distribution. Household records are editable separately.')}
        {numA('actuarialDiscountRate','Real actuarial discount rate',100,0,10,.1,'%', 'Expected lifetime value of the flat component is neutral before caps, at a fixed work record. Legacy benefits retain statutory early/delayed adjustments.')}

        <Toggle label="Cap annual retired-worker benefits" checked={a.socialSecurityBenefitCap2026 !== null} onChange={v=>setA({socialSecurityBenefitCap2026:v?36000:null,fundingStrategy:'paygo'})} />{a.socialSecurityBenefitCap2026 !== null && <NumberField label="Annual cap (2026 dollars)" value={a.socialSecurityBenefitCap2026} min={1000} max={200000} step={1000} suffix="$" onChange={n=>setA({socialSecurityBenefitCap2026:n})} />}
        {numA('realFPLGrowth','Real flat benefit growth',100,-2,6,.1,'%')}</fieldset><small>The cap applies to each reformed cohort’s total retired-worker benefit after legacy calibration. It rises with inflation; prefunding is unavailable with a cap.</small></section>
        <section className="game-card"><h2>Medicare</h2><Toggle label="Reform Medicare" checked={policy.benefits.medicareReform} onChange={v=>setBenefits({medicareReform:v})} /><fieldset disabled={!policy.benefits.medicareReform}>
          <Select label="Premium-support budget rule" value={a.medicareFundingMode} options={[{value:'gdpShare',label:'Fixed GDP share / eligible population'},{value:'perPerson',label:'Fixed real per-person path'}]} onChange={v=>setA({medicareFundingMode:v as ModelAssumptions['medicareFundingMode']})} />
          {a.medicareFundingMode === 'gdpShare' ? <>{numA('medicareSupportGDPShare','Senior support pool',100,0,15,.1,'% GDP', 'Federal contribution after beneficiary financing. Under-65 Medicare is separate. Population aging changes support per eligible senior.')}<p>2026 average federal support: ${Math.round(premiumSupportPerPersonNominal(2026,a)).toLocaleString()} per eligible senior. Income and wealth allocation rules remain unspecified; the model shows the average grant.</p></> : <>{numA('premiumSupport2026','Federal support / senior',1,0,60000,500,'$')}{numA('premiumSupportRealGrowth','Real support growth',100,-2,8,.1,'%')}</>}
          {numA('medicareEligibilityAge','Medicare eligibility age',1,60,80,1,'years')}
          <NumberField label="New entrants convert in" value={a.medicareYearA} min={2026} max={2095} step={1} onChange={n=>setA({medicareYearA:n,medicareYearB:Math.max(n,a.medicareYearB)})} />{numA('medicareYearB','All seniors convert by',1,a.medicareYearA,2095,1)}</fieldset></section></div>
        <div className="game-column"><section className="game-card"><h2>Financing and comparator</h2><Select label="Current-law benefit comparator" value={policy.baselineMode} options={[{value:'scheduled',label:'Scheduled benefits'},{value:'payable',label:'Trust-fund payable'}]} onChange={v=>setPolicy(p=>({...p,baselineMode:v as CombinedPolicy['baselineMode']}))} />
          <fieldset disabled={!fundingAllowed}><Select label="Benefit financing" value={fundingAllowed?a.fundingStrategy:'paygo'} options={[{value:'paygo',label:'PAYGO'},{value:'socialSecurityOnly',label:'Prefund Social Security'},{value:'medicareOnly',label:'Prefund Medicare'},{value:'both',label:'Prefund both'},{value:'socialSecurityFirst',label:'Social Security first'},{value:'savingsFundedSequential',label:'Savings-funded sequence'}]} onChange={v=>setA({fundingStrategy:v as ModelAssumptions['fundingStrategy']})} />
          <Select label="Prefunding starts at age" value={String(a.prefundingStartAge)} options={[{value:'0',label:'Birth'},{value:'18',label:'18'}]} onChange={v=>setA({prefundingStartAge:Number(v) as 0|18})} />{numA('realEndowmentYield','Real endowment yield',100,0,12,.1,'%')}</fieldset><small>Financing strategies activate when both benefit reforms are enabled and the benefit cap is off. Otherwise PAYGO is used in the calculation.</small></section>
        <section className="game-card"><h2>Who is affected?</h2><p>Compare working families and retirees in a selected year. Edit wages, ages, children, benefit levels, and program participation to see how the current policy changes their annual resources.</p><button className="game-reset" onClick={() => setTab('households')}>Open household examples</button></section></div></div>}
      {tab === 'households' && <HouseholdsTab policy={deferred} score={score} year={householdYear} setYear={setHouseholdYear}
        profiles={householdProfiles} setProfiles={setHouseholdProfiles} selectedId={householdSelectedId} setSelectedId={setHouseholdSelectedId} />}
      {tab === 'results' && <div className="game-results"><div className="game-score-grid"><article className="game-card game-score"><span>2026–2035 budget improvement</span><strong className={decade.fiscalImprovementBillions>=0?'good':'bad'}>{dollars(decade.fiscalImprovementBillions)}</strong><small>Nominal sum versus current law</small></article><article className="game-card game-score"><span>2035 debt / GDP</span><strong>{ratio(decade.terminalDebtGDP)}</strong><small>Current law {ratio(decade.baselineTerminalDebtGDP)}</small></article><article className="game-card game-score"><span>2095 debt / GDP</span><strong>{ratio(horizon.terminalDebtGDP)}</strong><small>Current law {ratio(horizon.baselineTerminalDebtGDP)}</small></article><article className="game-card game-score"><span>70-year budget improvement</span><strong>{pp(horizon.fiscalImprovementGDP)}</strong><small>GDP-weighted annual average, includes interest</small></article></div>
        <section className="game-card game-goal"><div><span>Debt challenge · {pct(a.policyHorizonDebtTargetGDP,0)} in 2095 and peak under {pct(a.peakDebtCeilingGDP,0)}</span><strong>{!Number.isFinite(score.additionalFiscalAdjustmentGDP) ? 'Debt goal outside the modeled adjustment range' : score.additionalFiscalAdjustmentGDP>0.00001?`${pp(score.additionalFiscalAdjustmentGDP)} GDP more annual fiscal adjustment needed`:`Goal met · ${pp(-score.additionalFiscalAdjustmentGDP)} GDP headroom`}</strong></div><small>Equivalent permanent revenue or spending adjustment from 2026.</small></section>
        {dynamicReady && <section className="game-card game-goal"><div><span>Dynamic feedback · illustrative labor and capital response</span><strong>GDP level {pct(score.steadyGDPLevelChange+score.steadyCapitalGDPLevelChange,2)} · 10-year deficit feedback {dollars(staticDecadeDeficit-dynamicDecadeDeficit)}</strong></div><small>Labor {pct(score.steadyGDPLevelChange,2)} + capital {pct(score.steadyCapitalGDPLevelChange,2)} versus static. Program spending stays on its baseline dollar path; receipts follow the changed GDP.</small></section>}
        <Toggle label="Show official CBO reference (2026–2056)" checked={showCBO} onChange={setShowCBO} note="February 2026 published debt path, with CBO's own economic assumptions. It is independent of these controls and is not extrapolated to 2095." /><div className="game-plots"><Chart title="Debt / GDP" note={dynamicReady ? 'Static combined is shown for comparison with the scored dynamic path.' : 'Four policy combinations against a common economic path.'} data={graph} lines={[...(showCBO ? [{key:'Official CBO',color:'#8a4dab'}] : []),{key:'Current law',color:'#8292a6'},{key:'Tax only',color:'#477fb8'},{key:'Benefits only',color:'#c58a3d'},...(dynamicReady ? [{key:'Static combined',color:'#96a7a0'}] : []),{key:'Combined',color:'#168565'}]} />
          {dynamicReady && <Chart title="GDP level effect" unit="Difference from static GDP" data={graph} lines={[{key:'GDP level effect',color:'#168565'}]} />}
          {dynamicReady && <Chart title="Deficit path" data={graph} lines={[{key:'Static deficit',color:'#96a7a0'},{key:'Scored deficit',color:'#168565'}]} />}
          <Chart title="Receipts and spending" data={graph} lines={[{key:'Receipts',color:'#168565'},{key:'Primary spending',color:'#c58a3d'},{key:'Interest',color:'#6678aa'}]} />
          <Chart title="What the federal government spends" data={graph} stacked lines={[{key:'Social Security',color:'#4890a2'},{key:'Medicare',color:'#8ac4ad'},{key:'Other mandatory',color:'#a7add3'},{key:'Discretionary',color:'#d9bb78'},{key:'Prefunding',color:'#63a27b'},{key:'Interest',color:'#d58375'}]} />
          <Chart title="Social Security: legacy and flat benefits" data={graph} lines={[{key:'Baseline SS',color:'#8292a6'},{key:'Legacy SS',color:'#4584ad'},{key:'Flat SS',color:'#168565'}]} />
          <Chart title="Medicare: legacy and premium support" data={graph} lines={[{key:'Baseline Medicare',color:'#8292a6'},{key:'Legacy Medicare',color:'#c58a3d'},{key:'Premium support',color:'#168565'}]} />
          <Chart title="Prefunding flows" note="Cohort deposits and avoided PAYGO, when selected." data={graph} lines={[{key:'SS deposits',color:'#4584ad'},{key:'Medicare deposits',color:'#168565'},{key:'Avoided SS PAYGO',color:'#c58a3d'}]} />
          <Chart title="Interest rates" unit="Annual percent" data={graph} lines={[{key:'Market rate',color:'#7089b5'},{key:'Effective rate',color:'#cf8c69'}]} />
        </div><section className="game-card"><h2>Budget ledger · selected years</h2><div className="game-table-wrap"><table className="game-table"><thead><tr><th>Year</th><th>Receipts</th><th>SS</th><th>Medicare</th><th>Other primary</th><th>Interest</th><th>Deficit</th><th>Debt / GDP</th></tr></thead><tbody>{score.combined.years.filter(row=>[2026,2035,2050,2075,2095].includes(row.year)).map(row=>{const d=row.nominalGDP;return <tr key={row.year}><th>{row.year}</th><td>{pct(row.revenue/d)}</td><td>{pct((row.legacySocialSecurity+row.flatSocialSecurityPaygo+row.otherOASDI)/d)}</td><td>{pct((row.legacySeniorMedicare+row.premiumSupportPaygo+row.under65Medicare)/d)}</td><td>{pct((row.totalPrimarySpending-row.legacySocialSecurity-row.flatSocialSecurityPaygo-row.otherOASDI-row.legacySeniorMedicare-row.premiumSupportPaygo-row.under65Medicare)/d)}</td><td>{pct(row.netInterest/d)}</td><td>{pct(row.overallDeficit/d)}</td><td>{ratio(row.endingDebtGDP)}</td></tr>})}</tbody></table></div></section><p className="game-caveat">Scores measure budget and debt, not net welfare. Tax brackets and credits are CPI indexed. Progressive wage-tax brackets are rescored against the Trustees real-wage path plus the selected deviation; the flat X-tax gross base remains tied to the aggregate macro base, while fixed-dollar credit costs change relative to GDP with real GDP per capita. SSA projected population and mortality govern entitlement cohorts, with Trustees beneficiary/enrollment growth used as a fidelity calibration. Non-entitlement CBO spending shares are extended after 2056; the official CBO reference is not. The flat SS promise is independent of wages. Higher wages do not automatically reduce aggregate antipoverty spending in this version. Investment risk and income/wealth-based Medicare contributions remain unresolved. Once the overall deficit first closes, the simulator keeps the budget at least balanced. Any overall surplus used for debt reduction is capped by the selected debt-paydown surplus cap (0% of GDP by default); at 0%, nominal debt is held constant and GDP growth alone lowers debt/GDP. With a positive cap, scheduled surpluses up to that amount retire debt until the selected long-run debt target is reached, after which receipts equal total outlays. The resulting aggregate tax adjustment is not allocated across tax brackets or credits. The debt plot clips paths beyond 1,000% of GDP; exact values remain in the ledger. Results depend strongly on growth and benefit assumptions.</p></div>}
    </main></div>
}
