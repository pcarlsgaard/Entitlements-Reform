import { useMemo, useState } from 'react'
import type { CombinedPolicy } from './model/combined'
import { scaledWorkerClasses,scaledWorkerEarnings,scaledWorkerRetirementBenefit } from './model/ssaScaledWorkers'
import type { ScaledWorkerClass } from './model/ssaScaledWorkers'
import { accountAnnuityFactor, accountBalanceAtClaim } from './model/personalAccountReform'
import { flatBenefitNominal, socialSecurityBenefitShares } from './model/socialSecurity'
import { populationMillions } from './model/demographics'
import { calculateHousehold } from './tax/model/household'

// Research diagnostic only. These are nearest-AIME shares among 2020–25 retirees
// in OCACT 2026 scaled-factors Note 2026.3 Table 1, NOT age-by-earnings census weights.
const masses:Record<ScaledWorkerClass,number>={veryLow:.186,low:.235,medium:.302,high:.199}
const bottomMass:Record<ScaledWorkerClass,number>={veryLow:.186,low:.235,medium:.302,high:.077}
const ages=[20,25,30,35,40,45,50,55,60,65]
const tierLabel:Record<ScaledWorkerClass,string>={veryLow:'Very low',low:'Low',medium:'Medium',high:'High'}
const money=(n:number)=>Math.round(n).toLocaleString('en-US')
const percent=(n:number)=>`${(n*100).toFixed(1)}%`
function scoreScaledWorker(policy:CombinedPolicy,age2026:number,tier:ScaledWorkerClass){
  const a=policy.assumptions,claimAge=a.socialSecurityClaimAge,birth=2026-age2026
  const record=scaledWorkerEarnings(birth,tier,a)
  const current=scaledWorkerRetirementBenefit(birth,tier,claimAge,a).annualAtClaim
  const shares=policy.benefits.socialSecurityReform
    ? socialSecurityBenefitShares(birth+a.fullRetirementAge,a):{legacyShare:1,flatShare:0}
  const flat=flatBenefitNominal(birth+claimAge,birth+claimAge,a)
  const promised=shares.legacyShare*current+shares.flatShare*flat
  const annual2026=record.find(e=>e.year===2026)?.coveredEarnings??0
  const p=policy.personalAccounts
  const balance=accountBalanceAtClaim(birth,claimAge,a,p,(year)=>{
    const earned=record.find(row=>row.year===year)?.coveredEarnings??0
    const contribution=earned*p.requiredContributionRate
    const grant=p.governmentMatchCap2026>0
      ? Math.min(contribution,p.governmentMatchCap2026*(1+a.inflation)**(year-2026)):0
    return contribution+grant
  })
  const factor=accountAnnuityFactor(birth,claimAge,a)
  const annuity=p.enabled&&factor>0?balance/factor:0
  const reformed=p.enabled?Math.max(promised,annuity):promised
  const taxChange=policy.taxEnabled?calculateHousehold(
     {filingStatus:'single',cashWage:annual2026,children:0},policy.tax).dollarChange:0
  const workingDelta=taxChange-(p.enabled?annual2026*p.requiredContributionRate:0)
  return {age2026,tier,annual2026,current,annuity,
    governmentTopup:p.enabled?Math.max(0,promised-annuity):promised,
    reformed,workingDelta,difference:current>0?reformed/current-1:0}
}
export default function ScaledWorkerPanel({policy}:{policy:CombinedPolicy}){
  const [selectedAge,setAge]=useState(40)
  const results=useMemo(()=>{
    const cells=ages.flatMap(age=>scaledWorkerClasses.map(tier=>{
      const cell=scoreScaledWorker(policy,age,tier)
      const demographicWeight=populationMillions(2026,age,policy.assumptions)
      return {...cell,weight:demographicWeight*masses[tier],lowerWeight:demographicWeight*bottomMass[tier]}
    }))
    const total=cells.reduce((s,x)=>s+x.lowerWeight,0)
    return {cells,protected:cells.filter(x=>x.difference>=-1e-9)
      .reduce((s,x)=>s+x.lowerWeight,0)/total,
      working:cells.filter(x=>x.workingDelta>=-1e-9)
      .reduce((s,x)=>s+x.lowerWeight,0)/total,
      averageShortfall:cells.reduce((s,x)=>s+x.weight*Math.max(0,-x.difference),0)/
        cells.reduce((s,x)=>s+x.weight,0)}
  },[policy])
  return <details className="game-card">
    <summary>SSA scaled-worker retirement audit · statutory AIME/PIA</summary>
    <p>Unlike the illustrative household tab, this panel reconstructs annual covered
      earnings from SSA's 2026 age-specific scaled factors and uses one record for
      the high-35-year AIME/PIA calculation and post-2026 private-account contributions.
      Outcomes are scheduled retirement benefits upon claiming, in nominal dollars.</p>
    <div className="game-score-grid">
      <article className="game-card game-score"><span>Bottom 80% with no retirement loss</span>
        <strong>{percent(results.protected)}</strong></article>
      <article className="game-card game-score"><span>Bottom 80% with no 2026 wage-cash loss</span>
        <strong>{percent(results.working)}</strong></article>
      <article className="game-card game-score"><span>Average retirement shortfall (modeled cases)</span>
        <strong>{percent(results.averageShortfall)}</strong></article>
    </div>
    <label className="game-field"><span>Age in 2026</span><select value={selectedAge}
      onChange={e=>setAge(Number(e.target.value))}>{ages.map(age=><option key={age} value={age}>{age}</option>)}</select></label>
    <div className="game-table-wrap"><table className="game-table">
      <thead><tr><th>SSA worker</th><th>2026 covered earnings</th><th>Scheduled current law</th>
        <th>Account annuity</th><th>Federal top-up</th><th>Combined retirement income</th>
        <th>Retirement change</th><th>2026 working cash change</th></tr></thead>
      <tbody>{results.cells.filter(x=>x.age2026===selectedAge).map(x=><tr key={x.tier}>
        <th>{tierLabel[x.tier]}</th><td>${money(x.annual2026)}</td><td>${money(x.current)}</td>
        <td>${money(x.annuity)}</td><td>${money(x.governmentTopup)}</td>
        <td>${money(x.reformed)}</td><td>{percent(x.difference)}</td>
        <td>${money(x.workingDelta)}</td>
      </tr>)}</tbody>
    </table></div>
    <small>SSA OCACT Note 2026.3, Tables 1 and 6; historical AWI; statutory 90/32/15 PIA.
      Ages 65+ have no new scaled earnings because SSA publishes scaled factors only
      through age 64. Results use hypothetical workers, age-weighted with SSA's
      2026 population and approximate retired-worker AIME-category shares;
      7.8% nearest-maximum earners are not modeled.
      Bottom-80% weights include a partial high-earner category. The 2026
      working-cash comparison includes modeled wage taxes and compulsory saving,
      but not benefits, health insurance costs, transfer changes, or indirect taxes.
      The federal aggregate fiscal and debt projections elsewhere still use the
      original cohort proxy; do not assume these individual figures are reconciled
      to those public-spending projections. Investment returns are deterministic.</small>
  </details>
}
