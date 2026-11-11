import { describe, expect, it } from "vitest";
import { buildMortalityReport } from "./mortality-report-engine";
import type {
  MortalityReportSource,
  MortalitySourceRecord,
} from "../shared/mortality-report";
import type {
  ProductionReportFlock,
  ResolvedFlockPerformanceFilters,
} from "../shared/production-reports";

const generatedAt = "2026-01-06T00:15:00.000Z";
const filters: ResolvedFlockPerformanceFilters = {
  startDate: "2026-01-03",
  endDate: "2026-01-05",
  houseId: null,
  flockId: null,
};
const flock = (
  patch: Partial<ProductionReportFlock> = {}
): ProductionReportFlock => ({
  id: 1,
  flockNumber: "F-1",
  houseId: 10,
  placementDate: "2026-01-01",
  initialCount: 100,
  status: "active",
  ...patch,
});
const record = (
  id: number,
  recordDate: string | null,
  mortality: number | string | null,
  patch: Partial<MortalitySourceRecord> = {}
): MortalitySourceRecord => ({
  id,
  flockId: 1,
  recordDate,
  mortality,
  dayNumber:
    recordDate === null ? 0 : Math.max(0, Number(recordDate.slice(-2)) - 1),
  ...patch,
});
const source = (
  dailyRecords: MortalitySourceRecord[] = [],
  flocks = [flock()]
): MortalityReportSource => ({
  houses: [{ id: 10, name: "House Ten", houseNumber: "10" }],
  flocks,
  dailyRecords,
});
const report = (
  input = source(),
  patch: Partial<ResolvedFlockPerformanceFilters> = {},
  timezone = "Africa/Johannesburg"
) =>
  buildMortalityReport(input, { ...filters, ...patch }, timezone, generatedAt);
