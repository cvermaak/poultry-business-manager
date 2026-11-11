import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFeedPerformanceCsv } from "./feed-report-csv";
import { buildFeedPerformanceReport } from "../../../server/feed-report-engine";
import type { FeedPerformanceReport, FeedReportSource } from "@shared/feed-report";
import { formatAuditTimestamp } from "./audit-time";

function fixture(): FeedPerformanceReport {
  const source: FeedReportSource = {
    houses: [{ id: 2, name: "TEST House", houseNumber: "TEST-2" }],
    flocks: [{ id: 1, flockNumber: "TEST-F1", houseId: 2, placementDate: "2026-11-01", initialCount: 1000, status: "active" }],
    dailyRecords: [
      { id: 13, flockId: 1, recordDate: "2026-11-03", dayNumber: 2, mortality: 0, averageWeight: "2.100", feedConsumed: "1000", feedType: "finisher" },
      { id: 11, flockId: 1, recordDate: "2026-11-01", dayNumber: 0, mortality: 10, averageWeight: "0", feedConsumed: "500", feedType: "starter" },
      { id: 12, flockId: 1, recordDate: "2026-11-02", dayNumber: 1, mortality: 10, averageWeight: "0", feedConsumed: "1000", feedType: "grower" },
    ],
    harvests: [{ id: 101, flockId: 1, harvestDate: "2026-11-02", chickenCountLoaded: 300, totalLoadedWeightKg: "600.000", chickenCountDelivered: null, totalDeliveredWeightKg: null, transportMortalities: 0 }],
    catches: [],
  };
  return buildFeedPerformanceReport(source, { startDate: "2026-11-02", endDate: "2026-11-03", houseId: 2, flockId: 1 }, "Africa/Johannesburg", "2026-11-08T22:30:00.000Z");
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
function objects(report = fixture()) { const [headers, ...rows] = parse(buildFeedPerformanceCsv(report)); return rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]]))); }
const byType = (report: FeedPerformanceReport, type: string) => objects(report).filter(r => r["Row type"] === type);

