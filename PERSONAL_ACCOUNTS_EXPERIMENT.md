# Experimental scheduled-benefit personal accounts

**Status: experimental fiscal comparison, not selectable in the main GUI.** The research runner uses the main federal debt engine, with private mandatory contributions treated as forgone payroll-tax revenues and public shortfall guarantees as expenditures. The production app's existing scoring is unchanged. No official SSA actuarial score is claimed.

## Design

This model preserves the **current-law earnings-related benefit schedule and COLA**, rather than changing benefits to a flat amount. Law requires workers (and their employers for the employer-equivalent contribution) to pay the specified amount **directly to qualifying privately owned and diversified retirement accounts**. The government verifies compliance; it neither collects the contribution nor invests it or owns the asset. The progressive scheduled-benefit floor is a separate public insurance obligation. A worker receives an individual retirement savings account credited with a chosen fraction of covered wages. At the normal retirement age (67), that balance is exchanged for an assumed CPI-indexed life annuity using an explicit real pricing rate and projected cohort survival. If that private payment falls short of the scheduled benefit, the federal government pays the difference. Private payments above the scheduled benefit belong to the retiree; they do not create negative federal spending.

The default **replaces** the combined 12.4% employee-plus-employer OASDI tax on covered earnings with qualifying **mandatory private saving**, with a **10-year calendar ramp**: 10% of the destination private-saving rate in year one, 20% in year two, etc. The remaining share of the old payroll tax is still collected during the transition. Other cases redirect only 6.2% or 10.6% and use 1-, 5-, 10-, or 20-year ramps. Current retirees and people with pre-enactment work histories do not receive fictional retroactive investments. As a result, a 5-year contribution ramp does **not** imply a 5-year completion of the old-age liability transition. It takes decades to approach full-career prefunding.

Accounts have a 4% annual gross *real* return, 0.25% annual asset fee, and 2.3% *real* CPI-annuity pricing rate by default, all configurable. Sensitivity grid real returns are 1%, 2.5%, 4%, and 5.5%; these are **hypothetical return assumptions**, not inferred risk-free yields. A year-specific real-return path can represent a crisis or an externally supplied historical series. No market-return series is bundled yet.

## Mandatory private saving and separate public-finance ledger

Private savings are never deposited with the Treasury and **never counted as federal outlays**. Qualified contributions are documented and verified, and invested in eligible personal retirement assets. This is a replacement for the corresponding OASDI payroll tax, **not an additional employee tax or a government disbursement**. The fraction of the old payroll tax not yet replaced remains collected to finance legacy benefits.

For each year:

    required_private_saving = taxable_payroll * mandatory_saving_rate
    public_retirement_spending = sum_income_groups max(scheduled_benefit - private_annuity, 0)
    federal_payroll_revenue_lost = required_private_saving
    federal_benefit_income_tax_lost = replaced_public_checks * tax_loss_rate
    remaining_federal_revenue = current_law_revenue - payroll_revenue_lost - benefit_income_tax_lost
    federal_deficit_change_vs_baseline =
        public_retirement_spending - full_scheduled_retirement_spending
        + federal_payroll_revenue_lost + federal_benefit_income_tax_lost

The research comparison uses the **separate receipt and outlay fields** of the existing debt simulator. The equivalent `federal_cost` computed by the standalone cohort module is a **net-fiscal-cost metric**, not government spending: it adds public top-ups and forgone revenues only for easy deficit comparisons. The 12.4% tax replacement includes the 1.8% DI share, whereas direct retirement benefits represent retired-worker OASI; the unchanged disability and other survivor benefits must be financed by other tax revenues if their payroll receipts disappear. No net market-investment return is booked as a government receipt.

**Do not treat this as new public expenditure.** Similarly, if the comparison already assumes repeal of all payroll taxation under a separate X-tax, **do not subtract payroll receipts a second time**. In that case the additional policy is a mandatory private saving requirement plus its government benefit floor, financed by the independently modeled tax system.

Account withdrawals are **Roth-like**: no deduction for contributions and no income tax on annuity distributions. Therefore some existing income taxes on Social Security benefits are lost when benefits are displaced. The effective tax-loss rate of 7% is an approximate scenario input, not a universal marginal tax rate. Set it to zero in the combined X-tax scenario if the comparator's taxation of Social Security benefits is already eliminated. Traditional-style accounts need a separate contribution-deduction and withdrawal-tax model.

