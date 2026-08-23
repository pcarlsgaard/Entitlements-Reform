# AGENTS.md

## Purpose

This repository contains an auditable cohort-based simulator for a proposed U.S. Social Security and Medicare entitlement reform.

The economic model is more important than the interface. UI work must never silently alter fiscal equations, cohort accounting, empirical inputs, or policy assumptions.

## Non-negotiable modeling rules

1. **Use cohort accounting, not an aggregate entitlement phaseout.**
   - A Social Security retirement cohort receives a legacy/flat benefit blend determined when it retires.
   - That blend is locked for the lifetime of that cohort.
   - The legacy share disappears only as members of the cohort die.
   - Never multiply aggregate Social Security spending by a generic linear phaseout factor.

2. **Benefit transition and prefunding are independent.**
   - A cohort may receive a partially or fully reformed benefit while remaining PAYGO-funded if it was already older than the prefunding age when reform began.
   - Prefunding begins only for cohorts at or below the specified funding age at enactment.

3. **The flat Social Security benefit is defined as a percentage of individual FPL.**
   - Default: 125% of individual FPL.
   - Real FPL growth is fixed at exactly 0% unless the policy specification is explicitly changed.
   - Do not define the flat benefit as a percentage of average current-law Social Security benefits.

4. **The new-cohort endowment is a calculated output, never a user-entered arbitrary %GDP value.**
   - Calculate separate Social Security and Medicare present-value sleeves.
   - Combined endowment = SS PV + Medicare PV.

5. **Medicare reform is modeled as a defined per-beneficiary premium-support entitlement.**
   - Default 2026 gross premium support: $19,000 per beneficiary.
   - Expected community-rating, risk-adjustment, and reinsurance costs are included in this all-in payment and are not modeled separately.
   - Default Year A = 2030: all new Medicare entrants use premium support.
   - Default Year B = 2035: all remaining senior Medicare beneficiaries use premium-support payment rules.

6. **Show both the constant-rate benchmark and the annual required-revenue path.**
   - There is one combined fiscal lever: a peak-debt ceiling and an endpoint debt target no higher than that ceiling. Do not reintroduce an objective dropdown.
   - The constant rate is the minimum single rate that satisfies both constraints.
   - The annual path begins at that rate. If the peak ceiling binds early and the constant path would finish below the endpoint target, begin a smooth decline in the earliest year that still respects the ceiling and reaches the endpoint.
   - After the cutoff, revenue may decline to the debt-maintenance requirement but may never rise above the prior year's rate.
   - Do not reintroduce an underdetermined transition/mature two-rate schedule.

7. **Debt-rate sensitivity and debt refinancing speed are separate concepts.**
   - Debt sensitivity sets the target market interest rate as debt/GDP rises.
   - Annual pass-through controls how quickly the average effective federal borrowing rate moves toward that target.

8. **All major spending components must reconcile.**
   - Never hide unexplained residuals in “other.”
   - Add explicit named assumptions when data are unavailable.

## Required architecture

Keep the fiscal engine separate from React components.

Preferred structure:

```text
src/
  model/
    types.ts
    mortality.ts
    socialSecurity.ts
    medicare.ts
    endowment.ts
    debt.ts
    simulate.ts
    solveTax.ts
    audit.ts
  data/
    ssaLifeTable.ts
    ssaRetiredWorkers.ts
    medicareBaseline.ts
    cboBaseline.ts
    sources.ts
  components/
  pages/
  presets/
tests/
```

Model functions should be pure TypeScript wherever practical.

## Testing requirements

Tests are part of the model specification, not optional implementation details.

At minimum preserve tests proving:

- 20-year SS phase-in: 2036 retiree is 50% legacy / 50% flat.
- The 2036 cohort is still 50/50 when evaluated in 2050.
- 2046 retiree is 100% flat under a 20-year phase-in beginning in 2026.
- Age-18 prefunding + Medicare age 65 => first prefunded Medicare cohort in 2073.
- Age-18 prefunding + FRA 70 => first prefunded SS cohort in 2078.
- Birth prefunding => first prefunded Medicare cohort in 2091 and SS cohort in 2096.
- Real FPL benefit does not grow over time.
- Higher flat benefit raises SS PV.
- Higher premium support raises Medicare PV.
- Higher real endowment yield lowers PV.
- Default Medicare Year A 2030 gives 100% premium support to new entrants.
- Default Medicare Year B 2035 completes senior conversion.
- Pass-through lambda = 1 reprices immediately.
- Pass-through lambda = 0.15 closes exactly 15% of the remaining rate gap each year.
- Spending decomposition sums to total primary spending within floating-point tolerance.
- The constant-rate solver uses the same federal revenue rate in every scored year and satisfies both the peak ceiling and endpoint debt target.
- The annual required-revenue path reaches the endpoint target without breaching the peak ceiling, starts at the constant rate, never rises, and reports its first decline year and minimum visible rate.

If a UI change breaks a model test, fix the UI or identify a genuine model-spec change. Do not weaken the test merely to make CI pass.

## Modeling discipline

- Do not hard-code derived outputs.
- Do not silently change assumptions to improve fiscal results.
- Do not substitute an aggregate approximation when a cohort variable already exists.
- Use named, typed intermediate values so the economic meaning is visible.
- Prefer explicit reconciliation tables and audit outputs.
- Clearly distinguish official empirical inputs, policy choices, modeling assumptions, and derived outputs.
- Record every empirical source in `src/data/sources.ts` with agency, dataset/report, date, URL, and transformation notes.

## Development order

Before visual polish:

1. Types and default policy assumptions.
2. Mortality/survival module.
3. Social Security cohort transition.
4. Medicare cohort transition.
5. Endowment PV calculation.
6. Annual spending decomposition.
7. Debt and interest-rate dynamics.
8. Constant-revenue solver.
9. Reconciliation and invariant tests.
10. Basic React UI.
11. Audit/ledger UI.
12. Charts.
13. URL scenario serialization.
14. GitHub Actions and deployment.

## Definition of done for model changes

A fiscal-model change is complete only when:

- the economic rule is explicit in code,
- unit tests cover the important invariant,
- the audit decomposition still reconciles,
- sources/assumptions are updated if necessary,
- and the UI label accurately describes the underlying primitive rather than a derived quantity.
