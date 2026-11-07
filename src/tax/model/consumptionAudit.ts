/**
 * 2026 tax-unit sensitivity audit for ESI replacement premiums, statutory
 * tax/credit changes, and compulsory Roth contributions.
 *
 * This combines compressed ESI tax units with the residual wage-earning CPS
 * sample, reweighted within coarse wage / filing / child strata. It is NOT
 * linked household/insurance-contract microdata. In particular non-ESI
 * rows lack Medicaid/ACA/private-policy status, while ESI rows lack
 * children's under-six counts. No fiscal revenues are changed here.
 */
import esiJson from '../data/health_esi_2025.json'
import laborJson from '../data/labor_response_microdata_2025.json'
import microJson from '../data/microdata_2025.json'
import baselineJson from '../data/baseline_2025.json'
import { calculateAdultCredit, calculateCurrentLaw, calculateReformWageTax } from './household'
import { calculateChildCredit } from './childCredits'
import type { TaxBreakdown, ReformSettings, FilingStatus } from './types'
import type { HealthPolicySettings } from './health'
import type { PersonalAccountSettings } from '../../model/personalAccountReform'

type Cell = number[]
type Coverage = 'policyholder' | 'dependent' | 'nonESI'
type Row = {
  p: number; s: number; w: number; weight: number;
  adults: number; eligibleAdults: number; children: number; under6: number;
  premium: number; benchmark2024: number; employerContribution: number; healthWage: number;
  coveredPeople: number; coveredAdults: number; tier: number; ageBand: number;
  coverage: Coverage; quintile: number;
}
type Observation = Row & {
  previous: number; change: number; taxChange: number;
  healthChange: number; rothChange: number; premiumNew: number;
  creditHealth: number; sourceWage: number;
}
interface Acc {
  weight: number; winners: number; losses1: number; losses5: number;
  losses10: number; losses5WithoutRoth: number;
  amountTax: number; amountHealth: number; amountRoth: number; amountChange: number;
  lossDollarTotal: number; premiumTotal: number; dollarBaseline: number;
}
export interface ConsumptionAuditBand {
  label: string
  unitsMillions: number
  gainPercent: number
  loss1Percent: number
  loss5Percent: number
  loss10Percent: number
  loss1Millions: number
  loss5Millions: number
  loss10Millions: number
  /** Of this band's units, those with a >5% loss attributable at least partly to new saving. */
  loss5AvoidedWithoutRothMillions: number
  meanChangeDollars: number
  meanTaxCreditChangeDollars: number
  meanHealthTransitionChangeDollars: number
  meanRothSavingDollars: number
}
export interface PremiumAuditBand {
  label: string
  policyholdersMillions: number
  meanPremiumDollars: number
  meanPerCoveredPersonDollars: number
  meanCoveredPeople: number
  sharePremiumOver15000: number
  sharePremiumOver20000: number
  shareBenchmarkExceedsOldTotal: number
}
export interface ConsumptionAuditResult {
  mode: HealthPolicySettings['nonPolicyholderTreatment']
  taxUnitsMillions: number
  quintileWageBoundaries: number[]
  total: ConsumptionAuditBand
  byWageQuintile: ConsumptionAuditBand[]
  loss1ByCoverage: ConsumptionAuditBand[]
  loss5ByCoverage: ConsumptionAuditBand[]
  severeLossByPolicyholderAge: ConsumptionAuditBand[]
  premiumByAge: PremiumAuditBand[]
  premiumByTier: PremiumAuditBand[]
  matchedPolicyIdentifiersAvailable: false
  /** Excluded non-policyholders are not assigned to a different tax unit. */
  excludedTaxUnitsMillions: number
  nonPositiveBaselineMillions: number
  /** Non-ESI observations have no matched nongroup premium/credit data. */
  nongroupPremiumStatusAvailable: false
}

