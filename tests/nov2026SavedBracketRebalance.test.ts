import { describe, it, expect } from 'vitest'
import { scoreCombined, type CombinedPolicy } from '../src/model/combined'

const BASE_POLICY = {"taxEnabled":true,"tax":{"rate":0.35,"wageTaxMode":"progressive","progressiveZeroBracketPerAdult":0,"progressiveTopBracketPerAdult":150000,"progressiveMiddleRate":0.25,"progressiveIntermediateStartPerAdult":75000,"progressiveIntermediateRate":0.3,"adultCredit":2700,"adultCreditMode":"earned","adultCreditPhaseInRate":0.2,"adultCreditPhaseOutStartPerAdult":50000,"adultCreditPhaseOutRate":0,"adultCreditTakeUpRate":1,"childCredit":5400,"noncomplianceRate":0.05,"exemptionShare":0,"cashWageExemptionShare":0,"employerSocialInsuranceExemptionShare":0,"employerHealthInsuranceExemptionShare":0,"employerPensionOtherInsuranceExemptionShare":0,"replacedTaxes":{"individualIncome":true,"payroll":true,"corporateIncome":true,"customs":true},"progressiveWageBrackets":[{"upperPerAdult":65000,"rate":0.2},{"upperPerAdult":150000,"rate":0.25},{"upperPerAdult":310000,"rate":0.3},{"upperPerAdult":null,"rate":0.35}],"adultCreditEarningsBase":"compensation","under6ChildCredit":0,"childCreditBaselineRefundableShare":0.5,"childCreditPhaseInRate":0.2},"health":{"adultHealthCredit":3000,"childHealthCredit":1500,"uninsuredTakeUpRate":0.85,"employerHealthPassThroughRate":1,"employerFicaPassThroughRate":1,"employeePremiumPreTaxShare":1,"benchmarkPremiumScale":1.03,"replaceAcaAptc":true,"redistributionRule":"nationalEqual","recipientScope":"policyholders"},"transfers":{"replacedPrograms":{"snap":false,"wic":false,"schoolMeals":false,"summerEbt":false,"tanf":false,"liheap":false,"housing":false}},"benefits":{"socialSecurityReform":true,"medicareReform":true},"personalAccounts":{"enabled":true,"requiredContributionRate":0.065,"expectedRealReturn":0.045,"governmentMatchCap2026":0},"spendingEnabled":true,"otherSpending":{"defenseMode":"currentLaw","nonDefenseMode":"currentLaw","defenseCustomNominalGrowth":0.01,"nonDefenseCustomNominalGrowth":0.01,"farmSubsidyPolicy":"reverse2025Expansion","federalRetirementReform":false},"assumptions":{"reformYear":2026,"endYear":2095,"maxModeledAge":110,"benefitPhaseInYears":70,"socialSecurityInitialBenefitMode":"flatTransition","socialSecurityPPIProtectedPercentile":0.5,"flatBenefitFPLMultiple":2,"individualFPL2026":15960,"realFPLGrowth":0,"fullRetirementAge":68,"socialSecurityReformFRA":67,"socialSecurityBenefitCap2026":null,"socialSecurityCOLAMode":"chainedCpi","socialSecurityCOLACap":0.03,"socialSecurityCOLAAdjustment":0,"socialSecurityDollarCOLACapPercentile":null,"vestingYears":35,"socialSecurityClaimAge":68,"qualifyingEarnings2026":7560,"averageWorkingYears":35,"averageAnnualEarnings2026":50000,"actuarialDiscountRate":0.023,"medicareFundingMode":"perPerson","medicareSupportGDPShare":0.0395393424550185,"nonDefenseDiscretionaryMode":"cbo","currentLawSSBenefit2026":24500,"currentLawSSBenefitRealGrowth":0.0114,"fundingStrategy":"paygo","prefundingStartAge":18,"realEndowmentYield":0.025,"medicareEligibilityAge":65,"premiumSupport2026":19000,"premiumSupportRealGrowth":0.018000000000000002,"legacyMedicareCost2026":19000,"legacyMedicareRealGrowth":0.015,"legacyMedicareHIShare2026":0.3401608579088472,"medicareYearA":2030,"medicareYearB":2035,"cohortSizeMillions2026":4.2,"cohortSizeGrowth":0.002,"startingNominalGDPBillions":31902,"realGDPGrowth":0.018,"realWageGrowthDeviation":0,"inflation":0.02,"startingDebtGDP":1.00605,"baselineRealMarketRate":0.023,"startingEffectiveNominalRate":0.0323741364743303,"debtSensitivity":0,"debtRatePassThrough":0.15,"otherOASDIGDP":0.01,"under65MedicareGDP":0.006,"nonDefenseDiscretionaryGDP2026":0.03121,"nonDefenseDiscretionaryRealGrowth":0.018,"otherMandatoryGDP2026":0.02994,"policyHorizonYears":70,"policyHorizonDebtTargetGDP":1.01,"debtPaydownTargetGDP":0.4,"debtPaydownSurplusCapGDP":0.1,"revenueCapBasis":"totalBalance","customRevenueCapBalanceGDP":0,"peakDebtCeilingGDP":1.5},"baselineMode":"scheduled","dynamic":{"enabled":true,"laborElasticity":0.15,"laborShareGDP":0.6,"phaseInYears":10,"capitalGDPLevelAtReference":0.014,"capitalRateSensitivity":0.15,"capitalPhaseInYears":15}} as unknown as CombinedPolicy
const PLANS = [{"name":"Your saved configuration","rates":[0.2,0.25,0.3,0.35],"cut":[65000,150000,310000],"phase":0.2},{"name":"Small first-rate cut, earlier top","rates":[0.195,0.25,0.3,0.35],"cut":[65000,150000,185000],"phase":0.2},{"name":"Smoother upper rates","rates":[0.192,0.255,0.33,0.35],"cut":[65000,150000,250000],"phase":0.2},{"name":"Higher-revenue compromise","rates":[0.192,0.255,0.34,0.35],"cut":[65000,150000,175000],"phase":0.2},{"name":"First-rate cut plus faster adult phase","rates":[0.195,0.25,0.3,0.35],"cut":[65000,150000,180000],"phase":0.25}]