## Empirical inputs and limitations

- The Social Security rate and the 2026 Trustees' **annual taxable-payroll-to-GDP shares (0.342 in 2026, 0.362 in 2035, and 0.335 in 2095)** are from SSA Alternative II. The model pins the 2026–2100 annual series and falls back to the configurable 2026 ratio outside those years. See [SSA 2026 Table VI.G1](https://www.ssa.gov/OACT/TR/2026/lr6g1.html).
- Age-specific population and survivorship use the existing repo's **2026 Trustees demographic datasets**, including its documented post-2100 projection limitations.
- The old-age spending comparator is the simulator's current-law **retired-worker cohort aggregate**, with the five income groups disaggregated using the repository's SSA benefit-distribution proxy. Income-group taxable-wage multipliers and working-age employment weights are **stylized assumptions**, renormalized yearly to preserve aggregate taxable payroll. These are not observed joint lifetime earnings and benefits records.
- The five-group model excludes variation within group, adverse longevity/earnings correlation, household and spousal guarantees, and stock-market sequence risk unless supplied as a scenario. Using a group mean inside the non-linear guarantee formula can **understate** average public top-ups. A federal benefit floor embeds a taxpayer guarantee of low returns.
- Annual fees are included but retirement annuity-market risk capital, benefit taxation details, post-retirement private asset management, economic-feedback effects, and survivor/disability account interactions need separate tests.
- Current-law OASI old-age benefits are not the entire OASDI program; **do not compare** these annual costs with full OASDI spending without adding back unchanged DI, survivor, and other programs.

**Crucial:** federal **net fiscal cost**, *not public outlays*, includes the forgone payroll-tax stream. For example, at the 2026 Trustees' taxable payroll share of 34.2% of GDP and 12.4% redirected, a full-year redirect is **4.24% of GDP** (and 0.424% in year one of the default 10-year ramp); using the 2035 share of 36.2%, full diversion is 4.49% of GDP, *before* government benefit top-ups or taxes foregone. There is no automatic proof this is fiscally cheaper than the flat-benefit alternative, although the mandatory saving substantially reduces the share of retirement incomes paid through government. If workers made these contributions on top of existing taxes rather than replacing them, the direct federal financing gap would fall but their total burden would rise.

## Developer entrypoints

- `src/model/personalAccounts.ts`: pure standalone accumulation, annuitization, group guarantee and federal cash-flow decomposition.
- `src/model/personalAccountsSensitivity.ts`: `personalAccountSensitivityGrid(assumptions, options)`, returning selected calendar-year GDP shares and income-group topups for all scenario combinations.
- `tests/personalAccounts.test.ts`: contribution ramps, non-retroactivity, exact benefit-floor reconciliation, zero-account baseline, return monotonicity and market shock.
- Run `npm run analyze:comparison` for the current-law, 150%-FPL flat, and mandatory-private-savings cash and debt comparison. Run `npm run analyze:personal-accounts` to print the baseline, p10–p90 public top-ups, and a 144-row sensitivity matrix to the console; run `npm test -- tests/personalAccounts.test.ts` and `npm run typecheck` for checks.

The experimental comparison has an opt-in fiscal bridge, so the normal app behavior, benefit controls, tax controls and UI are unchanged. Any future production integration must update revenue and outlays **once**, test cross-policy reconciliation, and display mandated private capital, public redistribution/top-ups, and contingent guarantee obligations separately. Do not infer from a low public top-up at the income-group mean that government redistribution or guarantee risk is minimal.

## Historical comparators

SSA Office of the Chief Actuary: Stephen Goss memoranda for DeMint (September 26, 2003), Ferrara (December 1, 2003 and April 6, 2004), supplied in the project. These predecessors combined diversified accounts and scheduled-benefit protections, but their financing mechanisms and expected stock returns are not assumed in this implementation.

For income-tax effects see [CBO, The Taxation of Social Security Benefits (2026)](https://www.cbo.gov/publication/62719), and for current-year statutory payroll taxes see [SSA Trustees summary](https://www.ssa.gov/oact/trsum/index.html).
