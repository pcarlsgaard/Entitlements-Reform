/**
 * SSA 2026 OASDI Trustees Report, Alternative II, Table VI.G1.
 * "Ratio of taxable payroll to GDP", calendar years 2026–2100.
 * https://www.ssa.gov/OACT/TR/2026/lr6g1.html
 * These ratios are SSA projection inputs, not a prediction conditional on
 * the combined simulator's independent GDP/tax reforms.
 */
export const ssaTaxablePayrollGDP2026: Readonly<Record<number,number>> = Object.fromEntries(
  [0.342,0.344,0.347,0.351,0.354,0.357,0.359,0.361,0.361,0.362,0.361,0.361,0.36,0.36,0.359,0.359,0.358,0.358,0.357,0.357,0.356,0.356,0.355,0.355,0.354,0.354,0.353,0.353,0.352,0.352,0.351,0.351,0.35,0.35,0.349,0.349,0.348,0.348,0.348,0.347,0.347,0.346,0.346,0.345,0.345,0.344,0.344,0.344,0.343,0.343,0.342,0.342,0.342,0.341,0.341,0.34,0.34,0.34,0.339,0.339,0.339,0.338,0.338,0.337,0.337,0.337,0.336,0.336,0.336,0.335,0.335,0.335,0.334,0.334,0.334].map((ratio, i) => [2026 + i, ratio]),
)
