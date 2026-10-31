/**
 * Research-only scheduled-benefit personal accounts. Not yet part of the GUI score.
 *
 * Federal cost = account contributions redirected from payroll receipts
 * + scheduled benefit guarantee topups + taxes lost on displaced SS benefits.
 * The diverted payroll receipts are counted ONCE as equivalent gross deposits;
 * do not also subtract these same receipts from federal revenue.
 */
import { currentLawRetirementAge } from './defaults'
import { ssaTaxablePayrollGDP2026 } from '../data/ssaTaxablePayrollGDP2026'
import { nominalGDPGrowth } from './debt'
import { populationMillions, projectedSurvival } from './demographics'
import { socialSecurityForYear } from './socialSecurity'
import { relativeBenefitAtPercentile } from './socialSecurityDistribution'
import type { ModelAssumptions } from './types'

export interface EarningsGroup {
  name: string
  share: number
  taxableEarningsIndex: number
  benefitPercentile: number
}

export const defaultEarningsGroups: readonly EarningsGroup[] = [
  { name: 'p10', share: .1, taxableEarningsIndex: .25, benefitPercentile: .1 },
  { name: 'p25', share: .2, taxableEarningsIndex: .55, benefitPercentile: .25 },
  { name: 'p50', share: .4, taxableEarningsIndex: 1, benefitPercentile: .5 },
  { name: 'p75', share: .2, taxableEarningsIndex: 1.65, benefitPercentile: .75 },
  { name: 'p90', share: .1, taxableEarningsIndex: 2.45, benefitPercentile: .9 },
]

export interface PersonalAccountsPolicy {
  startYear: number
  /** Fraction ramps 1/N, 2/N ... to 1 over N years. */
  rampYears: number
  /** 1 for full redirection; alternatively partial redirection. */
  redirectShare: number
  /** 12.4% for both employer and employee; 10.6% OASI; 6.2% employee. */
  payrollRate: number
  /** 2026 Trustees' projected 2026 taxable payroll/GDP: 0.342. */
  taxablePayrollGDP: number
  /** Optional year-specific replacement for constant taxable payroll/GDP. */
  payrollGDPByYear?: Readonly<Record<number, number>>
  /** Annual real asset return before fees; path overrides constant when supplied. */
  annualRealReturn: number
  realReturnByYear?: Readonly<Record<number, number>>
  annualAssetFee: number
  /** Real fixed yield used to price CPI-indexed annuity, not an equity guarantee. */
  annuityRealYield: number
  /** Consolidated federal tax loss on benefit dollars displaced by private annuities. */
  displacedBenefitTaxRate: number
  groups: readonly EarningsGroup[]
}

export const defaultPersonalAccountsPolicy: PersonalAccountsPolicy = {
  startYear: 2026, rampYears: 10, redirectShare: 1, payrollRate: .124,
  taxablePayrollGDP: .342, payrollGDPByYear: ssaTaxablePayrollGDP2026, annualRealReturn: .04, annualAssetFee: .0025,
  annuityRealYield: .023, displacedBenefitTaxRate: .07,
  groups: defaultEarningsGroups,
}

export interface AccountGroupYear {
  name: string
  scheduledBillions: number
  governmentTopupBillions: number
  privateTowardPromiseBillions: number
  privateExcessBillions: number
}
export interface PersonalAccountsYear {
  year: number
  nominalGDPBillions: number
  redirectedBillions: number
  scheduledOASIBillions: number
  governmentTopupBillions: number
  privateTowardPromiseBillions: number
  privateExcessBillions: number
  lostBenefitTaxesBillions: number
  federalCostBillions: number
  fiscalSavingsBillions: number
  groups: AccountGroupYear[]
}

