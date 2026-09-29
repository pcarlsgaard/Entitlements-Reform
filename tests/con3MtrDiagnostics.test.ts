import { describe, it, expect } from 'vitest'
import snapshotJson from '../src/tax/data/labor_response_microdata_2025.json'
import baseline from '../src/tax/data/baseline_2025.json'
import microdataJson from '../src/tax/data/microdata_2025.json'
import { calculateCurrentLaw, calculateReformWageTax, calculateAdultCredit } from '../src/tax/model/household'
import { calculateChildCredit } from '../src/tax/model/childCredits'
import { calculateLaborResponse } from '../src/tax/model/laborResponse'
import { calculateMacro } from '../src/tax/model/macro'
import { calculateHealthAnalysis, defaultHealthPolicySettings } from '../src/tax/model/health'
import type { FilingStatus, ReformSettings, HouseholdInput } from '../src/tax/model/types'

type Cell=[number,number,number,number,number,number,number]
const snapshot=snapshotJson as unknown as {distribution:Cell[]}
const cashScale=microdataJson.calibration.cashWageScaleToBea2025
const pensionRatio=baseline.compensationComponents.employerPensionAndOtherInsurance/microdataJson.compensationControlsBillions.cashWagesAndSalaries
const healthRatio=baseline.compensationComponents.employerHealthInsurance/microdataJson.compensationControlsBillions.cashWagesAndSalaries
const HALF=500

const base: ReformSettings={
 rate:.35,wageTaxMode:'progressive',progressiveZeroBracketPerAdult:0,
 progressiveTopBracketPerAdult:150000,progressiveMiddleRate:.25,
 progressiveIntermediateStartPerAdult:75000,progressiveIntermediateRate:.30,
 adultCredit:2000,adultCreditMode:'earned',adultCreditPhaseInRate:.10,
 adultCreditPhaseOutStartPerAdult:50000,adultCreditPhaseOutRate:0,adultCreditTakeUpRate:1,
 childCredit:6000,under6ChildCredit:6000,childCreditBaselineRefundableShare:.5,childCreditPhaseInRate:.25,
 noncomplianceRate:.075,exemptionShare:0,cashWageExemptionShare:0,employerSocialInsuranceExemptionShare:0,
 employerHealthInsuranceExemptionShare:0,employerPensionOtherInsuranceExemptionShare:0,
 replacedTaxes:{individualIncome:true,payroll:true,corporateIncome:true,customs:true},
 adultCreditEarningsBase:'compensation'
}

function point(primary:number,secondary:number,status:FilingStatus,children:number){
 const input:HouseholdInput={filingStatus:status,children,cashWage:Math.max(0,primary),secondaryCashWage:status==='married'?Math.max(0,secondary):0}
 const cur=calculateCurrentLaw(input)
 const cash=input.cashWage+(input.secondaryCashWage??0)
 return {cash,cur}
}
function credits(cur:ReturnType<typeof calculateCurrentLaw>){return cur.nonrefundableCtc+cur.refundableCtc+cur.eitc}

