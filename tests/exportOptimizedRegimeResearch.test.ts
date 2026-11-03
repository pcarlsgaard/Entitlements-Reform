import {describe,it,expect} from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { exampleHouseholds } from '../src/model/householdScenario'
import { parseConfiguration } from '../src/model/savedConfigurations'

describe('export optimized working-cash protective regime',()=>{
 it('emits the real simulator JSON format and validates round-trip import',()=>{
  const config={
   format:'entitlements-reform-configuration',
   version:1,
   id:'exploratory-180fpl-065saving-20261031',
   name:'Exploratory 180% FPL + 6.5% accounts + protective wage brackets',
   savedAt:'2026-10-31T23:00:00.000Z',
   scenario:{
    policy:{
     ...defaultCombinedPolicy,
     tax:{
      ...defaultCombinedPolicy.tax,
      rate:0.35,
      wageTaxMode:'progressive',
      progressiveWageBrackets:[
       {upperPerAdult:15000,rate:0.10},
       {upperPerAdult:60000,rate:0.20},
       {upperPerAdult:220000,rate:0.25},
       {upperPerAdult:275000,rate:0.30},
       {upperPerAdult:null,rate:0.35},
      ],
     },
     benefits:{...defaultCombinedPolicy.benefits,socialSecurityReform:true},
     personalAccounts:{
      enabled:true,requiredContributionRate:0.065,
      expectedRealReturn:0.04,governmentMatchCap2026:0,
     },
     assumptions:{
      ...defaultCombinedPolicy.assumptions,
      socialSecurityInitialBenefitMode:'flatTransition',
      flatBenefitFPLMultiple:1.8,
      fundingStrategy:'paygo',
     },
    },
    householdProfiles:structuredClone(exampleHouseholds),
    householdYear:2035,
    householdSelectedId:exampleHouseholds[0]!.id,
   },
  }
  const json=JSON.stringify(config)
  const loaded=parseConfiguration(json)
  expect(loaded.scenario.policy.personalAccounts.requiredContributionRate).toBe(0.065)
  expect(loaded.scenario.policy.tax.progressiveWageBrackets?.length).toBe(5)
  expect(loaded.scenario.policy.assumptions.flatBenefitFPLMultiple).toBe(1.8)
  expect(loaded.scenario.householdProfiles.length).toBe(5)
  console.log('IMPORTABLE_OPTIMIZED_REGIME_JSON='+json)
 },30_000)
})
