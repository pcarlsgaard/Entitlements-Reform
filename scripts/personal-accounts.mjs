/**
 * Standalone research experiment: retain scheduled OASI benefits, divert the
 * existing OASI payroll contribution to diversified individual accounts, and
 * provide a Treasury-financed benefit floor.
 *
 * This is an independently auditable prototype, NOT part of the core budget
 * score. It uses five explicitly illustrative earnings groups, current-law
 * 2026 PIA bend points, 2026 Trustees GDP/payroll and OASI cost anchors, and
 * the SSA period life table already pinned in src/data/ssaLifeTable.ts.
 *
 * Run: node scripts/personal-accounts.mjs
 *      node scripts/personal-accounts.mjs '{"rampYears":10,"realReturn":0.02}'
 *
 * WARNING: this is NOT a fully calibrated OASI microsimulation or a debt
 * score. It does not model disability, survivor benefits, risk premia,
 * annuity insurer default, income-tax interactions, or capital-market feedback.
 */
export function simulatePrivateAccounts(options = {}) {
  const p = {
    startYear: 2027, endYear: 2100, rampYears: 5,
    realReturn: 0.045, fee: 0.0025, annuityRate: 0.023,
    equityWeight: 0.65,
    retirementAge: 67, workingStartAge: 22, realWageGrowth: 0.0114,
    // Redirect OASI's 10.6 points, PRESERVING the separate 1.8-point DI tax.
    accountContributionRate: 0.106, retirementBenefitShare: 0.85,
    realGDPGrowth: 0.018, fiscalDiscountRate: 0.023, ...options
  };
  if (!Number.isInteger(p.rampYears) || p.rampYears < 1 || p.rampYears > 50)
    throw new Error('rampYears must be 1-50');
  if (p.endYear < p.startYear || p.endYear > 2160)
    throw new Error('Invalid endYear');
  if (p.realReturn - p.fee <= -1 || p.accountContributionRate < 0 ||
      p.accountContributionRate > 0.106 || p.equityWeight < 0 || p.equityWeight > 1 ||
      p.retirementBenefitShare < 0 ||
      p.retirementBenefitShare > 1)
    throw new Error('Invalid policy assumptions');
  const groups = [
    {name:'bottom quintile', wage2026:15000, weight:.2},
    {name:'second quintile', wage2026:30000, weight:.2},
    {name:'middle quintile', wage2026:55000, weight:.2},
    {name:'fourth quintile', wage2026:90000, weight:.2},
    {name:'top quintile', wage2026:170000, weight:.2}
  ];
  // SSA 2023 period table male/female l_x at exact ages 67..110.
  const male = [76416,74984,73486,71916,70269,68539,66722,64811,62797,60675,58429,56024,53477,50785,47960,44998,41922,38760,35529,32236,28901,25563,22265,19063,16023,13194,10617,8320,6333,4672,3335,2298,1534,999,633,389,232,133,74,39,20,10,4,2];
  const female = [85567,84569,83509,82374,81158,79847,78433,76904,75248,73454,71510,69387,67087,64606,61946,59099,56068,52857,49469,45919,42223,38399,34475,30504,26564,22732,19087,15697,12612,9877,7519,5554,3977,2758,1849,1196,745,446,256,141,73,36,17,7];
  const life = male.map((m,i)=>(m+female[i])/2);
  // From 2026 Trustees VI.G1 and VI.G3; last two columns are payroll/GDP,
  // OASI cost/GDP. Interpolation, not an official annual series.
  const anchors = [
    [2026,.342,1528/32289],[2030,.354,1896/37466],
    [2035,.362,2369/45582],[2040,.359,2920/55285],
    [2050,.354,4321/80467],[2060,.349,6631/116502],
    [2070,.345,10130/168283],[2080,.341,15182/241316],
    [2090,.337,21760/348009],[2100,.334,30655/505383]
  ];
  function interpolate(year,column) {
    if (year <= 2026) return anchors[0][column];
    if (year >= 2100) return anchors[anchors.length-1][column];
    for (let i=1;i<anchors.length;i++) {
      const a=anchors[i-1], b=anchors[i];
      if (year<=b[0])
        return a[column]+(b[column]-a[column])*(year-a[0])/(b[0]-a[0]);
    }
    return anchors.at(-1)[column];
  }
  function pia2026(wage) {
    const aime=wage/12;
    return 12*(.9*Math.min(aime,1286)+
      .32*Math.max(0,Math.min(aime,7749)-1286)+
      .15*Math.max(0,aime-7749));
  }
  const annuityFactor=life.reduce((s,l,i)=>
    s+(l/life[0])/(1+p.annuityRate)**i,0);
  const rampFraction=year=>
    Math.max(0,Math.min(1,(year-p.startYear+1)/p.rampYears));
  const cache=new Map();
  function retiringCohort(retirementYear) {
    if (cache.has(retirementYear)) return cache.get(retirementYear);
    const birthYear=retirementYear-p.retirementAge;
    const benefits=groups.map(group=>{
      let balance=0;
      for (let year=birthYear+p.workingStartAge;year<retirementYear;year++) {
        if (year<p.startYear) continue;
        // Real wages and the earnings cap increase at the SAME rate.
        const wageIndex=(1+p.realWageGrowth)**Math.max(0,year-2026);
        const deposit=Math.min(group.wage2026,184500)*wageIndex*
          p.accountContributionRate*rampFraction(year);
        // Optional annually varying real returns; repeats if shorter than the
        // simulation. This option allows externally supplied historic sequences.
        const selectYear=(series)=>series[((year-p.startYear)%series.length+
          series.length)%series.length];
        const hasAssetReturns=Array.isArray(p.equityRealReturns)&&
          p.equityRealReturns.length>0 && Array.isArray(p.bondRealReturns)&&
          p.bondRealReturns.length>0;
        // A diversified, annually rebalanced portfolio is possible when both
        // asset-class return series are provided. Otherwise, the caller's
        // blended realReturn is the explicit assumed portfolio return.
        const realReturn=hasAssetReturns
          ?p.equityWeight*selectYear(p.equityRealReturns)+
            (1-p.equityWeight)*selectYear(p.bondRealReturns)
          :Array.isArray(p.annualRealReturns)&&p.annualRealReturns.length
            ?selectYear(p.annualRealReturns)
            :p.realReturn;
        if (!Number.isFinite(realReturn)||realReturn-p.fee<=-1)
          throw new Error('Invalid annual portfolio return');
        balance=(balance+deposit)*(1+realReturn-p.fee);
      }
      // Stylized career-long AIME at the 2026 wage rate; preserve today's
      // 90/32/15 PIA formula and allow initial awards to follow real wages.
      const scheduledAnnualBenefit=pia2026(group.wage2026)*
        (1+p.realWageGrowth)**Math.max(0,retirementYear-2026);
      const accountAnnualAnnuity=balance/annuityFactor;
      return {
        group:group.name, earnings2026:group.wage2026, weight:group.weight,
        accountBalanceAtRetirement:balance, scheduledAnnualBenefit,
        accountAnnualAnnuity,
        publicAnnualTopUp:Math.max(0,scheduledAnnualBenefit-accountAnnualAnnuity),
        extraAnnualAnnuity:Math.max(0,accountAnnualAnnuity-scheduledAnnualBenefit),
        coveredShare:Math.min(1,accountAnnualAnnuity/scheduledAnnualBenefit)
      };
    });
    cache.set(retirementYear,benefits);
    return benefits;
  }
  const years=[];
  for(let year=2026;year<=p.endYear;year++) {
    let scheduledExposure=0,accountCoveredExposure=0;
    for(let age=p.retirementAge;age<=110;age++) {
      const retiredYear=year-age+p.retirementAge;
      const survival=life[age-p.retirementAge]/life[0];
      for(const group of retiringCohort(retiredYear)) {
        const exposure=survival*group.weight*group.scheduledAnnualBenefit;
        scheduledExposure+=exposure;
        accountCoveredExposure+=exposure*group.coveredShare;
      }
    }
    const retireeCoveredShare=scheduledExposure
      ?accountCoveredExposure/scheduledExposure:0;
    const taxablePayrollGDP=interpolate(year,1);
    const scheduledOASICostGDP=interpolate(year,2);
    const privatelyFinancedGDP=scheduledOASICostGDP*
      p.retirementBenefitShare*retireeCoveredShare;
    const divertedPayrollGDP=taxablePayrollGDP*
      p.accountContributionRate*rampFraction(year);
    const residualFederalOASIOutlayGDP=scheduledOASICostGDP-privatelyFinancedGDP;
    // The relevant COMPARISON to current law is DIVERSIONS MINUS ACCOUNT
    // ANNUITIES (subject to the guarantee). A reduction in gross OASI
    // outlays is NOT the same as an improvement in the federal deficit.
    const incrementalFinancingNeedGDP=divertedPayrollGDP-privatelyFinancedGDP;
    years.push({year,diversionFraction:rampFraction(year),
      taxablePayrollGDP,scheduledOASICostGDP,retireeCoveredShare,
      divertedPayrollGDP,privatelyFinancedGDP,residualFederalOASIOutlayGDP,
      incrementalFinancingNeedGDP});
  }
  const firstNetImprovementYear=years.find(row=>
    row.diversionFraction===1&&row.incrementalFinancingNeedGDP<0)?.year??null;
  const peakAdditionalNeed=years.reduce((a,b)=>
    a.incrementalFinancingNeedGDP>b.incrementalFinancingNeedGDP?a:b);
  // PV of extra federal financing in units of 2026 GDP.
  const incrementalPV2026GDP=years.reduce((s,row)=>{
    const t=row.year-2026;
    return s+row.incrementalFinancingNeedGDP*
      ((1+p.realGDPGrowth)/(1+p.fiscalDiscountRate))**t;
  },0);
  return {assumptions:p,annuityFactor,earningsGroups:groups,
    firstNetImprovementYear,peakAdditionalNeed,incrementalPV2026GDP,
    cohortExamples:[2035,2050,2070,2090].filter(y=>y<=p.endYear).map(y=>
      ({retirementYear:y,groups:retiringCohort(y)})),years};
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const opts=process.argv[2]?JSON.parse(process.argv[2]):{};
  const output=simulatePrivateAccounts(opts);
  console.log(JSON.stringify({
    assumptions:output.assumptions, annuityFactor:output.annuityFactor,
    firstNetImprovementYear:output.firstNetImprovementYear,
    peakAdditionalNeed:output.peakAdditionalNeed,
    incrementalPV2026GDP:output.incrementalPV2026GDP,
    selectedYears:output.years.filter(r=>[2027,2030,2040,2050,2060,2070,2080,2090,2100].includes(r.year)),
    cohortExamples:output.cohortExamples
  },null,2));
}
