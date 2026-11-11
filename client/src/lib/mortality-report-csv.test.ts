import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMortalityCsv } from "./mortality-report-csv";
import type { MortalityReport } from "@shared/mortality-report";

function fixture(): MortalityReport {
  return { kind: "mortality", generatedAt: "2026-11-08T22:30:00.000Z", timezone: "Africa/Johannesburg",
    filters: { startDate: "2026-11-02", endDate: "2026-11-03", houseId: 2, flockId: 1 },
    summary: { flockCount: 1, periodEligibleFlockCount: 1, cumulativeEligibleFlockCount: 1, initialBirds: 100, periodDeaths: 2, periodMortalityPct: 2, cumulativeDeaths: 3, cumulativeMortalityPct: 3, issues: [] },
    notes: ["Recorded mortality only; missing dates are not zero."],
    rows: [{ flockId: 1, flockNumber: "TEST-F1", houseId: 2, houseName: "TEST House", placementDate: "2026-11-01", currentStatus: "active", initialBirds: 100,
      periodDeaths: 2, periodMortalityPct: 2, cumulativeDeaths: 3, cumulativeMortalityPct: 3, recordedDays: 3, periodRecordedDays: 2, calendarDaysInPeriod: 2, unrecordedDaysInPeriod: 0,
      periodSummaryEligible: true, cumulativeSummaryEligible: true, issues: [],
      dailyRecords: [{ id: 101, date: "2026-11-03", dayNumber: 2, rawMortality: 0, deaths: 0, inPeriod: true, eligible: true, cumulativeDeaths: 3, issues: [] }],
      trend: [{ date: "2026-11-03", recordIds: [101], recordedDeaths: 0, cumulativeDeaths: 3, cumulativeMortalityPct: 3, inPeriod: true, issues: [] }] }],
  };
}
function parse(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n" && !quoted) { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  return rows;
}
function objects(report = fixture()) {
  const [headers, ...rows] = parse(buildMortalityCsv(report));
  return rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
}
describe("Mortality CSV snapshot", () => {
  it("produces BOM UTF-8 and CRLF with aligned summary/flock/trend/source rows", () => {
    const csv = buildMortalityCsv(fixture()); const rows = parse(csv);
    expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv.endsWith("\r\n")).toBe(true);
    expect(rows).toHaveLength(5); expect(new Set(rows.map(row => row.length)).size).toBe(1);
    expect(rows.slice(1).map(row => row[0])).toEqual(["summary", "flock", "daily-trend", "reviewed-source"]);
  });
  it("preserves the exact period/as-of cohort denominator and sums", () => {
    const [summary, flock] = objects();
    for (const row of [summary, flock]) {
      expect(row["Recorded deaths in period"]).toBe("2"); expect(row["Recorded deaths through end"]).toBe("3");
      expect(row["Initial birds denominator"]).toBe("100"); expect(row["Period mortality (% initial birds, not opening live birds)"]).toBe("2");
    }
  });
  it("repeats applied provenance on every row, including UTC generated-at and company zone", () => {
    for (const row of objects()) {
      expect(row["Generated at (UTC)"]).toBe("2026-11-08T22:30:00.000Z"); expect(row["Display timezone"]).toBe("Africa/Johannesburg");
      expect(row["House filter ID"]).toBe("2"); expect(row["Flock filter ID"]).toBe("1"); expect(row["As-of end date"]).toBe("2026-11-03");
    }
  });
  it("preserves recorded zero and stable IDs in trend and reviewed-source rows", () => {
    const [, , trend, source] = objects();
    expect(trend["Eligible source deaths"]).toBe("0"); expect(source["Raw recorded mortality (not necessarily eligible)"]).toBe("0");
    expect(source["Source eligible"]).toBe("yes"); expect(trend["Reviewed record IDs"]).toBe("101");
  });
  it("leaves unavailable metrics blank, with the warning and cohort coverage intact", () => {
    const f = fixture(); f.rows[0].periodDeaths = null; f.rows[0].periodSummaryEligible = false; f.rows[0].issues = ["Invalid death count"];
    const row = objects(f)[1]; expect(row["Recorded deaths in period"]).toBe(""); expect(row["Eligible for period summary"]).toBe("no"); expect(row["Data-quality warnings"]).toContain("Invalid death count");
  });
  it("exports excluded raw records as review, never as eligible contributions", () => {
    const f = fixture(); const d = f.rows[0].dailyRecords[0]; d.rawMortality = -2; d.deaths = null; d.eligible = false; d.issues = ["Negative count excluded"];
    const row = objects(f).at(-1)!; expect(row["Raw recorded mortality (not necessarily eligible)"]).toBe("-2"); expect(row["Eligible source deaths"]).toBe(""); expect(row["Source eligible"]).toBe("no");
  });
  it("includes recorded day number and validated excluded count separately from contributions", () => {
    const f = fixture(); const d = f.rows[0].dailyRecords[0];
    d.dayNumber = 7; d.rawMortality = 3; d.deaths = 3; d.eligible = false; d.issues = ["Pre-placement record excluded"];
    const row = objects(f).at(-1)!;
    expect(row["Recorded day number"]).toBe("7");
    expect(row["Validated source count (not contribution eligibility)"]).toBe("3");
    expect(row["Eligible source deaths"]).toBe("");
    expect(row["Recorded cumulative deaths on source date"]).toBe("");
    expect(row["Source eligible"]).toBe("no");
  });
  it.each(["=1+1", "+SUM(A1)", "-formula", "@SUM(A1)", "\t=1+1", "\r=1+1"])("neutralizes spreadsheet-like names %j", name => {
    const f = fixture(); f.rows[0].flockNumber = name; expect(objects(f)[1]["Flock"]).toBe("'" + name);
  });
  it("round-trips quotes, commas, Unicode and line breaks", () => {
    const f = fixture(); f.rows[0].houseName = 'Huis, "Berg"\nKaap'; expect(objects(f)[1]["House"]).toBe(f.rows[0].houseName);
  });
  it("keeps full numeric precision rather than using rounded display strings", () => {
    const f = fixture(); f.rows[0].periodMortalityPct = 1 / 3; expect(objects(f)[1]["Period mortality (% initial birds, not opening live birds)"]).toBe(String(1 / 3));
  });
  it("does not add phantom zero trend dates or mutate the report", () => {
    const f = fixture(); const before = JSON.stringify(f); expect(objects(f).filter(r => r["Row type"] === "daily-trend")).toHaveLength(1); expect(JSON.stringify(f)).toBe(before);
  });
  it("retains a summary-only empty cohort without inventing a successful flock", () => {
    const f = fixture(); f.rows = []; f.summary.flockCount = 0; f.summary.initialBirds = null; f.summary.periodDeaths = null;
    expect(objects(f)).toHaveLength(1); expect(objects(f)[0]["Recorded deaths in period"]).toBe("");
  });
});
describe("Mortality page integration boundaries", () => {
  const panel = readFileSync(resolve(process.cwd(), "client/src/components/MortalityReportPanel.tsx"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");
  it("shows the accepted report tabs with the implemented Harvest Results tab", () => {
    expect(page).toContain('value="flock-performance"'); expect(page).toContain('value="mortality"'); expect(page).toContain("<AuthorizedFlockPerformance");
    expect(page).not.toContain("Mortality — planned later"); expect(page).not.toContain("Harvest Results — planned later"); expect(page).toContain('value="harvest-results"');
  });
  it("uses role-gated mounting and disabled query guards without any mutation", () => {
    expect(page).toContain("canReadProductionReports(user.role)"); expect(page).toContain('activeReport === "mortality"');
    expect(panel).toContain("trpc.productionReports.mortality.useQuery"); expect(panel).toContain("enabled: authorized && !!applied && !!options && !optionsQuery.isError");
    expect(panel).not.toMatch(/useMutation|\bfetch\(/);
  });
  it("reuses the validated shared filters and stale/error/loading export guard", () => {
    for (const guard of ["validateFlockPerformanceDraft", "changeFlockPerformanceHouse", "canExportFlockPerformance", "dirty", "optionsQuery.isError", "reportQuery.isFetching"]) expect(panel).toContain(guard);
    expect(panel).toContain("if (!exportAllowed || !report) return;"); expect(panel).toContain("buildMortalityCsv(report)"); expect(panel).toContain('disabled={!exportAllowed}');
  });
});
