# Audit of Social Security retirement-benefit modeling (2026-10-31)

## Verdict
The aggregate Social Security cost path is calibrated to CBO/SSA, but household current-law and reform benefits are **not** calculated from the statutory AIME/PIA formula or historical covered wages. In the 2026 age-by-earnings grid, 2026 wages and legacy-benefit ranks are assigned separately; later household earnings grow using 2026 Trustees covered-wage growth. The fiscal model also independently models contributions from GDP/SSA taxable-payroll shares. The cohort grid is a sensitivity experiment, not a validated distributional incidence score. Do not treat its 37.2% bottom-80% retirement hold-harmless result as representative.

## Exact paths and behavior
- `src/model/householdScenario.ts`, `annualSocialSecurity`: current-law benefit starts from `legacySocialSecurityBenefitNominal`, then multiplies an externally assigned `legacyBenefitMultiplier` and `currentLawClaimFactor`. No top-35 earnings history or PIA calculation. Flat `FPL × transition share × actuarial claim factor × vesting fraction`.
- `src/model/socialSecurity.ts`: annual baseline `currentLawSSBenefit2026=$24,500` with real growth 1.14%, COLA, and delayed-claim adjustment. Linear flat-share cohort transition, rather than accrued-rights preservation.
- `src/model/socialSecurityDistribution.ts`: SSA December 2025 retired-worker payment distribution, relative to $2,071.30 monthly **mean**, supplies benefit ranks; this is *not* the indexed earnings distribution or PIA curve.
- `src/model/personalAccountReform.ts`: private accumulation uses annual wages or aggregate taxable-payroll-weighted age/income bins, real return 4% less 0.25% fees, and age/survival annuitization at 2.3% real yield. Accounts only begin in 2026.
- `src/model/householdScenario.ts`: illustrative wages start from one fixed 2026 amount and grow with Trustees real average-wage growth; no age-specific earnings hump, unemployment, pre-2026 wage history, or interannual rank mobility.
- `src/model/socialSecurity.ts`, `socialSecurityForYear`: fiscal cohort **legacy** spending is multiplied by a separate CBO/SSA-derived calibration factor, which is *not* applied to household individual legacy benefits.
- `tests/retirementAgeEarningsGridResearch.test.ts`: earnings groups $11.3k/$24.8k/$45.0k/$74.3k/$110.4k and group masses 10/20/40/20/10 are **hand-picked proxies**, not empirical age-by-earnings joint distributions.

## Quantified reconciliation issue
Derived `calibrated legacy cohort benefit / sum(surviving × uncalibrated cohort benefit)` using the actual annual aggregate model:
| Year | Fiscal legacy calibration multiplier |
|--|--:|
| 2026 | 1.000 |
| 2030 | 1.071 |
| 2040 | 1.138 |
| 2050 | 1.172 |
| 2060 | 1.300 |
| 2070 | 1.371 |
| 2095 | 1.548 |

Consequently the household retiree comparison is inconsistent with the aggregate legacy pension expenditure assumptions, increasingly so over the projection. Whether to re-specify individual initial awards or revise the aggregate spending projection needs actuarial calibration; simply multiplying household benefits by the ratio is *not* itself a fully validated correction.

## Illustrative SSA 2026 PIA cross-check
Using official 2026 PIA bend points $1,286/$7,749, 90/32/15% factors, and constant wage-indexed earnings in the highest 35 years, **before** claim-age adjustment:

| Group | Annual earnings 2026 | Existing 2026 proxy benefit | Approximate full 35-year PIA | Approximate 20-year PIA |
|--|--:|--:|--:|--:|
| p10 | $11,261 | $11,638 | $10,135 | $5,791 |
| p25 | $24,775 | $16,538 | $16,879 | $12,741 |
| p50 | $45,045 | $23,887 | $23,365 | $17,187 |
| p75 | $74,324 | $32,462 | $32,734 | $22,541 |
| p90 | $110,360 | $39,812 | $41,313 | $29,131 |

The proxy is surprisingly close for uninterrupted full careers, but ignores year-by-year earnings history and can overstate shorter-earning careers by 30–100%. This simple comparison is a transparent diagnostic, not an SSA-validated cohort estimate.

## Claim-age caveat
In the tested scenarios, **current-law** earnings-related PIA is increased by the 24% credit for claiming at 70 vs normal retirement age 67. The **flat FPL award** is defined at the reform `fullRetirementAge=70`, so it does not also receive a 24% increase. This is a substantive policy assumption, not an ordinary calculator bug. If the intent was an FPL floor at age 67 with delayed-credit uplift, change the specification and rescore.

## Next steps
1. Replace `legacyBenefitMultiplier` with a lifetime covered-wage vector (pre- and post-reform); earnings indexed to AWI at age 60, highest 35, bend points indexed to eligibility year, PIA COLA, real claiming-age adjustments, taxable maximum, work years. Compare to SSA OCACT scaled very-low/low/medium/high/max worker factors and official 2026 Trustees Table V.C7.
2. Use the **same age-specific earnings, covered-payroll totals, benefit engine, and actuarial weights** for household and macro scoring. Reconcile to Trustees retired-worker counts, OASI vs DI, and CBO benefit dollars without unexplained cohort scaling.
3. Re-run no-loss proportions, loss magnitudes, and 50-year phase-in under lifetime earnings heterogeneity and interrupted work histories; present current-law scheduled and payable separately.
4. Distinguish true floor vs earnings-based replacement, protect accrued entitlements as a separate policy, and model survivor/DI components as needed.
5. Compare pension at 67 and 70 under identical benefit-reference conventions. Account annuity 4% deterministic gross return and assumed mortality remain separate sensitivities.

## Sources
- SSA PIA: https://www.ssa.gov/OACT/COLA/piaformula.html (2026 bend points 1286 and 7749)
- SSA historical benefit example: https://www.ssa.gov/oact/ProgData/retirebenefit2.html
- SSA 2026 Trustees scaled earners: https://www.ssa.gov/OACT/TR/2026/V_C_prog.html
- SSA scaled worker factors 2025: https://www.ssa.gov/OACT/NOTES/ran3/an2025-3.pdf
- CRS benefit calculation R46658: https://www.congress.gov/crs_external_products/R/PDF/R46658/R46658.5.pdf
- Diagnostic research test: `tests/ssBenefitCalibrationAuditResearch.test.ts`
