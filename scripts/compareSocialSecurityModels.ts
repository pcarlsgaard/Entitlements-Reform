/**
 * Reproducible same-baseline federal comparison.
 * Run: npm run analyze:comparison
 * No tax reform, Medicare reform, or other spending policies.
 * Scheduled-benefit comparator, 2026-2095, constant exogenous macro path.
 */
import { defaultAssumptions } from '../src/model/defaults'
import { simulate } from '../src/model/simulate'
import { currentLawRevenueGDP } from '../src/model/revenueBaseline'
import { defaultPersonalAccountsPolicy, projectPersonalAccounts } from '../src/model/personalAccounts'
import type { PersonalAccountsPolicy, PersonalAccountsYear } from '../src/model/personalAccounts'

const assumptions={...defaultAssumptions,endYear:2095,debtSensitivity:0,
  fundingStrategy:'paygo' as const}
const flatAssumptions={...assumptions,
  flatBenefitFPLMultiple:1.50,benefitPhaseInYears:20,
  socialSecurityInitialBenefitMode:'flatTransition' as const,
  fullRetirementAge:70,socialSecurityClaimAge:70,
}
const revenue=(year:number)=>currentLawRevenueGDP(year)
const baseline=simulate(assumptions,revenue,{},'scheduled')
const flat=simulate(flatAssumptions,revenue,{},undefined,
  {socialSecurityReform:true,medicareReform:false})
const flatPrefunded25=simulate({...flatAssumptions,fundingStrategy:'socialSecurityOnly',realEndowmentYield:.025},
  revenue,{},undefined,{socialSecurityReform:true,medicareReform:false})
const flatPrefunded40=simulate({...flatAssumptions,fundingStrategy:'socialSecurityOnly',realEndowmentYield:.04},
  revenue,{},undefined,{socialSecurityReform:true,medicareReform:false})
const flatFundedCost=(row:typeof flatPrefunded25.years[number])=>
  row.legacySocialSecurity+row.flatSocialSecurityPaygo+row.socialSecurityPrefunding
