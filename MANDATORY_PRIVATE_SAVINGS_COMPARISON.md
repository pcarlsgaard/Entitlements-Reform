# Mandatory private saving with public Social Security top-up: 2026–2095 comparison

**Run:** `npm run analyze:comparison` (also exercised by `tests/personalAccountsComparison.test.ts`).

## Economic/legal interpretation

The proposed system replaces a fraction of the existing OASDI payroll tax with equally sized **legally mandatory contributions paid straight to privately owned qualifying retirement accounts**. Government verifies contributions and asset eligibility. Government does **not** collect those contributions, pay them into accounts, own the funds, or book deposits as spending. The remaining old payroll tax is levied while the contribution mandate ramps in.

The public obligation is an inflation-indexed guarantee to supplement account annuities below the **scheduled current-law retirement benefit**. Existing disability and other survivor benefits remain on the expenditure books. Separate replacement financing is necessary if the full 12.4% tax is extinguished; retaining the 1.8% DI tax and mandating 10.6% OASI private saving is a specific alternative.

This reform changes the institutional holder of retirement capital and the allocation of retirement financing; it does not, by itself, guarantee a federal solvency improvement. Federal deficits reflect both **lost payroll-tax receipts** and smaller public checks. The user’s separate X-tax proposal already removes payroll taxation and must not deduct that receipt stream again.

## Central assumptions

Start 2026; ten-year linear ramp to a mandatory private saving rate equal to 12.4% of OASDI-covered taxable earnings; 4.0% gross real account return; 0.25% asset fee; 2.3% real annuity discount rate; CPI-indexed annuity; 7% illustrative loss of income tax receipts on government benefits displaced by tax-exempt annuities. Government top-up = `max(scheduled retirement benefit - actual qualifying account annuity,0)`. Income and benefits: five stylized wage-benefit groups, calibrated to the underlying retired-worker cohort aggregate, not matched lifetime earnings microdata.

Comparison: (1) full **scheduled** current law; (2) mandatory private accounts with public top-up; (3) 20-year transition to flat benefit of **150% individual FPL** at age 70 under PAYGO; (4) same flat benefit with government cohort prefunding at 2.5% and 4% real endowment yields. All hold Medicare, other federal programs, underlying fiscal revenues and macro assumptions constant. Federal debt-interest premium is set to zero and fiscal balances are unfinanced stress tests.

## Annual retirement ledger (% GDP)

Private contributions appear separately from federal expenditure. “Net fiscal equivalent” = government top-up + displaced federal payroll receipts + lost taxes on public benefits; it is **not spending**.

| Year | Current-law public retirement checks | Flat 150% PAYGO checks | Flat 150% public costs with 2.5% prefunding | Private mandate: federal top-up checks | Qualified private saving | Forgone federal tax receipts | Private mandate: net fiscal equivalent |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026 | 4.222 | 4.222 | 5.390 | 4.222 | 0.424 | 0.424 | 4.646 |
| 2035 | 4.847 | 4.193 | 5.131 | 4.796 | 4.489 | 4.492 | 9.289 |
| 2050 | 4.801 | 3.349 | 4.048 | 4.040 | 4.390 | 4.443 | 8.483 |
| 2075 | 5.820 | 2.233 | 2.697 | 1.731 | 4.253 | 4.539 | 6.271 |
| 2095 | 5.760 | 1.649 | 0.684 | 0.412 | 4.154 | 4.528 | 4.941 |

The 2095 flat public-prefunding cost includes 0.339% GDP in new-cohort endowment deposits and 0.345% GDP in remaining retirement checks.

By 2095, account annuities supply 92.85% of the **scheduled retirement promise** in the deterministic central scenario. Government benefits are only 0.412% GDP, a material contraction of public retirement outlays; this is distinct from 4.528% GDP in forgone tax receipts compared to the existing payroll-tax baseline.

## Present-value comparison, 2026–2095

2.3% annual real discount, trillions of 2026 dollars. These are 70-year stock-flow sums, not official SSA actuarial deficit scores.

