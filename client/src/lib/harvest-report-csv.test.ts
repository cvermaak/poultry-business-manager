import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHarvestCsv } from "./harvest-report-csv";
import type { HarvestMetrics, HarvestReport } from "@shared/harvest-report";

function metrics(): HarvestMetrics {
  return { reviewedEventCount: 1, eligibleEventCount: 1, excludedEventCount: 0, loadedBirds: 100, loadedKg: 200, averageLoadedKg: 2,
    deliveredBirds: 90, deliveredKg: 180, averageDeliveredKg: 2, massLossKg: 20, massLossPct: 10, transportMortality: 3,
    coverage: { loadedBirdEvents: 1, loadedKgEvents: 1, loadedAveragePairs: 1, deliveredBirdEvents: 1, deliveredKgEvents: 1, deliveredAveragePairs: 1, massLossPairs: 1, transportMortalityEvents: 1 }, issues: [] };
}
function fixture(): HarvestReport {
  return { kind: "harvest-results", generatedAt: "2026-11-08T22:30:00.000Z", timezone: "Africa/Johannesburg",
    filters: { startDate: "2026-11-02", endDate: "2026-11-03", houseId: 2, flockId: 1 }, summary: { ...metrics(), flockCount: 1, catchExceptionCount: 1 },
    notes: ["Actual captured delivery only; no planning estimates."], rows: [{ flockId: 1, flockNumber: "TEST-F1", houseId: 2, houseName: "TEST HOUSE", placementDate: "2026-11-01", currentStatus: "active", metrics: metrics(), issues: [],
      events: [{ id: 101, date: "2026-11-03", inPeriod: true, eligible: true, classification: "Recorded harvest — completion status unavailable", sessionIds: [],
        loadedBirds: 100, loadedKg: 200, averageLoadedKg: 2, deliveredBirds: 90, deliveredKg: 180, averageDeliveredKg: 2, massLossKg: 20, massLossPct: 10, transportMortality: 3, issues: [],
        sourceVersions: [{ id: 101, flockId: 1, harvestDate: "2026-11-03", chickenCountLoaded: 100, totalLoadedWeightKg: "200.000", chickenCountDelivered: 90, totalDeliveredWeightKg: "180.000", transportMortalities: 3 }] }],
      catchExceptions: [{ sessionId: 77, harvestRecordId: null, date: "2026-11-03", reason: "Completed catch has no harvest link", sourceVersions: [{ id: 77, flockId: 1, catchDate: "2026-11-03", harvestRecordId: null, status: "completed" }] }] }] };
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
function objects(r = fixture()) { const [headers, ...rows] = parse(buildHarvestCsv(r)); return rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]]))); }
describe("Harvest Results same-snapshot CSV", () => {
  it("produces BOM UTF-8/CRLF and aligned summary/flock/event/raw/exception rows", () => {
    const text = buildHarvestCsv(fixture()); const rows = parse(text);
    expect(text.startsWith("\uFEFF")).toBe(true); expect(text.endsWith("\r\n")).toBe(true);
    expect(new Set(rows.map(row => row.length)).size).toBe(1);
    expect(rows.slice(1).map(row => row[0])).toEqual(["summary", "flock", "event", "raw-harvest-source", "catch-exception", "raw-catch-source"]);
  });
  it("uses the exact snapshot metrics and paired coverage", () => {
    for (const r of objects().slice(0, 2)) {
      expect(r["Recorded loaded birds"]).toBe("100"); expect(r["Recorded loaded kg"]).toBe("200");
      expect(r["Paired average loaded kg/bird"]).toBe("2"); expect(r["Mass loss paired events"]).toBe("1");
      expect(r["Eligible event count"]).toBe("1"); expect(r["Paired recorded mass loss %"]).toBe("10");
    }
  });
  it("does not infer transport deaths from the loaded-delivered bird difference", () => {
    expect(objects()[2]["Recorded transport mortality (default-zero caveat)"]).toBe("3");
  });
  it("repeats applied filter/calendar/generated-at provenance on every row", () => {
    for (const r of objects()) { expect(r["Generated at (UTC)"]).toBe("2026-11-08T22:30:00.000Z"); expect(r["Display timezone"]).toBe("Africa/Johannesburg"); expect(r["Period end (inclusive)"]).toBe("2026-11-03"); expect(r["House filter ID"]).toBe("2"); expect(r["Flock filter ID"]).toBe("1"); }
  });
  it("does not replace unavailable captured delivery with loaded quantities", () => {
    const f = fixture(); const e = f.rows[0].events[0]; e.deliveredBirds = null; e.deliveredKg = null; e.averageDeliveredKg = null; e.massLossKg = null; e.massLossPct = null;
    const r = objects(f)[2]; for (const k of ["Captured delivered birds", "Captured delivered kg", "Paired average delivered kg/bird", "Paired recorded mass loss kg"]) expect(r[k]).toBe(""); expect(r["Recorded loaded kg"]).toBe("200");
  });
  it("keeps raw source versions distinct without quantities on provenance/exception rows", () => {
    const rows = objects(); const raw = rows[3];
    expect(raw["Raw harvest ID"]).toBe("101"); expect(raw["Raw loaded kg"]).toBe("200.000"); expect(raw["Recorded loaded kg"]).toBe("");
    expect(rows[4]["Catch exception session ID"]).toBe("77"); expect(rows[5]["Raw catch current status"]).toBe("completed");
    for (const r of rows.slice(4)) expect(r["Recorded loaded birds"]).toBe("");
  });
  it("preserves every conflicting original harvest version for review", () => {
    const f = fixture(); const e = f.rows[0].events[0]; e.eligible = false; e.classification = "Excluded — conflicting source"; e.issues = ["Source conflict"];
    e.sourceVersions.push({ ...e.sourceVersions[0], chickenCountLoaded: 999, totalLoadedWeightKg: "-2.000" });
    const raw = objects(f).filter(r => r["Row type"] === "raw-harvest-source");
    expect(raw.map(r => r["Raw loaded birds"])).toEqual(["100", "999"]); expect(raw[1]["Raw loaded kg"]).toBe("'-2.000");
    expect(raw.every(r => r["Event contribution eligible"] === "no")).toBe(true);
  });
  it.each(["excluded", "undated", "outside-period"])("masks %s event metrics while retaining original source values", state => {
    const f = fixture(); const e = f.rows[0].events[0];
    if (state === "excluded") e.eligible = false;
    if (state === "undated") e.date = null;
    if (state === "outside-period") e.inPeriod = false;
    const rows = objects(f); const event = rows[2]; const raw = rows[3];
    expect(event["Event contribution eligible"]).toBe("no");
    for (const k of ["Recorded loaded birds", "Recorded loaded kg", "Paired average loaded kg/bird", "Captured delivered birds", "Captured delivered kg", "Paired recorded mass loss kg", "Recorded transport mortality (default-zero caveat)"]) expect(event[k]).toBe("");
    expect(raw["Raw loaded birds"]).toBe("100"); expect(raw["Raw loaded kg"]).toBe("200.000");
  });
  it("preserves negative observed mass loss as a number, not a formula or a clamp", () => { const f = fixture(); f.rows[0].events[0].massLossKg = -1.5; expect(objects(f)[2]["Paired recorded mass loss kg"]).toBe("-1.5"); });
  it("keeps captured transport zero as zero and its default caveat in the heading", () => { const f = fixture(); f.rows[0].events[0].transportMortality = 0; expect(objects(f)[2]["Recorded transport mortality (default-zero caveat)"]).toBe("0"); });
  it("preserves numerical precision rather than exporting display-rounded strings", () => { const f = fixture(); f.rows[0].metrics.averageLoadedKg = 1 / 3; expect(objects(f)[1]["Paired average loaded kg/bird"]).toBe(String(1 / 3)); });
  it("retains null values and explicit partial coverage/reasons", () => { const f = fixture(); f.rows[0].metrics.deliveredKg = null; f.rows[0].metrics.coverage.deliveredKgEvents = 0; f.rows[0].metrics.issues = ["Partial captured delivery"]; const r = objects(f)[1]; expect(r["Captured delivered kg"]).toBe(""); expect(r["Delivered kg event coverage"]).toBe("0"); expect(r["Data-quality warnings"]).toContain("Partial captured delivery"); });
  it.each(["=1+1", "+SUM(A1)", "-formula", "@SUM(A1)", "\t=1+1", "\r=1+1"])("neutralizes spreadsheet-like names %j", name => { const f = fixture(); f.rows[0].flockNumber = name; expect(objects(f)[1]["Flock"]).toBe("'" + name); });
  it("round-trips Unicode, commas, quotes and embedded newlines", () => { const f = fixture(); f.rows[0].houseName = 'Huis, "Berg"\nKaap'; expect(objects(f)[1]["House"]).toBe(f.rows[0].houseName); });
  it("does not mutate the snapshot or invent sources for an empty cohort", () => { const f = fixture(); const before = JSON.stringify(f); buildHarvestCsv(f); expect(JSON.stringify(f)).toBe(before); f.rows = []; f.summary.flockCount = 0; f.summary.loadedKg = null; expect(objects(f)).toHaveLength(1); expect(objects(f)[0]["Recorded loaded kg"]).toBe(""); });
});
describe("Harvest Results page/export integration", () => {
  const page = () => readFileSync(resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");
  const panel = readFileSync(resolve(process.cwd(), "client/src/components/HarvestReportPanel.tsx"), "utf8");
  it("registers all four implemented reports while preserving accepted tabs", () => { for (const value of ["flock-performance", "mortality", "harvest-results", "feed-performance"]) expect(page()).toContain(`value="${value}"`); expect(page()).not.toContain("planned later—not implemented"); });
  it("mounts the query behind the existing roles and selected-tab boundary", () => { expect(page()).toContain("canReadProductionReports(user.role)"); expect(page()).toContain('activeReport === "harvest-results"'); expect(panel).toContain("trpc.productionReports.harvestResults.useQuery"); expect(panel).toContain("enabled: authorized && !!applied && !!options && !optionsQuery.isError"); expect(panel).not.toMatch(/useMutation|\bfetch\(/); });
  it("blocks stale/loading/error exports and uses the exact returned report", () => { for (const guard of ["validateFlockPerformanceDraft", "changeFlockPerformanceHouse", "canExportFlockPerformance", "dirty", "optionsQuery.isError", "reportQuery.isFetching"]) expect(panel).toContain(guard); expect(panel).toContain("if (!exportAllowed || !report) return;"); expect(panel).toContain("buildHarvestCsv(report)"); expect(panel).toContain('disabled={!exportAllowed}'); });
});