const labor = laborJson as unknown as { distribution: Cell[] }
const esi = esiJson as unknown as { distribution: Cell[] }
const baseline = baselineJson as unknown as {
  gdp: number
  compensationComponents: { employerPensionAndOtherInsurance: number }
}
const micro = microJson as unknown as {
  calibration: { cashWageScaleToBea2025: number }
  compensationControlsBillions: { cashWagesAndSalaries: number }
}
/** 2026 GDP anchor used for the historic consumption comparisons. */
const CASH_SCALE_2026 = micro.calibration.cashWageScaleToBea2025 * 31_902 / baseline.gdp
const PENSION_PER_CASH = baseline.compensationComponents.employerPensionAndOtherInsurance
  / micro.compensationControlsBillions.cashWagesAndSalaries
const SSA_CAP_2026 = 184_500

const limit01 = (v: number) => Math.min(1, Math.max(0, v))
const percent = (top: number, bottom: number) => bottom > 0 ? 100 * top / bottom : 0
const init = (): Acc => ({ weight:0,winners:0,losses1:0,losses5:0,losses10:0,
  losses5WithoutRoth:0,amountTax:0,amountHealth:0,amountRoth:0,
  amountChange:0,lossDollarTotal:0,premiumTotal:0,dollarBaseline:0 })
const tierLabel = (tier: number) => ['Outside-unit dependent','Self-only ESI','Employee plus one','Family ESI'][tier] ?? 'Other'
const ageLabel = (age: number) => ['Outside-unit dependent','Under 30','30–39','40–49','50–59','60–64'][age] ?? 'Other'

function broadIncomeBucket(w: number): number {
  return [25_000,50_000,75_000,100_000,150_000,200_000,300_000]
    .findIndex(x=>w<x) === -1 ? 7 :
    [25_000,50_000,75_000,100_000,150_000,200_000,300_000].findIndex(x=>w<x)
}
const stratum = (w:number,a:number,k:number) => [broadIncomeBucket(w),a,Math.min(2,k)].join(':')

function allocatedHealthWage(r: Cell, h: HealthPolicySettings): number {
  if (h.redistributionRule === 'ownContribution') return r[8]!
  if (h.redistributionRule === 'employerCellEqual') {
    return h.recipientScope === 'policyholders' ? r[12]! : r[13]!
  }
  return h.recipientScope === 'policyholders' ? r[10]! : r[11]!
}

function prepared(h: HealthPolicySettings): { rows: Row[]; excluded: number } {
  const fullWeight = new Map<string,number>()
  const esiWeight = new Map<string,number>()
  const mode = h.nonPolicyholderTreatment ?? 'continueFamilyPolicy'
  for (const r of labor.distribution) {
    const a = r[2]!, k = r[4]!, w=(r[0]!+(a===2?r[1]!:0))*CASH_SCALE_2026
    if (w<=0) continue
    const key=stratum(w,a,k);fullWeight.set(key,(fullWeight.get(key)??0)+r[6]!)
  }
  for (const r of esi.distribution) {
    const a=r[2]!,k=r[4]!,w=(r[0]!+r[1]!)*CASH_SCALE_2026
    if (w<=0) continue
    const key=stratum(w,a,k);esiWeight.set(key,(esiWeight.get(key)??0)+r[21]!)
  }
  const rows:Row[]=[]
  for (const r of labor.distribution) {
    const a=r[2]!,p=r[0]!*CASH_SCALE_2026,s=a===2?r[1]!*CASH_SCALE_2026:0,w=p+s
    if(w<=0)continue
    const key=stratum(w,a,r[4]!)
    const all=fullWeight.get(key)??0,esiPart=esiWeight.get(key)??0
    const wt=r[6]!*Math.max(0,1-(all>0?esiPart/all:0))
    if(wt<=0)continue
    rows.push({p,s,w,weight:wt,adults:a,eligibleAdults:r[3]!,children:r[4]!,
      under6:r[5]!,premium:0,benchmark2024:0,employerContribution:0,healthWage:0,
      coveredPeople:0,coveredAdults:0,tier:0,ageBand:0,coverage:'nonESI',quintile:0})
  }
  let excluded=0
  for(const r of esi.distribution){
    const a=r[2]!,p=r[0]!*CASH_SCALE_2026,s=r[1]!*CASH_SCALE_2026,w=p+s,weight=r[21]!
    if(w<=0)continue
    const dependent=r[14]===0
    if(dependent&&mode==='exclude'){excluded+=weight;continue}
    const active=!dependent || mode==='asModeled'
    rows.push({p,s,w,weight,adults:a,eligibleAdults:r[3]!,children:r[4]!,under6:0,
      premium:active?r[7]!:0,benchmark2024:active?r[9]!:0,employerContribution:active?r[8]!:0,
      healthWage:active?allocatedHealthWage(r,h):0,
      coveredPeople:active?r[5]!:0,coveredAdults:active?r[6]!:0,
      tier:r[16]!,ageBand:r[17]!,coverage:dependent?'dependent':'policyholder',quintile:0})
  }
  return {rows,excluded}
}

