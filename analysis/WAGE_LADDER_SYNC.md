# Configurable X-tax wage brackets: October 2026 sync

Source design: [tax_reform PR #2](https://github.com/pcarlsgaard/tax_reform/pull/2).
This implementation ports its 3–5-band wage schedule to the integrated entitlement
simulator without replacing the latter's detailed CPS labor-response module.

## Tax policy

The new integrated default has **four statutory wage rates** of
17.5%, 25%, 30%, and 35%, with thresholds of $70,000, $220,000,
and $275,000 of taxable household compensation **per filing adult**.
The business-side rate remains independently adjustable (35% default).
The default $2,000 earned adult credit phases in at 10%, creating a
7.5% effective marginal wage-tax rate while that credit is phasing in.
The five-rate option additionally has a 7.5% first statutory rate;
with the same credit phase-in it creates a **negative 2.5%** initial
effective wage-tax rate. These are deliberate, distinct policies.

Previously saved configurations that predate the new field use
`progressiveWageBrackets: null` and retain the legacy
middle/intermediate/top schedule. New policies validate monotonically
increasing rates and boundaries. Thresholds are CPI-indexed in the
long-run projection by default; alternative wage-indexing settings
preserve real threshold positions relative to earnings.

## Opening static revenue check (2025-basis, 10% noncompliance)

Using `src/tax/data/microdata_2025.json`, the BEA cash-wage calibration,
taxable employer social insurance/health/pension components, and no
additional broad exemptions:

| Wage schedule | Estimated annual wage-side receipts |
| --- | ---: |
| Previous integrated 25/30/35%, at $75k/$150k | $3,914.1B |
| New four-rate 17.5/25/30/35%, at $70k/$220k/$275k | $3,014.4B |
| Change | **−$899.7B** |

This is **−2.92 percentage points of opening GDP** (2025 data basis).
The comparison changes **only wage-side receipts**: business taxes,
fixed health credits, child/adult-credit parameters, transfer policies,
and entitlement settings are held fixed. This is a static policy cost,
not the projected GDP gain. The integrated simulator recomputes
net receipts and debt paths when these brackets change.

## Labor response convention

The integrated model uses 18,761 compressed CPS tax-unit cells.
It independently perturbs an earner's cash wages by ±$500, including
the employer Social Security cap and wage-proportional retirement
compensation at the margin, while employer health insurance is fixed.
This differs from a wage-only employee marginal-rate example.

Two diagnostics are now calculated from each same perturbation:

- **Employer-cost marginal tax wedge:** federal total tax change
  (including employer payroll tax under current law) divided by the
  total change in employer labor cost, including marginal pension.
- **Personal cash-pay marginal rate:** personal-side tax change
  (excluding employer payroll tax under current law or if retained)
  divided by the change in gross cash pay including passed-through
  employer FICA under reform. Taxes on noncash pension compensation
  still appear in the numerator under reform, so this is a
  cash-pay diagnostic, not a complete valuation of compensation.

The model's dynamic labor GDP term uses **only the full wedge**
through the net-of-tax-wage log change; the personal rate is displayed
as a diagnostic and is **not** added as a separate growth channel.
A strong labor response cannot be interpreted without the large
revenue loss and any financing response. This remains an illustrative
long-run GDP *level* sensitivity, not an annual growth-rate forecast.