const years=[2026,2035,2050,2075,2095]
const d=(n:number)=>Number(n.toFixed(4))
function realPV(billions:number,year:number){
  const t=year-2026
  return billions / ((1+assumptions.inflation)*(1+.023))**t
}
function runAccounts(policy:PersonalAccountsPolicy){
  const accounts=projectPersonalAccounts(assumptions,policy,2095)
  const accountMap=new Map(accounts.map(r=>[r.year,r]))
  const sim=simulate(assumptions,revenue,{},'scheduled',undefined,{
    otherMandatorySavingsGDP:0,
    socialSecurityRetirementPublicTopupBillionsForYear:(year:number)=>{
      const r=accountMap.get(year)
      if(!r)throw Error('Missing account year '+year)
      return r.governmentTopupBillions
    },
    mandatoryPrivateSavingsPayrollReceiptsLostBillionsForYear:
      (year:number)=>accountMap.get(year)?.redirectedBillions ?? 0,
    privateAnnuityBenefitTaxReceiptsLostBillionsForYear:
      (year:number)=>accountMap.get(year)?.lostBenefitTaxesBillions ?? 0,
  })
  return {accounts,sim,accountMap}
}
const central=runAccounts(defaultPersonalAccountsPolicy)
const snapshots=years.map(year=>{
  const i=year-2026
  const b=baseline.years[i]!, f=flat.years[i]!, pf=flatPrefunded25.years[i]!,
    pf4=flatPrefunded40.years[i]!, p=central.sim.years[i]!
  const r=central.accountMap.get(year)!
  const g=b.nominalGDP
  if(Math.abs(g-r.nominalGDPBillions)>1e-6*g)throw Error('GDP mismatch in accounts')
  return {year,
    scheduledOASI:d(100*b.legacySocialSecurity/g),
    flat150OASI:d(100*(f.legacySocialSecurity+f.flatSocialSecurityPaygo)/g),
    flat150Prefunded25Cost:d(100*flatFundedCost(pf)/g),
    flat150Prefunded40Cost:d(100*flatFundedCost(pf4)/g),
    flatPrefundingDeposit25:d(100*pf.socialSecurityPrefunding/g),
    accountCostOASI:d(100*r.federalCostBillions/g),
    accountPublicSpendingOASI:d(100*p.legacySocialSecurity/g),
    accountFederalReceiptsLost:d(100*((p.lostMandatoryPayrollReceipts ?? 0)+(p.lostBenefitTaxReceipts ?? 0))/g),
    accountNetRevenueGDP:d(100*p.revenue/g),
    baselineNetRevenueGDP:d(100*b.revenue/g),
    accountDiversion:d(100*r.redirectedBillions/g),
    accountTopup:d(100*r.governmentTopupBillions/g),
    accountBenefitTaxLoss:d(100*r.lostBenefitTaxesBillions/g),
    accountPrivateCoveragePct:d(100*r.privateTowardPromiseBillions/r.scheduledOASIBillions),
    savingsFlatGDP:d(100*(b.legacySocialSecurity-f.legacySocialSecurity-f.flatSocialSecurityPaygo)/g),
    savingsAccountsGDP:d(100*r.fiscalSavingsBillions/g),
    baselineDebtGDP:d(100*b.endingDebtGDP),
    flatDebtGDP:d(100*f.endingDebtGDP),
    flatPrefunded25DebtGDP:d(100*pf.endingDebtGDP),
    flatPrefunded40DebtGDP:d(100*pf4.endingDebtGDP),
    accountDebtGDP:d(100*p.endingDebtGDP),
    baselineTotalSpendingGDP:d(100*b.totalFederalSpending/g),
    flatTotalSpendingGDP:d(100*f.totalFederalSpending/g),
    accountTotalSpendingGDP:d(100*p.totalFederalSpending/g),
  }
})
function summary(sim:typeof baseline, cost:(year:number)=>number){
  const pv=sim.years.reduce((sum,row)=>sum+realPV(cost(row.year),row.year),0)
  const pv0=baseline.years.reduce((sum,row)=>sum+realPV(row.legacySocialSecurity,row.year),0)
  const end=sim.years.at(-1)!
  return {retirementPV2026Trillions:d(pv/1000),
    directPublicOASIPV2026Trillions:d(sim.years.reduce((sum,row)=>
      sum+realPV(row.legacySocialSecurity+row.flatSocialSecurityPaygo,row.year),0)/1000),
    savingsPV2026Trillions:d((pv0-pv)/1000),
    finalDebtGDP:d(100*end.endingDebtGDP),
    peakDebtGDP:d(100*Math.max(...sim.years.map(x=>x.endingDebtGDP)))}
}
const totals={
  baseline:summary(baseline,row=>baseline.years[row-2026]!.legacySocialSecurity),
  flat150:summary(flat,year=>{const r=flat.years[year-2026]!;return r.legacySocialSecurity+r.flatSocialSecurityPaygo}),
  flat150Prefunded25:summary(flatPrefunded25,year=>flatFundedCost(flatPrefunded25.years[year-2026]!)),
  flat150Prefunded40:summary(flatPrefunded40,year=>flatFundedCost(flatPrefunded40.years[year-2026]!)),
  personalAccounts:summary(central.sim,year=>central.accountMap.get(year)!.federalCostBillions),
}
const sensitivity: {case:string,year:number,retirementCostGDP:number,topupGDP:number,redirectGDP:number,privateCoverage:number}[]=[]
const specs=[
  {case:'1% real, 10yr ramp',annualRealReturn:.01,rampYears:10},
  {case:'2.5% real, 10yr ramp',annualRealReturn:.025,rampYears:10},
  {case:'5.5% real, 10yr ramp',annualRealReturn:.055,rampYears:10},
  {case:'4% real, 1yr ramp',annualRealReturn:.04,rampYears:1},
  {case:'4% real, 5yr ramp',annualRealReturn:.04,rampYears:5},
  {case:'4% real, 20yr ramp',annualRealReturn:.04,rampYears:20},
  {case:'4% real, 10yr, 6.2%',annualRealReturn:.04,rampYears:10,payrollRate:.062},
  {case:'4% real, 10yr, 10.6%',annualRealReturn:.04,rampYears:10,payrollRate:.106},
]
for(const spec of specs){
  const scenario=projectPersonalAccounts(assumptions,{...defaultPersonalAccountsPolicy,...spec},2095)
  for(const year of [2050,2095]){
    const x=scenario[year-2026]!
    const g=x.nominalGDPBillions
    sensitivity.push({case:spec.case,year,retirementCostGDP:d(100*x.federalCostBillions/g),
      topupGDP:d(100*x.governmentTopupBillions/g),redirectGDP:d(100*x.redirectedBillions/g),
      privateCoverage:d(100*x.privateTowardPromiseBillions/x.scheduledOASIBillions)})
  }
}
// Five-year government cash-flow trajectory: private saving is never federal outlay.
const trajectoryYears=[2026,2030,2035,2040,2045,2050,2055,2060,2065,2070,2075,2080,2085,2090,2095]
const trajectory=trajectoryYears.map(year=>{
  const base=baseline.years[year-2026]!
  const paygoFlat=flat.years[year-2026]!
  const funded=flatPrefunded25.years[year-2026]!
  const acct=central.sim.years[year-2026]!
  const model=central.accountMap.get(year)!
  const g=base.nominalGDP
  const totalSavings=model.redirectedBillions
  const privateAnnuities=model.privateTowardPromiseBillions+model.privateExcessBillions
  return {year,
    mandatorySavingCoveredWagePct:d(100*.124*Math.min(1,(year-2026+1)/10)),
    privateAccountDepositsGDP:d(100*totalSavings/g),
    baselineRetiredWorkerSpendingGDP:d(100*base.legacySocialSecurity/g),
    privateAccountsPublicTopupsGDP:d(100*acct.legacySocialSecurity/g),
    privateAnnuitiesGDP:d(100*privateAnnuities/g),
    privateAnnuitiesCoveringGuaranteeGDP:d(100*model.privateTowardPromiseBillions/g),
    privateAnnuitiesExcessGDP:d(100*model.privateExcessBillions/g),
    lostFederalPayrollReceiptsGDP:d(100*(acct.lostMandatoryPayrollReceipts??0)/g),
    lostFederalBenefitTaxesGDP:d(100*(acct.lostBenefitTaxReceipts??0)/g),
    accountFiscalCostGDP:d(100*model.federalCostBillions/g),
    accountFiscalSavingsGDP:d(100*model.fiscalSavingsBillions/g),
    flatPaygoPublicBenefitsGDP:d(100*(paygoFlat.legacySocialSecurity+paygoFlat.flatSocialSecurityPaygo)/g),
    flatPrefunded25PublicBenefitsGDP:d(100*(funded.legacySocialSecurity+funded.flatSocialSecurityPaygo)/g),
    flatPrefunded25TreasuryEndowmentDepositsGDP:d(100*funded.socialSecurityPrefunding/g),
    flatPrefunded25TotalPublicCostsGDP:d(100*flatFundedCost(funded)/g),
    baselineTotalFederalOutlaysGDP:d(100*base.totalFederalSpending/g),
    accountTotalFederalOutlaysGDP:d(100*acct.totalFederalSpending/g),
    baselineFederalRevenueGDP:d(100*base.revenue/g),
    accountFederalRevenueGDP:d(100*acct.revenue/g),
    baselineDebtGDP:d(100*base.endingDebtGDP),
    accountDebtGDP:d(100*acct.endingDebtGDP),
  }
})
const incomeGroups=central.accounts.filter(x=>[2050,2095].includes(x.year)).map(row=>({
  year:row.year,
  groups:row.groups.map(group=>({group:group.name,
    publicTopupShareOfGroupBenefitPct:d(100*group.governmentTopupBillions/group.scheduledBillions),
    privateExcessBillions:d(group.privateExcessBillions)})),
}))
export const personalAccountComparison={inputs:{
  horizon:'2026-2095',flatFPL:1.5,flatPhaseInYears:20,flatRetirementAge:70,
  accountPayrollRate:.124,accountRampYears:10,accountGrossRealReturn:.04,
  accountFee:.0025,accountAnnuityRate:.023,benefitTaxLossRate:.07,
  federalBorrowingRateSensitivity:0,
},snapshots,trajectory,totals,sensitivity,incomeGroups}
console.log('PERSONAL_ACCOUNT_COMPARISON_JSON_START')
console.log(JSON.stringify(personalAccountComparison))
console.log('PERSONAL_ACCOUNT_COMPARISON_JSON_END')
