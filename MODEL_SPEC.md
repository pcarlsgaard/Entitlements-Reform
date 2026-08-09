# Entitlements Reform — Authoritative Model Specification

## Purpose

This document defines the intended economics and accounting of the simulator. The implementation may evolve, but code should not diverge from this specification without an explicit policy decision.

## Reform year

- Reform/enactment year: **2026**.

---

# 1. Social Security old-age reform

## 1.1 Benefit phase-in

The old-age benefit formula transitions by **retirement cohort**.

For a cohort retiring in year `r`:

```text
alpha_r = clamp((r - 2026) / H_SS, 0, 1)
```

where:

- `H_SS` = selected Social Security benefit phase-in in years.
- `alpha_r` = flat-benefit share permanently assigned to that cohort.

The cohort's retirement benefit is:

```text
B_r = (1 - alpha_r) * B_current_law_r
    + alpha_r * B_flat_r
```

### Critical persistence rule

`alpha_r` is locked at retirement and does not change later.

Example: 20-year phase-in.

| Retirement year | Current-law share | Flat share |
|---|---:|---:|
| 2026 | 100% | 0% |
| 2031 | 75% | 25% |
| 2036 | 50% | 50% |
| 2041 | 25% | 75% |
| 2046+ | 0% | 100% |

A 2036 retiree remains 50% current-law / 50% flat in 2050. The liability fades only through mortality.

## 1.2 Flat benefit

Default:

- **125% of individual federal poverty level**.
- 2026 individual FPL default: **$15,960**.
- Real FPL growth: **0%**.

Thus the central 2026 real flat benefit is:

```text
1.25 * 15,960 = $19,950/year
```

The flat benefit is a policy primitive and should never be defined indirectly as a percentage of current-law Social Security benefits.

## 1.3 Vesting

Default vesting period:

- **35 years** of qualifying labor participation.

The fiscal core may initially score fully vested participants unless a more explicit vesting-history module is implemented. Vesting forfeitures must not be silently assumed as savings.

## 1.4 Retirement age

Default full retirement age:

- **70**.

The architecture should allow longevity indexing later, but do not assume a longevity formula without an explicit parameter.

---

# 2. Prefunding architecture

## 2.1 Independence from benefit reform

Benefit reform and prefunding are separate.

A person can receive a fully or partially reformed benefit while remaining PAYGO-funded if that person was already older than the prefunding start age at enactment.

## 2.2 Default start age

Default:

- prefunding begins at **age 18** in 2026.

Alternative:

- prefunding at **birth**.

No retroactive endowment is automatically granted to cohorts already older than the selected funding age in 2026.

## 2.3 First prefunded cohorts

With funding age 18:

- Medicare age 65 => first prefunded Medicare cohort in **2073**.
- Social Security FRA 70 => first prefunded SS cohort in **2078**.

With funding at birth:

- Medicare age 65 => first prefunded Medicare cohort in **2091**.
- FRA 70 => first prefunded SS cohort in **2096**.

## 2.4 Endowment accounting

The endowment is calculated from the defined future benefit stream. It is never an arbitrary user-selected %GDP amount.

Separate sleeves:

```text
PV_total = PV_SS + PV_Medicare
```

Annual new-cohort prefunding:

```text
annual_prefunding_dollars = PV_total_per_person * funded_cohort_size
annual_prefunding_GDP = annual_prefunding_dollars / GDP
```

---

# 3. Medicare reform

## 3.1 Policy endpoint

The senior Medicare entitlement transitions to a **defined per-beneficiary premium-support payment** delivered through a competitive Medicare Advantage-style marketplace.

The model should not separately score detailed reinsurance, community rating, or risk adjustment. Their expected public cost is included in the all-in per-beneficiary premium-support value.

## 3.2 Premium-support amount

Default 2026 gross federal benchmark benefit:

- **$19,000 per beneficiary per year**.

Interpret this as the gross public value of benchmark Medicare-equivalent coverage.