const row = (
  input = source(),
  patch: Partial<ResolvedFlockPerformanceFilters> = {}
) => report(input, patch).rows[0];
const issues = (input: MortalityReportSource) => row(input).issues.join(" ");
const capture = () =>
  source([
    record(1, "2026-01-01", 2),
    record(2, "2026-01-03", 3),
    record(3, "2026-01-05", 0),
  ]);

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe("mortality report operational dates and selection", () => {
  it("uses placement through E cumulatively and inclusive S through E for period", () => {
    const result = row(
      source([
        record(1, "2026-01-01", 2),
        record(2, "2026-01-02", 4),
        record(3, "2026-01-03", 3),
        record(4, "2026-01-05", 1),
        record(5, "2026-01-06", 90),
      ])
    );
    expect(result.periodDeaths).toBe(4);
    expect(result.cumulativeDeaths).toBe(10);
    expect(result.periodMortalityPct).toBe(4);
    expect(result.cumulativeMortalityPct).toBe(10);
    expect(result.dailyRecords.map(r => r.id)).toEqual([1, 2, 3, 4]);
  });
  it("uses all recorded history from placement for blank start", () => {
    const result = row(capture(), { startDate: null });
    expect(result.periodDeaths).toBe(5);
    expect(result.periodDeaths).toBe(result.cumulativeDeaths);
    expect(result.calendarDaysInPeriod).toBe(5);
  });
  it("never uses records before placement even when S is earlier", () => {
    const result = row(
      source([record(1, "2025-12-31", 90), record(2, "2026-01-01", 2)]),
      { startDate: "2025-12-01" }
    );
    expect(result.periodDeaths).toBe(2);
    expect(result.calendarDaysInPeriod).toBe(5);
    expect(result.dailyRecords[0]).toMatchObject({
      eligible: false,
      inPeriod: false,
      cumulativeDeaths: null,
      deaths: 90,
    });
    expect(result.dailyRecords[0].issues.join(" ")).toContain(
      "before placement"
    );
    expect(result.trend.map(p => p.date)).toEqual(["2026-01-01"]);
  });
  it("includes a flock placed on E and excludes valid later placements", () => {
    const result = report(
      source(
        [record(1, "2026-01-05", 0)],
        [
          flock({ placementDate: "2026-01-05" }),
          flock({ id: 2, placementDate: "2026-01-06" }),
        ]
      )
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      calendarDaysInPeriod: 1,
      periodDeaths: 0,
    });
  });
  it("preserves current recorded status without inventing historic status", () => {
    expect(
      row(
        source([record(1, "2026-01-03", 1)], [flock({ status: "completed" })])
      ).currentStatus
    ).toBe("completed");
  });
  it("applies house and flock together without broadening a mismatched pair", () => {
    expect(report(capture(), { flockId: 1, houseId: 20 }).rows).toEqual([]);
    expect(report(capture(), { flockId: 1, houseId: 10 }).rows).toHaveLength(1);
    expect(report(capture(), { flockId: 2 }).rows).toEqual([]);
  });
  it.each([null, "invalid", "2026-02-30", "2026-1-01"])(
    "keeps invalid placement %s visible as N/A",
    placementDate => {
      const result = row(
        source([record(1, "2026-01-03", 2)], [flock({ placementDate })])
      );
      expect(result).toMatchObject({
        placementDate: null,
        periodDeaths: null,
        cumulativeDeaths: null,
        calendarDaysInPeriod: null,
        unrecordedDaysInPeriod: null,
        periodSummaryEligible: false,
      });
      expect(result.dailyRecords[0].eligible).toBe(false);
    }
  );
  it.each([
    { endDate: "2026-02-29" },
    { startDate: "2026-02-30" },
    { endDate: "2026-1-05" },
    { startDate: "2026-01-06" },
    { endDate: "2026-01-05T00:00:00Z" },
  ])("rejects invalid or reversed date filters %j", patch => {
    expect(() => report(capture(), patch)).toThrow();
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid selection ID %s",
    id => {
      expect(() => report(capture(), { flockId: id })).toThrow(/IDs/);
      expect(() => report(capture(), { houseId: id })).toThrow(/IDs/);
    }
  );
  it("handles leap dates as real operational calendar dates", () => {
    const result = row(
      source(
        [
          record(1, "2024-02-28", 1),
          record(2, "2024-02-29", 0),
          record(3, "2024-03-01", 2),
        ],
        [flock({ placementDate: "2024-02-28" })]
      ),
      { startDate: "2024-02-28", endDate: "2024-03-01" }
    );
    expect(result).toMatchObject({
      periodDeaths: 3,
      cumulativeDeaths: 3,
      calendarDaysInPeriod: 3,
      recordedDays: 3,
      unrecordedDaysInPeriod: 0,
    });
  });
  it("does not use recorded day number to override actual date selection", () => {
    const result = row(
      source([
        record(1, "2026-01-01", 7, { dayNumber: 50 }),
        record(2, "2026-01-03", 2, { dayNumber: -1 }),
      ])
    );
    expect(result.periodDeaths).toBe(2);
    expect(result.cumulativeDeaths).toBe(9);
    expect(result.issues.join(" ")).toContain("day number");
  });
  it("excludes all future records, including invalid deaths, duplicate IDs and details", () => {
    const baseline = report(capture());
    const input = capture();
    input.dailyRecords.push(
      record(50, "2026-01-06", null),
      record(50, "2026-01-06", -5),
      record(1, "2026-01-07", 99)
    );
    expect(report(input)).toEqual(baseline);
  });
});

