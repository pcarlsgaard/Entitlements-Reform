# Matched 45%→35% X-tax glide: 2026–2095 fiscal sensitivity

This is an **analysis branch**, not a deployed policy. Source input is
`tests/fixtures/glideSavedTaxReform2026.json`, using the saved reform's
benefits, private accounts, 5% noncompliance, ACA greater-of health rule,
and original spending assumptions. In this comparison the wage schedule is
17.5%, 26.5%, 31.5%, 35%, **45%** with per-adult thresholds of
$65k/$150k/$310k/$750k. The adult/child credits are $3,300/$5,400
and mandatory additional Roth saving is 6.5%.

Only the **highest wage band** and matching **DBCFT business rate**
change over time. The first four rates, threshold amounts and tax credits
remain exactly as in the optimized 45% plan; CPI indexing proceeds as
usual. A `firstCutYear` of 2035 and `durationYears` of 20 lowers the
rate from 45% to 44.5% in 2035, 44% in 2036, etc., reaching 35% in 2054.

## Baseline statutory-base model

| First cut / length | First reaches 35% | 2035 primary (% GDP) | Peak debt/GDP | 2095 debt/GDP |
|---|---:|---:|---:|---:|
| Constant 45% | never | +0.15% | 104.77% | 13.43% |
| Immediate 35% | 2026 | -2.54% | 163.45% | 75.02% |
| 2029 / 5y | 2033 | -2.54% | 148.77% | 57.61% |
| 2029 / 10y | 2038 | -1.73% | 141.33% | 48.78% |
| 2029 / 20y | 2048 | -0.79% | 126.52% | 38.04% |
| 2032 / 5y | 2036 | -2.00% | 139.85% | 47.03% |
| 2032 / 10y | 2041 | -0.92% | 132.40% | 40.00% |
| 2032 / 20y | 2051 | -0.38% | 117.70% | 34.51% |
| **2035 / 20y** | **2054** | **+0.02%** | **108.95%** | **31.91%** |
| 2040 / 5y | 2044 | +0.15% | 116.13% | 34.41% |
| 2040 / 10y | 2049 | +0.15% | 108.84% | 31.91% |
| **2040 / 20y** | **2059** | **+0.15%** | **104.77%** | **27.45%** |

The constant-45% plan's first positive primary balance is **2028**;
the first three-consecutive-year primary-surplus run starts **2030**.
There is no guarantee that an early cut preserves primary surpluses:
e.g. a 2029-first-cut ten-year glide reaches the 2095 goal **neither**
for 2035 primary balance nor for terminal debt.

## Hypothetical taxable-business-base elasticity

Taxable business cash flow is scaled with
`((1–annual business tax rate)/(1–0.35))^elasticity` relative to the
unchanged 35% business base. This is a deliberately *illustrative*
sensitivity, not an empirical Laffer curve; other GDP responses in
`scoreCombined` remain switched on. It does not capture shifting income,
accelerating expensing ahead of announced tax-rate reductions, investment
vintages, or fully endogenous balance-sheet behavior.

| Rate path | Elasticity | 2035 primary (% GDP) | Peak debt/GDP | 2095 debt/GDP |
|---|---:|---:|---:|---:|
| Stay 45% | 0.2 | -0.23% | 106.51% | 15.73% |
| Stay 45% | 0.5 | -0.78% | 114.69% | 20.31% |
| 2035 / 20y | 0.2 | -0.34% | 116.28% | 34.41% |
| 2035 / 20y | 0.5 | -0.86% | 126.93% | 38.49% |
| 2040 / 10y | 0.2 | -0.23% | 116.38% | 34.41% |
| 2040 / 10y | 0.5 | -0.78% | 127.31% | 38.52% |
| 2040 / 20y | 0.2 | -0.23% | 106.51% | 30.73% |
| 2040 / 20y | 0.5 | -0.78% | 117.44% | 34.41% |

**Key distinction:** 2095 debt sustainability persists in the long
glides under these base-erosion assumptions, but the ten-year 2035
primary-balance requirement fails under both elasticity scenarios
**even with the rate fixed at 45%**. Adding early cuts cannot repair
that strict near-term rule without another fiscal adjustment.

## Practical implications

- A cut-once-triggered automatic schedule should reference **multiple
  consecutive primary surpluses**, rather than the first isolated
  surplus in 2028.
- Add a **forecast guardrail**: reduce the rate by at most 0.5 percentage
  points a year only while the projected 2095 debt/GDP remains <=40%
  and a small primary surplus buffer remains; pause cuts if either
  criterion fails.
- A permanent statutory advance announcement of a declining DBCFT can
  create an intertemporal tax-shifting incentive: deductible purchases
  and investments occur at high rates, receipts at lower rates. Model
  this before claiming early 45% revenue is certain.
- As in the existing simulator, federal receipts are capped by its
  separate debt-paydown rule. Under a 40%-GDP debt target, an excess
  statutory revenue schedule need not translate dollar-for-dollar into
  paid-down debt after that cap binds.
- The current system does **not** assign the full economic incidence
  of higher business taxes to households. Constant lower wage brackets
  are insufficient to prove Q1–Q4 economic consumption is unchanged.

## Reproduction

```bash
npm ci
npm test -- tests/tax45to35Glide.test.ts
```

The test emits `FORTY_FIVE_TO_THIRTY_FIVE_GLIDE_JSON=` and
`FORTY_FIVE_TO_THIRTY_FIVE_GLIDE_STRESS_JSON=` with raw scenario
observations in GitHub Actions. Neither changes production defaults.
