# Program Financing Strategies and Tax Solver Comparisons

This file extends `MODEL_SPEC.md` and is authoritative for scenario comparison and tax-rate outputs.

## 1. Social Security and Medicare financing must be independently selectable

Add a policy input:

```ts
fundingStrategy:
  | 'paygo'
  | 'socialSecurityOnly'
  | 'medicareOnly'
  | 'both'
  | 'socialSecurityFirst'
  | 'savingsFundedSequential'
```

Default: `both` to preserve the original central scenario.

The purpose is to separate two distinct reforms:

1. **Benefit-design reform** — changing Social Security to the FPL-linked flat benefit and Medicare to defined premium support.
2. **Financing reform** — prefunding the defined benefit for new cohorts.

### Full and program-specific prefunding

For every prefunded program:

- calculate that program's cohort sleeve exactly as specified in `MODEL_SPEC.md`;
- record new-cohort prefunding as current primary spending/resource transfer according to the chosen funding-accounting convention;
- defined benefits for eligible prefunded cohorts are paid from their corresponding prefunded sleeve rather than PAYGO;
- residual legacy/current-law components remain federal PAYGO obligations.

The unselected program remains PAYGO. Its benefit design and transition are unchanged.

### Both benefits PAYGO

When `fundingStrategy = 'paygo'`:

- annual new-cohort prefunding is exactly zero;
- do not create or accumulate a cohort endowment;
- the benefit-design transition proceeds unchanged;
- all flat Social Security and Medicare premium-support obligations remain PAYGO federal spending for all cohorts;
- legacy obligations continue to run off by the same cohort rules and mortality assumptions.

### Social Security-first sequential prefunding

When `fundingStrategy = 'socialSecurityFirst'`, fully prefund the Social Security sleeve. For each funding year calculate:

```text
SS_prefunding_dividend =
  flat_SS_spending_under_PAYGO
  - remaining_flat_SS_PAYGO
  - SS_prefunding_deposit

Medicare_prefunding = min(
  max(SS_prefunding_dividend, 0),
  full_Medicare_endowment_cost
)
```

The resulting Medicare funded fraction is locked to that funding cohort and later removes the same fraction of its premium-support obligation from federal PAYGO. Do not use a negative dividend, future anticipated savings, debt issuance, or Medicare's own future PAYGO reductions to enlarge the current Medicare deposit.

### Savings-funded sequential prefunding

When `fundingStrategy = 'savingsFundedSequential'`, limit the current year's combined deposits to realized benefit-design savings against scheduled current law. Calculate the savings budget before and independently of any prefunding effects:

```text
available_reform_savings_t = max(
  scheduled_current_law_SS_and_senior_Medicare_t
  - reform_SS_and_senior_Medicare_under_PAYGO_t,
  0
)

SS_prefunding_t = min(
  available_reform_savings_t,
  full_SS_endowment_cost_t
)

Medicare_prefunding_t = min(
  available_reform_savings_t - SS_prefunding_t,
  full_Medicare_endowment_cost_t
)
```

Each program's funded fraction is locked to that funding cohort and proportionally removes the corresponding future defined-benefit spending from PAYGO. Deposits, avoided PAYGO created by earlier deposits, endowment returns, debt issuance, and Medicare's own future reductions must not enlarge `available_reform_savings_t`. Any savings left after both sleeves are fully funded remains unused reform savings/deficit reduction.

The benefit-design formulas, Medicare Year A/Year B transition, FPL benefit, mortality, and other policy primitives must be identical across all six scenarios unless explicitly changed by the user.

This makes differences between otherwise identical strategy runs interpretable estimates of the transition/timing consequences of financing choices.

Do not describe that difference as a pure economic “cost” without qualification: prefunding moves resources forward in time and is intended to finance future liabilities/assets. The UI may call it **incremental fiscal requirement during prefunding transition** or **prefunding timing cost**.

## 2. Required side-by-side scenario comparison

For any selected policy assumptions, calculate all six:

- both benefits PAYGO;
- Social Security prefunded and Medicare PAYGO;
- Social Security PAYGO and Medicare prefunded;
- both benefits prefunded;
- Social Security-first sequential prefunding.
- savings-funded sequential prefunding (Social Security first, then Medicare).

