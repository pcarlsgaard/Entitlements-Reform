# Combined tax and old-age reform simulator

Policy revision: September 28, 2026. This specification incorporates the user's explicit choices about work credits, actuarial claiming adjustments, inflation indexing, projected longevity, and GDP-linked Medicare. It supersedes the original aggregate calibration and per-person-only support conventions.

## Retirement and work credits

The flat benefit at the reference age equals the selected FPL multiple in constant 2026 dollars. It does not follow wages or GDP. Its cohort transition is pinned to birth year plus the full-benefit reference age, independently of the date benefits are claimed. Existing recipients (67+ at enactment in the aggregate proxy) retain their legacy cohort.

Claiming can begin at 62. The flat component is multiplied by `A(reference age) / A(claim age)`, where `A(c)` sums projected survival from age 62 through each payment age, discounted to age 62 at an explicit real actuarial discount rate. The expected present value is invariant to claiming age for a fixed credited work record, before benefit caps. Projected real FPL growth, if selected, is included in this annuity calculation. The legacy component uses the simplified FRA-67 statutory early reductions and 8% annual delayed credits through 70. Hence the mixed transitional benefit is not exactly actuarially neutral; its reform component is. Whole-year payments approximate actual monthly claiming rules. Current-law earnings tests, spousal/survivor benefits and exact earnings histories are not modeled.

One credited year is `min(real annual earnings / qualifying earnings threshold, 1)`. The default threshold is $7,560 in 2026, anchored to four SSA credits; the reform indexes it to inflation and allows fractional credit. Full flat benefits require 35 credited years by default. Fewer years receive `min(credited years / 35, 1)` of the promise, with no 35-year eligibility cliff. Aggregate costing uses explicitly editable representative working years and annual earnings, not a national work-history distribution. Household examples have editable pre-2026 credited years; future projected earnings accrue credits through the year before claiming. Additional work beyond claiming is not yet credited.

The benefit cap is CPI indexed and applied to the sum of legacy and flat benefits. A binding cap breaks actuarial neutrality. The current-law comparator uses age 67 unless a household explicitly supplies a claiming age; disabled reform switches restore the baseline rules.

## Demographics and opening calibration

The checked-in SSA 2026 Trustees Alternative II files provide population by calendar year and age, and mortality probabilities by sex, age and calendar year, through 2100. Survival follows a birth cohort through those calendar years. Unisex annuity factors average male and female conditional survival 50/50, an explicit approximation. SSA's 100+ population cell is distributed over ages 100–110 using projected survival weights. No one is counted beyond 110 in this model. After 2100 the actuarial extension freezes mortality and extrapolates population at 0.2% annually plus the user's deviation. That extension is not an SSA forecast.

The population growth control's central 0.2% setting means no deviation from SSA's projected path; changes shift that path's annual growth. The cohort-size level scales the entire population relative to its original 4.2-million reference. SSA-area population is a proxy for program eligibles, not an exact Medicare enrollment series.

Social Security uses one opening effective-beneficiary weight so age-67-plus legacy spending, plus named other OASDI, matches CBO's 2026 opening spending. That identical weight applies to BOTH legacy and flat payments, including prefunding deposits. It is never recalibrated to future CBO spending totals. This guarantees equal aggregate spending for equal individual benefit promises. The weight can include old-age/survivor accounting differences; it is not an empirically estimated take-up rate.

Medicare uses the same eligible population for legacy and premium support. The legacy *net federal* per-person cost is calibrated once to opening CBO spending less the separately modeled under-65 slice. Its subsequent growth is explicit. The $19,000 support parameter is a federal contribution after beneficiary financing, not a total insurance premium; it is not scaled down to match legacy net cost. This difference is visible and intentional.

## Medicare pool

The default senior premium-support pool is a fixed share of GDP. Initial generosity is the GDP share required to provide $19,000 per eligible senior in 2026. Average annual support is `pool share × nominal GDP / eligible population`. More eligible seniors divide the same pool; faster GDP increases the pool. Following complete conversion in 2035, PAYGO support equals that GDP share exactly. During conversion the pool's per-eligible amount applies to each cohort's converted share. Under-65 Medicare is a separate spending line.

An alternative per-person real-growth mode is retained for comparisons. Its dollar and growth controls have no effect in GDP-pool mode. Neither mode determines insurance quality, total health spending, or household premiums. Income- and wealth-based contribution thresholds, contribution rates, and allocation of the fixed pool are unresolved; household examples show equal average grants, not a means-tested design. A lower federal Medicare payment is never reported as a household cash loss.

## Taxes and spending

The tax engine is pinned from `pcarlsgaard/tax_reform` commit `c828fdb`, augmented with the checked-in Census child-credit distribution. No data downloads or GitHub Actions executions occur when changing controls.

Dollar brackets, credit maxima and dollar phase-out thresholds are CPI indexed. The central wage distribution follows the 2026 OASDI Trustees intermediate annual real covered-wage path, normalized to the simulator's 2026 opening year. The wage control is an additive annual percentage-point deviation from that path. Inflation alone therefore does not cause bracket creep; real wage growth can move households through the progressive schedule. The within-population income distribution and age mix of tax units remain fixed. Business and flat X-tax gross bases remain fixed GDP shares; fixed-dollar credit costs change relative to GDP with population and real GDP per capita. The custom current-law revenue path uses CBO receipt shares through 2056 and holds the last share thereafter. The reform removes changes in the selected replaced-tax receipt categories, so it cannot collect current-law bracket-creep revenue from a repealed tax. The imported 2025 opening revenue bridge is retained; CBO category changes are measured relative to 2026. These projected receipt shares do not fully respond to alternative macro assumptions. This is a fast projection, not a demographic tax microsimulation.

