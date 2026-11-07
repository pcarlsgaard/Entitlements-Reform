# 2026 ESI benchmark premium and consumption audit

This is an **exploratory tax-unit sensitivity analysis**, not a reconstructive
household-level insurance claims model or an additional federal fiscal score.
The audit is implemented in `src/tax/model/consumptionAudit.ts` and displayed
on the **Tax reform** tab. Federal receipts and the debt trajectory are **not**
changed by the audit.

## Premium provenance and interpretation

- ESI tax-unit records: pinned 2025 March CPS ASEC and Census 2024 Health
  Inclusive Poverty Measure (HIPM) joined on survey persons in the existing
  `health_esi_2025.json` build.
- The gross **replacement** premium uses the 2024 HIPM `ind_need` estimate
  of the individual age/location second-lowest-cost Silver Marketplace plan
  and sums it over covered persons appearing in the tax unit, multiplied by
  the selected benchmark premium scale (default 1.03).
- The **existing ESI premium** is the calibrated MEPS-IC employer + employee
  premium contribution, not necessarily the same benefits, actuarial value,
  network, or insured person allocation as the Marketplace benchmark.
- Policyholder age bands and ESI tier are retained from the original snapshot.
  The audit reports premium levels, high-premium shares, and older-worker
  loss counts; it does **not** assign each dependent to an external family
  contract.
- Existing ESI family-tier labels can represent people covered in a different
  tax unit. They must **not** be interpreted as a policy-to-tax-unit link.
- The post-2024 premium path is **not** estimated from actual 2026 plan quotes.
  The 1.03 scaling parameter is editable, and alternative pricing should be
  tested without claiming the Silver benchmark is actuarially equivalent to
  employer coverage.

Source references:
- US Census HIPM 2024 documentation:
  https://www.census.gov/library/working-papers/2025/demo/sehsd-wp2025-14.html
- HealthCare.gov premium rating factors:
  https://www.healthcare.gov/how-plans-set-your-premiums/index.html
- HIPM extract data dictionary (linked from the Census page).
- ESI microdata `source`, `method` and `calibration` metadata for reproducible
  source file provenance.

## Tax-unit population and attribution

1. Keep all wage-positive CPS compressed tax units; remove by coarse wage,
   adult count, and child count cell the weighted ESI sample represented in
   the employer coverage snapshot. The remaining records represent
   *unmatched non-ESI wage-earning tax units*, not individual-market, Medicaid,
   uninsured, or household insurance contracts.
2. Add wage-positive ESI tax units, respecting selected non-policyholder mode.
   Under default **continue family coverage**, covered dependents without
   an in-unit policyholder retain their wage/tax observations but receive no
   separately assigned benchmark premium, employee contribution, employer
   ESI wage allocation or health credit. The larger federal credit reserve
   remains in the preexisting aggregate health scoring system.
3. Rank by **tax-unit annual wage income**, not household earnings or total
   economic resources, then form weighted quintiles. Excluding dependent
   tax units changes the sample and quintile boundaries; interpret as a
   sensitivity analysis rather than a population policy.
4. For each wage unit, recalculate **current-law** income and employee payroll
   taxes using existing tax-model functions and observed pre-tax premiums.
   Calculate reform wage brackets, compensation exemptions, adult credit and
   the child credit's refundability/phase-in. The ESI snapshot lacks ages of
   under-six children, so no additional under-six child supplement is imputed
   for these rows.
5. Decompose the change in current spendable income as
   `tax and credit change + direct health transition change - mandatory Roth deposit`.
   The tax component includes the employer-FICA wage pass-through and taxes
   on transferred employer health compensation; the direct health component
   includes employer ESI wages, previously paid employee premiums, replacement
   benchmark premiums and health credits.
6. The mandatory **Roth** deposit is private saving and is *not a federal
   revenue item*. It is removed from current consumption for strict new-saving
   comparisons. Preexisting private retirement contributions are not netted
   against the requirement.
7. Percentage loss cutoffs use a positive current-law disposable-income
   denominator. Tax units with nonpositive baseline income remain in counts
   and gains but are unclassified for percentage loss cutoffs and are listed
   in the audit.

## HIPM benchmark sensitivity (reference 6.5% savings configuration)

The following numbers are model diagnostics, **not actuarial equivalence tests**
or predictions of an achievable universal premium reduction. The saved-style
reference uses 20/25/30/35% wage rates, 6.5% new Roth saving, $2,700 adult
credit, $5,400 child credit, default family continuation and an older-worker
benchmark profile from the 2024 HIPM snapshot.

| Benchmark scale applied to 2024 HIPM premiums | Tax units losing >5% nationwide | Q1–Q3 tax units losing >5% | Average 60–64 policyholder benchmark |
|---|---:|---:|---:|
| 103% (original) | 3.82% | 1.91 million | $17,496 |
| 90% | 2.25% | 1.10 million | $15,287 |
| 80% | 1.32% | 0.67 million | $13,589 |

The premiums affect the modeled **gross exchange premium** and the amount of
the credit capped at the premium; these are not simply extra subsidies.
The existing *Benchmark premium scale* control on the Tax reform tab can
reproduce these scenarios. This distributional audit should not be interpreted
as a budget-neutral policy comparison; the full fiscal engine separately
scores premium-capped health credits.

## Fundamental limitations

- **Insurance-contract matching is unavailable.** No claim is made that
  the cost or value of dependents' insurance has been correctly assigned to
  family policyholders.
- **Nongroup insurance is not observed in the residual CPS wage sample.**
  Health premiums and credits for nongroup purchasers, Medicaid enrollees
  and uninsured people are omitted from *this distribution*, even though
  the main macro health model separately scores their aggregate credits.
  This creates a material comparability limit and likely misclassifies some
  small losses or gains.
- **Household resource pooling** across separately filing spouses, adult
  children and other dependents is unknown.
- **Credit take-up, health quality, actuarial value, out-of-pocket exposure,**
  reinsurance and coverage choice are not fully simulated.
- The separate ESI incidence panel in `health.ts` excludes Roth saving and
  originally used a simpler fully-refundable child-credit convention. The
  new audit uses the statutory child-credit phase-in via `childCredits.ts`.
  These series should not be interpreted as identical or as an exact
  reconciliation of separate published distributions.
- The imposed national-compensation pass-through and target cash-wage
  scalings are modeling conventions and do not establish an individual
  worker's actual employer contribution.

## Regression tests

`tests/consumptionAudit.test.ts` checks the source premium tail, ESI
mode behavior, private saving counterfactual, weighted quintile totals,
component identity, and monotonic loss thresholds.
