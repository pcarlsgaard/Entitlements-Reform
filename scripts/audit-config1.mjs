import { createServer } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(process.argv[2] ?? '.')
const output = resolve(process.argv[3] ?? 'analysis/config1-current.json')
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { parseConfiguration } = await server.ssrLoadModule('/src/model/savedConfigurations.ts')
  const { scoreCombined } = await server.ssrLoadModule('/src/model/combined.ts')
  const { simulate } = await server.ssrLoadModule('/src/model/simulate.ts')
  const { currentLawRevenueGDP, replacedRevenueDriftGDP } = await server.ssrLoadModule('/src/model/revenueBaseline.ts')
  const { realIncomeGrowthFactor } = await server.ssrLoadModule('/src/model/taxProjection.ts')
  const policy = parseConfiguration(readFileSync(resolve(root, 'configurations/config1-paygo.json'), 'utf8')).scenario.policy
  const summarize = (p) => {
    const start = performance.now()
    const s = scoreCombined(p)
    const gdpFactor = year => {
      const y = Math.min(2095, year), a = p.assumptions
      return s.combined.years[y-2026].nominalGDP / (a.startingNominalGDPBillions *
        ((1+a.realGDPGrowth)*(1+a.inflation)) ** (y-2026))
    }
    const frozenTax = simulate(s.combined.assumptions, (year) => currentLawRevenueGDP(year) + s.netTaxRevenueChangeGDP - replacedRevenueDriftGDP(year, p.tax), {},
      p.baselineMode, p.benefits, {
        otherMandatorySavingsGDP:(s.tax.refundableTaxCreditOutlaySavings+s.programSavingsBillions)/s.tax.gdp,
        medicaidMarketplaceSavingsGDP:s.health.estimatedExistingAptcSavingsBillions/s.tax.gdp,
        savingsScaleForYear:year=>1/realIncomeGrowthFactor(year,p.assumptions),
      }, gdpFactor)
    return { frozenOpeningTaxRevenueDebt2095: frozenTax.years.at(-1).endingDebtGDP, milliseconds: performance.now() - start,
      openingChildCreditBillions: s.tax.childCreditCost,
      openingNetTaxRevenueDeltaGDP: s.netTaxRevenueChangeGDP,
      additionalFiscalAdjustmentGDP: s.additionalFiscalAdjustmentGDP,
      periods: s.periods,
      ledger: s.combined.years.filter(r => [2026,2035,2056,2095].includes(r.year)).map(r => ({
        year:r.year, debtGDP:r.endingDebtGDP, baselineDebtGDP:s.baseline.years[r.year-2026].endingDebtGDP,
        revenueGDP:r.revenueRate, ssGDP:(r.legacySocialSecurity+r.flatSocialSecurityPaygo+r.otherOASDI)/r.nominalGDP,
        medicareGDP:(r.legacySeniorMedicare+r.premiumSupportPaygo+r.under65Medicare)/r.nominalGDP,
        primaryGDP:r.totalPrimarySpending/r.nominalGDP,
      })) }
  }
  const result = { input:'configurations/config1-paygo.json', assumptions:policy.assumptions, central:summarize(policy),
    slowerGrowth:summarize({...policy,assumptions:{...policy.assumptions,realGDPGrowth:policy.assumptions.realGDPGrowth-.005}}),
    higherInterest:summarize({...policy,assumptions:{...policy.assumptions,baselineRealMarketRate:policy.assumptions.baselineRealMarketRate+.01}}),
    noDynamics:summarize({...policy,dynamic:{...policy.dynamic,enabled:false}}),
  }
  writeFileSync(output, JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify({output, central:result.central, stressDebt2095:[result.slowerGrowth,result.higherInterest,result.noDynamics].map(r=>r.periods[1].terminalDebtGDP)},null,2))
} finally { await server.close() }
