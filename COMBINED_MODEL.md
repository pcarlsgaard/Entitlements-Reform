# Combined tax and old-age reform game

The **Play** tab combines the active entitlement cohort engine with a pinned copy of the tax simulator's static 2025 scoring code. The tax model modules and snapshots under `src/tax/` are copied from `pcarlsgaard/tax_reform` at commit `c828fdb` (September 2026). Update the copy deliberately when that model changes; it is not a live dependency. The entitlement model begins from this repository's February 2026 CBO calibration.

## Fiscal identity

For a selected tax policy, in 2025 dollars and billions:

```text
net tax-receipt change = X-tax gross receipts − adult, child, and insurance credits
                         − receipts from the selected taxes being replaced
mandatory outlay savings = refundable EITC and child-credit excess formerly paid
                           as outlays, if the individual income tax is replaced
total direct fiscal improvement = net tax-receipt change + mandatory outlay savings
```

The 2025 tax amounts are divided by 2025 GDP and held at **constant shares of GDP** from 2026 through 2095. The first term adjusts the entitlement model's revenue rate above its 2026 CBO revenue baseline (17.541% of GDP). The second reduces its named `otherMandatory` component. The modeled benefit changes affect Social Security and Medicare cohort spending, not the tax score. No credit outlay saving is counted twice. The insurance-credit cost is a manually entered aggregate tax-model adjustment; it does not rerun the separate ESI microsimulation. Optional SNAP or other transfer repeal from the source tax app is not yet wired in.

The baseline can be scheduled benefits or trust-fund-payable benefits. The benefit switches independently choose current-law versus reform cohort formulas for Social Security and Medicare. The legacy portion of a partially reformed cohort retains the selected current-law delivery factor. PAYGO is used in this combined screen; the existing Results screen still explores prefunding strategies. Reformed and unreformed options share the same demographics and macro assumptions.

The **10-year** period is 2026–2035 inclusive and the **70-year** period is 2026–2095 inclusive. The 10-year fiscal headline sums **nominal dollars** without discounting. The 70-year headline divides the nominal fiscal improvement by the sum of annual nominal GDP, yielding a GDP-weighted average annual difference. Debt/GDP is an end-of-year stock, and the game solves the extra constant annual GDP-share adjustment needed to reach the opening debt/GDP ratio by 2095 while keeping the peak at or below 150% of GDP. The extra adjustment can be revenue, program savings, or a mix. The 2026 primary category baseline is reconciled in the entitlement model's original audit.

## Scenario assumptions and limits

- The game sets the debt-sensitive market-rate slope to **zero** by default. With a permanent tax-rate shortfall, the original entitlement model's 2 bp-per-1 pp debt sensitivity compounds into a debt-rate spiral over 70 years. The separate Results view retains that stress assumption and the full debt-constrained solver. The game still updates the average effective federal interest rate toward a constant market-rate target at the original 15% annual pass-through.
- The tax score is static: no labor, capital, consumption, avoidance, population-composition, or GDP responses over time. Tax data are 2025; the entitlement baseline is 2026. Both are scaled to a constant GDP share without a detailed year bridge.
- CBO category paths are available through 2056; the entitlement engine extends final published shares after that point and uses cohort trajectories for old-age programs. Results through 2095 are an actuarial scenario, not a CBO forecast.
- The household examples reuse the tax app's current-law and X-tax wage calculators. They exclude insurance premiums, the value and timing of Social Security or Medicare benefits, and distributional changes among retirees. These examples are **not** a welfare score. A credible net-welfare calculation requires a common lifetime household/cohort model with consumption, insurance value, benefit incidence, discounting, and behavioral responses.
- This imported child-credit snapshot lacks age-aware tax-unit detail, so policies with partially refundable child credits would use the tax module's documented fallback approximation. The game starts with a fully refundable child credit.

The source repositories' own specifications remain the authority for their separate equations: [`MODEL_SPEC.md`](MODEL_SPEC.md) here and [tax model specification](https://github.com/pcarlsgaard/tax_reform/blob/main/MODEL_SPEC.md).