| Scenario | PV government old-age checks only | PV public-finance-equivalent retirement cost incl. prefunding or forgone receipts | End-2095 debt/GDP |
|---|---:|---:|---:|
| Scheduled current law | $99.21T | $99.21T | 365.7% |
| Flat 150%, PAYGO | $56.45T | $56.45T | 178.1% |
| Flat 150%, government-prefunded, 2.5% real | $52.89T | $65.38T | 216.9% |
| Flat 150%, government-prefunded, 4.0% real | $52.89T | $58.01T | 184.8% |
| Mandatory private accounts, 4.0% gross real | **$58.51T** | **$137.23T** | 531.6% |

At 2095, government top-ups by illustrative benefit/income group cover 48.5% of scheduled benefits for p10, 20.3% for p25, 4.3% for p50, 1.4% for p75, and 0.5% for p90. These are *group mean* calculations; they do not establish how much of Social Security's lifetime redistribution could actually be preserved at that fiscal cost.

## Return sensitivity, 2095: full 12.4% private mandate

| Annual gross real return | Public guarantee top-ups (%GDP) | Private accounts’ share of scheduled benefits | Equivalent federal fiscal cost, including forgone revenue (%GDP) |
|---|---:|---:|---:|
| 1.0% | 2.801 | 51.4% | 7.163 |
| 2.5% | 1.553 | 73.0% | 6.002 |
| 4.0% | 0.412 | 92.8% | 4.941 |
| 5.5% | 0.097 | 98.3% | 4.647 |

At 4% gross real, replacing only the 10.6% OASI tax rather than all 12.4% would leave government topping up 0.783% GDP in 2095 and cost 4.683% GDP including forgone OASI receipts and benefit-tax receipts, while maintaining dedicated DI revenue. The 12.4% case yields lower top-ups (0.412%), but loses an additional 1.8% payroll tax.

## Important limitations and next questions

1. **Government size vs fiscal balance**: the proposed mandatory saving displaces public benefits but also prevents payroll taxes from entering the federal budget; no federal intermediary is assumed. Treat these as different outcome metrics.
2. **Guarantee exposure**: deterministic mean returns understate public puts in correlated market crashes, an adverse sequence near retirement, low earnings, interrupted work, and above-average longevity. A minimum benchmark investment rule, annuitization standard, and portfolio risk limits are needed to constrain taxpayer exposure.
3. **Redistribution**: direct public top-up spending is not equal to *redistribution alone*, especially during the transition; the floor mixes legacy accrued benefits, progressive PIA design, and investment/longevity risk insurance. A matched joint lifetime earnings/retirement-benefit/household dataset is required to quantify redistribution honestly.
4. **Macroeconomics**: mandatory saving may substitute for voluntary 401(k)/IRA saving, alter wages and consumption, change capital returns, and finance some public debt. The model holds those effects constant; investment outperformance over Treasury yields is not free government revenue.
5. **Other benefits**: benefits for dependents, disability and survivors are not yet fully assigned to public insurance versus inheritable private-account assets. The 10.6% old-age-only variant is cleaner for the dedicated DI split; OASI still contains survivor promises.
6. **Combined X-tax counterfactual**: the X-tax removes payroll taxes in *every* policy scenario. Compare the additional burden of mandatory saving and the remaining public guarantee under a **common X-tax revenue path**, without charging an additional 12.4%-of-payroll federal receipt loss. Specify which spending liabilities the X-tax pays during transition.

## Empirical reference anchors

SSA 2026 Trustees Table VI.G1 for taxable payroll ratios: https://www.ssa.gov/oact/TR/2026/VI_G_EstDollars.html . SSA 2026 Fast Facts for 10.6% OASI and 1.8% DI split: https://www.ssa.gov/policy/docs/chartbooks/fast_facts/2026/fast_facts26.html . CBO 2026 benefit taxation: https://www.cbo.gov/publication/62553 . Simulation implementation is in the experimental branch, not main; reports are scenario estimates, not official actuarial scores.
