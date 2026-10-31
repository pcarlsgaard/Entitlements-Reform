# Social Security financing experiment: scheduled accounts vs flat 150% FPL

**Run date:** October 31, 2026. **Scope:** illustrative, repo-calibrated 2026–2095 cohort projection. This is not an SSA actuarial estimate. **Main fiscal code remains unchanged in the deployed app.** Research branch runs use `npm run analyze:comparison`; CI imports that script through `tests/personalAccountsComparison.test.ts`.

## Policies compared

Common federal 2026 CBO/SSA economic baseline, unchanged current-law federal revenue path, unchanged Medicare and other public spending, scheduled (not as-payable) OASI, a constant 2.3% real federal borrowing rate without a marginal debt premium (the repo still applies refinancing pass-through). The model's separate tax and Medicare reforms are switched off for this experiment. All nominal calculations are in dollars; reported present values discount nominal projected cash flows at 2.3% real plus assumed 2.0% inflation.

1. Scheduled current-law retirement benefits: the model's current-law, wage-linked cohort benchmark.
2. Personal accounts: divert the **full 12.4% of OASDI taxable payroll** over a 10-year calendar ramp (10%, 20%, …, 100% of that rate). Annuities replace scheduled benefits dollar-for-dollar, with the government guaranteeing the shortfall for each income group. 4% gross real accumulation, 0.25% annual investment fee, 2.3% real CPI-annuity pricing and 7% effective tax loss on benefits displaced by private Roth-like annuities. Other OASDI costs remain unchanged.
3. Flat 150% FPL, PAYGO: 20-year retirement-cohort phase-in, age-70 retirement, fixed real 2026 poverty guideline $15,960 and annual full benefit of **$23,940 (2026 dollars)**, no new prefunding.
4. Same flat benefit, with public age-18 cohort endowments to finance the future flat entitlement, at 2.5% and 4% real endowment yields. Existing and ineligible cohorts remain PAYGO-financed. Medicare remains **current law** in both cases; the experimental fiscal engine separately permits the existing Social Security-only prefunding sleeve without converting Medicare.

## Annual federal retirement financing cost (% GDP)

The personal-account column includes (a) diverted old payroll receipts scored as an equivalent outlay, (b) benefit guarantees, and (c) lost Social Security-benefit income taxes. Baseline and flat columns measure their federal public old-age spending; the flat-prefunding columns also include all new-cohort SS endowment deposits. None include unchanged DI/other OASDI.

| Year | Current law | Accounts 4% | Flat 150% PAYGO | Flat prefund 2.5% | Flat prefund 4% |
|---|---:|---:|---:|---:|---:|
| 2026 | 4.222 | 4.646 | 4.222 | 5.390 | 4.701 |
| 2035 | 4.847 | 9.289 | 4.193 | 5.131 | 4.577 |
| 2050 | 4.801 | 8.483 | 3.349 | 4.048 | 3.636 |
| 2075 | 5.820 | 6.271 | 2.233 | 2.697 | 2.423 |
| 2095 | 5.760 | 4.941 | 1.649 | 0.684 | 0.484 |

## 70-year summary

**Present value of government retirement financing through 2095, 2026 $ trillions**, 2.3% real discount. Positive savings mean lower federal financing cost than scheduled benefits; these figures omit benefits paid privately from the accumulated assets.

| Scenario | Fiscal PV | Savings PV vs baseline | Debt/GDP 2095 |
|---|---:|---:|---:|
| Scheduled current law | $99.21T | — | 365.7% |
| Accounts 12.4%, 4% gross real | $137.23T | **−$38.02T** | 531.6% |
| Flat 150%, PAYGO | $56.45T | **+$42.76T** | 178.1% |
| Flat 150%, prefund 2.5% | $65.38T | +$33.82T | 216.9% |
| Flat 150%, prefund 4% | $58.01T | +$41.19T | 184.8% |

These **unfinanced** debt paths apply current-law revenue policy across the scenarios; they are fiscal stress tests, not revenue-needs solutions. Comparing the alternative funding policies under a constant debt-target revenue solver and a combined X-tax transition requires a separate integration.

## Personal-account public transition funding