Do not silently net out Part B premiums or other beneficiary contributions. If beneficiary contributions are later included, show them as an explicit assumption and subtraction.

## 3.3 Medicare eligibility age

Default:

- **65**.

## 3.4 Transition dates

Default:

- **Year A = 2030**.
- **Year B = 2035**.

### Year A

By Year A, all newly Medicare-eligible beneficiaries use the premium-support system.

Before Year A, newly eligible cohorts can transition linearly from legacy financing toward premium support.

### Year B

By Year B, all remaining senior Medicare beneficiaries have been converted to premium-support payment rules.

Existing beneficiaries transition between Year A and Year B.

## 3.5 Legacy Medicare definition

“Legacy Medicare” means current-law federal Medicare financing, including both:

- Original Medicare fee-for-service, and
- current-law Medicare Advantage payment rules.

Current Medicare Advantage enrollment should not automatically be treated as already reformed, because the proposed premium-support obligation differs from current MA financing.

## 3.6 Premium-support growth

Default real premium-support growth:

- **1.0% annually**.

This is a model assumption, not a guaranteed policy target.

Legacy current-law Medicare real cost growth should remain separately configurable.

---

# 4. Mortality and survival

Use SSA life-table data rather than a simple exponential survival curve.

For life-table survivors `l_x`:

```text
Pr(alive at age b | alive at age a) = l_b / l_a
```

Period life tables are acceptable for the initial model, but the source/limitation must be documented. Cohort mortality projections can replace them later.

---

# 5. Endowment calculation

## 5.1 Social Security sleeve

For funding age `a`:

```text
PV_SS(a) = Σ_age>=FRA [
  Pr(alive at age | alive at a)
  * defined_flat_SS_payment(age)
  / (1 + real_endowment_yield)^(age-a)
]
```

For the mature fully reformed cohort:

- defined flat SS = `%FPL * FPL`.
- real FPL growth = 0%.

If the first funded cohort is not yet fully transitioned under an unusually long SS phase-in, only the defined flat share should be prefunded; any legacy share remains PAYGO.

## 5.2 Medicare sleeve

```text
PV_Medicare(a) = Σ_age>=MedicareAge [
  Pr(alive at age | alive at a)
  * premium_support(age)
  * applicable_premium_support_share
  / (1 + real_endowment_yield)^(age-a)
]
```

Default real endowment yield:

- **2.5%**.

---

# 6. Federal spending decomposition

Every simulation year should retain at least these components separately:

1. Legacy/current-law Social Security old-age spending.
2. Flat Social Security PAYGO spending for cohorts not prefunded.
3. Other OASDI outside the old-age reform.
4. Legacy/current-law senior Medicare spending.
5. Premium-support PAYGO for senior cohorts not prefunded.
6. Under-65 Medicare outside the senior reform.
7. New-cohort prefunding.
8. Other federal primary spending.
9. Net interest.
10. Total primary spending.
11. Total federal spending.
12. Federal revenue.
13. Primary balance.
14. Overall deficit.
15. Debt/GDP.

The sum of primary spending components must exactly reconcile to modeled total primary spending within floating-point tolerance.

---

# 7. Decomposition audit

The application should allow selection of any year and show each primary spending component in:

- dollars,
- %GDP.

A selected Social Security cohort should show:

- retirement year,
- legacy share,
- flat share,
- whether the flat component was prefunded,
- initially retiring beneficiaries,
- surviving beneficiaries in the audit year,
- survival fraction,
- legacy PAYGO spending from that cohort,
- flat PAYGO spending from that cohort.

The cohort ledger must make it visually obvious that transition cohorts continue to carry legacy obligations after the formal phase-in ends.

---

# 8. Debt and interest-rate mechanics

## 8.1 Constant revenue rate

The main policy question is the minimum **single constant federal revenue rate as %GDP** needed to meet a selected fiscal objective.

Do not introduce separate transition and mature tax rates.

## 8.2 Debt dynamics

