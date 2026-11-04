import { describe, expect, it } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { projectAccountReform } from '../src/model/personalAccountReform'

/**
 * Required gross real investment return to offset a given percentage of the
 * *reformed* Social Security promise in 2075, cohort by cohort. Private
 * benefits ABOVE the promised public amount do not offset other cohorts'
 * public shortfalls. Government matching is switched off.
 */
describe('2075 retirement coverage real-return thresholds',()=>{
  it('finds minimum gross real return for near/full public obligation offset',()=>{
    const a=structuredClone(defaultCombinedPolicy.assumptions)
    Object.assign(a,{
      reformYear:2026,endYear:2075,benefitPhaseInYears:70,flatBenefitFPLMultiple:2,
      fullRetirementAge:68,socialSecurityClaimAge:68,
      socialSecurityCOLAMode:'chainedCpi',
      socialSecurityInitialBenefitMode:'flatTransition',
      startingNominalGDPBillions:31902,
      debtSensitivity:0,startingDebtGDP:1.00605,
      startingEffectiveNominalRate:.0323741364743303,
      nonDefenseDiscretionaryGDP2026:.03121,
      otherMandatoryGDP2026:.02994,
      medicareFundingMode:'perPerson',
      premiumSupportRealGrowth:.018,
      medicareSupportGDPShare:.0395393424550185,
      otherOASDIGDP:.01,under65MedicareGDP:.006,
      debtPaydownSurplusCapGDP:.10
    })
    const rates=[.05,.06,.065,.07,.075,.08,.09,.10,.12,.15]
    const rows=[]
    for(const saving of rates){
      let evaluations=0
      const get=(realReturn:number)=>{
        evaluations++
        const p={enabled:true,requiredContributionRate:saving,
          expectedRealReturn:realReturn,governmentMatchCap2026:0}
        const y=projectAccountReform(a,p,'scheduled').at(-1)!
        return {
          coverage:y.privateBenefitOffsetBillions/y.scheduledBenefitsBillions,
          publicResidualBillions:y.federalTopupsBillions,
          scheduledBillions:y.scheduledBenefitsBillions,
          privateExcessBillions:y.privateExcessBillions
        }
      }
      const central=get(.045),at10=get(.10),at25=get(.25),at100=get(1)
      const minimumFor=(target:number)=>{
        let lo=0,hi=1
        if(get(lo).coverage>=target)return 0
        if(at100.coverage<target)return null
        for(let i=0;i<15;i++){
          const mid=(lo+hi)/2
          if(get(mid).coverage>=target)hi=mid
          else lo=mid
        }
        return hi
      }
      const row={saving,grossReturnFor99pct:minimumFor(.99),
        grossReturnFor999pct:minimumFor(.999),
        grossReturnFor9999pct:minimumFor(.9999),
        grossReturnForFullWithinRounding:minimumFor(1-1e-12),
        coverageAt4p5pct:central.coverage,
        coverageAt10pct:at10.coverage,
        coverageAt25pct:at25.coverage,
        coverageAt100pct:at100.coverage,
        publicResidualAt100pctBillions:at100.publicResidualBillions,
        evaluations}
      rows.push(row)
      console.log('RETIREMENT_2075_THRESHOLD_ROW='+JSON.stringify(row))
    }
    console.log('RETIREMENT_2075_THRESHOLD_RESULTS_JSON='+JSON.stringify(rows))
    expect(rows.length).toBe(rates.length)
  },900000)
})