function validate(a: ModelAssumptions, p: PersonalAccountsPolicy): void {
  if (p.startYear < a.reformYear) throw new RangeError('Historical enactment requires a separate demographic baseline.')
  if (!Number.isInteger(p.rampYears) || p.rampYears < 1) throw new RangeError('Positive integer ramp required.')
  for (const v of [p.redirectShare,p.payrollRate,p.taxablePayrollGDP,p.annualAssetFee,p.displacedBenefitTaxRate]) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError('Policy share must be between zero and one.')
  }
  for (const v of [p.annualRealReturn,p.annuityRealYield,...Object.values(p.realReturnByYear ?? {})]) {
    if (!Number.isFinite(v) || v <= -1) throw new RangeError('Invalid real return.')
  }
  if (p.groups.length === 0 || p.groups.some(g => g.share <= 0 || g.taxableEarningsIndex < 0 ||
    g.benefitPercentile < 0 || g.benefitPercentile > 1)) throw new RangeError('Invalid income groups.')
}
function workWeight(age: number): number {
  if (age < 18 || age >= currentLawRetirementAge) return 0
  if (age < 25) return .60
  if (age < 55) return 1
  if (age < 62) return .80
  return .55
}
function gdp(year: number, a: ModelAssumptions): number {
  return a.startingNominalGDPBillions * nominalGDPGrowth(a) ** (year-a.reformYear)
}
export function payrollDiversionShare(year: number, p: PersonalAccountsPolicy): number {
  return year < p.startYear ? 0 : p.redirectShare * Math.min(1,(year-p.startYear+1)/p.rampYears)
}
export function redirectedPayrollBillions(year: number, a: ModelAssumptions, p: PersonalAccountsPolicy): number {
  return gdp(year,a) * (p.payrollGDPByYear?.[year] ?? p.taxablePayrollGDP) *
    p.payrollRate * payrollDiversionShare(year,p)
}
const populationCache = new WeakMap<ModelAssumptions, Map<number, number>>()
function workPopulation(year: number, a: ModelAssumptions): number {
  let cache=populationCache.get(a)
  if(!cache){cache=new Map();populationCache.set(a,cache)}
  const cached=cache.get(year)
  if(cached!==undefined)return cached
  let sum=0
  for(let age=18;age<currentLawRetirementAge;age++) sum += populationMillions(year,age,a)*workWeight(age)
  cache.set(year,sum)
  return sum
}
function normalizedIndices(p: PersonalAccountsPolicy): {share:number[], wage:number[], benefit:number[]} {
  const total=p.groups.reduce((n,g)=>n+g.share,0)
  const share=p.groups.map(g=>g.share/total)
  const wageMean=share.reduce((n,v,i)=>n+v*p.groups[i]!.taxableEarningsIndex,0)
  const benefitRaw=p.groups.map(g=>relativeBenefitAtPercentile(g.benefitPercentile))
  const benefitMean=share.reduce((n,v,i)=>n+v*benefitRaw[i]!,0)
  if(wageMean<=0||benefitMean<=0) throw new RangeError('Group means must be positive.')
  return {share,wage:p.groups.map(g=>g.taxableEarningsIndex/wageMean),
    benefit:benefitRaw.map(b=>b/benefitMean)}
}
/** Real-rate annuitization: guaranteed CPI stream, not perpetual risky withdrawal. */
export function accountAnnualAnnuityAtRetirement(retireYear:number, wageIndex:number,
  a:ModelAssumptions, p:PersonalAccountsPolicy): number {
  if(retireYear<=p.startYear||wageIndex===0)return 0
  let balance=0
  let compound=1
  const earliest=Math.max(p.startYear,retireYear-(currentLawRetirementAge-18))
  for(let year=retireYear-1;year>=earliest;year--){
    const age=currentLawRetirementAge-retireYear+year
    const participants=workPopulation(year,a)
    const deposit=participants>0 ? 1000*redirectedPayrollBillions(year,a,p)/
      participants*workWeight(age)*wageIndex : 0
    compound*=(1+a.inflation)*(1+(p.realReturnByYear?.[year]??p.annualRealReturn))*
      (1-p.annualAssetFee)
    balance+=deposit*compound
  }
  let annuityFactor=0
  const birthYear=retireYear-currentLawRetirementAge
  for(let age=currentLawRetirementAge;age<=a.maxModeledAge;age++)
    annuityFactor+=projectedSurvival(currentLawRetirementAge,age,birthYear)/
      (1+p.annuityRealYield)**(age-currentLawRetirementAge)
  return annuityFactor>0?balance/annuityFactor:0
}
/**
 * Uses the same pre-existing current-law retired-worker aggregate benchmark.
 * Five earnings and benefit groups are transparent proxies, NOT joint microdata.
 * The guarantee applies group by group, never to the national mean.
 */
