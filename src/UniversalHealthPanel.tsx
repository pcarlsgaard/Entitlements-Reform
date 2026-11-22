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

export default function UniversalHealthPanel({settings, onChange, opening, increment}: {
  settings: HealthPolicySettings
  onChange: (patch: Partial<HealthPolicySettings>) => void
  opening: UniversalHealthYear | null
  increment: number
}) {
  return <>
    <p>Risk-adjusted, standardized private health plans for all ages. Premium support
      replaces federal Medicare, Medicaid/CHIP and Marketplace coverage outlays;
      ACA and flat purchase credits do not stack with this pathway.</p>
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
      <Numeric label="Under-65 annual real price growth" value={settings.universalBidRealGrowth*100}
        min={-3} max={10} step={0.1} suffix="%"
        onChange={n => onChange({universalBidRealGrowth:n/100})}/>
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
      <div className="game-total"><dt>Additional federal healthcare spending net of replaced programs</dt>
        <dd>{billions(increment)}</dd></div>
    </dl>}
    <small>Under-65 plan costs are computed from the app's existing Census HIPM
      ESI and nongroup premium source and scaled from a roughly 70% Silver actuarial
      value to the selected standardized benefit. Senior costs follow the existing
      CBO/Medicare Trustees cohort projection, with a Part B premium gross-up.
      They do not include every form of supplemental patient spending. The 4%
      second-lowest bid advantage and rural support are modeling assumptions,
      not estimated outcomes of a new auction. The default $202.90 contribution
      equals the 2026 standard Part B premium; the contribution is paid to
      insurers and earns no investment return in this PAYGO version. Current-law
      state Medicaid spending is not counted as federal savings. The provisional
      fiscal score assumes the new plan also displaces all existing federal
      Medicaid/CHIP/Marketplace outlays. Because HIPM premiums do not directly
      price Medicaid long-term services, and the nonelderly high-risk/disabled
      population may be more costly than the privately insured benchmark,
      those obligations still require explicit reconciliation before treating
      this as a comprehensive actuarial budget score.</small>
  </>
}
