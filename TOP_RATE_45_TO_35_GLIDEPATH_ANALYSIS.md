# Temporary 45% DBCFT/top wage X-tax, then statutory 35% floor

## Design being tested

Reference: exact saved **optimized five-rate 45% tax reform**:
- Wage rates: 17.5%, 26.5%, 31.5%, 35%, 45%
- Per-adult thresholds: $65,000; $150,000; $310,000; $750,000.
- Universal adult wage credit: $3,300; child tax credit $5,400;
  ESI/health policy and entitlement reforms unchanged.
- All 5%-noncompliance, exemption and 6.5%-additional-Roth-saving rules unchanged.
- DBCFT is always **equal to the highest annual wage rate**.
- Only the fifth rate and matching DBCFT change over time. Lower four
  wage rates, thresholds and refundable credits are held fixed.
  Dollar parameters retain the saved CPI indexing.
- Exact annual X-tax receipts are recalculated by `taxRevenueChangePath`.
  The 70-year combined federal model, interest/debt feedback and saved
  debt/revenue ceilings then run without an exogenous balancing tax.
- The first primary surplus under permanent 45% arrives in **2028**,
  but 2029 slips negative; a surplus is sustained from **2030** onward.

## Glide schedules and fiscal outcomes

All numbers are derived from branch CI test output in
`tests/temporary45Glidepath.test.ts`. Percent GDP except where indicated.

| Hold 45% through | Reach 35% in | 2035 primary balance | Peak debt/GDP | 2095 debt/GDP | Sustained primary surplus from |
|---|---|---:|---:|---:|---:|
| Permanent 45% | Never | +0.15% | 104.8% | 13.4% | 2030 |
| 2028 | 2040 | -1.42% | 138.1% | 44.6% | 2054 |
| 2030 | 2045 | -0.74% | 127.7% | 38.5% | 2054 |
| 2035 | 2045 | +0.15% | 120.3% | 35.7% | 2054 |
| 2035 | 2050 | +0.15% | 113.1% | 33.1% | 2054 |
| **2035** | **2055** | **+0.15%** | **105.9%** | **30.7%** | **2030** |
| 2040 | 2060 | +0.15% | 104.8% | 26.4% | 2030 |
| Permanent 35% from 2026 | Already | -2.54% | 163.4% | 75.0% | 2054 |

The preferred first-pass legislative schedule holds 45% through 2035
and lowers by **0.5 percentage points each year** (42.5% in 2040,
40% in 2045, 37.5% in 2050, 35% in 2055). It closes the 2035
primary deficit, satisfies peak debt below 150%, and reaches 30.7%
debt/GDP in 2095 **under the simulator's current dynamic settings**.
Note: the same statutory X-tax rate for businesses and highest wage
bracket is crucial for consistency.

## Growth sensitivity

The simulator's dynamic GDP benefit is calculated from the original
45% policy, and is not endogenously re-solved as that rate falls.
A separate test disabled the entire dynamic GDP uplift (a much
stronger change than simply updating a top-rate response).

| Glide | 2095 debt with dynamic GDP | Without dynamic GDP |
|---|---:|---:|
| 2035–2050 | 33.1% | 45.3% |
| 2035–2055 | 30.7% | 39.8% |
| 2040–2060 | 26.4% | 34.4% |

Without the uplift, permanent 45% no longer closes the primary
deficit by 2035 (primary balance -0.12% GDP); it reaches sustained
primary balance in 2037. This is a warning against treating
a 2035 primary surplus of +0.15% as robust.

## Illustrative higher-rate business-base response

Sensitivity formula, for a *hypothetical* elasticity `e` relative to
the net-of-tax share with the 35% DBCFT reference:

```
B(t) / B(35%) = ((1 - t) / (1 - 0.35)) ** e
annual lost GDP-share receipts =
  - t * businessBase2026 / GDP2026 * (1 - B(t)/B(35%))
```

This is not a measured elasticity of a broad destination-based cash
flow tax. The real DBCFT rate-maximizing point cannot be established
from this shortcut.

**With the existing dynamic GDP uplift**, for 2035–2055:

| e | 2026 business receipt reduction | 2035 primary (% GDP) | 2095 debt/GDP |
|---|---:|---:|---:|
| 0 | $0B | +0.15% | 30.7% |
| 0.1 | -$59B | -0.04% | 31.9% |
| 0.2 | -$118B | -0.23% | 33.1% |
| 0.5 | -$288B | -0.78% | 37.1% |

The long-run debt target holds, but the 2035 primary-balance
deadline fails even with elasticity 0.1.

**Joint downside: no dynamic GDP uplift plus 0.2 elasticity**:

| Glide | 2035 primary (% GDP) | 2095 debt/GDP |
|---|---:|---:|
| 2035–2055 | -0.50% | 46.1% |
| 2035–2060 | -0.50% | 40.0% |
| 2040–2060 | -0.50% | 37.6% |
| 2045–2065 | -0.50% | 33.1% |

Thus the strong headline version is **not robust to both adverse
assumptions simultaneously**. The 2040–2060 glide meets the long-run
debt criterion in this stress test but cannot independently rescue
the 2035 primary deficit. The 2045–2065 glide has still more cushion.

## Suggested real-world trigger and stop rules

The modeled statutory 2035–2055 path is a **benchmark**, not a promise.
A safer legislated transition would:

1. Establish a *temporary* 45% fifth wage band and 45% DBCFT,
   preserving the lower four wage bands.
2. Require a three-year sustained, preferably cyclically adjusted,
   **primary** surplus rather than treating the first positive year
   as a sufficient trigger. In the reference model, 2028 is briefly
   positive while sustained surplus begins in 2030.
3. Begin at most 0.5 percentage points per year after the trigger,
   and not before 2035 in the original fiscal design.
4. Re-evaluate the next 10-year primary balance and 2095 debt forecast
   conservatively before each cut. **Pause** (do not accelerate or
   invent fiscal receipts) whenever the forecast fails either test.
5. Permanently stop at 35%; if the top rate falls, the DBCFT falls
   in lockstep. The 35% fourth wage band and 35% fifth band effectively
   merge upon completion.

The existing code permits annual projection in the **analysis** model,
not the deployed UI/saved configuration schema. PR is intentionally a
draft until the empirical business-base-response and fiscal guardrail
treatment have been reviewed.

## Reproduce

```bash
npm test -- tests/temporary45Glidepath.test.ts
npm test -- tests/temporaryGlideBusinessBaseSensitivity.test.ts
```

CI log labels:
`TEMPORARY_45_TO_35_GLIDEPATH_RESULTS_JSON`,
`TEMPORARY_GLIDE_WITHOUT_GDP_UPLIFT_JSON`,
`TEMPORARY_GLIDE_BUSINESS_BASE_SENSITIVITY_JSON`, and
`TEMPORARY_GLIDE_JOINT_DOWNSIDE_JSON`.
