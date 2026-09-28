# Config1 model revision audit — September 28, 2026

Input: the unchanged `configurations/config1-paygo.json`. Before engine: commit `74ee80a1e611021cdb36c442634afc040a2d4f94`. After engine: the policy-rule revision accompanying this report. These are deterministic conditional illustrations, not forecasts. Negative debt is modeled net financial assets.

| Scenario | Previous 2095 debt/GDP | Revised 2095 debt/GDP |
|---|---:|---:|
| Central | 2.7% | -166.9% |
| Real growth 0.5 percentage point lower | 150.4% | -49.1% |
| Real borrowing rate 1 percentage point higher | 78.8% | -136.3% |
| Dynamic scoring off | 30.9% | -144.3% |

Central 2035 debt/GDP changes from 98.4% to 98.8%. The opening child-credit cost changes from $282.7 billion to $512.6 billion because the empty-data fallback had omitted the earnings-dependent refundable amount.

The revised central 2095 net-debt result becomes **30.8%** if the reform tax score alone is frozen at its opening GDP share (while retaining the revised demographics, entitlement rules, CBO receipt-category drift and indexed transfer savings). With CPI-indexed dollar parameters and real income growth, it is **-166.9%**. This large difference means real bracket creep and the shrinking credit/GDP ratio are material long-run assumptions. It must not be attributed just to entitlement reform or nominal inflation.

Further interpretation:

- Official CBO is a separate reference through 2056; the custom baseline is no longer forced to reproduce future CBO entitlement spending by rescaling legacy benefits alone.
- Medicare uses the GDP pool, initially calibrated to the old $19,000 grant. The saved 1.8% per-person support growth is inactive in this mode.
- Claiming at 70 adjusts the legacy component for delayed claiming and anchors the flat component at full benefits. Work credits use a representative 35-year full record nationally, not an empirical work-history distribution.
- Adverse economics worsens the fiscal outcome here. Remaining surpluses under these selected adverse cases do not prove robustness across all economic paths.
- The net-asset path assumes assets earn the borrowing rate. Risk, portfolio allocation, disposition of surpluses, and endogenous fiscal responses have not been specified. The fixed tax-unit distribution and post-2056 revenue-share extension also need sensitivity analysis before using the terminal result as a policy claim.
- Income/wealth-based Medicare contributions and national poverty-spending feedback are not yet specified. No net-welfare claim is made.

Reproduction: `node scripts/audit-config1.mjs`. The current and pre-revision numeric ledgers are checked in beside this note. Timing fields are local observations and vary by machine; the central recomputation took about 0.64 seconds here. Data is precomputed and bundled; controls do not consume GitHub Actions time.