| Year | Redirected tax (% GDP) | Government scheduled-benefit topups (% GDP) | Lost benefit income taxes (% GDP) | Total (% GDP) | Scheduled promise privately covered |
|---|---:|---:|---:|---:|---:|
| 2026 | 0.424 | 4.222 | 0.000 | 4.646 | 0.0% |
| 2035 | 4.489 | 4.796 | 0.004 | 9.289 | 1.0% |
| 2050 | 4.390 | 4.040 | 0.053 | 8.483 | 15.9% |
| 2075 | 4.253 | 1.731 | 0.286 | 6.271 | 70.3% |
| 2095 | 4.154 | 0.412 | 0.374 | 4.941 | 92.8% |

## Personal account sensitivities

| Change (all other defaults fixed) | Cost 2050 (% GDP) | Cost 2095 (% GDP) |
|---|---:|---:|
| 1.0% real asset return | 8.649 | 7.163 |
| 2.5% real asset return | 8.573 | 6.002 |
| 4.0% real asset return | 8.483 | 4.941 |
| 5.5% real asset return | 8.376 | 4.647 |
| 4.0%, 1-year contribution ramp | 8.123 | 4.855 |
| 4.0%, 5-year contribution ramp | 8.294 | 4.885 |
| 4.0%, 20-year contribution ramp | 8.754 | 5.133 |
| 4.0%, redirect only 6.2% | 6.642 | 4.927 |
| 4.0%, redirect only 10.6% | 7.948 | 4.683 |

**Interpretation:** The 10-year accounts experiment delays tax receipts before accounts can pay meaningful benefits. The flat 150%-FPL reform achieves large benefit-design savings as the legacy wage-linked earnings formula runs off; accounts preserve that more expensive benefit guarantee. Even with above-baseline asset returns, payroll diversion remains a federal financing cost. An account model with a 10.6% contribution can be cheaper in 2095 than diverting all 12.4%, because contributions beyond the amount needed to cover scheduled benefits often create private surplus wealth without reducing the public benefit guarantee further.

## Essential cautions

- **This is fiscal, not welfare or retirement-income equivalence.** The personal account retiree owns assets and may receive annuities exceeding scheduled Social Security; some excess and inheritances have value but no net federal budget reduction. The flat pension gives a substantially different—and lower for many high earners—retirement income promise.
- Accounts start at normal retirement age **67**; the existing flat proposal starts at **70**. This is the app's default policy comparison, not an isolated experiment holding claiming ages equal.
- Returns are stylized deterministic averages, not historical realized market sequences. The five earnings groups are illustrative, and intra-group shocks, earnings/benefit correlations, early death, annuity market pricing and longevity variation may change federal guarantee cost significantly.
- The 7% benefit-income-tax offset is approximate. Set it to zero in an X-tax proposal that has repealed the same tax. If payroll tax itself is repealed under the X-tax, **12.4% private mandatory saving is a new burden on workers/employers**, not a free transfer of already collected revenue; the worker tax wedge and the reform financing need joint rescoring.
- All OASDI taxable-payroll/GDP ratios use the official 2026 Trustees alternative II series, starting at 0.342 in 2026 and reaching 0.335 in 2095. The rest of the macro baseline remains the repo's independent CBO/SSA-calibrated series. A fixed nominal GDP compounding bug in the original personal-accounts experiment was corrected before these numbers were generated.
- The model's initial OASI-style annual spending aggregate is a calibrated proxy, not a complete individual benefit calculation or a published SSA microsimulation. Source data: [2026 SSA VI.G1](https://www.ssa.gov/OACT/TR/2026/lr6g1.html); cohort/mortality methodology and further caveats are documented in [PERSONAL_ACCOUNTS_EXPERIMENT.md](../PERSONAL_ACCOUNTS_EXPERIMENT.md).

## Reproduce

```bash
npm ci
npm run analyze:comparison
npm test -- tests/personalAccounts.test.ts tests/personalAccountsComparison.test.ts
npm run typecheck
```

The comparison script outputs machine-readable JSON between `PERSONAL_ACCOUNT_COMPARISON_JSON_START` and `PERSONAL_ACCOUNT_COMPARISON_JSON_END`, including debt and benefit-cost outcomes for each case. GitHub CI on the experimental branch passed the full model tests, TypeScript check, and production build after inclusion of the flat prefunding cases.
