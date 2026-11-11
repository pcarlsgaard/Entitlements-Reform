# Constrained X-tax Pareto search (2026)

The 2026 optimizer is a **deterministic heuristic**, not a global optimality
certificate. Run from the repository:

```bash
npm ci
npm test -- tests/paretoTaxOptimizer.test.ts
```

The test prints a single `PARETO_OPTIMIZER_2026_RESULTS_JSON=` line with
machine-readable baseline, fiscal-feasible leaders, and a Pareto frontier.
The saved input is pinned in
`tests/fixtures/paretoSavedTaxReform2026.json`. The model code is
`src/model/optimizeTaxReform.ts`, with fast, cached survey-incidence
evaluation in `src/tax/model/consumptionAudit.ts`.

## Immutable principles

- **Business rate = highest wage rate = 35%.** No discount for
  retained business cash flow or corporate profits; progressive wage rates
  only. The X-tax remains fully cash-flow-based, with zero exclusions of
  ordinary cash wages, employer FICA, employer pension, employer ESI,
  or the other existing compensation components.
- **Compliance gap remains 5%** throughout. The optimizer cannot buy
  fiscal space by assuming better compliance, and does not change the
  replacement of individual, corporate, FICA and customs taxes.
- **Additional Roth saving remains 6.5%**, not credited against any
  prior retirement saving; personal accounts and their fiscal projection
  use the saved policy unchanged.
- **Entitlement and spending paths are held constant**. No
  discretionary-spending cuts or Social Security formula changes are
  allowed during the wage/credit optimization.
- **Default family continuation** is used for ESI-covered tax units outside
  their insurance-policyholder tax unit. **ACA greater-of** is used instead
  of the saved legacy ACA-repeal assumption, with the saved ESI switcher
  percentage (0% if absent). Switching to restored 2024 enhanced ACA
  eligibility requires another independent policy scenario.
- No credit phaseout in this initial search. Both adult and child
  credits are nonnegative, with configurable earned-income phase-in
  rates. The statutory credits and the wage brackets are jointly optimized.

## Search parameters

Four-bracket candidates: approximately 17.5–22%, 23.5–28.5%,
29–33%, and fixed 35%, with upper cutoffs explored near
$45–80k, $110–220k, and $184.5–350k **per adult**.

Five-bracket candidates: 7.5–12.5%, 17.5–21.5%, 23.5–28%,
28.5–33%, then 35%. Upper cutoffs explore $10–25k,
$50–75k, $120–220k and $184.5–310k per adult.
All thresholds must increase and rates must be nondecreasing.
No jump between adjacent rates exceeds 12.5 percentage points.

Adult credit: $1,800–$3,300 in candidate steps. Child credit:
$4,000–$6,200. Adult phase-in: 15 or 20%; child
phase-in: 15, 20 or 25%.

The preserved saved policy and three previously discussed alternative
schedules are added explicitly to the candidate set. A fixed-seed
pseudorandom generator expands the grid. Results depend on the
candidate budget and seed; a repeated run returns the same candidates.

## Two-stage scoring, then fiscal verification

1. **Distribution:** Cache each current-law tax unit and health/retirement
   transition **once**. Evaluate exact changes in model-calculated wage taxes
   and earned credits for each candidate. Survey weights stay fixed.
   Record winners, losses >1%, >5%, >10%, large winners >20/40%,
   five wage-quintile outcomes, and a dispersion penalty centered on
   **+2% consumption change**. Penalize severe losses more than
   large gains, but penalize both.
2. **Revenue screen:** Use the same `calculateMacro` and net federal
   credits as `scoreCombined`. Revenue-screen threshold can be
   changed. This screen is **not fiscal feasibility**; it retains
   revenue-diverse candidates for final verification.
3. **Work incentives:** Apply `calculateLaborResponse` to a diversified
   shortlist. Distinguish employer-inclusive effective marginal
   **economic wedge** from the worker-facing personal tax rate.
   Report share of workers with higher wedges, share with higher
   personal rates, weighted rate changes, and the **Roth-inclusive liquid
   marginal take-home rate**. The private deposit is an asset, not a
   government tax, and does not enter the employer-inclusive economic
   wedge used in the GDP-growth calculation.
   Roth deposits affect **current consumption** but are not counted as
   taxes in the employer-inclusive economic wedge.
4. **Fiscal:** For a balanced/multimetric shortlist, run the **full
   2026–2095 `scoreCombined` model** and require simultaneously:
   - Primary balance nonnegative in **2035**;
   - 2095 debt/GDP **no more than 40%** (stronger than simply reducing
     starting debt ratio);
   - Peak debt/GDP **no more than 150%**.
   No supplemental unmodeled tax revenue may be added to pass this test.
   The baseline's existing revenue/paydown cap remains applied.
5. **Pareto comparison:** Among fiscally feasible finalists, report
   balanced score leader, fewest >5% losers, most winners,
   best marginal work incentives, fewest >20% winners,
   best five-rate proposal, and highest net revenue, plus
   a non-dominated frontier. If none passes all hard tests,
   **do not label a scenario feasible**: show the five smallest
   violations and which constraints remain unmet.

## Run the optimization without editing code

After this branch is merged, go to **GitHub → Actions → X-tax Pareto
optimizer → Run workflow**. The job runs on demand and uploads
`x-tax-pareto-2026-report` containing the raw log and structured
`tax-optimizer-results.json`. It does not alter deployed rates.

Three result populations are deliberately distinguished:

- **Strictly feasible**: primary balance nonnegative in 2035, peak debt
  ≤150% GDP, 2095 debt ≤40% GDP, **and** more than half of wage-earning
  tax units gain current consumption.
- **Fiscal-only feasible**: all three fiscal tests pass but the majority
  may lose consumption. These are stress-test counterexamples, not
  recommended outcomes.
- **Debt-only compromises**: peak and terminal debt targets hold but
  primary balance remains negative in 2035. Report the remaining
  fiscal gap instead of claiming all eight goals are met.

The enhanced search targets $550–850 billion additional annual receipts
to explore the least disruptive schedules near primary-budget break-even.
It tests modest increases in upper wage bands separately from removing
adult or child tax credits.

## Interpretation and data limitations

This optimizes **wage-earning tax units**, not fully linked
households. Family health-policy identifiers and the nongroup
Marketplace/Medicaid/uninsured premium data needed for precise
household distributional scoring are missing. Survey wages have a
synthetic 2026 scale; ESI benchmark premium estimation is
age-sensitive. Enormous % gains can occur with tiny current-law
spendable-income denominators; this is one reason to report both
large gain and large loss tails and group-level counts.

`calculateLaborResponse` does not model ACA premium-credit withdrawal
and the 400% FPL cliff, or participation/retirement decisions.
Employer contribution rates and after-tax consumption incentives are
separate concepts; 6.5% Roth saving reduces current liquidity but
creates an individually owned retirement asset.

The objective is a transparent **search preference**, not an
economically estimated social-welfare function. One cannot force
everyone to gain with an unchanged fiscal revenue requirement
merely by changing the wage rate ladder.
