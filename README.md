# Entitlements Reform Simulator

A cohort-based simulator for a proposed U.S. Social Security and Medicare entitlement reform.

The project is designed to answer a central fiscal question:

> What single constant federal revenue rate, as a percentage of GDP, is required to transition from current Social Security and Medicare obligations to a prefunded flat old-age benefit and defined Medicare premium-support system while satisfying a selected long-run debt objective?

## Current policy defaults

### Social Security

- Reform year: 2026
- Benefit formula phase-in: 20 years
- Flat benefit: 125% of individual FPL
- 2026 individual FPL: $15,960
- Real FPL growth: 0%
- Vesting period: 35 years
- Full retirement age: 70

### Prefunding

- Default start age: 18
- Alternative: birth
- Real endowment yield: 2.5%
- Five financing strategies: both benefits PAYGO, Social Security only prefunded, Medicare only prefunded, both prefunded, and Social Security-first sequential prefunding
- In the sequential strategy, only a positive Social Security prefunding dividend is available for the new cohort's Medicare endowment; partial funding follows that cohort into Medicare eligibility

### Medicare

- Eligibility age: 65
- Gross 2026 premium-support benefit: $19,000 / beneficiary
- Default real premium-support growth: 1.0%
- Year A: 2030 — all new entrants use premium support
- Year B: 2035 — all senior beneficiaries use premium-support payment rules
- Expected community-rating, risk-adjustment, and reinsurance costs are included in the all-in premium-support amount

### Fiscal environment

- Starting public debt: 101% of GDP
- Real GDP growth: 1.8%
- Baseline effective real borrowing rate: 2.3%
- Debt sensitivity: +2 bp long-run target rate per +1 percentage point debt/GDP
- Annual debt-rate pass-through: 15%
- 2026 nondefense discretionary outlays: 3.1% of GDP
- Default real NDD growth: 1.8% (matches central GDP growth to preserve the prior baseline share)

The Policy view exposes financing strategy plus macro and broader-budget sensitivities including real GDP growth, inflation, cohort growth, borrowing rates, debt sensitivity, legacy benefit growth, and an independent nondefense discretionary spending path. The Results view compares all five financing strategies and compares any custom macro/budget combination with central assumptions while holding the benefit design and fiscal objective fixed.

## Core modeling principle

The model is cohort-based.

A cohort's Social Security legacy/flat benefit blend is determined when it retires and is then locked for life.

For example, with a 20-year transition beginning in 2026, a cohort retiring in 2036 receives a 50% current-law / 50% flat benefit. That cohort remains 50/50 in 2050; the legacy liability declines only as members die.

The model must never replace this with an aggregate linear entitlement phaseout.

See [`MODEL_SPEC.md`](./MODEL_SPEC.md) for the authoritative economic and accounting specification and [`AGENTS.md`](./AGENTS.md) for Codex implementation guardrails.

## Intended stack

- Vite
- React
- TypeScript
- Vitest
- Recharts
- Static client-side model
- GitHub Actions CI
- GitHub Pages deployment

No backend is initially required.

## Target architecture

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

All fiscal calculations should live in pure TypeScript model modules rather than React components.

## Recommended Codex implementation order

1. Initialize Vite + React + strict TypeScript + Vitest.
2. Define model inputs, outputs, and baseline defaults.
3. Add official-source mortality and calibration datasets.
4. Implement Social Security cohort transition and persistence.
5. Implement Medicare Year A / Year B transition.
6. Implement endowment PV calculations.
7. Implement annual spending decomposition.
8. Implement debt and effective-rate dynamics.
9. Implement constant-revenue solver.
10. Write invariant/reconciliation tests.
11. Build basic UI only after the model tests pass.
12. Add year decomposition and cohort-ledger audit views.
13. Add charts and results dashboard.
14. Add scenario URL serialization.
15. Add GitHub Actions and GitHub Pages deployment.

## Minimum tests before visual polish

The test suite should demonstrate at least:

- 2036 retirement cohort is 50/50 under a 20-year phase-in.
- The same cohort remains 50/50 in 2050.
- 2046 cohort is 100% flat.
- Age-18 funding gives first prefunded Medicare cohort in 2073 and SS cohort in 2078.
- Birth funding gives 2091 and 2096 respectively.
- Flat FPL benefit has zero real growth.
- Higher flat benefit raises SS PV.
- Higher premium support raises Medicare PV.
- Higher real endowment yield lowers PV.
- Medicare Year A = 2030 and Year B = 2035 behave correctly.
- 15% debt-rate pass-through closes 15% of the remaining target-rate gap each year.
- Spending decomposition exactly reconciles.
- Solver uses one constant revenue rate and satisfies its selected objective.

## Modeling discipline

If an empirical value is unavailable, expose a named assumption rather than burying an unexplained constant.

Every empirical source should be documented with agency, dataset/report, date, URL, and transformation notes.

The simulator should make it easy to distinguish:

- empirical inputs,
- policy choices,
- model assumptions,
- derived outputs.