describe("mortality report missingness and counts", () => {
  it("empty cohort is unavailable rather than a successful zero total", () => {
    expect(report(source([], [])).summary).toMatchObject({
      flockCount: 0,
      initialBirds: null,
      periodDeaths: null,
      cumulativeDeaths: null,
      periodMortalityPct: null,
    });
  });
  it("selected no-capture flock remains visible with unknown coverage and totals", () => {
    const result = report(source(), { flockId: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      periodDeaths: null,
      cumulativeDeaths: null,
      recordedDays: 0,
      periodRecordedDays: 0,
      calendarDaysInPeriod: 3,
      unrecordedDaysInPeriod: 3,
      trend: [],
      dailyRecords: [],
    });
    expect(result.summary.periodEligibleFlockCount).toBe(0);
  });
  it.each([
    "planned",
    "pending",
    "scheduled",
    "unconfirmed",
    "not_started",
    "not-started",
    " Planned ",
  ])("planned status %s is not zero-mortality success", status => {
    const result = row(
      source([record(1, "2026-01-03", 0)], [flock({ status })])
    );
    expect(result.periodDeaths).toBeNull();
    expect(result.cumulativeDeaths).toBeNull();
    expect(result.dailyRecords[0].rawMortality).toBe(0);
    expect(result.dailyRecords[0].eligible).toBe(false);
    expect(result.periodSummaryEligible).toBe(false);
  });
  it("preserves recorded zero and allows zero ratios with valid positive initial count", () => {
    const result = report(source([record(1, "2026-01-03", 0)]));
    expect(result.rows[0]).toMatchObject({
      periodDeaths: 0,
      cumulativeDeaths: 0,
      periodMortalityPct: 0,
      cumulativeMortalityPct: 0,
      periodRecordedDays: 1,
    });
    expect(result.rows[0].trend[0].recordedDeaths).toBe(0);
    expect(result.summary).toMatchObject({
      periodDeaths: 0,
      periodMortalityPct: 0,
      initialBirds: 100,
    });
  });
  it("permits recorded period subtotal with gaps but warns missing dates are unknown", () => {
    const result = row(source([record(1, "2026-01-03", 2)]));
    expect(result).toMatchObject({
      periodDeaths: 2,
      periodRecordedDays: 1,
      calendarDaysInPeriod: 3,
      unrecordedDaysInPeriod: 2,
      periodSummaryEligible: true,
    });
    expect(result.issues.join(" ")).toMatch(/unrecorded.*unknown/);
  });
  it("earlier valid capture never fabricates zero period deaths when period has no capture", () => {
    const result = report(source([record(1, "2026-01-01", 2)]));
    expect(result.rows[0]).toMatchObject({
      periodDeaths: null,
      cumulativeDeaths: 2,
      periodSummaryEligible: false,
      cumulativeSummaryEligible: true,
    });
    expect(result.summary).toMatchObject({
      initialBirds: 100,
      periodDeaths: null,
      cumulativeDeaths: 2,
      periodEligibleFlockCount: 0,
      cumulativeEligibleFlockCount: 1,
    });
  });
  it.each([
    null,
    -1,
    1.2,
    "",
    " ",
    "bad",
    "-2",
    "2.2",
    "1.0000000000000001",
    "1e-400",
    "-1e-400",
    "9007199254740990.5",
    "0x10",
    "1e0",
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "invalid period mortality %s blocks both totals and preserves raw value",
    mortality => {
      const input = source([
        record(1, "2026-01-01", 4),
        record(2, "2026-01-03", mortality),
        record(3, "2026-01-05", 2),
      ]);
      const output = report(input);
      const result = output.rows[0];
      expect(result).toMatchObject({
        periodDeaths: null,
        cumulativeDeaths: null,
        periodSummaryEligible: false,
        cumulativeSummaryEligible: false,
        periodRecordedDays: 2,
      });
      expect(result.dailyRecords.find(r => r.id === 2)).toMatchObject({
        rawMortality: mortality,
        deaths: null,
        eligible: false,
      });
      expect(result.trend.at(-1)?.cumulativeDeaths).toBeNull();
      expect(output.summary).toMatchObject({
        periodDeaths: null, cumulativeDeaths: null,
        periodMortalityPct: null, cumulativeMortalityPct: null,
      });
    }
  );
  it.each([null, -1, 0.5, "bad"])(
    "earlier invalid mortality %s allows independently valid period",
    mortality => {
      const result = report(
        source([record(1, "2026-01-01", mortality), record(2, "2026-01-03", 3)])
      );
      expect(result.rows[0]).toMatchObject({
        periodDeaths: 3,
        periodMortalityPct: 3,
        cumulativeDeaths: null,
        periodSummaryEligible: true,
        cumulativeSummaryEligible: false,
      });
      expect(result.summary).toMatchObject({
        initialBirds: 100,
        periodDeaths: 3,
        periodMortalityPct: 3,
        cumulativeDeaths: null,
        periodEligibleFlockCount: 1,
        cumulativeEligibleFlockCount: 0,
      });
      expect(result.rows[0].trend[1]).toMatchObject({
        recordedDeaths: 3,
        cumulativeDeaths: null,
      });
    }
  );
  it.each([null, "bad-date", "2026-02-30"])(
    "unknown date %s makes even otherwise valid totals ambiguous",
    recordDate => {
      const result = row(
        source([record(1, "2026-01-03", 2), record(2, recordDate, 0)])
      );
      expect(result.periodDeaths).toBeNull();
      expect(result.cumulativeDeaths).toBeNull();
      expect(result.dailyRecords.find(r => r.id === 2)).toMatchObject({
        date: null,
        eligible: false,
        rawMortality: 0,
      });
      expect(result.trend[0].cumulativeDeaths).toBeNull();
    }
  );
  it("invalid pre-placement mortality is review-only and does not poison properly scoped totals", () => {
    const input = source([
      record(1, "2025-12-31", null),
      record(2, "2026-01-03", 2),
    ]);
    expect(row(input)).toMatchObject({ periodDeaths: 2, cumulativeDeaths: 2 });
    expect(issues(input)).toContain("before placement");
  });
  it("parses numeric strings but preserves them unchanged for review", () => {
    const result = row(
      source([record(1, "2026-01-03", " 003 "), record(2, "2026-01-05", "0")])
    );
    expect(result.periodDeaths).toBe(3);
    expect(result.dailyRecords.map(r => r.rawMortality)).toEqual([
      " 003 ",
      "0",
    ]);
    expect(result.dailyRecords.map(r => r.deaths)).toEqual([3, 0]);
  });
  it.each([0, -1, 1.5, NaN])(
    "invalid/zero initial count %s retains counts but disallows ratio and summary",
    initialCount => {
      const result = report(
        source([record(1, "2026-01-03", 0)], [flock({ initialCount })])
      );
      expect(result.rows[0].periodDeaths).toBe(0);
      expect(result.rows[0].periodMortalityPct).toBeNull();
      expect(result.rows[0].periodSummaryEligible).toBe(false);
      expect(result.summary.periodDeaths).toBeNull();
    }
  );
  it("counts exceeding initial birds are not clamped but invalidate ratios and confident summary", () => {
    const result = report(source([record(1, "2026-01-03", 110)]));
    expect(result.rows[0]).toMatchObject({
      periodDeaths: 110,
      cumulativeDeaths: 110,
      periodMortalityPct: null,
      cumulativeMortalityPct: null,
      periodSummaryEligible: false,
    });
    expect(result.rows[0].issues.join(" ")).toMatch(
      /exceed initial birds.*balance/
    );
    expect(result.summary.periodDeaths).toBeNull();
  });
  it("earlier deaths exceeding initial birds invalidate cumulative ratio but not valid period ratio", () => {
    const result = row(
      source([record(1, "2026-01-01", 105), record(2, "2026-01-03", 2)])
    );
    expect(result).toMatchObject({
      periodDeaths: 2,
      cumulativeDeaths: 107,
      periodMortalityPct: 2,
      cumulativeMortalityPct: null,
      periodSummaryEligible: true,
      cumulativeSummaryEligible: false,
    });
  });
  it("safe-integer overflow is unavailable instead of rounded aggregate deaths", () => {
    const result = row(
      source(
        [
          record(1, "2026-01-03", Number.MAX_SAFE_INTEGER),
          record(2, "2026-01-05", 1),
        ],
        [flock({ initialCount: Number.MAX_SAFE_INTEGER })]
      )
    );
    expect(result.periodDeaths).toBeNull();
    expect(result.cumulativeDeaths).toBeNull();
    expect(result.issues.join(" ")).toContain("safe integer precision");
  });
});

describe("mortality report duplicate identity and metadata safety", () => {
  it("exact duplicated ID contributes only once and produces a warning", () => {
    const one = record(1, "2026-01-03", 3);
    const result = row(source([one, { ...one }]));
    expect(result).toMatchObject({
      periodDeaths: 3,
      cumulativeDeaths: 3,
      recordedDays: 1,
    });
    expect(result.dailyRecords).toHaveLength(1);
    expect(result.trend[0].recordIds).toEqual([1]);
    expect(result.issues.join(" ")).toContain("Repeated daily source ID 1");
  });
  it("multiple unique IDs on a date sum, warn, and count the captured date once", () => {
    const result = row(
      source([record(1, "2026-01-03", 2), record(2, "2026-01-03", 3)])
    );
    expect(result).toMatchObject({
      periodDeaths: 5,
      cumulativeDeaths: 5,
      recordedDays: 1,
      periodRecordedDays: 1,
    });
    expect(result.trend[0]).toMatchObject({
      recordIds: [1, 2],
      recordedDeaths: 5,
      cumulativeDeaths: 5,
    });
    expect(result.issues.join(" ")).toContain("Duplicate daily date");
    expect(result.dailyRecords.map(r => r.cumulativeDeaths)).toEqual([5, 5]);
  });
  it("conflicting same ID counts are preserved as review versions and block both totals", () => {
    const result = row(
      source([record(1, "2026-01-03", 2), record(1, "2026-01-03", "3")])
    );
    expect(result).toMatchObject({
      periodDeaths: null,
      cumulativeDeaths: null,
    });
    expect(result.dailyRecords.map(r => r.rawMortality)).toEqual(["3", 2]);
    expect(result.dailyRecords.every(r => !r.eligible)).toBe(true);
    expect(result.trend[0]).toMatchObject({
      recordIds: [1],
      recordedDeaths: null,
      cumulativeDeaths: null,
    });
  });
  it("repeated exact version within conflicts is retained once, never three contributions", () => {
    const one = record(1, "2026-01-03", 2);
    const result = row(source([one, { ...one }, { ...one, mortality: 3 }]));
    expect(result.dailyRecords).toHaveLength(2);
    expect(result.periodDeaths).toBeNull();
  });
  it("different raw types for same ID are conflicts, not silently normalized versions", () => {
    const result = row(
      source([record(1, "2026-01-03", 3), record(1, "2026-01-03", "3")])
    );
    expect(result.dailyRecords.map(d => d.rawMortality)).toEqual(["3", 3]);
    expect(result.periodDeaths).toBeNull();
  });
  it("nonfinite raw values are not fingerprinted as null duplicates", () => {
    const result = row(
      source([record(1, "2026-01-03", NaN), record(1, "2026-01-03", null)])
    );
    expect(result.dailyRecords).toHaveLength(2);
    expect(result.issues.join(" ")).toContain("Conflicting versions");
  });
  it("conflicting earlier versions block cumulative but leave valid period independent", () => {
    const result = row(
      source([
        record(1, "2026-01-01", 2),
        record(1, "2026-01-01", 4),
        record(2, "2026-01-03", 3),
      ])
    );
    expect(result).toMatchObject({
      periodDeaths: 3,
      cumulativeDeaths: null,
      periodSummaryEligible: true,
      cumulativeSummaryEligible: false,
    });
  });
  it("conflicting dated versions across S cannot be resolved by source order", () => {
    const input = source([
      record(1, "2026-01-01", 2),
      record(1, "2026-01-03", 2),
      record(2, "2026-01-05", 1),
    ]);
    expect(row(input)).toMatchObject({
      periodDeaths: null,
      cumulativeDeaths: null,
    });
    expect(
      report({ ...input, dailyRecords: [...input.dailyRecords].reverse() })
    ).toEqual(report(input));
  });
  it("a dated/undated version conflict makes all cumulative trend positions unknown", () => {
    const result = row(
      source([
        record(1, "2026-01-03", 2),
        record(1, null, 2),
        record(2, "2026-01-05", 1),
      ])
    );
    expect(result).toMatchObject({
      periodDeaths: null,
      cumulativeDeaths: null,
    });
    expect(result.trend.every(p => p.cumulativeDeaths === null)).toBe(true);
  });
  it("conflicting flock ownership blocks both affected flocks rather than choosing a winner", () => {
    const input = source(
      [
        record(1, "2026-01-01", 2),
        record(1, "2026-01-01", 2, { flockId: 2 }),
        record(2, "2026-01-03", 3),
        record(3, "2026-01-03", 4, { flockId: 2 }),
      ],
      [flock(), flock({ id: 2 })]
    );
    const result = report(input);
    expect(
      result.rows.every(
        r => r.periodDeaths === null && r.cumulativeDeaths === null
      )
    ).toBe(true);
    expect(
      result.rows.every(r => r.issues.join(" ").includes("flock ownership"))
    ).toBe(true);
    expect(result.summary.periodEligibleFlockCount).toBe(0);
  });
  it("invalid synthetic daily ID cannot contribute", () => {
    const result = row(source([record(0, "2026-01-03", 2)]));
    expect(result.periodDeaths).toBeNull();
    expect(result.dailyRecords[0].eligible).toBe(false);
  });
  it("exact duplicate flock and house metadata count each ID once", () => {
    const input = source([record(1, "2026-01-03", 2)], [flock(), flock()]);
    input.houses.push({ ...input.houses[0] });
    const result = report(input);
    expect(result.rows).toHaveLength(1);
    expect(result.summary).toMatchObject({
      initialBirds: 100,
      periodDeaths: 2,
    });
    expect(result.rows[0].issues.join(" ")).toContain(
      "Repeated flock source ID"
    );
    expect(result.rows[0].issues.join(" ")).toContain(
      "Repeated house source ID"
    );
  });
  it("conflicting flock placement and initial count are never chosen by order", () => {
    const input = source(
      [record(1, "2026-01-03", 2)],
      [flock(), flock({ initialCount: 200, placementDate: "2026-01-02" })]
    );
    const result = report(input);
    expect(result.rows[0]).toMatchObject({
      initialBirds: null,
      placementDate: null,
      periodDeaths: null,
      cumulativeDeaths: null,
    });
    expect(report({ ...input, flocks: [...input.flocks].reverse() })).toEqual(
      result
    );
  });
  it("conflicting house ownership remains visible under a matching candidate, but is not assigned as winner", () => {
    const input = source(
      [record(1, "2026-01-03", 2)],
      [flock(), flock({ houseId: 20 })]
    );
    const result = report(input, { houseId: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].houseId).toBe(-1);
    expect(result.rows[0].periodDeaths).toBeNull();
    expect(result.summary.periodDeaths).toBeNull();
  });
  it("conflicting current labels/status do not fabricate a master-data version", () => {
    const result = row(
      source(
        [record(1, "2026-01-03", 2)],
        [flock(), flock({ flockNumber: "Other", status: "completed" })]
      )
    );
    expect(result.currentStatus).toContain("Conflicting");
    expect(result.flockNumber).toContain("conflicting");
    expect(result.initialBirds).toBeNull();
    expect(result.periodDeaths).toBeNull();
  });
  it("conflicting house name or number protects summary without arbitrary labels", () => {
    const input = capture();
    input.houses.push({ id: 10, name: "Different", houseNumber: "10" });
    const result = row(input);
    expect(result.houseName).toContain("conflicting");
    expect(result.periodSummaryEligible).toBe(false);
    expect(report(input).summary.periodDeaths).toBeNull();
    input.houses[1] = { id: 10, name: "House Ten", houseNumber: "different" };
    expect(row(input).periodSummaryEligible).toBe(false);
  });
  it("missing house metadata disallows complete-cohort aggregate", () => {
    const input = capture();
    input.houses = [];
    expect(row(input).periodSummaryEligible).toBe(false);
    expect(report(input).summary.initialBirds).toBeNull();
  });
});

describe("mortality report cohort ratios and trend", () => {
  it("full selected cohort uses ratio of sums, not mean of flock percentages or live birds", () => {
    const input = source(
      [
        record(1, "2026-01-01", 10),
        record(2, "2026-01-03", 10),
        record(3, "2026-01-01", 90, { flockId: 2 }),
        record(4, "2026-01-03", 90, { flockId: 2 }),
      ],
      [flock(), flock({ id: 2, initialCount: 900 })]
    );
    const result = report(input);
    expect(result.summary).toMatchObject({
      initialBirds: 1000,
      periodDeaths: 100,
      periodMortalityPct: 10,
      cumulativeDeaths: 200,
      cumulativeMortalityPct: 20,
      periodEligibleFlockCount: 2,
      cumulativeEligibleFlockCount: 2,
    });
    expect(result.rows[0].periodMortalityPct).toBe(10);
  });
  it("unequal percentages aggregate against matched denominators, not arithmetic average", () => {
    const result = report(
      source(
        [
          record(1, "2026-01-03", 10),
          record(2, "2026-01-03", 9, { flockId: 2 }),
        ],
        [flock(), flock({ id: 2, initialCount: 900 })]
      )
    );
    expect(result.summary.periodMortalityPct).toBeCloseTo(1.9);
    expect(result.summary.periodMortalityPct).not.toBe(5.5);
  });
  it("one no-capture flock makes partial cohort totals N/A with coverage rather than omitted", () => {
    const result = report(
      source([record(1, "2026-01-03", 3)], [flock(), flock({ id: 2 })])
    );
    expect(result.summary).toMatchObject({
      flockCount: 2,
      periodEligibleFlockCount: 1,
      cumulativeEligibleFlockCount: 1,
      initialBirds: null,
      periodDeaths: null,
      cumulativeDeaths: null,
      periodMortalityPct: null,
    });
    expect(result.summary.issues.join(" ")).toContain("1/2");
  });
  it("full period cohort remains available when cumulative cohort is incomplete", () => {
    const result = report(
      source(
        [
          record(1, "2026-01-01", null),
          record(2, "2026-01-03", 3),
          record(3, "2026-01-03", 7, { flockId: 2 }),
        ],
        [flock(), flock({ id: 2, initialCount: 900 })]
      )
    );
    expect(result.summary).toMatchObject({
      initialBirds: 1000,
      periodDeaths: 10,
      periodMortalityPct: 1,
      cumulativeDeaths: null,
      cumulativeMortalityPct: null,
      periodEligibleFlockCount: 2,
      cumulativeEligibleFlockCount: 1,
    });
  });
  it("full cumulative cohort remains available when period cohort has a no-capture member", () => {
    const result = report(
      source(
        [
          record(1, "2026-01-01", 3),
          record(2, "2026-01-03", 7, { flockId: 2 }),
        ],
        [flock(), flock({ id: 2, initialCount: 900 })]
      )
    );
    expect(result.summary).toMatchObject({
      initialBirds: 1000,
      periodDeaths: null,
      periodMortalityPct: null,
      cumulativeDeaths: 10,
      cumulativeMortalityPct: 1,
      periodEligibleFlockCount: 1,
      cumulativeEligibleFlockCount: 2,
    });
  });
  it("denominator overflow disallows aggregate rather than approximate totals", () => {
    const result = report(
      source(
        [
          record(1, "2026-01-03", 1),
          record(2, "2026-01-03", 1, { flockId: 2 }),
        ],
        [
          flock({ initialCount: Number.MAX_SAFE_INTEGER }),
          flock({ id: 2, initialCount: Number.MAX_SAFE_INTEGER }),
        ]
      )
    );
    expect(result.summary.initialBirds).toBeNull();
    expect(result.summary.periodDeaths).toBeNull();
    expect(result.summary.issues.join(" ")).toContain("safe integer precision");
  });
  it("trend includes real recorded zero dates but never fills calendar gaps", () => {
    const result = row(capture());
    expect(result.trend.map(p => p.date)).toEqual([
      "2026-01-01",
      "2026-01-03",
      "2026-01-05",
    ]);
    expect(result.trend.map(p => p.recordedDeaths)).toEqual([2, 3, 0]);
    expect(result.trend.map(p => p.cumulativeDeaths)).toEqual([2, 5, 5]);
    expect(result.trend.map(p => p.inPeriod)).toEqual([false, true, true]);
    expect(result.trend[2].issues.join(" ")).toContain("gap");
    expect(result.trend.at(-1)?.date).not.toBe("2026-01-06");
  });
  it("latest same-date source cumulative total is truthful regardless of ID order", () => {
    const input = source([
      record(20, "2026-01-05", 4),
      record(2, "2026-01-01", 2),
      record(10, "2026-01-05", 3),
    ]);
    const result = report(input);
    expect(
      result.rows[0].dailyRecords
        .filter(d => d.date === "2026-01-05")
        .map(d => d.cumulativeDeaths)
    ).toEqual([9, 9]);
    expect(result.rows[0].trend.at(-1)).toMatchObject({
      recordIds: [10, 20],
      recordedDeaths: 7,
      cumulativeDeaths: 9,
    });
    expect(
      report({ ...input, dailyRecords: [...input.dailyRecords].reverse() })
    ).toEqual(result);
  });
  it("a same-day invalid count makes all same-day cumulative detail values unavailable", () => {
    const result = row(
      source([record(1, "2026-01-03", 2), record(2, "2026-01-03", null)])
    );
    expect(result.dailyRecords.map(d => d.cumulativeDeaths)).toEqual([
      null,
      null,
    ]);
    expect(result.trend[0].recordedDeaths).toBeNull();
  });
  it("does not pretend an older observation was newly recorded on E", () => {
    const result = row(source([record(1, "2026-01-03", 2)]));
    expect(result.trend).toHaveLength(1);
    expect(result.trend[0].date).toBe("2026-01-03");
    expect(result.cumulativeDeaths).toBe(2);
  });
  it("known gaps warn on summary even when full cohort is numerically eligible", () => {
    const result = report(capture());
    expect(result.summary.periodEligibleFlockCount).toBe(1);
    expect(result.summary.issues.join(" ")).toContain("Recorded-only totals");
  });
});

describe("mortality report boundaries and purity", () => {
  it("ignores unrelated runtime fields and exposes no cull/diagnosis/forecast outputs", () => {
    const input = {
      ...capture(),
      mortalityRecords: [{ mortality: 90 }],
      harvests: [{ chickenCountLoaded: 50 }],
      dailyRecords: capture().dailyRecords.map(r => ({
        ...r,
        culls: 10,
        averageWeight: 1.5,
        causeOfDeath: "unknown",
        transportMortality: 9,
      })),
    };
    const result = report(input);
    expect(result.rows[0].cumulativeDeaths).toBe(5);
    expect(result.notes.join(" ")).toContain(
      "No separate cull count, cause-of-death analysis or diagnosis"
    );
    expect(Object.keys(result.rows[0])).not.toContain("forecast");
    expect(Object.keys(result.rows[0])).not.toContain("culls");
    expect(Object.keys(result.rows[0])).not.toContain("causeOfDeath");
    expect(Object.keys(result.rows[0])).not.toContain("remainingBirds");
  });
  it("is deterministic and leaves deeply frozen source and filters unchanged", () => {
    const input = freeze(capture());
    const selectedFilters = freeze({ ...filters });
    const before = structuredClone(input);
    const first = buildMortalityReport(
      input,
      selectedFilters,
      "Africa/Johannesburg",
      generatedAt
    );
    expect(
      buildMortalityReport(
        input,
        selectedFilters,
        "Africa/Johannesburg",
        generatedAt
      )
    ).toEqual(first);
    expect(input).toEqual(before);
    expect(first.filters).not.toBe(selectedFilters);
    expect(first.rows[0].dailyRecords[0]).not.toBe(input.dailyRecords[0]);
  });
  it("does not mutate null, negative, string or conflicting raw values", () => {
    const input = freeze(
      source([
        record(1, "2026-01-01", -2),
        record(2, "2026-01-03", "003"),
        record(2, "2026-01-03", null),
      ])
    );
    const before = structuredClone(input);
    const result = report(input);
    expect(input).toEqual(before);
    expect(result.rows[0].dailyRecords.map(r => r.rawMortality)).toEqual([
      -2,
      "003",
      null,
    ]);
  });
  it("timezone metadata never shifts operational dates even across midnight and DST", () => {
    const input = capture();
    const utc = report(input, {}, "UTC");
    const east = report(input, {}, "Pacific/Kiritimati");
    const west = report(input, {}, "America/Los_Angeles");
    expect(east.rows).toEqual(utc.rows);
    expect(west.rows).toEqual(utc.rows);
    expect(east.generatedAt).toBe(generatedAt);
    expect(west.filters).toEqual(filters);
    expect(east.timezone).toBe("Pacific/Kiritimati");
  });
  it("supports DST-transition operational dates without 23/25-hour day drift", () => {
    const input = source(
      [
        record(1, "2026-03-07", 1),
        record(2, "2026-03-08", 0),
        record(3, "2026-03-09", 2),
      ],
      [flock({ placementDate: "2026-03-07" })]
    );
    const result = report(
      input,
      { startDate: "2026-03-07", endDate: "2026-03-09" },
      "America/New_York"
    );
    expect(result.rows[0]).toMatchObject({
      calendarDaysInPeriod: 3,
      unrecordedDaysInPeriod: 0,
      cumulativeDeaths: 3,
    });
  });
  it("preserves numeric precision rather than rounding per-flock or summary percentages", () => {
    const result = report(
      source([record(1, "2026-01-03", 1)], [flock({ initialCount: 3 })])
    );
    expect(result.rows[0].periodMortalityPct).toBe(100 * (1 / 3));
    expect(result.summary.periodMortalityPct).toBe(100 * (1 / 3));
  });
});