function reformTaxBase(
  cashWage:number,fica:number,employerHealth:number,pension:number,t:ReformSettings,
):number {
  return cashWage*(1-limit01(t.cashWageExemptionShare))
    +fica*(1-limit01(t.employerSocialInsuranceExemptionShare))
    +employerHealth*(1-limit01(t.employerHealthInsuranceExemptionShare))
    +pension*(1-limit01(t.employerPensionOtherInsuranceExemptionShare))
}

function sampleOutcome(row:Row,t:ReformSettings,h:HealthPolicySettings,accounts:PersonalAccountSettings): Observation {
  const pretaxPremium = Math.min(row.w,row.premium*limit01(h.employeePremiumPreTaxShare))
  const ratio = row.w>0 ? (row.w-pretaxPremium)/row.w : 1
  const pastPrimary=row.p*ratio,pastSecondary=row.s*ratio
  const status: FilingStatus=row.adults===2?'married':'single'
  const previousTax=calculateCurrentLaw({filingStatus:status,children:row.children,
    cashWage:pastPrimary,secondaryCashWage:pastSecondary})
  const previous=row.w-previousTax.individualIncomeTax
    -previousTax.employeePayrollTax-row.premium
  const fica=t.replacedTaxes.payroll
    ? previousTax.employerPayrollTax*limit01(h.employerFicaPassThroughRate):0
  const healthComp=row.healthWage*limit01(h.employerHealthPassThroughRate)
    +row.employerContribution*(1-limit01(h.employerHealthPassThroughRate))
  const healthWageCash=row.healthWage*limit01(h.employerHealthPassThroughRate)
  const pension=row.w*PENSION_PER_CASH
  const reformComp=row.w+fica+healthComp+pension
  const taxableComp=reformTaxBase(row.w,fica,healthComp,pension,t)
  const reformWageTax=calculateReformWageTax(taxableComp,status,t)
  const creditBase=t.adultCreditEarningsBase==='cash'
    ? row.w+fica+healthWageCash:reformComp
  const adultCredit=calculateAdultCredit(creditBase,row.eligibleAdults,t)
    *limit01(t.adultCreditTakeUpRate)
  // The ESI snapshot has child count but no count under six.
  const childCredit=calculateChildCredit(reformComp,row.children,row.under6,t)
  let retainedCurrentTaxes=0
  if(!t.replacedTaxes.individualIncome || !t.replacedTaxes.payroll){
    const retainedTax=calculateCurrentLaw({filingStatus:status,children:row.children,
      cashWage:row.p+fica+healthWageCash,secondaryCashWage:row.s})
    if(!t.replacedTaxes.individualIncome)retainedCurrentTaxes+=retainedTax.individualIncomeTax
    if(!t.replacedTaxes.payroll)retainedCurrentTaxes+=retainedTax.employeePayrollTax
  }
  const taxChange=fica + previousTax.individualIncomeTax + previousTax.employeePayrollTax
    -reformWageTax-retainedCurrentTaxes+adultCredit+childCredit
  // Annual 2024 HIPM SLCSP benchmark, scaled by the selected policy factor.
  const replacementPremium=row.benchmark2024*Math.max(0,h.benchmarkPremiumScale)
  const healthCredit=Math.min(replacementPremium,
    Math.max(0,h.adultHealthCredit)*row.coveredAdults
    +Math.max(0,h.childHealthCredit)*Math.max(0,row.coveredPeople-row.coveredAdults))
  const healthChange=healthComp + row.premium + healthCredit - replacementPremium
  const employerTaxFor=(w:number)=>.062*Math.min(SSA_CAP_2026,Math.max(0,w))+.0145*Math.max(0,w)
  const employerP=employerTaxFor(pastPrimary)
  const employerS=employerTaxFor(pastSecondary)
  const safeEmployerTotal=employerP+employerS
  const ficaP=fica*(safeEmployerTotal>0?employerP/safeEmployerTotal:0)
  const ficaS=fica*(safeEmployerTotal>0?employerS/safeEmployerTotal:0)
  // New mandatory saving is modeled on covered worker compensation; existing
  // pensions and earlier retirement contributions remain additional.
  const mandatory=accounts.enabled?Math.max(0,accounts.requiredContributionRate)*(
    Math.min(SSA_CAP_2026,Math.max(0,row.p+ficaP+healthWageCash))
    +Math.min(SSA_CAP_2026,Math.max(0,row.s+ficaS))
  ):0
  const rothChange=-mandatory
  return {...row,previous,change:taxChange+healthChange+rothChange,
    taxChange,healthChange,rothChange,premiumNew:replacementPremium,
    creditHealth:healthCredit,sourceWage:row.w}
}

