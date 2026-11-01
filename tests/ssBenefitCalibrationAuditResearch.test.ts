import { describe,it,expect } from 'vitest'
import { defaultAssumptions } from '../src/model/defaults'
import { socialSecurityForYear } from '../src/model/socialSecurity'
import { relativeBenefitAtPercentile } from '../src/model/socialSecurityDistribution'
import { incomeGroups } from '../src/model/personalAccountReform'
import { realWageGrowthFactor } from '../src/model/taxProjection'
const norm=incomeGroups.reduce((s,g)=>s+g.share*relativeBenefitAtPercentile(g.benefitRank),0)
const claimYear=2026
function pia(annual:number,years=35){
 const aime=annual*Math.min(35,Math.max(0,years))/35/12
 return 12*(0.9*Math.min(aime,1286)+0.32*Math.max(0,Math.min(aime,7749)-1286)+0.15*Math.max(0,aime-7749))
}
describe('diagnostic: baseline aggregation versus benefit profiles',()=>{
 it('prints CBO/SSA re-scaling and PIA approximation versus five-bin retiree-payment anchor',()=>{
   const years=[2026,2030,2040,2050,2060,2070,2095]
   const agg=years.map(year=>{
     const raw= socialSecurityForYear(year,defaultAssumptions,'currentLaw')
     const naive=raw.cohorts.reduce((s,c)=>s+c.legacyBenefitPerPerson*c.survivingBeneficiariesMillions/1000,0)
     return {year,calibratedLegacyB:raw.legacyBillions,rawLegacyB:naive,
       aggregateBenefitScale:raw.legacyBillions/naive,
       representativeRealWageFactor:realWageGrowthFactor(year,defaultAssumptions)}
   })
   const wageMean=incomeGroups.reduce((s,g)=>s+g.share*g.wage,0)
   const proxies=incomeGroups.map(g=>{
    const wage=Math.round(50000*g.wage/wageMean)
    const paymentProxy=24500*relativeBenefitAtPercentile(g.benefitRank)/norm
    return {group:g.name,wage,retireeDistributionProxy:paymentProxy,
      piecedPIA35:pia(wage,35),pia20:pia(wage,20),
      proxyVsPIA35:paymentProxy/pia(wage,35)-1,
      proxyVsPIA20:paymentProxy/pia(wage,20)-1}
   })
   console.log('SS_BENEFIT_AUDIT_JSON='+JSON.stringify({agg,proxies}))
   expect(agg.length).toBe(7)
 },45000)
})
