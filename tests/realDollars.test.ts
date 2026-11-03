import { describe, expect, it } from 'vitest'
import { priceIndexFrom2026, sumIn2026Dollars, to2026Dollars } from '../src/model/realDollars'

describe('presentation in constant 2026 dollars', () => {
  it('preserves base-year money and deflates future amounts using the selected inflation assumption', () => {
    expect(priceIndexFrom2026(2026,.02)).toBe(1)
    expect(to2026Dollars(1000,2026,.02)).toBe(1000)
    expect(to2026Dollars(1000*(1.02)**49,2075,.02)).toBeCloseTo(1000,8)
    expect(to2026Dollars(1000,2025,.02)).toBeCloseTo(1020,8)
  })
  it('deflates each annual cash flow rather than the total at the terminal year', () => {
    const rows=[{year:2026,nominal:100},{year:2027,nominal:102},{year:2028,nominal:104.04}]
    expect(sumIn2026Dollars(rows,row=>row.year,row=>row.nominal,.02)).toBeCloseTo(300,8)
    expect(to2026Dollars(306.04,2028,.02)).not.toBeCloseTo(300,1)
  })
  it('does not alter signs', () => {
    expect(to2026Dollars(-102,2027,.02)).toBeCloseTo(-100,8)
  })
})