describe("Feed Performance same-snapshot CSV", () => {
  it("exports aligned BOM UTF-8/CRLF rows with a summary and explicit traceability row types", () => {
    const text = buildFeedPerformanceCsv(fixture()); const rows = parse(text);
    expect(text.startsWith("\uFEFF")).toBe(true); expect(text.endsWith("\r\n")).toBe(true);
    expect(new Set(rows.map(row => row.length)).size).toBe(1);
    expect(rows.slice(1).map(r => r[0])).toEqual(["Summary", "Flock", "Daily source", "Raw daily source (review only)", "Daily source", "Raw daily source (review only)", "Daily source", "Raw daily source (review only)", "Harvest source", "Raw harvest source (review only)"]);
  });
  it("exports existing snapshot FCR inputs and unrounded ratio, not selected-period feed divided by cumulative mass", () => {
    const f = fixture(), row = f.rows[0], out = byType(f, "Flock")[0];
    expect(out["Recorded feed in period (kg)"]).toBe(String(row.periodFeed.kg));
    expect(out["Recorded feed through end (kg)"]).toBe(String(row.cumulativeFeed.kg));
    expect(out["FCR cumulative feed through Q (kg)"]).toBe(String(row.fcr.cumulativeFeedKg));
    expect(out["FCR biomass denominator (kg)"]).toBe(String(row.fcr.biomassKg));
    expect(out["Harvest-adjusted recorded-feed FCR"]).toBe(String(row.fcr.value));
    expect(out["FCR qualifying flocks / selected"]).toBe("1/1");
  });
  it("labels the known loaded-count diagnostic truthfully when a count-only event blocks FCR", () => {
    const f = fixture(); f.rows[0].fcr.loadedBirds = 350; f.rows[0].fcr.loadedKg = 600;
    f.rows[0].fcr.eligible = false; f.rows[0].fcr.value = null; f.rows[0].fcr.reasons = ["Count-only event needs actual paired kg"];
    const r = byType(f, "Flock")[0];
    expect(r["FCR known eligible loaded-count balance through Q (may include unpaired events)"]).toBe("350");
    expect(r).not.toHaveProperty("FCR paired loaded birds through Q");
    expect(r["Harvest-adjusted recorded-feed FCR"]).toBe("");
    expect(r["FCR paired loaded net kg through Q"]).toBe("600");
  });
  it("exports primary company-local 12-hour time and separate UTC reference on every row", () => {
    const f = fixture(); for (const r of objects(f)) {
      expect(r["Generated at (company timezone)"]).toBe(formatAuditTimestamp(f.generatedAt, f.timezone));
      expect(r["Generated at (company timezone)"]).toContain("12:30 AM");
      expect(r["Generated at (UTC)"]).toBe(f.generatedAt); expect(r["Display timezone"]).toBe("Africa/Johannesburg");
      expect(r["As-of end date"]).toBe("2026-11-03"); expect(r["House filter ID"]).toBe("2");
    }
  });
  it("retains per-day chronology instead of source-array or day-number order", () => {
    const rows = byType(fixture(), "Daily source"); expect(rows.map(r => r["Operational source date"])).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(rows[0]["Period feed contribution (kg)"]).toBe(""); expect(rows[0]["Cumulative feed contribution (kg)"]).toBe("500");
  });
  it.each(["=1+1", "+SUM(A1)", "-formula", "@SUM(A1)", "\t=1+1", "\r=1+1"])("neutralizes formula-like flock names %j", name => {
    const f = fixture(); f.rows[0].flockNumber = name; expect(byType(f, "Flock")[0]["Flock"]).toBe("'" + name);
  });
  it("round-trips Unicode, commas, quotes and embedded line breaks", () => {
    const f = fixture(); f.rows[0].houseName = 'Huis, "Berg"\nKaap'; expect(byType(f, "Flock")[0]["House"]).toBe(f.rows[0].houseName);
  });
  it("keeps zero source feed visible while null source feed remains blank", () => {
    const f = fixture(); f.rows[0].dailyRecords[0].feedKg = 0; f.rows[0].dailyRecords[1].feedKg = null;
    const rows = byType(f, "Daily source"); expect(rows[0]["Validated source feed kg (review value)"]).toBe("0"); expect(rows[1]["Validated source feed kg (review value)"]).toBe("");
  });
  it("never turns excluded validated or raw feed into contribution quantities", () => {
    const f = fixture(); const daily = f.rows[0].dailyRecords[1]; daily.eligible = false; daily.issues = ["TEST excluded conflicting source"];
    const out = byType(f, "Daily source")[1]; expect(out["Validated source feed kg (review value)"]).toBe("1000");
    for (const key of ["Period feed contribution (kg)", "Cumulative feed contribution (kg)", "FCR feed contribution (kg)"]) expect(out[key]).toBe("");
    const raw = byType(f, "Raw daily source (review only)")[1]; expect(raw["Raw feed kg"]).toBe("1000"); expect(raw["FCR feed contribution (kg)"]).toBe("");
  });
  it("keeps unavailable FCR blank with reasons and does not silently reduce the selected population", () => {
    const f = fixture(); f.rows[0].fcr.eligible = false; f.rows[0].fcr.value = null; f.rows[0].fcr.reasons = ["Missing endpoint weight"];
    f.summary.fcr = null; f.summary.qualifyingFlocks = 0;
    expect(byType(f, "Summary")[0]["Harvest-adjusted recorded-feed FCR"]).toBe("");
    expect(byType(f, "Flock")[0]["FCR reasons"]).toContain("Missing endpoint weight"); expect(objects(f)[0]["FCR qualifying flocks / selected"]).toBe("0/1");
  });
  it("preserves final-harvest endpoint independently of report end and later period-feed totals", () => {
    const f = fixture(); f.rows[0].fcr.endpoint = "2026-11-02"; f.rows[0].fcr.closureDate = "2026-11-02";
    f.rows[0].dailyRecords[2].inFcr = false;
    const out = byType(f, "Flock")[0]; expect(out["FCR endpoint (Q)"]).toBe("2026-11-02"); expect(out["As-of end date"]).toBe("2026-11-03");
    expect(byType(f, "Daily source")[2]["FCR feed contribution (kg)"]).toBe("");
  });
  it("pairs harvest count and kg from the same source and never counts catch provenance as feed or output", () => {
    const f = fixture(); f.rows[0].harvestRecords[0].loadedKg = null;
    expect(byType(f, "Harvest source")[0]["Paired harvest contributes to FCR"]).toBe("no");
    f.rows[0].catchExceptions.push({ sessionId: 88, harvestRecordId: null, date: null, reason: "TEST orphan catch", sourceVersions: [{ id: 88, flockId: 1, catchDate: null, harvestRecordId: null, status: "completed" }] });
    for (const r of objects(f).filter(r => r["Row type"].includes("catch") || r["Row type"].includes("Catch"))) {
      expect(r["FCR biomass denominator (kg)"]).toBe(""); expect(r["FCR feed contribution (kg)"]).toBe("");
    }
  });
  it("preserves every conflicting raw source version with no extra contribution", () => {
    const f = fixture(); const d = f.rows[0].dailyRecords[0]; d.eligible = false; d.sourceVersions.push({ ...d.sourceVersions[0], feedConsumed: "=1+1" });
    const raw = byType(f, "Raw daily source (review only)"); expect(raw[1]["Raw feed kg"]).toBe("'=1+1"); expect(raw[1]["Period feed contribution (kg)"]).toBe("");
  });
  it("does not mutate the snapshot or invent per-flock results for an empty report", () => {
    const f = fixture(); const before = JSON.stringify(f); buildFeedPerformanceCsv(f); expect(JSON.stringify(f)).toBe(before);
    f.rows = []; f.summary.flockCount = 0; f.summary.fcr = null; expect(objects(f)).toHaveLength(1); expect(objects(f)[0]["Harvest-adjusted recorded-feed FCR"]).toBe("");
  });
  it("exports stage totals and qualified partial-coverage warnings from the snapshot without recategorization", () => {
    const f = fixture(); f.rows[0].periodFeed.partial = true; f.rows[0].issues.push("TEST partial capture");
    const r = byType(f, "Flock")[0]; expect(r["Period Starter (kg)"]).toBe(String(f.rows[0].periodFeed.stages.starter));
    expect(r["Period subtotal partial"]).toBe("yes"); expect(r["Data-quality warnings"]).toContain("TEST partial capture");
  });
});

