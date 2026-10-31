# Scheduled-benefit Social Security with mandatory personal accounts

## Status

**Research prototype only.** The independently runnable experiment lives in
[`scripts/personal-accounts.mjs`](../scripts/personal-accounts.mjs) and is
covered by [`tests/personalAccounts.test.js`](../tests/personalAccounts.test.js).
It is deliberately **not** connected to the React policy UI, existing debt
solver, or main Social Security fiscal score. Do not label these results as a
new scored benefit-reform option until cohort retirement and public financing
are integrated and reconciled against the main model.

Run:

```bash
node scripts/personal-accounts.mjs
node scripts/personal-accounts.mjs '{"rampYears":10,"realReturn":0.02}'
npm test -- --run tests/personalAccounts.test.js
```

`simulatePrivateAccounts` can also be imported to execute full parameter
sweeps and inspect year-by-year results, earnings groups and retirement cohorts.

## Policy modeled

- Existing **earnings-related scheduled retirement benefit** remains
  unchanged as a minimum payment. Account-financed inflation-indexed annuity
  is credited against that benefit. Public payment is
  `max(0, scheduled benefit - account annuity)`; an annuity in excess of the
  benefit promise remains with the retiree.
- Starting in 2027, redirect between zero and **10.6 percentage points**
  of OASDI-taxable wages to a mandatory account. Default is all 10.6
  points of the **OASI** portion, not the additional 1.8 points financing DI.
  Existing contribution level is retained, but transition financing is extra.
- Diversified portfolio default: **65% equity / 35% bonds**, rebalanced
  annually. Callers can supply `equityRealReturns` and `bondRealReturns`
  arrays. When not supplied, `realReturn` is the assumed *blended* portfolio
  return; a nominal 65/35 allocation is **not** inferred from that scalar.
- Ramp is the proportion of the OASI contribution credited to accounts:
  `min(1,(year-startYear+1)/rampYears)`. This is **not** the fraction of
  future retirees whose benefits immediately become account-funded.
- No historical payroll contributions are credited retrospectively; individuals
  older at enactment accumulate only actual post-enactment deposits.
- A 0.25% annual fee is applied against balances and real annuities use a 2.3%
  discount rate with unisex SSA period life-table survival from age 67.

### Illustrative economic and empirical inputs

The prototype's earnings types are NOT representative SSA microdata or exact
income quintiles: wages in 2026 dollars are $15,000, $30,000, $55,000,
$90,000 and $170,000, each weighted at 20%. Working ages are 22–66;
retirement age is 67. All wages and the taxable maximum grow together at
1.14% real annually; the current-law progressive PIA uses 2026 bend points
($1,286/$7,749 monthly) as a stylized lifetime-AIME approximation.

Aggregate OASI cost / GDP and taxable payroll / GDP reference points are
interpolated from the 2026 Trustees long-range dollar projections
(Table VI.G1 and Table VI.G3); survival is the 2023 SSA period life table
already retained in the repository. The experiment assumes **85% of aggregate
OASI expenditures** can be offset against individually owned annuities; this
is a provisional *illustrative* share and requires actuarial reconciliation.
Other survivor, dependent, and DI benefits remain outside the account-financed
claim model and remain federal expenditures.

Sources for the final calibrated build should be registered in
`src/data/sources.ts`:

- SSA 2026 Trustees report: https://www.ssa.gov/oact/tr/2026/
- SSA 2026 PIA bend points: https://www.ssa.gov/oact/cola/bendpoints.html
- SSA payroll tax allocation, 2026: https://www.ssa.gov/policy/docs/chartbooks/fast_facts/2026/fast_facts26.html
- SSA 2023 period life table (already in `src/data/ssaLifeTable.ts`)
- Long-term portfolio return history: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html

## Accounting identity: the important fiscal test

For each year, with all series expressed as fractions of GDP:

```text
D  = diverted OASI payroll contributions
B  = scheduled OASI expenditures
A  = benefits actually financed by private annuities, capped at B
G  = federal OASI cash outlays after account offsets = B - A

Net incremental federal financing vs scheduled-benefit PAYGO
   = G - (B - D)
   = D - A
```

**Never present `A` alone as federal budget savings**, because it is financed
by contributions that no longer flow to the OASI trust fund. Negative
`D-A` represents an annual improvement, not a zero-transition-cost
outcome. An overall baseline simulation must preserve the Treasury's extra
borrowing requirement and resulting debt-service costs over time.

The main script additionally outputs `incrementalPV2026GDP`, a discounted
sum of *incremental annual financing needs* in units of 2026 GDP, not a
federal open-group actuarial balance or score.

## Initial constant-return sensitivity

Five-year diversion ramp (2027–2031), 10.6 points OASI diversion,
0.25% account fee. **Entries are incremental financing needs in percent
of GDP versus scheduled-benefit PAYGO**; a negative entry is an annual
financing improvement.

| Year | 2% gross real | 4% gross real | 6% gross real |
|---|---:|---:|---:|
| 2030 | +2.99 | +2.99 | +2.99 |
| 2050 | +2.79 | +2.61 | +2.39 |
| 2070 | +0.58 | -0.24 | -0.78 |
| 2090 | -0.74 | -1.53 | -1.73 |
| 2100 | -0.72 | -1.46 | -1.61 |

Ramps from 1 to 10 years primarily change near-term diverted revenue,
not the roughly 40–50-year period needed for retirement cohorts to
accumulate close to a full career of accounts.

## Before adding to the GUI fiscal score

1. Replace proxy income quintiles with SSA career-earnings distribution or
   calibrated microsimulation; use worker-specific tax cap histories, AIME,
   mortality and disability incidence.
2. Match contribution flows, survivor/DI carve-outs and the scheduled
   retirement bill to the *same* 2026 Trustees baseline as the existing app.
   Preserve comparators for both **scheduled** and **as-payable** benefits.
3. Introduce cohort assets at each working age, stock/bond historical
   returns and stochastic bootstrap sequences, glidepaths, fees, and
   retirement-annuity pricing versus guaranteed benefit.
4. Choose financial rules for account residuals after death, spouse/survivor
   claims, income-tax treatment (traditional, Roth, benefits-tax-equivalent),
   and private/treasury annuity guarantees; include all in the federal budget.
5. Explicitly test general-revenue transfer, debt interest, and tax offsets
   rather than attributing external capital returns to Treasury.
6. Compare the *federal debt and public outlay paths*, net fiscal present
   value, account assets, probability of shortfall, and cohort distribution
   against the existing flat-benefit transition, rather than comparing gross
   OASI public outlays alone.
7. Once calibrated, expose a separate personal-account Social Security
   financing choice in the Entitlement Reform tab with start year, duration,
   diverted share, 65/35 allocation, annuity yield/fee, guarantee floor,
   tax mode, and plot of `D` vs `A`; preserve existing financing modes
   and the saved-configuration migration.

**Interpretation:** A public guarantee of today's formula can be politically
attractive. But investing an individual's existing tax contributions does not
make the unfunded liability disappear. It shifts government financing earlier
and makes the eventual government cost sensitive to portfolio returns,
annuitization rates, taxable wages, mortality and guarantees.
