# Tax-schedule revenue cap: primary, total, or custom fiscal reference

Federal receipts always originate in the selected statutory tax settings (including
the X-tax, credits, replacements, and legacy revenue projections). **The cap
never generates additional revenue**. It only limits revenue that the tax schedule
would otherwise produce.

The existing `debtPaydownSurplusCapGDP` parameter is the **additional annual
GDP share allowed above the reference**. The three selectable references are:

- **Total balance (default):** reference receipts = primary outlays + net interest.
  With a 0% allowance, the schedule cannot collect more than total outlays,
  but it may collect less if its own scheduled receipts are insufficient.
- **Primary balance:** reference receipts = primary outlays, excluding interest.
  With a 0% allowance, interest is borrowed when the schedule has enough
  receipts to reach the primary-balance cap.
- **Custom overall balance:** reference receipts = total outlays plus a signed
  percentage of GDP. +2% means a 2%-of-GDP overall surplus; -2% means a
  2%-of-GDP overall deficit. The allowance is then added on top.

For every year t:

```
scheduled = statutoryTaxSchedule(year, modeledGDP, policy)
reference = primarySpending
          + (basis === primaryBalance ? 0 : netInterest)
          + (basis === customOverallBalance ? customBalanceGDP * GDP : 0)
cap = max(0, reference + revenueAllowanceGDP * GDP)
debtPaydownStop = beginningDebt/GDP <= target
          ? totalSpending
          : max(0, beginningDebt + totalSpending - target * GDP)
actualReceipts = min(scheduled, cap, debtPaydownStop)
primaryDeficit = primarySpending - actualReceipts
overallDeficit = primaryDeficit + netInterest
endingDebt = beginningDebt + overallDeficit
```

This is a ceiling **every year** rather than a permanently binding budget floor:
if scheduled revenue later falls, receipts fall with it. It is not a solver that
fills a revenue shortfall. The existing separate debt-paydown target stops
nominal surplus-financed paydown at the chosen debt/GDP level; GDP growth can
continue reducing the ratio passively. Interest and borrowing are recursively
recomputed each year under the selected cap.

The UI overlays the **uncapped scheduled receipt rate** and actual capped
receipt rate, while the debt chart updates as the cap changes. No statutory
brackets or credits are silently altered to finance the desired budget balance.

Older saved configurations default to the original total-balance reference
unless an earlier experimental financing selector specified primary or total.
In that case its option is migrated to a revenue **cap** basis, not a new
funding requirement.
