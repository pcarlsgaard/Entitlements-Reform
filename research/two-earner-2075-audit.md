# Two-earner household: 2075 retirement-loss audit (2026-11-02)

**Input:** user-exported `exploratory-180-fpl-6-5-accounts-protective-wage-brackets.json`, whose actual settings are 175% FPL, 10% mandatory personal saving, 20-year flat replacement transition, claiming at 68, scheduled SS comparator. Household: married 38/36 in 2026, $65k/$35k annual wages, 16/14 prior credited years, work through 68, shared legacy multiplier 1.0.

## Exact simulator reproduction
Per `tests/uploadedPolicyAuditResearch.test.ts` (CI successful):
| 2075 | Primary (87) | Spouse (85) | Total |
|--|--:|--:|--:|
| Current-law scheduled SS | $96,998 | $99,222 | $196,221 |
| Accumulated account at claim (2056/2058 nominal) | $789,301 | $496,752 | — |
| Private real-annuity indexed to 2075 nominal | $72,633 | $43,761 | $116,394 |
| Federal top-up above private annuity | $1,069 | $29,941 | $31,010 |
| Reformed retirement benefit | $73,702 | $73,702 | $147,404 |
| **Reform less current scheduled** | −$23,296 | −$25,520 | **−$48,817** |

Policy is **max(private annuity, public promise)**; the federal top-up is only the shortfall below the promise. There is no separate entire 175%-FPL public pension *in addition to* the account. Both private annuities happen to lie below the flat promise.

The 2026 retired-worker proxy `$24,500 × (1.0114)^years × CPI × 1.08` assigns both spouses multiplier 1.0, ignoring different wage records. Due to birth years, the $35k earner's legacy baseline is paradoxically slightly larger than the $65k earner's legacy baseline.

The `−$48,817` is 2075 **nominal** dollars, ≈ **−$18,500 in 2026 dollars**. Both spouses are assumed alive at ages 87/85.

## Comparator is decisive
In `src/model/currentLaw.ts`, the illustrative current-law OASI payable fraction for 2075 is **67.9701%**. For this identical proxy household:
- Full scheduled legacy: $196,221 (reform −$48,817).
- Trust-fund payable legacy: $133,372 (reform **+$14,032**).

Neither comparator describes the only feasible congressional response after insolvency; each asks a different policy question.

## SSA-method benefit sensitivity
`tests/uploadedPolicyAuditResearch.test.ts` also used the SSA 2026 *medium-worker age-specific earnings factor curve*, scaled to each spouse's **observed 2026 wage** $65k/$35k; reconstructed ages 21–67 including historical AWI, capped covered wages, statutory highest-35 indexed AIME and eligibility-year 90/32/15 PIA, 1.08 delayed benefit credit at age 68, and COLAs through 2075. Because SSA factors stop at 64, ages 65–67 extend the age-64 factor (explicit approximation). The private accounts use precisely these earnings paths from 2026 onward, same 10% contribution/4% return.

| SSA-anchored 2075 benefits | Primary | Spouse | Total |
|--|--:|--:|--:|
| Statutory-method scheduled SS | $113,581 | $81,003 | $194,583 |
| Personal account annuity | $72,290 | $44,895 | $117,185 |
| Reform with 175%-FPL floor | $73,702 | $73,702 | $147,404 |

Reform **−$47,179 vs scheduled**, **+$15,145 vs trust-fund payable**, under this illustrative SSA-anchored reconstruction. Thus the old per-person split is clearly misleading, but its household total happened to be near the SSA-anchored result.

## Interpretation and repair
1. **Not a missing account:** savings are counted as offsets to the public promise.
2. **Old household SS baseline is not wage-specific:** do not attribute a household benefit from the shared multiplier to individual work histories. Integrate SSA/AIME/PIA engine into household display; use independent per-adult records rather than one multiplier. Calibrate jointly to macro forecast before presenting national winner shares.
3. **Scheduled vs payable matters most:** the $48.8k loss turns into a $14k gain using payable law, under same stylized parameters.
4. **Long-run nominal income may mislead:** show real 2026-dollar differences and a conditional-survival caution.
5. Reforms of flat benefit at retirement age 68 without further actuarial delay credit are an explicit design choice.
6. Ignore neither the large gross-benefit loss versus scheduled entitlements nor the requirement to fund that scheduled baseline if promised.

All current repo changes are to an unmerged research branch; no household production code was modified by this audit.
