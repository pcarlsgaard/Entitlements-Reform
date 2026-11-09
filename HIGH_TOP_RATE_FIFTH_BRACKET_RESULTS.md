# Fifth rate above 35% — top-rate Pareto search (analysis only)

## Reproducibility

- Base: `tests/fixtures/paretoSavedTaxReform2026.json` from the previously
  uploaded saved reform, with ACA *greater-of* selected, ESI policyholder
  continuation, and 0% assumed ESI-to-Marketplace transfer.
- Engine: `src/model/optimizeTopRate.ts`; exact weighted wage-tax-unit
  incidence from `prepareTaxSearchConsumption`, labor response from
  `calculateLaborResponse`, and full 2026–2095 `scoreCombined` projection.
- Test: `npm test -- tests/topRateQ1Q4Search.test.ts`. CI emits
  `HIGHER_TOP_RATE_Q1Q4_RESULTS_JSON=` for auditing all scored candidates.
- Main run: 1,906 generated four- and five-rate schedules; 68 complete
  labor/fiscal simulations. This is a heuristic search, **not proof of a global
  Pareto optimum**.

The fixed comparison changes **only** the marginal wage rate above $500,000
per adult and the *entire* business DBCFT rate, keeping wage rates
18.5%/27.5%/33.5%/35% and adult/child credits $2,700/$5,400.

## Equal DBCFT and fifth wage rate, existing bands fixed

| Top/fifth rate and business rate | Extra net revenue vs original saved reform, $B/year | 2035 primary balance, % GDP | First primary surplus | Q1–Q4 winners | Q5 lose >5% | 2095 debt/GDP |
|---|---:|---:|---:|---:|---:|---:|
| 35%, original four-rate compromise | -52 | -1.990% | 2050 | 88.15% | 5.33% | 40.0% |
| 37.5% | 159 | -1.295% | 2045 | 88.15% | 5.33% | 27.5% |
| 40% | 371 | -0.600% | 2039 | 88.15% | 5.33% | 19.6% |
| 42.5% | 582 | +0.095% | 2028 | 88.15% | 5.74% | 14.1% |
| 45% | 794 | +0.789% | 2027 | 88.15% | 6.49% | 10.7% |
| 47.5% | 1005 | +1.484% | 2026 | 88.15% | 6.79% | 8.5% |
| 50% | 1216 | +2.178% | 2026 | 88.15% | 7.33% | 7.1% |

The 42.5% model has only about 0.095% GDP of 2035 primary-balance margin,
which is extremely sensitive to tax-base assumptions.

## Selected optimized five-rate designs

| Metric | Original 35% four-rate | Five-rate 45% distribution compromise | Five-rate 50% faster balance |
|---|---:|---:|---:|
| Wage brackets, % | 18.5/27.5/33.5/35 | 17.5/26.5/31.5/35/45 | 17.5/27.5/34.5/35/50 |
| Per-adult thresholds, $ | 70k/185k/310k | 65k/150k/310k/750k | 70k/150k/310k/1000k |
| Adult / child tax credit, $ | 2700 / 5400 | 3300 / 5400 | 3600 / 5400 |
| Q1–Q4 any consumption gain | 88.15% | **95.99%** | **96.45%** |
| Q1–Q4 loss >5% | 2.74% | **1.98%** | **1.75%** |
| Q1–Q4 gain >20% | 13.95% | 17.38% | 18.93% |
| Q5 loss >5% | 5.33% | 3.78% | 4.34% |
| All tax units with any gain | 84.26% | 92.64% | 91.62% |
| Workers with increased employer-inclusive wedge | 11.77% | 16.01% | 11.50% |
| Annual revenue difference from original saved plan | -$52B | +$578B | +$963B |
| 2035 primary balance, % GDP | -1.990% | +0.154% | +1.449% |
| First year of primary surplus | 2050 | 2028 | 2026 |
| 2095 debt/GDP | 40.0% | 13.4% | 8.5% |

**Selection caveat:** the 45% design has less substantial loss than the old
compromise but increases the large gain tail. The 50% plan is an extreme
stress case, not a recommended default. The top wage bracket is only
part of the revenue effect; applying the same higher rate to *all business
taxable cash flow* drives the fiscal result.

## Static rate-response sensitivity

Hypothetically scale the business base by

`[(1 - new_rate) / (1 - 0.35)] ^ taxable_base_elasticity`.

Keep current compliance/labor assumptions unchanged; **these are not the
full 70-year fiscal scores under the sensitivity**.

| Fifth/DBCFT rate | No business-base response | Elasticity 0.20 | Elasticity 0.50 | Elasticity 0.80 |
|---|---:|---:|---:|---:|
| 40% | +$371B | +$320B | +$246B | +$173B |
| 42.5% | +$582B | +$500B | +$381B | +$266B |
| 45% | +$794B | +$676B | +$506B | +$345B |
| 47.5% | +$1005B | +$847B | +$621B | +$410B |
| 50% | +$1216B | +$1013B | +$726B | +$462B |
| 55% | +$1639B | +$1328B | +$903B | +$522B |

The 2035 primary-balance break-even was around +$550–600B in the
unchanged economic model. Therefore a 42.5% DBCFT is *not* a
robust primary-balance solution after even modest taxable-base
elasticity. Under elasticity 0.5, approximately 47.5% would be
needed from the **fixed** plan (not an independently scored fully
elastic fiscal forecast). Under elasticity 0.8, none of the fixed
plans below or equal to 55% produces +$550B in this sensitivity.

## Key methodological warnings

1. This **does not** identify the real-world revenue-maximizing top rate.
   A fixed 5% compliance gap and effectively fixed real business cash
   flow favor high headline rates. The existing macro dynamic module
   also caps some growth effects, and the simple business elasticity
   sensitivity is separate from the main fiscal path.
2. The consumption figures apply taxes/credits and health changes to
   wage tax units but **do not distribute the economic incidence of
   the higher DBCFT on wages, prices, equity values, business rents
   and retirement investment returns**. A high DBCFT may make many
   reported tax-unit winners worse off indirectly.
3. All bracket thresholds are per tax-filing adult. A family coverage
   link and full Marketplace MAGI are not in the tax-unit microdata.
4. Keep the strictly additional 6.5% Roth deposit, the same benefit
   reforms and spending assumptions, 5% noncompliance and ACA
   greater-of rule. There is no ESI-loss payment or special rebate.
5. *Strict* five-rate candidates have a 35% fourth rate, a positive
   increase to the fifth and increasing thresholds. Rates as high as
   55% include stress cases with large final-bracket jumps and
   deserve special scrutiny.

This is a draft analysis branch layered on the unmerged Pareto
optimizer PR #49 and not yet implemented as a production search screen.
