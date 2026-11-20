/**
 * Aviagen Ross 308 / Ross 308 FF Performance Objectives 2022, as-hatched,
 * printed page 3. Exact published daily rows, ages 0–56; no interpolation,
 * extrapolation, housing adjustment, or recomputation of published FCR.
 *
 * Transcribed from the approved ross308-current-versus-proposed-daily.csv
 * accompanying the 20 November 2026 Ross benchmark proposal. Weight and
 * cumulative feed are expressed in kg; gains and daily feed remain in g.
 * Publication blanks remain null, including cumulative feed at placement.
 * Feed is per living bird. Published FCR includes initial placement weight
 * and does not account for mortality; it is not phase feed-to-gain.
 */
export interface RossObjective {
  readonly day: number;
  readonly weightKg: number;
  readonly dailyGainG: number | null;
  readonly averageDailyGainG: number | null;
  readonly dailyFeedG: number | null;
  readonly cumulativeFeedKg: number | null;
  readonly fcr: number | null;
}

export const ROSS_REFERENCE = Object.freeze({
  label: "Ross 308 / 308 FF as-hatched breeder objective",
  edition: "2022",
  objectiveUrl:
    "https://aviagen.com/assets/Tech_Center/Ross_Broiler/RossxRoss308-BroilerPerformanceObjectives2022-EN.pdf",
  handbookUrl:
    "https://aviagen.com/assets/Tech_Center/Ross_Broiler/Aviagen-ROSS-Broiler-Handbook-EN.pdf",
  handbookEdition: "2025",
  context: "Breeder objective; not a verified South African open-house average",
} as const);

type ObjectiveRow = readonly [
  day: number,
  weightKg: number,
  dailyGainG: number | null,
  averageDailyGainG: number | null,
  dailyFeedG: number | null,
  cumulativeFeedKg: number | null,
  fcr: number | null,
];

// FCR and gain columns are published values, not ratios/differences of rounded
// neighboring values. In particular, day 1 daily feed is not published.
const OBJECTIVE_ROWS: readonly ObjectiveRow[] = Object.freeze(
  (
    [
      [0, 0.044, null, null, null, null, null],
      [1, 0.062, 18, null, null, 0.012, 0.196],
      [2, 0.081, 19, null, 16, 0.028, 0.352],
      [3, 0.102, 21, null, 20, 0.048, 0.476],
      [4, 0.125, 23, null, 24, 0.072, 0.577],
      [5, 0.151, 26, null, 27, 0.1, 0.658],
      [6, 0.181, 29, null, 31, 0.131, 0.724],
      [7, 0.213, 32, 24, 35, 0.166, 0.78],
      [8, 0.249, 36, 26, 39, 0.206, 0.826],
      [9, 0.288, 39, 27, 44, 0.249, 0.865],
      [10, 0.33, 42, 29, 48, 0.297, 0.9],
      [11, 0.376, 46, 30, 52, 0.349, 0.93],
      [12, 0.425, 49, 32, 57, 0.406, 0.957],
      [13, 0.477, 52, 33, 62, 0.468, 0.982],
      [14, 0.533, 56, 35, 67, 0.535, 1.005],
      [15, 0.592, 59, 37, 72, 0.608, 1.026],
      [16, 0.655, 62, 38, 77, 0.685, 1.047],
      [17, 0.72, 66, 40, 83, 0.768, 1.066],
      [18, 0.789, 69, 41, 88, 0.856, 1.086],
      [19, 0.86, 72, 43, 94, 0.95, 1.105],
      [20, 0.935, 74, 45, 100, 1.05, 1.123],
      [21, 1.012, 77, 46, 105, 1.155, 1.142],
      [22, 1.092, 80, 48, 111, 1.266, 1.16],
      [23, 1.174, 82, 49, 117, 1.383, 1.178],
      [24, 1.258, 85, 51, 122, 1.505, 1.196],
      [25, 1.345, 87, 52, 128, 1.633, 1.214],
      [26, 1.434, 89, 53, 134, 1.767, 1.233],
      [27, 1.524, 91, 55, 139, 1.907, 1.251],
      [28, 1.616, 92, 56, 145, 2.051, 1.269],
      [29, 1.71, 94, 57, 150, 2.202, 1.288],
      [30, 1.805, 95, 59, 156, 2.357, 1.306],
      [31, 1.901, 96, 60, 161, 2.518, 1.325],
      [32, 1.999, 97, 61, 166, 2.684, 1.343],
      [33, 2.097, 98, 62, 171, 2.855, 1.362],
      [34, 2.196, 99, 63, 176, 3.031, 1.381],
      [35, 2.296, 100, 64, 180, 3.211, 1.399],
      [36, 2.396, 100, 65, 185, 3.396, 1.418],
      [37, 2.496, 100, 66, 189, 3.584, 1.437],
      [38, 2.597, 101, 67, 193, 3.777, 1.456],
      [39, 2.697, 101, 68, 197, 3.974, 1.474],
      [40, 2.798, 100, 69, 201, 4.175, 1.493],
      [41, 2.898, 100, 70, 204, 4.379, 1.512],
      [42, 2.998, 100, 70, 207, 4.586, 1.531],
      [43, 3.097, 100, 71, 211, 4.797, 1.55],
      [44, 3.197, 99, 72, 213, 5.01, 1.569],
      [45, 3.295, 98, 72, 216, 5.226, 1.587],
      [46, 3.393, 98, 73, 219, 5.445, 1.606],
      [47, 3.49, 97, 73, 221, 5.666, 1.625],
      [48, 3.586, 96, 74, 223, 5.89, 1.644],
      [49, 3.681, 95, 74, 225, 6.115, 1.663],
      [50, 3.776, 94, 75, 227, 6.342, 1.681],
      [51, 3.869, 93, 75, 229, 6.571, 1.7],
      [52, 3.961, 92, 75, 230, 6.801, 1.719],
      [53, 4.052, 91, 76, 231, 7.032, 1.738],
      [54, 4.142, 90, 76, 233, 7.265, 1.756],
      [55, 4.23, 89, 76, 233, 7.498, 1.775],
      [56, 4.318, 87, 76, 234, 7.733, 1.793],
    ] satisfies ObjectiveRow[]
  ).map((row) => Object.freeze(row)),
);

