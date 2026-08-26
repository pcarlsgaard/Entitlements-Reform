# Entitlements Reform Simulator

A cohort-based simulator for a proposed U.S. Social Security and Medicare entitlement reform.

The project is designed to answer a central fiscal question:

> What constant federal revenue rate—and what realistic year-by-year revenue path—is required to transition from current Social Security and Medicare obligations while meeting a clearly dated debt objective?

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
- Six financing strategies: both benefits PAYGO, Social Security only prefunded, Medicare only prefunded, both prefunded, Social Security-first sequential prefunding, and savings-funded sequential prefunding
- In the sequential strategy, only a positive Social Security prefunding dividend is available for the new cohort's Medicare endowment; partial funding follows that cohort into Medicare eligibility
- In the savings-funded strategy, benefit-design savings versus scheduled current law prefund Social Security first and then Medicare; deposits cannot create or enlarge their own savings budget, and partial SS or Medicare funding follows the cohort for life

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
- 2026 nondefense discretionary outlays: 3.121% of GDP
- Central NDD path: CBO's published GDP shares through 2056; custom paths can instead apply an independent real-growth assumption

The Policy view exposes financing strategy plus macro and broader-budget sensitivities including real GDP growth, inflation, cohort growth, borrowing rates, debt sensitivity, legacy benefit growth, and an independent nondefense discretionary spending path. The Results view compares all six financing strategies, measures each against current law with scheduled benefits and with trust-fund-payable benefits, and compares any custom macro/budget combination with central assumptions while holding the benefit design and fiscal objective fixed.

## Current-law benchmarks

The Results view includes two apples-to-apples reference cases inside the simulator's cohort calibration:

- **Scheduled:** current-law Social Security and senior Medicare benefits are paid in full.
- **Payable:** OASI and Medicare Part A are constrained after their projected trust-fund depletion dates using the 2026 Trustees payable percentages; DI and Medicare Parts B/D remain fully payable.

The annual model approximates the partial depletion years, interpolates published Trustees points through 2100, and holds the 2100 percentages afterward. The displayed unpaid-benefit share makes clear that the payable baseline's lower fiscal requirement is not reform savings. Because “other OASDI” is not yet split into survivor and disability components, its separate calibration remains scheduled while the OASI factor applies to the modeled old-age stream.

Legacy senior Medicare is an all-in Parts A, B, D, and Medicare Advantage benefit growing at the selected current-law cost rate, initially 1.5% real per beneficiary. Medicare Advantage payments are allocated between Part A and Part B financing rather than modeled as a separate trust fund. The payable baseline leaves the scheduled trajectory intact and applies nonpayment only to the HI-financed share.

The primary score uses a 70-year policy horizon through 2095, with companion 30- and 50-year calculations retained in the model. The Results page keeps the longer path through 2160 visible as a marked actuarial stress test. Users select a peak-debt ceiling and an endpoint debt target no higher than that ceiling. The operational revenue path starts at the minimum single rate satisfying both limits. If the peak binds early, revenue begins a smooth decline in the earliest safe year and reaches the endpoint target without a later increase; otherwise it stays at the opening rate through the cutoff.

The 2026 scheduled-current-law calibration reconciles category by category to CBO: 5.222% of GDP for total Social Security, 3.332% for net Medicare, 2.64997% for Medicaid/CHIP/marketplace subsidies, 2.994% for other mandatory spending, 2.773% for defense discretionary, and 3.121% for nondefense discretionary. Those components sum to 20.092% primary spending; adding 3.257% net interest produces 23.348% total spending. CBO's 17.541% revenue and 100.605% debt/GDP are also loaded exactly, although the UI rounds headline labels. Social Security and Medicare policy slices remain separate, with explicit subtotals that match CBO. Reform prefunding deposits appear on top of the baseline.

The CBO category paths run through 2056. The simulator holds the final published shares after 2056 as an actuarial stress test, not a CBO forecast. The macro engine remains stylized: it uses the selected constant real GDP growth and inflation assumptions rather than importing CBO's year-specific macro forecast.

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
- Constant-rate solver satisfies both the peak-debt ceiling and endpoint debt target.
- Non-rising revenue path reaches the endpoint target without breaching the peak ceiling, starts at the single-rate result, never increases, and reports its first decline and lowest visible rate.
- Opening fiscal adjustment equals the opening rate minus CBO's unrounded 17.541%-of-GDP 2026 current-law revenue baseline; compact labels round the benchmark to 17.5%.

## Modeling discipline

If an empirical value is unavailable, expose a named assumption rather than burying an unexplained constant.

Every empirical source should be documented with agency, dataset/report, date, URL, and transformation notes.

The simulator should make it easy to distinguish:

- empirical inputs,
- policy choices,
- model assumptions,
- derived outputs.
