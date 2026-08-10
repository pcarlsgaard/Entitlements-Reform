export interface LifeTablePoint {
  age: number
  maleLx: number
  femaleLx: number
  unisexLx: number
}

// SSA 2023 period life table, as used in the 2026 Trustees Report. The model
// stores the funding ages and the complete 65-110 benefit-payment range. The
// unisex value is the simple mean of the published male and female l_x columns;
// it is a transparent initial calibration, not a cohort mortality projection.
const raw: ReadonlyArray<readonly [number, number, number]> = [
  [0, 100000, 100000], [18, 98921, 99188],
  [65, 79084, 87399], [66, 77783, 86508], [67, 76416, 85567],
  [68, 74984, 84569], [69, 73486, 83509], [70, 71916, 82374],
  [71, 70269, 81158], [72, 68539, 79847], [73, 66722, 78433],
  [74, 64811, 76904], [75, 62797, 75248], [76, 60675, 73454],
  [77, 58429, 71510], [78, 56024, 69387], [79, 53477, 67087],
  [80, 50785, 64606], [81, 47960, 61946], [82, 44998, 59099],
  [83, 41922, 56068], [84, 38760, 52857], [85, 35529, 49469],
  [86, 32236, 45919], [87, 28901, 42223], [88, 25563, 38399],
  [89, 22265, 34475], [90, 19063, 30504], [91, 16023, 26564],
  [92, 13194, 22732], [93, 10617, 19087], [94, 8320, 15697],
  [95, 6333, 12612], [96, 4672, 9877], [97, 3335, 7519],
  [98, 2298, 5554], [99, 1534, 3977], [100, 999, 2758],
  [101, 633, 1849], [102, 389, 1196], [103, 232, 745],
  [104, 133, 446], [105, 74, 256], [106, 39, 141],
  [107, 20, 73], [108, 10, 36], [109, 4, 17], [110, 2, 7],
]

export const ssaPeriodLifeTable: readonly LifeTablePoint[] = raw.map(
  ([age, maleLx, femaleLx]) => ({
    age,
    maleLx,
    femaleLx,
    unisexLx: (maleLx + femaleLx) / 2,
  }),
)

export const SSA_LIFE_TABLE_MAX_AGE = 110
