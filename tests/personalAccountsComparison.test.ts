import { describe, expect, it } from 'vitest'
import { personalAccountComparison as result } from '../scripts/compareSocialSecurityModels'

describe('scheduled benefit / personal account / 150%-FPL flat comparison',()=>{
  it('uses the same scheduled baseline and reconciles 2026 cash flows',()=>{
    const opening=result.snapshots.find(r=>r.year===2026)!
    expect(opening).toBeDefined()
    expect(opening.accountPrivateCoveragePct).toBe(0)
    expect(opening.accountTopup).toBeCloseTo(opening.scheduledOASI,2)
    expect(opening.accountCostOASI).toBeGreaterThan(opening.scheduledOASI)
    expect(result.totals.baseline.savingsPV2026Trillions).toBeCloseTo(0,8)
    expect(result.totals.flat150.retirementPV2026Trillions).toBeGreaterThan(0)
    expect(result.totals.flat150Prefunded25.retirementPV2026Trillions).toBeGreaterThan(0)
    expect(result.totals.flat150Prefunded40.retirementPV2026Trillions).toBeGreaterThan(0)
    expect(result.snapshots[0]!.flatPrefundingDeposit25).toBeGreaterThan(0)
    expect(result.snapshots.at(-1)!.flatPrefunded25DebtGDP).toBeGreaterThan(0)
    expect(result.totals.personalAccounts.retirementPV2026Trillions).toBeGreaterThan(0)
    expect(result.snapshots).toHaveLength(5)
    expect(result.sensitivity).toHaveLength(16)
  })
})