const OBJECTIVES: readonly RossObjective[] = Object.freeze(
  OBJECTIVE_ROWS.map(
    ([
      day,
      weightKg,
      dailyGainG,
      averageDailyGainG,
      dailyFeedG,
      cumulativeFeedKg,
      fcr,
    ]) =>
      Object.freeze({
        day,
        weightKg,
        dailyGainG,
        averageDailyGainG,
        dailyFeedG,
        cumulativeFeedKg,
        fcr,
      }),
  ),
);

/** Return the exact frozen published row, or null for any unsupported age. */
export function getRossObjective(day: number): RossObjective | null {
  if (!Number.isInteger(day) || day < 0 || day >= OBJECTIVES.length) {
    return null;
  }
  return OBJECTIVES[day] ?? null;
}

/**
 * Derived idealized phase feed-to-gain ratio, NOT a published cumulative FCR.
 * Inputs are age endpoints: (startDay, endDay], not inclusive feed-day labels.
 * For example feed days 11–24 use weight/feed endpoints 10 and 24.
 * Uses exact endpoint cumulative-feed and weight differences in kg, without
 * rounding. Only placement (day 0) uses zero cumulative feed for this derived
 * calculation; the published day-0 row itself continues to contain null.
 * Unsupported, reversed, or equal endpoints / unusable denominators yield null.
 * No mortality, thinning, housing, or farm-population adjustment is implied.
 */
export function derivedRossPhaseReference(
  startDay: number,
  endDay: number,
): number | null {
  const start = getRossObjective(startDay);
  const end = getRossObjective(endDay);
  if (!start || !end || endDay <= startDay) return null;

  const startFeed = start.day === 0 ? 0 : start.cumulativeFeedKg;
  const endFeed = end.cumulativeFeedKg;
  if (startFeed === null || endFeed === null) return null;

  const gainKg = end.weightKg - start.weightKg;
  const feedKg = endFeed - startFeed;
  if (
    !Number.isFinite(gainKg) ||
    gainKg <= 0 ||
    !Number.isFinite(feedKg) ||
    feedKg < 0
  ) {
    return null;
  }
  const ratio = feedKg / gainKg;
  return Number.isFinite(ratio) ? ratio : null;
}