Let:

- `d_t` = debt/GDP,
- `r_t` = effective real federal borrowing rate,
- `g_t` = real GDP growth,
- `P_t` = primary spending/GDP,
- `T` = constant revenue/GDP.

Then:

```text
d_(t+1) = d_t * (1 + r_t) / (1 + g_t)
        + (P_t - T) / (1 + g_t)
```

Default starting debt/GDP:

- **101%**.

Default real GDP growth:

- **1.8%**.

Default baseline effective real borrowing rate:

- **2.3%**.

## 8.3 Debt-to-market-rate sensitivity

Default assumption:

- +1 percentage point of debt/GDP raises the long-run market-rate target by **2 basis points**.

Conceptually:

```text
target_rate_t = baseline_rate
              + beta * max(debtGDP_t - startingDebtGDP, 0)
```

This is distinct from refinancing/pass-through.

## 8.4 Annual debt-rate pass-through

The average effective borrowing rate does not instantly jump to the market-rate target because Treasury debt reprices as securities mature and new debt is issued.

Default:

- `lambda = 0.15`.

```text
effective_rate_t = effective_rate_(t-1)
                 + lambda * (target_rate_t - effective_rate_(t-1))
```

Interpretation:

- `lambda = 1.00`: immediate full repricing.
- `lambda = 0.15`: 15% of the remaining gap closes each year.

Derived diagnostics:

```text
half_life = ln(0.5) / ln(1-lambda)
time_to_90pct = ln(0.1) / ln(1-lambda)
```

The UI should explain this rather than presenting “pass-through” as a self-explanatory slider.

---

# 9. Solver objectives

Implement a deterministic solver for the constant federal revenue rate.

Supported objectives:

## Long-run stable debt

```text
terminal annual change in debt/GDP <= 0
```

## Return debt

```text
terminal debt/GDP <= starting debt/GDP
```

## Peak-debt constraint

```text
peak debt/GDP <= selected target
```

## Combined

Both:

- long-run stable debt, and
- peak debt/GDP <= selected target.

Solver outputs should include:

- required constant revenue/GDP,
- peak debt/GDP,
- peak year,
- terminal debt/GDP,
- terminal annual debt change,
- effective interest rate at peak debt,
- terminal effective interest rate.

---

# 10. Baseline empirical framework

The model should distinguish empirical inputs from policy assumptions.

Empirical sources should be isolated under `src/data` and documented in `src/data/sources.ts`.

Priority official sources:

- SSA period life table used in the 2026 Trustees framework.
- SSA retired-worker counts and average benefits by age.
- CMS Medicare enrollment.
- CBO 2026 baseline GDP, debt, spending, rates, and long-run projections.
- CBO debt-interest-rate sensitivity.
- HHS 2026 federal poverty guideline.

When exact age-specific Medicare spending is not available in a clean official form, use a clearly named average per-beneficiary calibration rather than inventing an unsupported age-cost curve.

---

# 11. UI requirements

Primary views:

1. **Policy** — policy primitives only.
2. **Results** — debt and spending paths plus headline outputs.
3. **Audit** — year decomposition and cohort ledger.
4. **Model & Sources** — equations, empirical provenance, assumptions, limitations.

Derived quantities such as the annual cohort endowment should appear as outputs, not sliders.

Scenarios should eventually serialize into URL query parameters so another user can reproduce the same assumption set.

---

# 12. Required model invariants

The implementation is not considered reliable until automated tests verify:

- benefit shares are locked by retirement cohort,
- legacy obligations persist until mortality removes the cohort,
- prefunding and benefit reform are independent,
- first prefunded cohort dates are correct,
- FPL real growth is zero,
- endowment PV moves correctly with benefit, premium-support, and discount-rate assumptions,
- Medicare Year A and Year B semantics are correct,
- rate pass-through semantics are correct,
- decomposition reconciles exactly,
- constant-revenue solver satisfies its selected condition without changing the tax rate over time.