function premiumBands(h:HealthPolicySettings,group:(r:Cell)=>string):PremiumAuditBand[]{
  type P={n:number,prem:number,personPrem:number,people:number,over15:number,over20:number,overOld:number}
  const sums=new Map<string,P>()
  for(const r of esi.distribution){
    if(r[14]===0)continue
    const key=group(r),s=sums.get(key)??{n:0,prem:0,personPrem:0,people:0,over15:0,over20:0,overOld:0}
    const wt=r[21]!,prem=r[9]!*Math.max(0,h.benchmarkPremiumScale)
    const oldPrem=r[7]!+r[8]!
    s.n+=wt;s.prem+=wt*prem;s.personPrem+=wt*prem/Math.max(1,r[5]!)
    s.people+=wt*r[5]!
    s.over15+=wt*Number(prem>15_000);s.over20+=wt*Number(prem>20_000)
    s.overOld+=wt*Number(prem>oldPrem)
    sums.set(key,s)
  }
  return [...sums.entries()].map(([label,s])=>({label,policyholdersMillions:s.n/1e6,
    meanPremiumDollars:s.n?s.prem/s.n:0,
    meanPerCoveredPersonDollars:s.n?s.personPrem/s.n:0,
    meanCoveredPeople:s.n?s.people/s.n:0,
    sharePremiumOver15000:percent(s.over15,s.n),
    sharePremiumOver20000:percent(s.over20,s.n),
    shareBenchmarkExceedsOldTotal:percent(s.overOld,s.n),
  }))
}