The health credit is counted once against receipts. Replaced refundable credit outlays and selected transfers reduce other mandatory spending; replaced ACA credits reduce the Medicaid/marketplace line. Their real per-person amounts remain fixed, so their GDP shares decline as real income per person rises. Existing spending on retained programs is not automatically reduced by higher wages. A defensible aggregate poverty-feedback module would require an income distribution and eligibility model. Household means tests already respond to household earnings, but those examples are not national fiscal estimates.

Nondefense discretionary spending has an explicit choice between CBO GDP shares and independent real growth. Tiny numeric changes can no longer silently switch modes. Other named spending categories follow CBO shares through 2056 and hold the final shares afterward.

## Official CBO comparison and dynamic scoring

The official February 2026 CBO debt path is available as a separate reference through 2056: 100.605% GDP in 2026 and 175.076% in 2056. It has its own official growth, revenue and spending assumptions. It is never extended to 2095 or silently substituted into the common-economy policy comparisons. The model's custom current-law comparator matches opening spending but subsequently follows its selected economics and SSA demographics. The custom debt ledger retains the editable opening-debt convention and is not a reproduction of CBO's annual debt levels.

Optional labor response uses eight illustrative households, a default 0.15 substitution elasticity and 60% GDP exposure. Optional capital response uses the Tax Foundation 21% DBCFT reference (+1.4% GDP, +2.6% capital, +1.3% wages), with a mild editable rate sensitivity. These are level changes phased in over 10 and 15 years, not permanent increases in growth. They are sensitivities, not external scores of this reform.

Receipts follow the changed GDP level; the GDP-linked Medicare pool follows it by design. Flat Social Security and other primary spending retain their dollar promises. The household examples do not allocate national dynamic GDP gains to individual families. No additional labor, poverty or investment response is invented. Investment returns remain deterministic assumptions; no return-risk distribution or fiscal guarantee has been selected.

Long-run fiscal consolidation has two explicit controls. The debt-paydown surplus cap limits the annual overall surplus that may be devoted to principal reduction after the total budget first reaches balance; it defaults to 0% of GDP. At a 0% cap, receipts are set equal to total federal outlays from the first balanced-budget year onward, nominal debt is held constant, interest continues to be paid, and GDP growth alone reduces debt/GDP. With a positive cap, scheduled surpluses up to that share of GDP are used to retire debt. Debt-reduction surpluses stop once the separate debt/GDP target is reached (40% by default), after which receipts again equal total outlays and nominal debt remains constant. If the scheduled tax path later falls below total outlays after balance has been achieved, receipts are adjusted upward to preserve overall balance. These post-balance adjustments are aggregate; the simulator does not yet allocate them across X-tax rates, brackets, or credits.

The HUD reports the first primary-balance year, the first overall-balance year, and the first year the debt target is reached. It also snapshots total federal spending and actual receipts as shares of GDP in the first overall-balance year. With a 0% surplus cap those two percentages are identical; with a positive cap, receipts may exceed spending by the debt-paydown surplus actually used in that year.

## Household comparisons, configurations and limits

Households compare cash and near-cash items (taxes, cash transfers and Social Security) on a common nominal or real basis. In-kind benefits, health credits and Medicare payments are shown separately. Insurance welfare, taxation of Social Security, investment income and comprehensive lifetime consumption are outside the current model. Benefits stop at the modeled age limit. No aggregate net-welfare score is claimed.

Version-1 saved configurations receive additive migration when loaded: new work-credit and discount defaults, a claiming age equal to their prior retirement age, and GDP-pool generosity that preserves their old opening per-person grant. Existing NDD path behavior is preserved once during migration; the mode is explicit thereafter. The source JSON is never overwritten by loading. Scores always use the current engine; exporting again captures all newly explicit assumptions. Config-only commits continue to skip deployment.

Automated invariants cover equal-benefit aggregate parity, cohort-share lock, prefunding dates, actuarial neutrality of the uncapped flat benefit, partial credits, population-scaled Medicare pools, CPI invariance, detailed child-credit phase-in, NDD continuity, disabled-policy equality, budget decomposition and debt solvers. Adverse scenarios are stress tests; higher debt under adverse inputs is not itself a failure.


## Long-run baseline fidelity revision — September 2026

The long-run tax and entitlement projections deliberately separate aggregate macro growth from household wage growth.

- The flat X-tax gross base remains linked to the aggregate consumption and compensation base. The fixed household distribution follows the annual 2026 Trustees intermediate real covered-wage path, plus an explicit user-selected percentage-point deviation, through progressive wage-tax brackets; this does not manufacture a larger aggregate wage base.
- CPI-indexed dollar credits are tested against the wage path for eligibility and phase-ins, while their aggregate cost relative to GDP follows population relative to real GDP.
- The central current-law Social Security and net Medicare comparator matches CBO program shares through 2056. Beyond CBO's published horizon, Social Security follows the growth of the 2026 OASDI Trustees intermediate OASDI-cost path and Medicare follows the growth of the 2026 Medicare Trustees total-expenditure path through 2100.
- SSA age-specific population and mortality remain the cohort engine. Retired-worker beneficiary growth and Medicare enrollment growth are separately benchmarked to the 2026 Trustees series.
- Policy benefits are not forced to current-law aggregate totals. User-selected flat Social Security benefits, premium support, claiming ages, eligibility ages, caps, and funding rules remain explicit policy promises.
