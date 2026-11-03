/** Presentation-only deflator for nominal model outputs.
 * All fiscal simulations remain nominal. Never deflate GDP ratios, tax rates,
 * percentages, or the stored 2026-dollar policy parameters.
 */
export const DOLLAR_BASE_YEAR = 2026

export function priceIndexFrom2026(year: number, inflation: number): number {
  if (!Number.isFinite(year) || !Number.isFinite(inflation) || inflation <= -1) {
    throw new RangeError('A finite year and inflation rate above -100% are required.')
  }
  return (1 + inflation) ** (year - DOLLAR_BASE_YEAR)
}

/** Convert a nominal amount associated with `year` to 2026 buying power. */
export function to2026Dollars(amount: number, year: number, inflation: number): number {
  return amount / priceIndexFrom2026(year, inflation)
}

/** Convert a stream of separately dated nominal amounts before aggregating. */
export function sumIn2026Dollars<T>(
  rows: readonly T[],
  yearOf: (row: T) => number,
  amountOf: (row: T) => number,
  inflation: number,
): number {
  return rows.reduce(
    (total, row) => total + to2026Dollars(amountOf(row), yearOf(row), inflation),
    0,
  )
}
