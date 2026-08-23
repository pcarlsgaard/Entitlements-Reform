# Interest Accounting — Authoritative Addendum

This file clarifies and extends `MODEL_SPEC.md`. If there is any ambiguity about interest accounting, this addendum controls.

## Why this exists

The entitlement decomposition is naturally expressed in **primary spending** terms, but the fiscal model must also show and reconcile **net interest**, **total federal spending**, the **overall deficit**, and the resulting debt path.

Interest must not be hidden merely because it is already implicit in the debt roll-forward.

## Required annual accounting sequence

For every simulation year `t`, calculate and retain the following in this order.

### 1. Primary spending

```text
primary_spending_t =
    legacy_SS_t
  + flat_SS_PAYGO_t
  + other_OASDI_t
  + legacy_Medicare_t
  + premium_support_PAYGO_t
  + under65_Medicare_t
  + nondefense_discretionary_t
  + new_cohort_prefunding_t
  + other_primary_spending_excluding_NDD_t
```

### 2. Primary balance

Let `revenue_t` be federal revenue as a share of GDP. The model reports both a constant-rate benchmark and an annual required-revenue path.

```text
primary_balance_t = revenue_t - primary_spending_t
primary_deficit_t = primary_spending_t - revenue_t
```

A positive `primary_balance` is a surplus.

### 3. Net interest

Net interest must be an explicit annual output.

For budget-style accounting, use the **average effective nominal interest rate on the outstanding federal debt stock**:

```text
net_interest_t = effective_nominal_rate_t * beginning_debt_t
```

where `beginning_debt_t` is debt held by the public expressed as a share of current-year GDP.

This is the modeled budget outlay for servicing the debt during year `t`.

### 4. Total federal spending

```text
total_spending_t = primary_spending_t + net_interest_t
```

### 5. Overall deficit

```text
overall_deficit_t = total_spending_t - revenue_t
                  = primary_deficit_t + net_interest_t
```

### 6. Debt roll-forward

The debt roll-forward must reconcile with the same interest and deficit calculations shown in the audit.

If nominal GDP growth is `nominal_gdp_growth_t`:

```text
debt_(t+1) =
  [
      debt_t * (1 + effective_nominal_rate_t)
    + primary_deficit_t
  ]
  / (1 + nominal_gdp_growth_t)
```

Equivalently:

```text
debt_(t+1) =
  [ debt_t + overall_deficit_t ]
  / (1 + nominal_gdp_growth_t)
```

subject only to consistent timing conventions.

These two implementations should reconcile to floating-point tolerance.

## Real versus nominal interest rates

Do not conflate three distinct quantities:

1. **Long-run real market-rate target** — the economic interest-rate assumption that responds to debt/GDP.
2. **Nominal market-rate target** — the real target converted using the model's inflation assumption.
3. **Average effective nominal rate on the federal debt stock** — the rate actually used to calculate annual net-interest outlays.

Recommended structure:

```text
real_target_rate_t = baseline_real_target_rate
                   + debt_sensitivity * max(debt_t - reference_debt, 0)

nominal_target_rate_t = (1 + real_target_rate_t) * (1 + inflation_t) - 1

effective_nominal_rate_t = effective_nominal_rate_(t-1)
                         + lambda * (
                             nominal_target_rate_t
                             - effective_nominal_rate_(t-1)
                           )
```

`lambda` is the annual debt-rate pass-through/refinancing-speed parameter.

This separation is preferable to calling the same rate both a real market rate and an effective budget interest rate.

## Starting effective interest-rate calibration

The model should support a starting **effective nominal interest rate** calibrated from the baseline budget:

```text
starting_effective_nominal_rate
  = baseline_net_interest / baseline_debt_held_by_public
```

Do not force the starting effective rate to equal the long-run market-rate target.

This allows the model to represent gradual refinancing of the existing Treasury debt stock toward prevailing market rates.

The precise baseline values should live in `src/data/cboBaseline.ts` and be documented in `src/data/sources.ts`.

## Inflation

Because budget net-interest outlays are nominal, the model should have an explicit inflation assumption or path.

Nominal GDP growth should be calculated consistently from real GDP growth and inflation, for example:

```text
nominal_gdp_growth_t
  = (1 + real_gdp_growth_t) * (1 + inflation_t) - 1
```

Do not mix a real interest rate with nominal federal budget interest spending without an explicit conversion.

## Decomposition audit requirements

The year audit must show both primary and total-budget accounting.

At minimum display, in dollars and %GDP:

### Primary spending

- Legacy/current-law Social Security
- Flat Social Security PAYGO
- Other OASDI
- Legacy/current-law senior Medicare
- Premium-support PAYGO
- Under-65 Medicare
- Nondefense discretionary spending
- New-cohort prefunding
- Other primary spending excluding nondefense discretionary spending
- **Total primary spending**

### Financing and interest

- Federal revenue
- **Primary balance / primary deficit**
- Beginning debt/GDP
- Effective nominal interest rate
- **Net interest**
- **Total federal spending**
- **Overall deficit**
- Ending debt/GDP

The UI should visually separate `Primary program spending` from `Interest & financing` rather than mixing net interest into an entitlement stack.

## Reconciliation tests

Automated tests must verify all of the following for every modeled year or a representative set of years:

```text
sum(primary components) == total primary spending

total primary spending + net interest == total federal spending

primary spending - revenue == primary deficit

primary deficit + net interest == overall deficit

total spending - revenue == overall deficit
```

The debt roll-forward using `debt * (1 + effective nominal rate) + primary deficit` must produce the same ending debt ratio as the equivalent formulation using the overall deficit, subject to the model's stated timing convention.

## Solver implication

Both revenue presentations must respond to interest through the debt feedback loop.

A higher debt path can:

1. raise the market-rate target through the debt-sensitivity parameter;
2. raise the effective debt-service rate gradually through `lambda`;
3. increase net interest;
4. increase the overall deficit;
5. increase debt further.

Thus interest is endogenous to the fiscal path even though it is not part of `primary_spending`.

For the non-rising path, use the minimum constant-rate solution through the policy cutoff. After the cutoff, calculate the revenue needed to hold the target debt ratio after current-year primary spending and net interest, then use the lesser of that maintenance rate and the prior-year rate. This allows taxes to fall without permitting a later increase; if the cap binds, debt may drift above the post-cutoff target rather than violating the no-increase rule.

## UI terminology

Use precise labels:

- `Primary spending` excludes net interest.
- `Total federal spending` includes net interest.
- `Primary deficit` excludes net interest.
- `Overall deficit` includes net interest.
- `Debt-rate pass-through` describes refinancing speed, not the magnitude of the debt-interest-rate sensitivity.