type FringeMode='fixed'|'pension'|'all'
function analyze(settings:ReformSettings,mode:FringeMode){
 let w=0, cm=0, rm=0, log=0, improve=0
 const bands=[
  {label:'<25k',lo:0,hi:25000,w:0,c:0,r:0,improve:0},
  {label:'25-50k',lo:25000,hi:50000,w:0,c:0,r:0,improve:0},
  {label:'50-75k',lo:50000,hi:75000,w:0,c:0,r:0,improve:0},
  {label:'75-100k',lo:75000,hi:100000,w:0,c:0,r:0,improve:0},
  {label:'100-150k',lo:100000,hi:150000,w:0,c:0,r:0,improve:0},
  {label:'150-250k',lo:150000,hi:250000,w:0,c:0,r:0,improve:0},
  {label:'250k+',lo:250000,hi:Infinity,w:0,c:0,r:0,improve:0},
 ]
 for(const row of snapshot.distribution){
   const [rp,rs,adults,creditAdults,children,under6,weight]=row
   const p=rp*cashScale,s=rs*cashScale,status:FilingStatus=adults>=2?'married':'single'
   for(const secondary of [false,true]){
     if(secondary && status!=='married') continue
     const earn=secondary?s:p
     if(earn<=0) continue
     const baseCash=p+s
     const fixedHealth=baseCash*healthRatio
     const fixedPension=baseCash*pensionRatio
     const dn=point(secondary?p:Math.max(0,p-HALF),secondary?Math.max(0,s-HALF):s,status,children)
     const up=point(secondary?p:p+HALF,secondary?s+HALF:s,status,children)
     const dCash=up.cash-dn.cash
     const dEmployerFica=up.cur.employerPayrollTax-dn.cur.employerPayrollTax
     const marginalPension=mode==='fixed'?0:pensionRatio*dCash
     const marginalHealth=mode==='all'?healthRatio*dCash:0
     const dComp=dCash+dEmployerFica+marginalPension+marginalHealth
     const curM=(up.cur.totalFederalTax-dn.cur.totalFederalTax)/dComp
     function reform(pt:ReturnType<typeof point>, sign:-1|1){
       const employerFica=pt.cur.employerPayrollTax
       const deltaCash=pt.cash-baseCash
       const health=fixedHealth+(mode==='all'?healthRatio*deltaCash:0)
       const pension=fixedPension+(mode==='fixed'?0:pensionRatio*deltaCash)
       const gross=pt.cash+employerFica+health+pension
       const taxable=gross
       const adult=calculateAdultCredit(gross,creditAdults,settings)
       const child=calculateChildCredit(gross,children,under6,settings)
       return calculateReformWageTax(taxable,status,settings)-adult-child
     }
     const refM=(reform(up,1)-reform(dn,-1))/dComp
     const lw=weight*(earn*(1+.0765+(mode==='fixed'?0:pensionRatio)+(mode==='all'?healthRatio:0)))
     w+=lw; cm+=lw*curM; rm+=lw*refM; log+=lw*Math.log((1-refM)/(1-curM)); if(refM<curM) improve+=lw
     const b=bands.find(x=>earn>=x.lo&&earn<x.hi)!
     b.w+=lw;b.c+=lw*curM;b.r+=lw*refM;if(refM<curM)b.improve+=lw
   }
 }
 return {current:cm/w,reform:rm/w,log:log/w,improvedShare:improve/w,bands:bands.map(b=>({label:b.label,current:b.c/b.w,reform:b.r/b.w,improvedShare:b.improve/b.w,laborWeightShare:b.w/w}))}
}
const health={...defaultHealthPolicySettings,adultHealthCredit:3000,childHealthCredit:1500,uninsuredTakeUpRate:.85,employerHealthPassThroughRate:1,employerFicaPassThroughRate:1,employeePremiumPreTaxShare:1,benchmarkPremiumScale:1.03,replaceAcaAptc:false,redistributionRule:'nationalEqual' as const,recipientScope:'policyholders' as const}
function score(settings:ReformSettings){
 const labor=calculateLaborResponse(settings,1)
 const h=calculateHealthAnalysis(settings,health)
 const m=calculateMacro(settings,{insuranceCreditCost:h.totalHealthCreditCostBillions})
 return {mtr:labor.weightedReformMarginalRate,log:labor.netWageLogChange,revenue:m.netRevenue,revenueGDP:m.netRevenue/m.gdp}
}
const variants:{name:string,patch:Partial<ReformSettings>}[]=[
 {name:'base',patch:{}},
 {name:'24/29/35',patch:{progressiveMiddleRate:.24,progressiveIntermediateRate:.29}},
 {name:'23/28/35',patch:{progressiveMiddleRate:.23,progressiveIntermediateRate:.28}},
 {name:'22/27/35',patch:{progressiveMiddleRate:.22,progressiveIntermediateRate:.27}},
 {name:'25/29/35',patch:{progressiveIntermediateRate:.29}},
 {name:'25/28/35',patch:{progressiveIntermediateRate:.28}},
 {name:'25/30/35 @100/200',patch:{progressiveIntermediateStartPerAdult:100000,progressiveTopBracketPerAdult:200000}},
 {name:'25/30/35 @125/250',patch:{progressiveIntermediateStartPerAdult:125000,progressiveTopBracketPerAdult:250000}},
 {name:'24/29/35 @100/200',patch:{progressiveMiddleRate:.24,progressiveIntermediateRate:.29,progressiveIntermediateStartPerAdult:100000,progressiveTopBracketPerAdult:200000}},
 {name:'23/28/35 @100/200',patch:{progressiveMiddleRate:.23,progressiveIntermediateRate:.28,progressiveIntermediateStartPerAdult:100000,progressiveTopBracketPerAdult:200000}},
 {name:'adult $3k @10%',patch:{adultCredit:3000}},
 {name:'adult $4k @10%',patch:{adultCredit:4000}},
 {name:'adult $2k @15%',patch:{adultCreditPhaseInRate:.15}},
 {name:'adult $2k @20%',patch:{adultCreditPhaseInRate:.20}},
]
describe('Con3 MTR diagnostics',()=>{
 it('prints wedge conventions and policy variants',()=>{
   console.log('WEDGE_MODES='+JSON.stringify({fixed:analyze(base,'fixed'),pension:analyze(base,'pension'),all:analyze(base,'all')}))
   const bs=score(base)
   console.log('VARIANTS='+JSON.stringify(variants.map(v=>{const s=score({...base,...v.patch});return {name:v.name,...s,revenueDeltaGDP:s.revenueGDP-bs.revenueGDP}})))
   const grid:any[]=[]
   for(const middle of [.24,.25]) for(const inter of [.29,.30])
    for(const start of [90000,100000,110000,120000,125000])
     for(const top of [180000,200000,220000,240000,250000]){
      if(top<=start) continue
      const p={...base,progressiveMiddleRate:middle,progressiveIntermediateRate:inter,progressiveIntermediateStartPerAdult:start,progressiveTopBracketPerAdult:top}
      const s=score(p)
      if(s.mtr<.282413452776157) grid.push({middle,inter,start,top,mtr:s.mtr,netWageLog:s.log,revenueGDP:s.revenueGDP,revenueDeltaGDP:s.revenueGDP-bs.revenueGDP})
     }
   console.log('GRID_IMPROVERS='+JSON.stringify(grid))
   expect(true).toBe(true)
 },30000)
})
