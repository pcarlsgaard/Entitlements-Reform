# Five-year, 1% consumption hold-harmless transition study (November 2026)

This **analysis-only** branch uses the pinned 2026 wage-earning tax-unit
sample, default **continue family coverage** ESI convention, 6.5% mandatory
new Roth deposits, $3,000 adult/$1,500 child health credits, and saved tax
family-credit rules. It is not merged into the federal fiscal engine.

## Benefit definition

For wage-income quintiles Q1–Q3 (about 76.41 million tax units, 76.24 million
with positive prior-law spending), each eligible tax unit receives a refundable
payment `max(0, 0.99 * priorSpendable - reformSpendable)`.
This covers all but a 1% decline in current consumption **including** the 6.5%
Roth deposit, treated as new saving. Winners receive no payment. The
approximately 166,000 units in Q1 with nonpositive old-law spendable income
cannot be classified by percentage loss and need a separate absolute-dollar
fallback rule. Quintiles are wage **tax units** (not households) and boundaries
are around $33.44k, $55.74k, $86.95k and $151.61k.

## First-year 2026 static scores

| Policy | Annual minimum top-up | Recipients (Q1–Q3) | 5 years at 2026 dollar cost | 5-year nominal illustration at 3.836% annual growth |
|---|---:|---:|---:|---:|
| Saved 20/25/30/35%, $2,700 adult | $17.790B | 16.392M | $88.951B | $96.041B |
| A 19.5/25/30/35%, top from $185k | $14.001B | 8.368M | $70.004B | $75.585B |
| B 20/25/30/35%, top from $170k, $3,000 adult | $13.727B | 8.345M | $68.637B | $74.108B |
| C 19.2/25.5/33/35%, top from $250k | $13.000B | 6.372M | $65.002B | $70.183B |

The 3.836% nominal growth illustration compounds the model's 2% inflation
and 1.8% real GDP growth assumptions. It is **not** a new 2027–2030 CPS
microsimulation, and holds eligibility and relative loss structure constant.

### Saved schedule: Q1–Q3 breakdown

| Quintile | Top-up ($B) | Recipients (M) | Mean payment per recipient |
|---|---:|---:|---:|
| Q1 (< $33.44k wages) | 1.565 | 0.914 | $1,711 |
| Q2 ($33.44–55.74k) | 4.517 | 7.923 | $570 |
| Q3 ($55.74–86.95k) | 11.709 | 7.554 | $1,550 |

## Why a literal old-law tax election is not equivalent

The study also calculates a *shadow* old-law income-tax + employee-FICA
election on **new post-reform cash wages**, preserving the reform's
insurance and mandatory retirement contributions.

| Saved schedule diagnostic | Annual cost ($B) |
|---|---:|
| Automatic 1% make-whole top-up | 17.790 |
| Unrestricted shadow old-law election cost | 4.409 |
| Additional top-up to reach the 1% ceiling after the election | 15.094 |
| Election + required remaining top-up | 19.503 |
| Hold harmless **excluding** Roth saving from the consumption test | 5.181 |

Old-law election alone leaves **10.93M** bottom-three-quintile tax units with
more than a 1% consumption decline. Applying a *different* shadow
interpretation—old rules on **pre-reform** wages while permitting the
reform's wage pass-through—produces an expensive and economically inconsistent
elective comparison (about $132B for the saved case). Thus a refundable
reconciliation credit is clearer and usually cheaper than a blanket return
election.

## Important caveats

1. The sample includes wage-earning tax units, not linked households.
   To prevent mis-targeting, legislative eligibility should ideally be based
   on joint household resources and family policy contracts.
2. Residual non-ESI tax units lack detailed marketplace/Medicaid/uninsured
   premiums and subsidies, and family plans cannot be linked across tax units.
3. New saving is counted as foregone *current* consumption, not lost wealth.
4. Current-law calculations use the simulator's simplified tax representation.
5. No new 5-year individual income paths, tax-unit composition changes,
   behavioral responses, premium changes, claim administration, or debt
   feedback are simulated. Costs are approximate and **not an official budget
   score**. The fiscal model is not modified by this analysis.
6. A cliff after year five may create a second transition shock; a planned
   short phase-out or protection for exceptional cases would mitigate this but
   would change the estimated five-year cost.

Reproduce: `tests/holdHarmlessCostStudy.test.ts`.
