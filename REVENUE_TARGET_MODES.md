# Annual revenue rules: primary vs total balance

The combined fiscal scenario has three revenue rules. Current law and the separate
tax-only, benefit-only, and spending-only comparisons keep their original financing.

**Tax schedule (default)** uses the modeled statutory tax receipts and the existing
post-balance surplus cap. It preserves all previous defaults and saved policies.

**Primary balance** sets receipts each year to primary federal outlays plus an
optional additional share of GDP. With a zero increment, the primary deficit is zero,
but interest remains an overall deficit and is financed through new debt.

**Total balance** sets receipts each year to primary outlays plus net interest and
the optional increment. With zero increment, the total deficit is zero, nominal debt
is constant, and debt/GDP declines only because GDP grows.

The increment is a GDP percentage entered as 0–10%; it may be zero. In primary mode,
the increment offsets net interest first, so it does not guarantee principal paydown.
In total mode, every dollar of the increment is nominal debt repayment. The increment
is limited to avoid moving the end-of-year debt/GDP below the long-run debt target,
and turns off once that target is reached; the selected balance rule continues.
Set the long-run target to 0% to study a full debt-elimination path.

For year t:
- interest = effective interest rate × beginning debt
- receipt target = primary outlays + (total mode ? interest : 0) + increment
- deficit = primary outlays + interest − actual receipts
- ending debt = beginning debt + deficit (floor at zero)

The debt path feeds next year's interest, including the debt-sensitive market rate
and refinancing lag. The standalone X-tax tax brackets and microeconometric labor
response are *not* solved to finance these implied receipts: the comparison is a
funding counterfactual, not a tax incidence or general-equilibrium estimate.
The 2095 debt goal and peak-debt ceiling are diagnostic under balance rules; they
are not imposed by an additional tax solver.
