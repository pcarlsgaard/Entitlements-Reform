# Experimental scheduled-benefit personal accounts

**Status: standalone research model on an experimental branch.** The existing combined-app fiscal score is unchanged until the personal-account model has been validated and integrated deliberately. No official SSA actuarial score is claimed.

## Design

This model preserves the **current-law earnings-related benefit schedule and COLA**, rather than changing benefits to a flat amount. A worker receives an individual, diversified retirement savings account credited with a chosen fraction of payroll contributions. At the normal retirement age (67), that balance is exchanged for an assumed CPI-indexed life annuity using an explicit real pricing rate and projected cohort survival. If that private payment falls short of the scheduled benefit, the federal government pays the difference. Private payments above the scheduled benefit belong to the retiree; they do not create negative federal spending.

The default redirects the combined 12.4% employee-plus-employer OASDI rate on taxable payroll, with a **10-year calendar ramp**: 10% of the destination rate is redirected in year one, 20% in year two, etc. Other cases redirect only 6.2% or 10.6% and use 1-, 5-, 10-, or 20-year ramps. Current retirees and people with pre-enactment work histories do not receive fictional retroactive investments. As a result, a 5-year contribution ramp does **not** imply a 5-year completion of the old-age liability transition. It takes decades to approach full-career prefunding.

Accounts have a 4% annual gross *real* return, 0.25% annual asset fee, and 2.3% *real* CPI-annuity pricing rate by default, all configurable. Sensitivity grid real returns are 1%, 2.5%, 4%, and 5.5%; these are **hypothetical return assumptions**, not inferred risk-free yields. A year-specific real-return path can represent a crisis or an externally supplied historical series. No market-return series is bundled yet.

## Consolidated federal cash accounting

For each year:

    public_retirement_outlay = sum_groups max(scheduled_benefit - private_annuity, 0)
    redirected_payroll = GDP * taxable_payroll/GDP * payroll_rate * redirect_share
    tax_revenue_lost = displaced_public_benefits * displaced_benefit_tax_rate
    federal_cost = public_retirement_outlay + redirected_payroll + tax_revenue_lost
    federal_savings = full_scheduled_retirement_benefits - federal_cost

The diverted contribution is represented as a **gross deposit outlay against unchanged baseline tax receipts**. This is equivalent to removing the diverted receipts from tax revenue and NOT including deposits as outlays. The code must never do both. Disability and survivor benefits outside the current retired-worker cohort remain as public obligations; if all 12.4% is diverted, their dedicated payroll financing also needs replacement by the general fund, reflected here in the redirected receipt cost. There is no inference that account assets are federal trust-fund assets.

Account withdrawals are **Roth-like**: no deduction for contributions and no income tax on annuity distributions. Therefore some existing income taxes on Social Security benefits are lost when benefits are displaced. The effective tax-loss rate of 7% is an approximate scenario input, not a universal marginal tax rate. Set it to zero in the combined X-tax scenario if the comparator's taxation of Social Security benefits is already eliminated. Traditional-style accounts need a separate contribution-deduction and withdrawal-tax model.

## Empirical inputs and limitations

- The Social Security rate and the 2026 Trustees' **annual taxable-payroll-to-GDP shares (0.342 in 2026, 0.362 in 2035, and 0.335 in 2095)** are from SSA Alternative II. The model pins the 2026–2100 annual series and falls back to the configurable 2026 ratio outside those years. See [SSA 2026 Table VI.G1](https://www.ssa.gov/OACT/TR/2026/lr6g1.html).
- Age-specific population and survivorship use the existing repo's **2026 Trustees demographic datasets**, including its documented post-2100 projection limitations.
- The old-age spending comparator is the simulator's current-law **retired-worker cohort aggregate**, with the five income groups disaggregated using the repository's SSA benefit-distribution proxy. Income-group taxable-wage multipliers and working-age employment weights are **stylized assumptions**, renormalized yearly to preserve aggregate taxable payroll. These are not observed joint lifetime earnings and benefits records.
- The five-group model excludes variation within group, adverse longevity/earnings correlation, household and spousal guarantees, and stock-market sequence risk unless supplied as a scenario. Using a group mean inside the non-linear guarantee formula can **understate** average public top-ups. A federal benefit floor embeds a taxpayer guarantee of low returns.
- Annual fees are included but retirement annuity-market risk capital, benefit taxation details, post-retirement private asset management, economic-feedback effects, and survivor/disability account interactions need separate tests.
- Current-law OASI old-age benefits are not the entire OASDI program; **do not compare** these annual costs with full OASDI spending without adding back unchanged DI, survivor, and other programs.

**Crucial:** mature federal outlays here still include the redirected payroll stream. For example, at the 2026 Trustees' taxable payroll share of 34.2% of GDP and 12.4% redirected, a full-year redirect is **4.24% of GDP** (and 0.424% in year one of the default 10-year ramp); using the 2035 share of 36.2%, full diversion is 4.49% of GDP, *before* government benefit top-ups or taxes foregone. There is no automatic proof this is fiscally cheaper than the flat-benefit alternative. If workers make these contributions on top of existing taxes rather than redirecting them, the direct federal transition expense falls but their total payment burden rises.

## Developer entrypoints

- `src/model/personalAccounts.ts`: pure standalone accumulation, annuitization, group guarantee and federal cash-flow decomposition.
- `src/model/personalAccountsSensitivity.ts`: `personalAccountSensitivityGrid(assumptions, options)`, returning selected calendar-year GDP shares and income-group topups for all scenario combinations.
- `tests/personalAccounts.test.ts`: contribution ramps, non-retroactivity, exact benefit-floor reconciliation, zero-account baseline, return monotonicity and market shock.
- Run `npm run analyze:personal-accounts` to print the baseline, p10–p90 public top-ups, and a 144-row sensitivity matrix to the console; run `npm test -- tests/personalAccounts.test.ts` and `npm run typecheck` for checks.

This experimental module does not touch the fiscal simulator, benefit controls, tax controls, or UI; the subsequent integration must update full government receipts/outlays **once**, test cross-policy reconciliation, and display the account's private wealth and the public contingent guarantee separately.

## Historical comparators

SSA Office of the Chief Actuary: Stephen Goss memoranda for DeMint (September 26, 2003), Ferrara (December 1, 2003 and April 6, 2004), supplied in the project. These predecessors combined diversified accounts and scheduled-benefit protections, but their financing mechanisms and expected stock returns are not assumed in this implementation.

For income-tax effects see [CBO, The Taxation of Social Security Benefits (2026)](https://www.cbo.gov/publication/62719), and for current-year statutory payroll taxes see [SSA Trustees summary](https://www.ssa.gov/oact/trsum/index.html).
