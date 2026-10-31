/** Mandatory, individually owned retirement accounts with a public benefit floor.
 * Contributions are private savings, never Treasury deposits or tax receipts.
 * The match is one federal dollar per private contribution dollar, up to a
 * CPI-indexed annual per-worker cap set in 2026 dollars.
 * Stylized income-group proxies retain the exact aggregate benefit totals.
 */
import { ssaTaxablePayrollGDP2026 } from '../data/ssaTaxablePayrollGDP2026'
import { currentLawRetirementAge } from './defaults'
import { nominalGDPGrowth } from './debt'
import { populationMillions, projectedSurvival } from './demographics'
import { socialSecurityForYear } from './socialSecurity'
import { relativeBenefitAtPercentile } from './socialSecurityDistribution'
import { currentLawDeliveryShares } from './currentLaw'
import type { CurrentLawBaselineMode, ModelAssumptions } from './types'

export interface PersonalAccountSettings {
  enabled: boolean
  /** Fraction of individual covered earnings, not total household income. */
  requiredContributionRate: number
  /** Gross real asset return during accumulation. */
  expectedRealReturn: number
  /** Federal 1:1 match up to this many 2026 dollars per worker per year. Zero disables the match. */
  governmentMatchCap2026: number
}

export const defaultPersonalAccountSettings: PersonalAccountSettings = {
  enabled: false, requiredContributionRate: .065, expectedRealReturn: .04, governmentMatchCap2026: 0,
}
export const accountFees = .0025
export const realAnnuityYield = .023
export const incomeGroups = [
  { name: 'p10', share: .1, wage: .25, benefitRank: .1 },
  { name: 'p25', share: .2, wage: .55, benefitRank: .25 },
  { name: 'p50', share: .4, wage: 1, benefitRank: .5 },
  { name: 'p75', share: .2, wage: 1.65, benefitRank: .75 },
  { name: 'p90', share: .1, wage: 2.45, benefitRank: .9 },
] as const
const meanWage = incomeGroups.reduce((s,g)=>s+g.share*g.wage,0)
const benefitIndices = incomeGroups.map(g=>relativeBenefitAtPercentile(g.benefitRank))
const meanBenefit = incomeGroups.reduce((s,g,i)=>s+g.share*benefitIndices[i]!,0)
const wageIndex = incomeGroups.map(g=>g.wage/meanWage)
const benefitIndex = benefitIndices.map(v=>v/meanBenefit)
const weight = (age:number)=> age<18||age>=currentLawRetirementAge?0: age<25?.6:age<55?1:age<62?.8:.55

export interface PersonalAccountReformYear {
  year: number
  privateContributionBillions: number
  governmentMatchingBillions: number
  scheduledBenefitsBillions: number
  federalTopupsBillions: number
  privateBenefitOffsetBillions: number
  privateExcessBillions: number
}

export function accountAnnuityFactor(birthYear:number,claimAge:number,a:ModelAssumptions):number {
  if(claimAge<18||claimAge>a.maxModeledAge)return 0
  let sum=0
  for(let age=claimAge;age<=a.maxModeledAge;age++)
    sum+=projectedSurvival(claimAge,age,birthYear)/(1+realAnnuityYield)**(age-claimAge)
  return sum
}

/** Identical account valuation convention for cohort and household panels:
 * end-of-year nominal contributions, real return net of fees, then CPI annuity. */
export function accountBalanceAtClaim(
  birthYear:number, claimAge:number, a:ModelAssumptions, p:PersonalAccountSettings,
  annualNominalDeposits:(year:number,age:number)=>number,
):number {
  if(!p.enabled)return 0
  const claimYear=birthYear+claimAge
  let balance=0
  const firstYear=Math.max(a.reformYear,birthYear+18)
  for(let year=firstYear;year<claimYear;year++){
    const age=year-birthYear
    const deposit=annualNominalDeposits(year,age)
    balance=(balance+Math.max(0,deposit))*(1+a.inflation)*(1+p.expectedRealReturn)*(1-accountFees)
  }
  return balance
}

export function personalAccountYearlyMatch(privateContribution:number,year:number,
  a:ModelAssumptions,p:PersonalAccountSettings):number{
  return p.enabled?Math.min(Math.max(0,privateContribution),
    p.governmentMatchCap2026*(1+a.inflation)**(year-a.reformYear)):0
}

