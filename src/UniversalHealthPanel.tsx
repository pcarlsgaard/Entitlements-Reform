import { useState } from 'react'
import type { HealthPolicySettings } from './tax/model/health'
import type { UniversalHealthYear } from './model/universalHealth'

function Numeric({ label, value, onChange, min = 0, max, step = 1, suffix }: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const commit = () => {
    const number = Number(draft)
    if (draft.trim() && Number.isFinite(number) && number >= min &&
      (max === undefined || number <= max)) onChange(number)
    setFocused(false)
  }
  return <label className="game-field">
    <span>{label}</span>
    <span className="game-number">
      <input type="number" aria-label={label} min={min} max={max} step={step}
        value={focused ? draft : value}
        onFocus={() => { setDraft(String(value)); setFocused(true) }}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      {suffix && <small>{suffix}</small>}
    </span>
  </label>
}

const billions = (value: number) => '$' + Math.round(value).toLocaleString() + 'B'
const dollars = (value: number) => '$' + Math.round(value).toLocaleString()

export default function UniversalHealthPanel({settings, onChange, opening, retainedMedicaid, increment}: {
  settings: HealthPolicySettings
  onChange: (patch: Partial<HealthPolicySettings>) => void
  opening: UniversalHealthYear | null
  retainedMedicaid: number
  increment: number
}) {
  return <>
    <p>Risk-adjusted, standardized private health plans for all ages. Premium support
      replaces federal Medicare, CHIP and Marketplace coverage outlays. Select how much
      federal Medicaid spending the new coverage displaces.</p>
    <label className="game-field"><span>Federal Medicaid spending offset</span>
      <select value={settings.universalMedicaidOffset} onChange={e => onChange({
        universalMedicaidOffset: e.target.value === 'full' ? 'full' : 'acuteOnly',
      })}>
        <option value="acuteOnly">Preserve disability and long-term care</option>
        <option value="full">Replace all federal Medicaid spending</option>
      </select>
    </label>
    <label className="game-field"><span>Premium-support benchmark</span>
      <select value={settings.universalBenchmark} onChange={e => onChange({
        universalBenchmark: e.target.value as HealthPolicySettings['universalBenchmark'],
      })}>
        <option value="secondLowest">Second-lowest qualifying bid</option>
        <option value="average">Average qualifying bid</option>
      </select>
    </label>
    <Numeric label="Monthly member contribution · each resident, including children"
      value={settings.universalMemberPremiumMonthly2026} min={0} max={3000} step={0.1} suffix="$"
      onChange={universalMemberPremiumMonthly2026 => onChange({universalMemberPremiumMonthly2026})} />
    <p>Plan costs for both age groups grow using one real cost-per-enrollee rule after 2026.
      The number and age distribution of enrolled residents are projected separately.
      Member contributions can grow at a different rate, changing the federal share.</p>
    <details className="game-more"><summary>Coverage, cost and competitive-bid assumptions</summary>
      <Numeric label="Standardized benefit actuarial value" value={settings.universalTargetActuarialValue*100}
        min={70} max={100} step={1} suffix="%"
        onChange={n => onChange({universalTargetActuarialValue:n/100})}/>
      <Numeric label="Bid price multiplier vs projected source costs" value={settings.universalBidMultiplier*100}
        min={50} max={200} suffix="%" onChange={n => onChange({universalBidMultiplier:n/100})}/>
      <Numeric label="Second-lowest bid / average bid" value={settings.universalSecondLowestBidFactor*100}
        min={50} max={100} suffix="%" onChange={n => onChange({universalSecondLowestBidFactor:n/100})}/>
      <Numeric label="HIPM 2024-to-2025 premium scaling" value={settings.benchmarkPremiumScale*100}
        min={0} max={300} suffix="%" onChange={n => onChange({benchmarkPremiumScale:n/100})}/>
      <label className="game-field"><span>All-age cost-growth scenario</span>
        <select value={[.01,.018,.025,.03].includes(settings.universalBidRealGrowth)
          ? String(settings.universalBidRealGrowth) : 'custom'}
          onChange={e => {if (e.target.value !== 'custom')
            onChange({universalBidRealGrowth:Number(e.target.value)})}}>
          <option value="0.01">Cost containment · 1.0% real</option>
          <option value="0.018">Central · 1.8% real</option>
          <option value="0.025">High growth · 2.5% real</option>
          <option value="0.03">Adverse growth · 3.0% real</option>
          <option value="custom" disabled>Custom rate below</option>
        </select>
      </label>
      <Numeric label="Universal plan annual real cost growth · all ages, per enrollee"
        value={Math.round(settings.universalBidRealGrowth*1000)/10}
        min={-3} max={10} step={0.1} suffix="%"
        onChange={n => onChange({universalBidRealGrowth:n/100})}/>
      <Numeric label="Member contribution annual real growth · beyond CPI"
        value={Math.round(settings.universalMemberPremiumRealGrowth*1000)/10}
        min={-3} max={10} step={0.1} suffix="%"
        onChange={n => onChange({universalMemberPremiumRealGrowth:n/100})}/>
      <Numeric label="Additional rural access support · 2026" value={settings.universalRuralSupportBillions2026}
        min={0} max={500} step={5} suffix="$B"
        onChange={universalRuralSupportBillions2026 => onChange({universalRuralSupportBillions2026})}/>
    </details>
    <details className="game-more"><summary>Employer coverage compensation transition</summary>
      <Numeric label="Employer health contribution converted to wages" value={settings.employerHealthPassThroughRate*100}
        min={0} max={100} suffix="%" onChange={n => onChange({employerHealthPassThroughRate:n/100})}/>
      <Numeric label="Employer FICA converted to wages" value={settings.employerFicaPassThroughRate*100}
        min={0} max={100} suffix="%" onChange={n => onChange({employerFicaPassThroughRate:n/100})}/>
      <Numeric label="Existing employee premium pretax fraction" value={settings.employeePremiumPreTaxShare*100}
        min={0} max={100} suffix="%" onChange={n => onChange({employeePremiumPreTaxShare:n/100})}/>
      <label className="game-field"><span>Employer pool distribution</span>
        <select value={settings.redistributionRule} onChange={e=>onChange({
          redistributionRule:e.target.value as HealthPolicySettings['redistributionRule'],
        })}>
          <option value="nationalEqual">National equal</option>
          <option value="employerCellEqual">Employer cell equal</option>
          <option value="ownContribution">Own employer contribution</option>
        </select>
      </label>
      <label className="game-field"><span>Health wage recipient</span>
        <select value={settings.recipientScope} onChange={e=>onChange({
          recipientScope:e.target.value as HealthPolicySettings['recipientScope'],
        })}>
          <option value="policyholders">ESI policyholders</option>
          <option value="coveredWorkers">Covered workers</option>
        </select>
      </label>
    </details>
    {opening && <dl className="game-ledger">
      <div><dt>All-age insured population</dt><dd>{opening.populationMillions.toFixed(1)}M</dd></div>
      <div><dt>Existing HIPM 2024 Silver annual premium · nonelderly</dt>
        <dd>{dollars(opening.sourceSilverAnnualPerPerson2024)}</dd></div>
      <div><dt>Derived under-65 gross bid / resident / year</dt>
        <dd>{dollars(opening.nonelderlyGrossAnnualPerPerson)}</dd></div>
      <div><dt>Derived 65+ gross bid / resident / year</dt>
        <dd>{dollars(opening.seniorGrossAnnualPerPerson)}</dd></div>
      <div><dt>Average gross all-age bid / month</dt><dd>{dollars(opening.averageBidMonthly)}</dd></div>
      <div><dt>Selected gross benchmark / month</dt><dd>{dollars(opening.benchmarkMonthly)}</dd></div>
      <div><dt>Gross plan benchmark premiums</dt><dd>{billions(opening.grossBenchmarkBillions)}</dd></div>
      <div><dt>Resident contributions paid to plans</dt><dd>−{billions(opening.memberContributionsBillions)}</dd></div>
      <div><dt>Federal premium grants plus rural support</dt><dd>{billions(opening.federalOutlayBillions)}</dd></div>
      <div><dt>Federal Medicaid spending retained</dt><dd>{billions(retainedMedicaid)}</dd></div>
      <div className="game-total"><dt>Additional federal healthcare spending net of replaced programs</dt>
        <dd>{billions(increment)}</dd></div>
    </dl>}
    <small>2026 under-65 plan costs are computed from the app's Census HIPM
      ESI and nongroup premium source and scaled from approximately 70% Silver AV
      to the chosen benefit. The 2026 senior anchor uses CBO/Medicare Trustees
      current-law net Medicare spending plus a Part B premium gross-up; its 90%-AV
      normalization is an explicit sensitivity assumption, not a measured
      traditional-Medicare actuarial value. Both anchors subsequently grow at the
      selected single real per-enrollee rate plus CPI. Changes in the number of
      younger and older enrollees still affect aggregate spending. Current-law
      Medicare projections remain in the comparator only.
      The 4% second-lowest bid advantage and rural support are model assumptions,
      not observed savings. The default $202.90 member contribution is the 2026
      standard Part B premium; by default it grows with CPI alone, but its separate
      real growth control allows financing scenarios. It is paid to insurers,
      not Treasury, and earns no investment return. The default retains estimated spending
      for disability-based eligibility, separately identified long-term services and Medicare
      premium assistance. Managed care can contain additional long-term services that the
      source does not separate. State Medicaid savings are outside the federal ledger.
      Under-65 benchmark bids still use a privately insured population as the pricing proxy.</small>
  </>
}