describe('November 2026 saved-plan consumption-preserving bracket alternatives', () => {
  it('compares the exact uploaded spending and budget assumptions through 2095', () => {
    const out = []
    for (const candidate of PLANS) {
      const policy = structuredClone(BASE_POLICY)
      policy.tax.progressiveWageBrackets = candidate.rates.map((rate, i) => ({
        upperPerAdult: i < 3 ? candidate.cut[i]! : null,
        rate
      }))
      policy.tax.adultCreditPhaseInRate = candidate.phase
      const score = scoreCombined(policy)
      const debt = (year: number) => score.combined.years.find(r=>r.year===year)!.endingDebtGDP * 100
      out.push({
        name: candidate.name,
        rates: candidate.rates,cutoffs: candidate.cut,
        adultCreditPhase: candidate.phase,
        netTaxRevenue2025Billions: score.tax.netRevenue,
        peakDebtPercentGDP: Math.max(...score.combined.years.map(r=>r.endingDebtGDP)) * 100,
        debt2035PercentGDP: debt(2035),debt2050PercentGDP: debt(2050),
        debt2075PercentGDP: debt(2075),debt2095PercentGDP: debt(2095),
        steadyStateGDPChangePercent: score.steadyGDPLevelChange*100,
        fiscalAdjustmentNeededGDPPercent: score.additionalFiscalAdjustmentGDP*100,
        privateOffset2075: score.accountsByYear.get(2075)!.privateBenefitOffsetBillions /
           score.accountsByYear.get(2075)!.scheduledBenefitsBillions,
        privateOffset2095: score.accountsByYear.get(2095)!.privateBenefitOffsetBillions /
           score.accountsByYear.get(2095)!.scheduledBenefitsBillions
      })
    }
    console.log('NOV26_SAVED_BRACKET_REBALANCE_RESULTS_JSON=' + JSON.stringify(out))
    expect(out.length).toBe(PLANS.length)
  },900000)
})
