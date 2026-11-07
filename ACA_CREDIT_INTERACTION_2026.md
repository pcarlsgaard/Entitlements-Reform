# ACA and universal health-credit interaction (2026)

## Binding credit rule

For every policy enrolled in eligible Marketplace coverage, the modeled
federal premium credit is **max(ACA PTC, universal health credit)**, limited to
the relevant benchmark premium. Both full amounts are **never stacked**.
The **incremental cost above the universal credit** is
`max(0, eligible ACA PTC - min(universal credit, benchmark))`.

- Existing Marketplace APTC recipient (`health_nongroup_2025.json`,
  status 2): `replaceAcaAptc=false` retains the existing ACA spending
  already inside the federal baseline, and adds **only** the top-up needed
  to reach the universal amount. `replaceAcaAptc=true` is a legacy
  *replacement-only* scenario. The new combined-simulator **default is false**.
- Existing direct-purchase unit without APTC (status 1): the snapshot only
  supports the universal credit. It has no MAGI field with which to reassign
  ACA eligibility under the new 2026 rules.
- Currently uninsured (status 3): full universal credit is conditional on
  an assumed new coverage take-up rate.
- ESI policyholder who **actually leaves employer coverage** and enrolls in
  Marketplace insurance: the optional transition share computes a 2026-law
  ACA PTC from a tax-unit wage-income MAGI proxy, then awards only the
  excess above the flat universal credit. People who retain qualifying
  affordable ESI are not assumed eligible.
- Dependents covered on an outside family policy are not assigned a second
  exchange premium or independent ACA credit under family-continuation mode.

## 2026 eligibility method

Uses the 2026 applicable percentage table in IRS Revenue Procedure 2025-25
with the **2025** HHS poverty guidelines (2026 ACA plan year):
* 100–<133% FPL: 2.10% of income;
* 133–<150%: 3.14–4.19%;
* 150–<200%: 4.19–6.60%;
* 200–<250%: 6.60–8.44%;
* 250–<300%: 8.44–9.96%;
* 300–400%: 9.96%;
* Outside 100–400%: no regular ACA PTC.

The approximation does **not** identify (1) household MAGI including
capital and nonwage incomes, (2) plan and employer offer details, (3)
Medicaid/CHIP eligibility, (4) geography in AK/HI, (5) family insurance
contracts across tax units, (6) immigration-related exceptions, or
(7) a guaranteed future employer transition fraction. It uses 48-state
2025 FPL and 2026 wage plus assumed employer health/payroll cash transfers
as the taxable income proxy.

## Reference cost estimates — optional scenario

Using a 35% top-rate saved-style reform with $3,000/adult and $1,500/child
universal premium credits and full 2026 benchmark premium:

| Portion of ESI policyholders shifting to eligible Marketplace plans | Incremental ACA PTC over universal |
|---|---:|
| 0% (default) | $0 |
| 10% | $3.95 billion/year |
| 25% | $9.88 billion/year |
| 50% | $19.75 billion/year |
| 100% (upper scenario) | $39.50 billion/year |

At 100%, about 18.2M ESI policyholder tax units fall in the basic 100–400%
FPL income window and about 14.0M have a *positive* eligible ACA subsidy.
Excluding hypothetical PTC for 100–138% FPL (some may receive Medicaid)
lowers incremental cost to about $36.60B at 100% transition.

The full-transition ACA increment is overwhelmingly in bottom-three
wage-tax-unit quintiles (approximately $36B of the $39.5B), assuming
relative wages from the pinned sample.

**Existing nongroup ACA baseline warning:** The status-2 data use observed
**2024** ACA PTC payments (about $105.8B after the model's premium scaling),
calibrated to average 2025 enrollment. The enhanced 2021–2025 ACA credits
expired for 2026; the source lacks MAGI to recompute 2026 policyholder
entitlements. This creates significant risk of **overstating 2026 ACA
retention cost**. On this old source, preserving the greater ACA/universal
amount costs roughly $56B more per year than full ACA replacement
*net of ACA baseline savings*; this is not an official 2026 forecast.
Improving the nongroup dataset with household MAGI and Marketplace
eligibility flags is needed before interpreting the long-run debt impact.

## Incidence consistency

The selected hypothetical ESI transition share also changes the
`consumptionAudit` expected-value ESI policyholder credit. At the 100%
reference scenario, Q1/Q2/Q3 tax-unit shares losing >5% of spendable
income fall from approximately **1.19/2.23/4.06%** to
**0.21/0.25/2.38%**, respectively. Intermediate shares are a
weighted expectation, not actual random or predictable transition decisions.
The baseline non-ESI sample lacks Marketplace/Medicaid records, so
the household incidence series should not be treated as an official
distribution of tax/health policy winners and losers.

## How to operate

Tax Reform → Health coverage credits:
* Enable **Retain larger of ACA PTC or universal health credit**
  (on by default for new configurations, older saved explicit values preserved).
* Adjust **ESI policyholders shifting to Marketplace** from 0% to 100%;
  the model scores the ACA excess only, never both full credits.
* Examine fiscal and consumption changes; baseline debt paths follow
  the selected transition-share expenditure, not the 100% sensitivity
  if the slider remains at 0%.

IRS sources:
- https://www.irs.gov/irb/2025-32_IRB
- https://www.irs.gov/affordable-care-act/individuals-and-families/questions-and-answers-on-the-premium-tax-credit
- https://www.healthcare.gov/glossary/federal-poverty-level-FPL/
