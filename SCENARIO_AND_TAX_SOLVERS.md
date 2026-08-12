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

The benefit-design formulas, Medicare Year A/Year B transition, FPL benefit, mortality, and other policy primitives must be identical across all five scenarios unless explicitly changed by the user.

This makes differences between otherwise identical strategy runs interpretable estimates of the transition/timing consequences of financing choices.

Do not describe that difference as a pure economic “cost” without qualification: prefunding moves resources forward in time and is intended to finance future liabilities/assets. The UI may call it **incremental fiscal requirement during prefunding transition** or **prefunding timing cost**.

## 2. Required side-by-side scenario comparison

For any selected policy assumptions, calculate all five:

- both benefits PAYGO;
- Social Security prefunded and Medicare PAYGO;
- Social Security PAYGO and Medicare prefunded;
- both benefits prefunded;
- Social Security-first sequential prefunding.

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

A user control may select which scenario is shown in detailed charts, but the headline comparison must calculate all five without requiring manual assumption changes.

## 3. Two different tax/revenue presentations

For every scenario calculate BOTH:

### A. Single permanent revenue rate

One constant federal revenue rate `T_constant` applies in every simulation year.

Solve this exactly as in `MODEL_SPEC.md` under the selected fiscal objective.

Report:

- `constantRevenueRate`
- peak debt/GDP
- peak year
- terminal debt/GDP
- terminal annual debt change
- terminal net interest/GDP

### B. Transition + mature revenue rates

Also calculate a two-rate schedule:

```text
T_t = T_transition, for reformYear <= t < matureSystemYear
T_t = T_mature,     for t >= matureSystemYear
```

The two-rate schedule is an analytical comparison only. It does NOT replace the permanent-rate result.

Because infinitely many pairs of rates can satisfy long-run stability, the solver must use the explicit handoff rule below.

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

Expose the calculated mature-system year in the UI and explain why it differs across financing strategies.

## 5. Two-rate solver: make the pair unique

A two-rate problem is underdetermined unless a handoff debt condition is specified.

Add:

```ts
matureDebtTargetGDP: number
```

Default:

```text
matureDebtTargetGDP = startingDebtGDP
```

Central default = 101% of GDP.

### Step 1: solve the transition rate

Solve for one constant `T_transition` from the reform year through the year before `matureSystemYear` such that:

```text
debtGDP_at_start_of_matureSystemYear = matureDebtTargetGDP
```

The transition-rate simulation must include:

- all primary spending components;
- explicit net interest;
- endogenous debt-sensitive interest rates;
- the same interest-rate pass-through rules as the permanent-rate simulation.

Use a deterministic numerical solver.

If the target cannot be reached within configured tax-search bounds, return an explicit infeasible result rather than silently changing assumptions.

### Step 2: solve the mature rate

Starting from:

```text
debtGDP = matureDebtTargetGDP
```

and the mature-system spending structure, solve the minimum constant `T_mature` that keeps debt/GDP non-rising indefinitely / over the mature simulation horizon.

Do not simply set `T_mature = maturePrimarySpending` because debt service matters.

The mature solver must include:

- net interest;
- nominal GDP growth;
- debt-sensitive rates;
- effective-rate repricing/pass-through.

If the mature state is stationary at the target debt ratio and rates/growth are constant, the numerical result should be consistent with the relevant debt-stabilizing accounting identity.

## 6. Why this comparison is useful

The UI should explain the distinction:

### Single permanent rate

“How high would federal revenues need to be if one stable tax/revenue burden were adopted immediately and maintained permanently?”

### Transition rate

“What revenue burden is required while the old system is running off and, when enabled, new cohorts are simultaneously being prefunded, if debt is to reach the chosen handoff target by maturity?”

### Mature rate

“What permanent revenue burden is required once the transition cohorts have exited and the financing regime is fully mature?”

The gap between `T_transition` and `T_mature` makes the temporary fiscal burden of the transition visible.

## 7. Required result matrix

Show a compact comparison with rows:

1. Both benefits PAYGO
2. Social Security prefunded / Medicare PAYGO
3. Social Security PAYGO / Medicare prefunded
4. Both benefits prefunded
5. Social Security-first sequential prefunding

And columns at minimum:

- mature-system year
- single permanent revenue rate
- transition revenue rate
- mature revenue rate
- peak debt/GDP under permanent-rate solution
- peak debt/GDP under two-rate solution
- cumulative prefunding contributions/GDP or dollars (0 when OFF)
- mature primary spending/GDP
- mature net interest/GDP at handoff target
- first positive Social Security prefunding dividend year
- first Medicare prefunding-deposit year
- first funded cohort's Medicare eligibility year
- first fully funded Medicare cohort year, or an explicit `not reached by horizon`

The user should be able to answer immediately:

- What does changing the benefit design save/cost?
- What additional near-term fiscal requirement comes from prefunding?
- What is the long-run revenue requirement with and without prefunding?
- How much higher is the transition rate than the mature rate?

## 8. Audit requirements

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

For the two-rate schedule, the audit should also show which tax regime applies in the selected year:

- `transition rate`, or
- `mature rate`.

## 9. Required tests

Add tests proving:

1. With identical benefit-design assumptions, `paygo` sets annual prefunding to exactly zero.
2. Financing strategy does not alter cohort benefit shares or Medicare Year A/Year B transition shares.
3. Each program-specific strategy removes only its selected sleeve from later PAYGO.
4. `both` removes both eligible defined components from PAYGO when benefits begin.
5. Default age-18 prefunding produces mature-system year 2118 when max modeled age is 110.
6. Default 20-year SS phase-in with both programs PAYGO produces mature-system year 2086 when FRA=70, max age=110, and Year B=2035.
7. The permanent-rate solver uses exactly one revenue rate in every year.
8. The two-rate solver uses exactly `T_transition` before the handoff and exactly `T_mature` from the mature-system year onward.
9. The transition solver reaches the configured mature debt target within numerical tolerance.
10. The mature-rate solver produces non-rising debt at the handoff target.
11. Interest and overall-deficit accounting reconcile under both tax schedules and all five strategies.
12. Scenario comparisons use identical benefit assumptions except for `fundingStrategy`.
13. Sequential Medicare deposits are zero while the SS dividend is negative.
14. Sequential Medicare deposits equal the lesser of the positive SS dividend and full Medicare sleeve.
15. A partial Medicare funded fraction follows its cohort and proportionally reduces later PAYGO.

## 10. UI recommendation

On the Results page, place a **Financing comparison** matrix near the top with one row per strategy:

```text
Strategy                    Permanent   Transition   Mature   SS dividend   Medicare starts
Both PAYGO                    x.xx%        x.xx%       x.xx%       —               —
SS prefunded                 x.xx%        x.xx%       x.xx%      2080             —
Medicare prefunded           x.xx%        x.xx%       x.xx%       —              2026
Both prefunded               x.xx%        x.xx%       x.xx%      2080            2026
SS-first                     x.xx%        x.xx%       x.xx%      2080            2080
```

Below it, show a control to inspect any strategy in the charts and decomposition audit.

On the Policy page, expose the five-value financing-strategy control for scenario-specific inspection, but always compute all strategies in the Results view.