describe("Feed Performance page/export boundaries", () => {
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");
  const panel = readFileSync(resolve(process.cwd(), "client/src/components/FeedReportPanel.tsx"), "utf8");
  it("requires all four implemented tabs with no remaining planned placeholder", () => {
    for (const value of ["flock-performance", "mortality", "harvest-results", "feed-performance"]) expect(page).toContain(`value="${value}"`);
    expect(page).not.toContain("planned later—not implemented");
  });
  it("mounts only selected report after authorization and requests only its options/query", () => {
    expect(page).toContain("canReadProductionReports(user.role)"); expect(page).toContain('activeReport === "feed-performance"');
    expect(panel).toContain("trpc.productionReports.feedPerformance.useQuery"); expect(panel).toContain("enabled: authorized && !!applied && !!options && !optionsQuery.isError");
    expect(panel).not.toMatch(/useMutation|\bfetch\(/);
  });
  it("locks CSV on stale filters, errors and refresh and downloads the exact returned report", () => {
    for (const guard of ["validateFlockPerformanceDraft", "changeFlockPerformanceHouse", "canExportFlockPerformance", "dirty", "optionsQuery.isError", "reportQuery.isFetching"]) expect(panel).toContain(guard);
    expect(panel).toContain("if (!exportAllowed || !report) return;"); expect(panel).toContain("buildFeedPerformanceCsv(report)"); expect(panel).toContain('disabled={!exportAllowed}');
  });
});