export function projectPersonalAccounts(a:ModelAssumptions,
  p:PersonalAccountsPolicy=defaultPersonalAccountsPolicy,
  throughYear=Math.min(a.endYear,2100)):PersonalAccountsYear[]{
  validate(a,p)
  const current:ModelAssumptions={...a,fullRetirementAge:currentLawRetirementAge,
    socialSecurityClaimAge:currentLawRetirementAge,socialSecurityReformFRA:currentLawRetirementAge,
    socialSecurityInitialBenefitMode:'current',socialSecurityCOLAMode:'current',
    socialSecurityBenefitCap2026:null,fundingStrategy:'paygo'}
  const index=normalizedIndices(p)
  const annuities=new Map<string,number>()
  const output:PersonalAccountsYear[]=[]
  for(let year=Math.max(p.startYear,a.reformYear);year<=throughYear;year++){
    const retired=socialSecurityForYear(year,current,'currentLaw')
    const groups:AccountGroupYear[]=p.groups.map((group,i)=>{
      let scheduledBillions=0,governmentTopupBillions=0,privateTowardPromiseBillions=0,privateExcessBillions=0
      for(const cohort of retired.cohorts){
        const scheduled=cohort.legacyPaygoBillions*index.share[i]!*index.benefit[i]!
        const key=String(cohort.retirementYear)+':'+group.name
        let annuity=annuities.get(key)
        if(annuity===undefined){
          annuity=accountAnnualAnnuityAtRetirement(cohort.retirementYear,index.wage[i]!,current,p)
          annuities.set(key,annuity)
        }
        const amount=cohort.survivingBeneficiariesMillions*index.share[i]!*annuity*
          (1+a.inflation)**Math.max(0,year-cohort.retirementYear)/1000
        scheduledBillions+=scheduled
        governmentTopupBillions+=Math.max(0,scheduled-amount)
        privateTowardPromiseBillions+=Math.min(scheduled,amount)
        privateExcessBillions+=Math.max(0,amount-scheduled)
      }
      return {name:group.name,scheduledBillions,governmentTopupBillions,
        privateTowardPromiseBillions,privateExcessBillions}
    })
    const scheduledOASIBillions=retired.legacyBillions
    const governmentTopupBillions=groups.reduce((n,g)=>n+g.governmentTopupBillions,0)
    const privateTowardPromiseBillions=groups.reduce((n,g)=>n+g.privateTowardPromiseBillions,0)
    const privateExcessBillions=groups.reduce((n,g)=>n+g.privateExcessBillions,0)
    const redirectedBillions=redirectedPayrollBillions(year,current,p)
    const lostBenefitTaxesBillions=privateTowardPromiseBillions*p.displacedBenefitTaxRate
    const federalCostBillions=redirectedBillions+governmentTopupBillions+lostBenefitTaxesBillions
    output.push({year,nominalGDPBillions:gdp(year,current),redirectedBillions,
      scheduledOASIBillions,governmentTopupBillions,privateTowardPromiseBillions,
      privateExcessBillions,lostBenefitTaxesBillions,federalCostBillions,
      fiscalSavingsBillions:scheduledOASIBillions-federalCostBillions,groups})
  }
  return output
}