The main Results view should allow a direct comparison of:

- required revenue rate(s);
- peak debt/GDP;
- peak debt year;
- transition primary spending;
- net interest;
- terminal debt/GDP;
- mature primary spending;
- cumulative prefunding contributions;
- legacy PAYGO runoff;
- reformed-benefit PAYGO spending;
- prefunded-benefit spending removed from the federal PAYGO budget.

A user control may select which scenario is shown in detailed charts, but the headline comparison must calculate all six without requiring manual assumption changes.

### Policy-score horizons

The primary policy score covers 70 fiscal years, 2026 through 2095 inclusive. Also report otherwise-identical 30-year (through 2055) and 50-year (through 2075) scores. Each horizon independently solves the same peak-ceiling and endpoint-target constraints.

Keep the simulation visible through 2160 as an actuarial stress-test extension. Every long chart must mark the policy cutoff with a vertical line. Do not describe post-cutoff extrapolations as part of the 70-year score.

Also calculate two non-reform reference cases defined in `MODEL_SPEC.md`:

- current law with scheduled benefits paid in full;
- current law with only payable benefits delivered after OASI and HI depletion.

Use both revenue presentations below for the reference cases and retain them for audit and validation. Do not assign a benefit-design maturity date to current law. The main Results layout need not surface these reference cases; if shown elsewhere, label the payable comparison carefully because its lower spending reflects unpaid scheduled benefits rather than enacted reform savings.

## 3. Two revenue presentations

For every scenario calculate BOTH:

### A. Constant revenue-rate benchmark

One constant federal revenue rate `T_constant` applies in every scored year. Solve the minimum rate satisfying both:

```text
max(debtGDP_t for t <= policyHorizonEndYear) <= peakDebtCeilingGDP
debtGDP_policyHorizonEndYear <= endpointDebtTargetGDP
```

Require `startingDebtGDP <= peakDebtCeilingGDP` and `endpointDebtTargetGDP <= peakDebtCeilingGDP`. The longer simulation may display what would happen if that fixed rate continued, but the operational charts should use the annual path below so an early-binding peak does not force unnecessary later collections.

### B. Minimum-opening, nonincreasing revenue path

Begin with the solved constant rate. If its endpoint debt is at the endpoint target, use it in every year through the policy cutoff:

```text
requiredRevenueRate_t = T_constant, for t <= policyHorizonEndYear
```

This is the minimum possible opening rate under a no-future-increase constraint. If the first-year rate were below `T_constant`, all future rates would also be below the already-minimal constant solution and at least one debt constraint would fail.

If the constant path instead touches the peak ceiling early and finishes below the endpoint target, find the earliest safe hold-through year `Y`. Hold `T_constant` through `Y`, then decline linearly:

```text
requiredRevenueRate_t = T_constant, for t <= Y

requiredRevenueRate_t = T_constant
  + ((t - Y) / (policyHorizonEndYear - Y))
  * (T_endpoint - T_constant), for Y < t <= policyHorizonEndYear
```

Solve `T_endpoint <= T_constant` so endpoint debt equals `endpointDebtTargetGDP`. Choose the earliest `Y` for which the full scored path remains at or below `peakDebtCeilingGDP`. This allows taxes to begin falling shortly after an early peak while ruling out a later tax increase or a second debt overshoot.

After the cutoff, calculate the rate required to hold the objective-consistent endpoint debt ratio, then cap it at the prior-year rate:

```text
maintenanceRate_t = (
    totalFederalSpending_t
  + beginningDebt_t
  - endpointDebtTargetGDP * nominalGDP_t
) / nominalGDP_t

requiredRevenueRate_t = max(
  0,
  min(requiredRevenueRate_(t-1), maintenanceRate_t)
)
```

This lets the revenue burden fall when the transition runs off without ever requiring it to rise. If the maintenance requirement later rises above the cap, preserve the no-increase rule and allow post-cutoff debt to drift rather than silently raising taxes.

