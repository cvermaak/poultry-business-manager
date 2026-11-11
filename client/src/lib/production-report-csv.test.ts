import { describe, expect, it } from "vitest";
import type { FlockPerformanceReport, FlockPerformanceRow } from "../../../shared/production-reports";
import { isProductionDate, productionDayDifference, productionToday } from "../../../shared/production-report-dates";
import { buildFlockPerformanceCsv, productionCsvCell } from "./production-report-csv";

function row(patch: Partial<FlockPerformanceRow> = {}): FlockPerformanceRow {
  return {
    flockId: 1, flockNumber: "UNIT-ONLY", houseId: 2, houseName: 'House "A", North', placementDate: "2026-10-01", currentStatus: "active",
    initialBirds: 100, elapsedDays: 10, periodDeaths: 2, cumulativeDeaths: 3, cumulativeMortalityPct: 3,
    loadedBirds: 20, remainingBirds: 77, latestWeightKg: 1.345, latestWeightDate: "2026-10-09", weightAgeDays: 2, weightOutsidePeriod: false,
    observedGrowthGPerBirdDay: -2.5, growthStartDate: "2026-10-08", growthEndDate: "2026-10-09", growthStartWeightKg: 1.3475, growthEndWeightKg: 1.345,
    recordedDays: 3, periodRecordedDays: 2, expectedPeriodDays: 4, missingPeriodDays: 2, summaryEligible: true,
    issues: ["Missing dates are unknown, not zero."], dailyRecords: [], harvestRecords: [], catchExceptions: [], ...patch,
  };
}
function report(rows = [row()]): FlockPerformanceReport {
  return {
    kind: "flock-performance", generatedAt: "2026-11-08T20:00:00.000Z", timezone: "Africa/Johannesburg",
    filters: { startDate: "2026-10-08", endDate: "2026-10-11", houseId: 2, flockId: null }, rows,
    summary: { flockCount: rows.length, eligibleFlockCount: rows.length, excludedFlockCount: 0, initialBirds: 100, periodDeaths: 2, cumulativeDeaths: 3, cumulativeMortalityPct: 3, loadedBirds: 20, remainingBirds: 77, issues: [] },
    notes: ["Recorded balance; no inferred culls/transfers."],
  };
}
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let cells: string[] = []; let cell = ""; let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && c === ",") { cells.push(cell); cell = ""; }
    else if (!quoted && c === "\r" && text[i + 1] === "\n") { cells.push(cell); out.push(cells); cells = []; cell = ""; i++; }
    else cell += c;
  }
  return out;
}

describe("production CSV encoding", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-HYPERLINK(1)", "@SUM(1)", "  =1", "\t=1", "\r=1", "\nhello"])("neutralizes formula-like text: %j", value => {
    expect(productionCsvCell(value)).toContain("'");
  });
  it("keeps numeric negatives numeric, and unavailable/nonfinite numbers blank", () => {
    expect(productionCsvCell(-2.5)).toBe("-2.5");
    for (const value of [null, undefined, NaN, Infinity]) expect(productionCsvCell(value)).toBe('""');
    expect(productionCsvCell(0)).toBe("0");
  });
  it("roundtrips quotes, commas, newlines and Unicode without extra rows", () => {
    const name = 'Farm "Test",\nWorcester – unité';
    const parsed = parseCsv(buildFlockPerformanceCsv(report([row({ houseName: name })])));
    expect(parsed).toHaveLength(2);
    const column = parsed[0].indexOf("House");
    expect(parsed[1][column]).toBe(name);
    expect(parsed[1]).toHaveLength(parsed[0].length);
  });
  it("exports the exact supplied snapshot, filters, raw values and coverage", () => {
    const data = report(); const original = JSON.stringify(data);
    const parsed = parseCsv(buildFlockPerformanceCsv(data));
    const cell = (name: string) => parsed[1][parsed[0].indexOf(name)];
    expect(cell("Generated at (UTC)")).toBe(data.generatedAt);
    expect(cell("As-of end date")).toBe("2026-10-11");
    expect(cell("Recorded deaths in period")).toBe("2");
    expect(cell("Recorded deaths through end")).toBe("3");
    expect(cell("Observed mean-weight growth (g/bird/day)")).toBe("-2.5");
    expect(cell("Summary coverage (eligible/selected)")).toBe("1/1");
    expect(JSON.stringify(data)).toBe(original);
  });
  it("does not turn missing observations into zeros", () => {
    const parsed = parseCsv(buildFlockPerformanceCsv(report([row({ periodDeaths: null, latestWeightKg: null, remainingBirds: null })])));
    for (const column of ["Recorded deaths in period", "Latest mean weight (kg/bird)", "Recorded birds remaining (excludes unrecorded culls/transfers)"]) {
      expect(parsed[1][parsed[0].indexOf(column)]).toBe("");
    }
  });
  it("exports just one header on an empty dataset and no fabricated summary rows", () => {
    const text = buildFlockPerformanceCsv(report([]));
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(parseCsv(text)).toHaveLength(1);
  });
});

describe("operational report calendars", () => {
  it.each(["2026-02-29", "2026-13-01", "2026-01-32", "0000-00-00", "2026-11-08T00:00:00Z", "08/11/2026", "2026-1-01"])("rejects invalid date %s", value => {
    expect(isProductionDate(value)).toBe(false);
  });
  it("accepts leap days and uses calendar-day differences, not host wall-clock DST", () => {
    expect(isProductionDate("2024-02-29")).toBe(true);
    expect(productionDayDifference("2026-03-07", "2026-03-09")).toBe(2);
    expect(productionDayDifference("2026-10-01", "2026-10-01")).toBe(0);
  });
  it("defaults to the company calendar rather than the browser/server UTC date", () => {
    expect(productionToday("Africa/Johannesburg", new Date("2026-11-08T23:30:00Z"))).toBe("2026-11-09");
    expect(productionToday("America/New_York", new Date("2026-11-08T01:00:00Z"))).toBe("2026-11-07");
    expect(() => productionToday("Invalid/Timezone")).toThrow();
  });
});
