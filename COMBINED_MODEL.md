# Combined tax and old-age reform game

The four-tab simulator uses the entitlement cohort engine and a pinned copy of the tax simulator's 2025 scoring code, health ESI/nongroup snapshots, and federal transfer definitions under `src/tax/`. The tax source is `pcarlsgaard/tax_reform` at commit `c828fdb` (September 2026). This is a deliberate snapshot, not a live dependency. The entitlement model starts with the February 2026 CBO calibration.

## Fiscal bridge

The 2025 X-tax score, expressed as a share of 2025 GDP, stays at that share of each year's GDP from 2026 through 2095. Receipts change by gross consumption tax less adult, child, and modeled health credits and the receipts from selected replaced taxes. The old refundable EITC/CTC outlay portion and selected federal transfer spending reduce `otherMandatory`. If the policy replaces ACA premium tax credits, estimated existing APTC spending reduces `medicaidChipMarketplace`. The new health purchase credit is counted once against tax receipts. These channels sum to the tax model's direct deficit improvement. A negative tax score can increase the modeled deficit. Tax incidence and health-credit estimates use the copied tax app's methods; the stock/flow bridge does not include dynamic feedback.

Scheduled or trust-fund-payable current law is the comparator. The Social Security and Medicare reform switches are independent. With both enabled and no Social Security benefit cap, the original model's prefunding strategies can be selected. With an independent switch or a cap, the game uses PAYGO. Its baseline and tax-only paths use the model benchmark retirement age of 70 and Medicare eligibility age 65. A policy change to either age affects the benefit reform path, while economic growth assumptions affect both paths. The model benchmark age 70 is **not** a representation of the statutory current-law full retirement age schedule.

The optional Social Security cap is a CPI-indexed annual limit per surviving beneficiary, specified in 2026 dollars. After calibrating legacy old-age benefits to the CBO path, each reformed retirement cohort's combined legacy and flat entitlement is scaled to the cap if needed. Cohort-level legacy/flat shares remain locked at retirement. The cap is available under PAYGO; current-law cohorts are uncapped. This is an illustrative modeled cap rather than a detailed implementation of statutory benefit rules.

## Scores and interpretation

The 10-year period is 2026–2035 inclusive, and the 70-year period is 2026–2095 inclusive. The 10-year fiscal score sums nominal deficits without discounting. The 70-year score divides the nominal deficit improvement by the sum of nominal GDP, a GDP-weighted average annual difference. Debt/GDP is an end-of-year stock. The extra adjustment solves for an equivalent constant GDP share of revenue or spending changes needed to reach the user's debt target by 2095 subject to the peak ceiling.

The default debt-sensitive interest premium is zero to keep unsolved long-run debt paths finite; the user can raise it on the Economic assumptions tab. Default real GDP growth of 1.8%, per-beneficiary Medicare real growth of 1.5%, and market rate assumptions are stylized extensions, not CBO forecasts. Published CBO category shares end before the 70-year scenario, so the model extends final shares beyond the source window. Changes in longevity, policy implementation, growth feedback, and economic incidence could materially affect long-run results.

The household cash examples cover tax formulas and employer payroll-tax pass-through. The benefit and premium-support figures are payments, not measures of welfare or insurance value. There is no aggregate net-welfare score: a defensible measure needs household lifetime consumption, benefit incidence, insurance value, discounting, and behavioral responses. The imported child-credit snapshot has no age-aware tax-unit distribution, so partially refundable child-credit settings use the tax module's fallback approximation.

See [`MODEL_SPEC.md`](MODEL_SPEC.md) and the [tax model specification](https://github.com/pcarlsgaard/tax_reform/blob/main/MODEL_SPEC.md) for the underlying separate models.
