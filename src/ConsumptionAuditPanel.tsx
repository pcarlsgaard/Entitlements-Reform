import type { ConsumptionAuditResult } from './tax/model/consumptionAudit'

const pct=(x:number)=>x.toFixed(1)+'%'
const millions=(x:number)=>x.toFixed(2)+'M'
const money=(x:number)=>(x<0?'−':'')+'$'+Math.abs(Math.round(x)).toLocaleString('en-US')

/** Screening tool: tax-unit microdata, not linked contract-level households. */
export default function ConsumptionAuditPanel({audit}:{audit:ConsumptionAuditResult}) {
  return <section className="game-card" aria-label="2026 premium and consumption audit">
    <h2>2026 tax-unit consumption and ESI premium audit</h2>
    <p>The tables update with the selected tax, insurance, ESI-dependent, and Roth settings. Both the ESI and residual wage samples are weighted tax units—not a linked household panel. Mandatory retirement deposits are subtracted from current spending, but remain privately owned savings.</p>
    <div className="game-table-wrap"><table className="game-table">
      <thead><tr><th>Wage-income quintile</th><th>Tax units</th><th>Gain any</th><th>Lose &gt;1%</th><th>Lose &gt;5%</th><th>Lose &gt;10%</th></tr></thead>
      <tbody>{audit.byWageQuintile.map(b=><tr key={b.label}>
        <th scope="row">{b.label}</th><td>{millions(b.unitsMillions)}</td>
        <td>{pct(b.gainPercent)}</td><td>{pct(b.loss1Percent)} ({millions(b.loss1Millions)})</td>
        <td>{pct(b.loss5Percent)} ({millions(b.loss5Millions)})</td>
        <td>{pct(b.loss10Percent)}</td>
      </tr>)}
      <tr><th scope="row">All tax units</th><td>{millions(audit.total.unitsMillions)}</td>
        <td>{pct(audit.total.gainPercent)}</td>
        <td>{pct(audit.total.loss1Percent)}</td>
        <td>{pct(audit.total.loss5Percent)}</td><td>{pct(audit.total.loss10Percent)}</td></tr></tbody>
    </table></div>
    <small>Quintiles are defined over the selected wage-earning tax-unit sample, not equivalized income or whole households. Wage cutoffs: {audit.quintileWageBoundaries.map(money).join(' / ')}. The exclusion sensitivity changes the sample itself; cross-mode quintile membership is not fixed. Tax-unit records with nonpositive baseline disposable income: {millions(audit.nonPositiveBaselineMillions)}.</small>
    <details className="game-more">
      <summary>What causes the losses? Tax, insurance and required savings</summary>
      <div className="game-table-wrap"><table className="game-table">
        <thead><tr><th>Among losers</th><th>Number</th><th>Average tax/credit</th><th>Average health transition</th><th>Average Roth deposit</th><th>Average total change</th></tr></thead>
        <tbody>{[
          ...audit.loss1ByCoverage.map(b=>({...b,label:'>1% · '+({'policyholder':'ESI policyholder','dependent':'ESI dependent','nonESI':'No ESI match'}[b.label]??b.label)})),
          ...audit.loss5ByCoverage.map(b=>({...b,label:'>5% · '+({'policyholder':'ESI policyholder','dependent':'ESI dependent','nonESI':'No ESI match'}[b.label]??b.label)})),
        ].map(b=><tr key={b.label}><th scope="row">{b.label}</th><td>{millions(b.unitsMillions)}</td>
          <td>{money(b.meanTaxCreditChangeDollars)}</td><td>{money(b.meanHealthTransitionChangeDollars)}</td>
          <td>{money(b.meanRothSavingDollars)}</td><td>{money(b.meanChangeDollars)}</td></tr>)}
        </tbody>
      </table></div>
      <small>Components sum to each tax unit's modeled change: tax and credits (including the FICA cash pass-through and tax on health wages), direct health cash flows, and compulsory Roth contributions. These categories are accounting assignments, not causal estimates. Among all tax units, {millions(audit.total.loss5AvoidedWithoutRothMillions)} would no longer lose over 5% if required new Roth contributions remained spendable; this comparison does not assign zero value to their saved assets.</small>
    </details>
    <details className="game-more">
      <summary>Audit age- and plan-tier-specific ESI replacement premiums</summary>
      <p>The replacement premium is the Census HIPM 2024 age/location second-lowest-cost Silver benchmark, adjusted by the selected benchmark multiplier. It is <strong>not the existing employer-plan premium</strong>. Old ESI employee + employer contributions and new Silver benchmark pricing may represent different coverage; there are no insurance contract identifiers to validate family allocations.</p>
      <div className="game-table-wrap"><table className="game-table">
        <thead><tr><th>Policyholder age</th><th>Tax units</th><th>Average benchmark</th><th>Average per ESI-covered person</th><th>Premium &gt;$20k</th><th>Benchmark &gt;old ESI total cost</th></tr></thead>
        <tbody>{audit.premiumByAge.filter(b=>b.policyholdersMillions>0).map(b=><tr key={b.label}>
          <th scope="row">{b.label}</th><td>{millions(b.policyholdersMillions)}</td>
          <td>{money(b.meanPremiumDollars)}</td><td>{money(b.meanPerCoveredPersonDollars)}</td>
          <td>{pct(b.sharePremiumOver20000)}</td><td>{pct(b.shareBenchmarkExceedsOldTotal)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="game-table-wrap"><table className="game-table">
        <thead><tr><th>Existing ESI plan tier</th><th>Tax units</th><th>Mean persons in tax-unit ESI</th><th>Average replacement premium</th><th>Premium &gt;$20k</th></tr></thead>
        <tbody>{audit.premiumByTier.filter(b=>b.policyholdersMillions>0).map(b=><tr key={b.label}>
          <th scope="row">{b.label}</th><td>{millions(b.policyholdersMillions)}</td>
          <td>{b.meanCoveredPeople.toFixed(2)}</td><td>{money(b.meanPremiumDollars)}</td>
          <td>{pct(b.sharePremiumOver20000)}</td></tr>)}</tbody>
      </table></div>
      <h3>Policyholders losing over 5%, by age</h3>
      <div className="game-table-wrap"><table className="game-table">
        <thead><tr><th>Age group</th><th>Losers &gt;5%</th><th>Mean health effect</th><th>Mean Roth effect</th><th>Mean tax/credit effect</th></tr></thead>
        <tbody>{audit.severeLossByPolicyholderAge.map(b=><tr key={b.label}><th scope="row">{b.label}</th>
          <td>{millions(b.unitsMillions)}</td><td>{money(b.meanHealthTransitionChangeDollars)}</td>
          <td>{money(b.meanRothSavingDollars)}</td><td>{money(b.meanTaxCreditChangeDollars)}</td></tr>)}</tbody>
      </table></div>
    </details>
    <small>Important limits: non-ESI tax units have no matched individual-market/Medicaid/ACA premiums or health credits. ESI microdata lack children's under-six counts; those ESI tax units receive zero under-six supplement in this audit. The survey's own family-tier labels cannot link dependents across tax units. This audit is strictly distributional, has no independent effect on federal receipts/debt, and is not a validated prediction of household consumption.</small>
  </section>
}