`endpointDebtTargetGDP` is always the user-selected target; there are no alternate fiscal-objective modes. Report starting revenue/GDP, the opening fiscal adjustment versus CBO's 17.5%-of-GDP 2026 current-law revenue baseline, the first decline year, minimum revenue/GDP and its year across the visible simulation, endpoint revenue rate, peak debt/GDP, and endpoint debt/GDP. The opening fiscal adjustment may be supplied by higher revenues, lower spending elsewhere, or both. Do not call these values “transition” and “mature” rates.

## 4. Mature-system year

Calculate `matureSystemYear` mechanically from cohort rules. Do not equate it with the end of the statutory benefit phase-in.

The mature-system year is the first year after which there are no remaining modeled transition cohorts that can generate a temporary PAYGO obligation that would not exist in the mature version of that financing regime.

Use the maximum modeled age from the mortality table (`maxModeledAge`, initially 110).

### Any strategy with at least one prefunded sleeve

The transition includes PAYGO obligations for cohorts that were already older than the prefunding start age at enactment.

Let:

```text
oldestFundedAtEnactment = prefundingStartAge
youngestUnfundedAgeAtEnactment = prefundingStartAge + 1
```

The last initially-unfunded cohort exits the modeled population in:

```text
matureSystemYear_prefunded = reformYear
  + (maxModeledAge - youngestUnfundedAgeAtEnactment)
  + 1
```

Example, funding at age 18, reform 2026, max age 110:

```text
youngest unfunded age = 19
last modeled year alive = 2026 + (110 - 19) = 2117
mature system begins = 2118
```

This deliberately recognizes that the financing transition lasts much longer than the benefit-formula phase-in. It applies to `socialSecurityOnly`, `medicareOnly`, `both`, and `socialSecurityFirst` because each has initially unfunded cohorts in at least one prefunded program.

For `socialSecurityFirst`, this year marks the exit of initially unfunded cohorts; Medicare's funded fraction can continue evolving afterward. Report the first positive SS dividend, first Medicare deposit, first funded cohort's Medicare eligibility, and first fully funded Medicare cohort separately.

### Both benefits PAYGO

There is no prefunding transition. The temporary transition is the legacy-benefit runoff.

For Social Security, find the last retirement cohort with `legacyShare > 0`. Under a linear phase-in of `H_SS` years beginning in the reform year, this is normally the cohort retiring in:

```text
lastBlendedRetirementYear = reformYear + H_SS - 1
```

That cohort exits the model at:

```text
lastBlendedExitYear = lastBlendedRetirementYear
  + (maxModeledAge - FRA)
```

Medicare legacy financing ends no later than Year B by policy design.

Therefore:

```text
matureSystemYear_paygo = max(
  lastBlendedExitYear + 1,
  medicareYearB + 1
)
```

Example with reform 2026, H_SS=20, FRA=70, max age=110, Year B=2035:

```text
last blended SS retirement = 2045
last modeled year alive = 2085
mature PAYGO benefit-design system begins = 2086
```

Expose the calculated mature-system year in the UI and explain why it differs across financing strategies. Also report 90%, 95%, and 99% transition-runoff milestones using period-life-table conditional survival for the youngest initially unfunded cohort under prefunding, and for the final blended retiree under PAYGO.

## 5. Required result matrix

Show a compact comparison with rows:

1. Both benefits PAYGO
2. Social Security prefunded / Medicare PAYGO
3. Social Security PAYGO / Medicare prefunded
4. Both benefits prefunded
5. Social Security-first sequential prefunding
6. Savings-funded sequential prefunding

And columns at minimum:

- starting/single revenue rate;
- minimum visible revenue rate and year;
- peak debt/GDP and year;
- policy-cutoff debt/GDP;
- mature-system year and mature primary spending/GDP;
- 95% transition-runoff year;
- first Medicare prefunding-deposit year;
- first fully funded Medicare cohort year, or an explicit `not reached by horizon`.

The user should be able to answer immediately:

- What does changing the benefit design save/cost?
- What additional near-term fiscal requirement comes from prefunding?
- What is the long-run revenue requirement with and without prefunding?
- How far can the required revenue share decline as the transition runs off?

## 6. Audit requirements

The decomposition audit must clearly label the selected financing strategy.

When both programs are PAYGO:

```text
newCohortPrefunding = 0
```

and all reformed benefits remain in the appropriate PAYGO categories.

When either sleeve is prefunded, the audit must separately show:

- Social Security prefunding;
- Medicare prefunding;
- total new-cohort prefunding;
- flat SS PAYGO for unfunded cohorts;
- premium-support PAYGO for unfunded cohorts;
- legacy SS;
- legacy Medicare;
- net interest.

For `socialSecurityFirst`, also show avoided SS PAYGO, SS prefunding deposit, signed SS dividend, full Medicare sleeve cost, actual Medicare deposit, and the cohort's Medicare funded fraction.

For `savingsFundedSequential`, also show scheduled-current-law benefit-design savings, full and actual SS sleeve costs, the SS funded fraction, full and actual Medicare sleeve costs, the Medicare funded fraction, and unused reform savings. The audit must reconcile `total prefunding <= available reform savings` in every year.

The audit must identify whether the selected year uses the minimum opening rate, the policy-window decline released by the peak ceiling, or the post-cutoff non-rising maintenance rule. It must show annual revenue, net interest, total federal spending, and ending debt/GDP.

## 7. Required tests

Add tests proving:

1. With identical benefit-design assumptions, `paygo` sets annual prefunding to exactly zero.
2. Financing strategy does not alter cohort benefit shares or Medicare Year A/Year B transition shares.
3. Each program-specific strategy removes only its selected sleeve from later PAYGO.
4. `both` removes both eligible defined components from PAYGO when benefits begin.
5. Default age-18 prefunding produces mature-system year 2118 when max modeled age is 110.
6. Default 20-year SS phase-in with both programs PAYGO produces mature-system year 2086 when FRA=70, max age=110, and Year B=2035.
7. The constant-rate solver uses exactly one revenue rate in every scored year.
8. The annual path reaches the configured policy-horizon debt target within numerical tolerance.
9. The annual path starts at the constant-rate solution and never increases through the visible simulation.
10. The reported minimum rate equals the actual minimum across the visible simulation.
11. Interest and overall-deficit accounting reconcile under both revenue presentations and all six strategies.
12. Scenario comparisons use identical benefit assumptions except for `fundingStrategy`.
13. Sequential Medicare deposits are zero while the SS dividend is negative.
14. Sequential Medicare deposits equal the lesser of the positive SS dividend and full Medicare sleeve.
15. A partial Medicare funded fraction follows its cohort and proportionally reduces later PAYGO.
16. Savings-funded deposits never exceed independently calculated benefit-design savings.
17. Savings-funded sequencing fills the Social Security sleeve before depositing into Medicare.
18. A partial Social Security funded fraction follows its cohort and proportionally reduces later PAYGO.
19. The default policy score ends in 2095 while the visible simulation extends through 2160.
20. The 30-, 50-, and 70-year score endpoints are 2055, 2075, and 2095.
21. Scheduled-current-law 2026 primary spending reconciles to approximately 20.0% of GDP and total spending to approximately 23.3% before reform deposits.
22. Birth-cohort size is multiplied by life-table survival before counting Medicare and Social Security eligibility cohorts.

## 8. UI recommendation

On the Results page, place a **Financing comparison** matrix near the top with one row per strategy:

```text
Strategy                    Start/single   Lowest visible   Peak debt   Mature primary   Medicare starts
Both PAYGO                      x.xx%           x.xx%          xxx%          x.xx%               —
SS prefunded                   x.xx%           x.xx%          xxx%          x.xx%               —
Medicare prefunded             x.xx%           x.xx%          xxx%          x.xx%              2026
Both prefunded                 x.xx%           x.xx%          xxx%          x.xx%              2026
SS-first                       x.xx%           x.xx%          xxx%          x.xx%              2081
```

Below it, show a control to inspect any strategy in the charts and decomposition audit. Long charts must show a vertical policy-cutoff marker. The spending chart must stack net interest on primary components and draw an explicit total-federal-spending line. Provide a click-to-open glossary, including a plain-language definition of nondefense discretionary spending.

On the Policy page, expose the six-value financing-strategy control for scenario-specific inspection, but always compute all strategies in the Results view.