export function projectAccountReform(a:ModelAssumptions,p:PersonalAccountSettings,
  baselineMode:CurrentLawBaselineMode):PersonalAccountReformYear[]{
  if(!p.enabled)return []
  if(p.requiredContributionRate<0||p.requiredContributionRate>1 ||
    p.expectedRealReturn<=-1||p.expectedRealReturn>1 ||
    p.governmentMatchCap2026<0||p.governmentMatchCap2026>100000)
    throw new RangeError('Invalid personal account settings')
  const population=new Map<number,number>()
  const workers=(year:number)=>{
    const known=population.get(year);if(known!==undefined)return known
    let count=0
    for(let age=18;age<currentLawRetirementAge;age++)count+=populationMillions(year,age,a)*weight(age)
    population.set(year,count)
    return count
  }
  const averageEarnings=(year:number)=>workers(year)>0
    ? a.startingNominalGDPBillions*(1+nominalGDPGrowth(a))**(year-a.reformYear)
        *(ssaTaxablePayrollGDP2026[year]??.342)*1000/workers(year)
    :0
  const annualContrib=(year:number,age:number,group:number)=>
    averageEarnings(year)*wageIndex[group]!*weight(age)*p.requiredContributionRate
  const annuity=new Map<string,number>()
  function annualPayout(birthYear:number,claimAge:number,group:number):number{
    const key=`${birthYear}:${claimAge}:${group}`
    const cached=annuity.get(key);if(cached!==undefined)return cached
    const balance=accountBalanceAtClaim(birthYear,claimAge,a,p,(year,age)=>{
      // No pretended pre-enactment assets; no contribution after 67.
      const privateDeposit=annualContrib(year,age,group)
      return privateDeposit+personalAccountYearlyMatch(privateDeposit,year,a,p)
    })
    const factor=accountAnnuityFactor(birthYear,claimAge,a)
    const amount=factor>0?balance/factor:0
    annuity.set(key,amount)
    return amount
  }
  const rows:PersonalAccountReformYear[]=[]
  for(let year=a.reformYear;year<=a.endYear;year++){
    let privateContributionBillions=0,governmentMatchingBillions=0
    for(let age=18;age<currentLawRetirementAge;age++){
      const people=populationMillions(year,age,a)
      for(let i=0;i<incomeGroups.length;i++){
        const privateDeposit=annualContrib(year,age,i)
        privateContributionBillions+=people*incomeGroups[i]!.share*privateDeposit/1000
        governmentMatchingBillions+=people*incomeGroups[i]!.share*
          personalAccountYearlyMatch(privateDeposit,year,a,p)/1000
      }
    }
    const ss=socialSecurityForYear(year,a,'reform')
    const delivery=currentLawDeliveryShares(year,a,baselineMode).socialSecurity
    let scheduledBenefitsBillions=0,federalTopupsBillions=0,privateBenefitOffsetBillions=0,privateExcessBillions=0
    for(const cohort of ss.cohorts){
      const claimAge=cohort.claimAge
      const beforeStart=cohort.claimYear<=a.reformYear
      for(let i=0;i<incomeGroups.length;i++){
        const share=incomeGroups[i]!.share
        const promised=(cohort.legacyPaygoBillions*delivery*benefitIndex[i]!+
          cohort.flatBenefitBillions)*share
        const privateAnnual=beforeStart?0:annualPayout(cohort.birthYear,claimAge,i)
        const paid=cohort.survivingBeneficiariesMillions*share*
          privateAnnual*(1+a.inflation)**Math.max(0,year-cohort.claimYear)/1000
        scheduledBenefitsBillions+=promised
        federalTopupsBillions+=Math.max(0,promised-paid)
        privateBenefitOffsetBillions+=Math.min(promised,paid)
        privateExcessBillions+=Math.max(0,paid-promised)
      }
    }
    rows.push({year,privateContributionBillions,governmentMatchingBillions,
      scheduledBenefitsBillions,federalTopupsBillions,privateBenefitOffsetBillions,privateExcessBillions})
  }
  return rows
}