function add(acc:Acc,r:Observation){
  const wt=r.weight,base=Math.max(0,r.previous),threshold1=.01*base,threshold5=.05*base,threshold10=.10*base
  acc.weight+=wt;acc.winners+=wt*Number(r.change>=0)
  // Percent losses are undefined when prior disposable income is nonpositive.
  // Keep such units in population and gain counts, but not the loss bins.
  if(r.previous>0){
    acc.losses1+=wt*Number(r.change< -threshold1)
    acc.losses5+=wt*Number(r.change< -threshold5)
    acc.losses10+=wt*Number(r.change< -threshold10)
    acc.losses5WithoutRoth+=wt*Number(r.change< -threshold5 && r.change-r.rothChange>= -threshold5)
  }
  acc.amountTax+=wt*r.taxChange;acc.amountHealth+=wt*r.healthChange
  acc.amountRoth+=wt*r.rothChange;acc.amountChange+=wt*r.change
  acc.lossDollarTotal+=wt*Math.max(0,-r.change);acc.premiumTotal+=wt*r.premiumNew
  acc.dollarBaseline+=wt*r.previous
}
function band(label:string,records:Observation[]):ConsumptionAuditBand{
  const a=init();for(const r of records)add(a,r)
  const w=a.weight
  return{label,unitsMillions:w/1e6,gainPercent:percent(a.winners,w),
    loss1Percent:percent(a.losses1,w),loss5Percent:percent(a.losses5,w),
    loss10Percent:percent(a.losses10,w),loss1Millions:a.losses1/1e6,
    loss5Millions:a.losses5/1e6,loss10Millions:a.losses10/1e6,
    loss5AvoidedWithoutRothMillions:a.losses5WithoutRoth/1e6,
    meanChangeDollars:w?a.amountChange/w:0,
    meanTaxCreditChangeDollars:w?a.amountTax/w:0,
    meanHealthTransitionChangeDollars:w?a.amountHealth/w:0,
    meanRothSavingDollars:w?a.amountRoth/w:0}
}
const lossOver=(r:Observation,pct:number)=>r.previous>0 && r.change< -pct*r.previous
export function calculateConsumptionAudit(
  tax:ReformSettings,health:HealthPolicySettings,accounts:PersonalAccountSettings,
):ConsumptionAuditResult{
  const {rows,excluded}=prepared(health)
  rows.sort((a,b)=>a.w-b.w)
  const total=rows.reduce((sum,r)=>sum+r.weight,0)
  let cum=0
  const boundaries:number[]=[]
  let last=0
  for(const r of rows){
    const index=Math.min(4,Math.floor(5*(cum+r.weight/2)/Math.max(1,total)))
    for(let i=last;i<index;i++)boundaries[i]=r.w
    last=index
    r.quintile=index
    cum+=r.weight
  }
  const observed=rows.map(r=>sampleOutcome(r,tax,health,accounts))
  const mode=health.nonPolicyholderTreatment??'continueFamilyPolicy'
  return{mode,taxUnitsMillions:total/1e6,quintileWageBoundaries:boundaries,
    total:band('All wage-earning tax units',observed),
    byWageQuintile:[0,1,2,3,4].map(q=>band('Q'+(q+1),observed.filter(r=>r.quintile===q))),
    loss1ByCoverage:(['policyholder','dependent','nonESI'] as Coverage[]).map(kind=>
      band(kind,observed.filter(r=>r.coverage===kind&&lossOver(r,.01)))),
    loss5ByCoverage:(['policyholder','dependent','nonESI'] as Coverage[]).map(kind=>
      band(kind,observed.filter(r=>r.coverage===kind&&lossOver(r,.05)))),
    severeLossByPolicyholderAge:[1,2,3,4,5].map(i=>band(ageLabel(i),
      observed.filter(r=>r.coverage==='policyholder'&&r.ageBand===i&&lossOver(r,.05)))),
    premiumByAge:premiumBands(health,r=>ageLabel(r[17]!)),
    premiumByTier:premiumBands(health,r=>tierLabel(r[16]!)),
    matchedPolicyIdentifiersAvailable:false,
    excludedTaxUnitsMillions:excluded/1e6,
    nonPositiveBaselineMillions:observed.reduce((s,r)=>s+(r.previous<=0?r.weight:0),0)/1e6,
    nongroupPremiumStatusAvailable:false
  }
}
