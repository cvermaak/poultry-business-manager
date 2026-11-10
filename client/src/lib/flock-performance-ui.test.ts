import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FlockPerformanceReport, FlockPerformanceRow, ProductionReportOptions } from "@shared/production-reports";
import { FlockPerformanceDetailView, FlockPerformanceReportView } from "../components/FlockPerformanceReport";
import { canExportFlockPerformance, changeFlockPerformanceHouse, defaultFlockPerformanceDraft, flockPerformanceInput, sameFlockPerformanceFilters, validateFlockPerformanceDraft } from "./flock-performance-ui";

const options: ProductionReportOptions = {
  timezone: "Africa/Johannesburg", today: "2026-11-08",
  houses: [{ id: 1, name: "House A", houseNumber: "1" }, { id: 2, name: "House B", houseNumber: "2" }],
  flocks: [{ id: 10, flockNumber: "F-10", houseId: 1, placementDate: "2026-10-01", status: "completed" }],
};
const row: FlockPerformanceRow = {
  flockId: 10, flockNumber: "F-10", houseId: 1, houseName: "House A", placementDate: "2026-10-01", currentStatus: "completed",
  initialBirds: 100, elapsedDays: 38, periodDeaths: 0, cumulativeDeaths: 2, cumulativeMortalityPct: 2,
  loadedBirds: 90, remainingBirds: 8, latestWeightKg: 1.9, latestWeightDate: "2026-11-05", weightAgeDays: 3, weightOutsidePeriod: false,
  observedGrowthGPerBirdDay: -20, growthStartDate: "2026-10-31", growthEndDate: "2026-11-05", growthStartWeightKg: 2, growthEndWeightKg: 1.9,
  recordedDays: 2, periodRecordedDays: 1, expectedPeriodDays: 10, missingPeriodDays: 9, summaryEligible: true,
  issues: ["Missing daily capture is unknown, not confirmed zero.", "Observed sample-mean change is negative."],
  dailyRecords: [{ id: 501, date: "2026-11-05", dayNumber: 35, mortality: 0, weightKg: 1.9, inPeriod: true, issues: ["Duplicate daily date: inspect source rows."] }],
  harvestRecords: [{ id: 601, date: "2026-11-06", loadedBirds: 90, eligible: false, classification: "Linked catch not completed", sessionIds: [701], issues: ["Harvest reconciliation required."] }],
  catchExceptions: [{ sessionId: 702, harvestRecordId: 602, date: "2026-11-07", reason: "Catch/flock mismatch; do not guess a link." }],
};
function report(patch: Partial<FlockPerformanceRow> = {}): FlockPerformanceReport {
  return {
    kind: "flock-performance", generatedAt: "2026-11-08T20:00:00Z", timezone: options.timezone,
    filters: { startDate: "2026-10-30", endDate: "2026-11-08", houseId: null, flockId: null }, rows: [{ ...row, ...patch }],
    summary: { flockCount: 1, eligibleFlockCount: 1, excludedFlockCount: 0, initialBirds: 100, periodDeaths: 0, cumulativeDeaths: 2, cumulativeMortalityPct: 2, loadedBirds: 90, remainingBirds: 8, issues: ["Recorded-only totals; incomplete daily capture."] },
    notes: ["Each source ID contributes once."],
  };
}
const render = (value = report(), interactive = false) => renderToStaticMarkup(React.createElement(FlockPerformanceReportView, { report: value, onSelectFlock: interactive ? () => {} : undefined }));

describe("actual Flock Performance snapshot renderer", () => {
  it("labels period, as-of scope, current status and elapsed days without inventing final age", () => {
    const html = render();
    expect(html).toContain("Period (inclusive): 2026-10-30 → 2026-11-08");
    expect(html).toContain("Snapshot: placement through E");
    expect(html).toContain("Current status: completed");
    expect(html).toContain("Days since placement at E (days)");
    expect(html).toContain("not final slaughter age");
    expect(html).toContain("38");
    expect(html).not.toContain("Final slaughter age (days)");
  });
  it("uses company-time generated instant in 12-hour format and preserves operational sample dates", () => {
    const html = render(report({ weightOutsidePeriod: true }));
    expect(html).toContain("Nov 8, 2026 at 10:00 PM SAST");
    expect(html).toContain("Measured 2026-11-05");
    expect(html).toContain("Sample age at E: 3 days");
    expect(html).toContain("Outside selected period");
    expect(html).toContain("2026-10-31 → 2026-11-05");
  });
  it("preserves negative observed growth and warns rather than clamping or ranking", () => {
    const html = render();
    expect(html).toContain((-20).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(html).toContain("Negative observed sample-mean change; not clamped");
    expect(html).toContain("g/bird/day");
    expect(html).not.toContain("Best flock");
    expect(html).not.toContain("FCR");
  });
  it("renders unavailable values as N/A with reasons rather than zero or NaN", () => {
    const html = render(report({ initialBirds: null, elapsedDays: null, periodDeaths: null, cumulativeDeaths: null, cumulativeMortalityPct: null, remainingBirds: null, loadedBirds: null, latestWeightKg: null, latestWeightDate: null, observedGrowthGPerBirdDay: null }));
    expect(html).toContain("N/A");
    expect(html).toContain("No valid positive placement count");
    expect(html).toContain("Recorded balance unavailable / reconciliation required");
    expect(html).toContain("Requires two valid sample dates within the period");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("shows validity/coverage, recorded zero, exclusions and movement limitations without a green certification", () => {
    const value = report({ summaryEligible: false });
    value.summary = { ...value.summary, eligibleFlockCount: 0, excludedFlockCount: 1, initialBirds: null, periodDeaths: null, cumulativeDeaths: null, cumulativeMortalityPct: null, loadedBirds: null, remainingBirds: null };
    const html = render(value);
    expect(html).toContain("0 eligible for summary · 1 excluded");
    expect(html).toContain("entire selected cohort");
    expect(html).toContain("not a hidden partial subtotal");
    expect(html).toContain("1 recorded / 10 calendar days in scope · 9 without a record");
    expect(html).toContain("Excluded — see issues");
    expect(html).toContain('class="tabular-nums">0</span>');
    expect(html).toContain("Unrecorded culls, transfers and placement additions are not assumed zero");
    expect(html).toContain("today’s corrected source records");
    expect(html).toContain("not historical snapshots");
    expect(html).not.toMatch(/text-green|bg-green|text-emerald|certified zero/i);
  });
  it("shows an empty cohort as no matching flocks, not successful zero activity", () => {
    const value = report(); value.rows = []; value.summary = { ...value.summary, flockCount: 0, eligibleFlockCount: 0, initialBirds: null, periodDeaths: null, cumulativeDeaths: null, cumulativeMortalityPct: null, loadedBirds: null, remainingBirds: null };
    expect(render(value)).toContain("No matching flocks placed on or before E");
    expect(render(value)).toContain("No activity is inferred");
  });
  it("offers a View button rather than links to missing report or operational routes", () => {
    const html = render(report(), true);
    expect(html).toContain('aria-label="View contributing records for F-10"');
    expect(html).toContain(">View details</button>");
    expect(html).not.toContain("href=");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain('scope="col"');
  });
  it("exposes stable daily/harvest/catch IDs, recorded values, eligibility and reconciliation issues", () => {
    const html = renderToStaticMarkup(React.createElement(FlockPerformanceDetailView, { row }));
    for (const id of [501, 601, 701, 702, 602]) expect(html).toContain(`#${id}`);
    for (const date of ["2026-11-05", "2026-11-06", "2026-11-07"]) expect(html).toContain(date);
    expect(html).toContain("Sampled mean (kg/bird)");
    expect(html).toContain((1.9).toLocaleString("en-ZA", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
    expect(html).toContain("Inside selected period");
    expect(html).toContain("Duplicate daily date");
    expect(html).toContain("Excluded — reconciliation required");
    expect(html).toContain("Catch/flock mismatch; do not guess a link");
    expect(html).not.toContain("href=");
  });
  it("keeps missing source sections explicit rather than fabricating rows", () => {
    const html = renderToStaticMarkup(React.createElement(FlockPerformanceDetailView, { row: { ...row, dailyRecords: [], harvestRecords: [], catchExceptions: [] } }));
    expect(html).toContain("No contributing daily records. This does not confirm zero deaths");
    expect(html).toContain("unrecorded movements remain unknown");
    expect(html).toContain("historical uniqueness is not certified");
  });
});

describe("draft/applied filter and export rules", () => {
  const draft = defaultFlockPerformanceDraft(options.today);
  it("starts from available beginning and company today, not client local today", () => {
    expect(draft).toEqual({ startDate: "", endDate: options.today, houseId: "", flockId: "" });
    expect(flockPerformanceInput(draft)).toEqual({ startDate: undefined, endDate: options.today, houseId: undefined, flockId: undefined });
    expect(validateFlockPerformanceDraft(draft, options)).toBeNull();
  });
  it("validates real inclusive dates, reversed ranges and identifiers", () => {
    expect(validateFlockPerformanceDraft({ ...draft, startDate: "2026-11-08" }, options)).toBeNull();
    expect(validateFlockPerformanceDraft({ ...draft, startDate: "2026-11-09" }, options)).toMatch(/before/);
    expect(validateFlockPerformanceDraft({ ...draft, endDate: "2026-02-30" }, options)).toMatch(/valid/);
    expect(validateFlockPerformanceDraft({ ...draft, houseId: "2", flockId: "10" }, options)).toMatch(/does not belong/);
    expect(validateFlockPerformanceDraft({ ...draft, houseId: "99" }, options)).toMatch(/available house/);
    expect(validateFlockPerformanceDraft({ ...draft, flockId: "99" }, options)).toMatch(/available flock/);
  });
  it("clears incompatible flock on house change, keeping a compatible one", () => {
    const selected = { ...draft, houseId: "1", flockId: "10" };
    expect(changeFlockPerformanceHouse(selected, "2", options).flockId).toBe("");
    expect(changeFlockPerformanceHouse(selected, "1", options).flockId).toBe("10");
    expect(changeFlockPerformanceHouse(selected, "", options).flockId).toBe("10");
    expect(sameFlockPerformanceFilters(selected, { ...selected })).toBe(true);
    expect(sameFlockPerformanceFilters(selected, draft)).toBe(false);
  });
  it("never enables a stale, pending, failed, dirty or unauthorized export", () => {
    const ready = { authorized: true, hasReport: true, fetching: false, error: false, dirty: false };
    expect(canExportFlockPerformance(ready)).toBe(true);
    for (const blocker of [{ authorized: false }, { hasReport: false }, { fetching: true }, { error: true }, { dirty: true }]) expect(canExportFlockPerformance({ ...ready, ...blocker })).toBe(false);
  });
});

const mocks = vi.hoisted(() => ({ auth: { user: { id: 1, role: "admin" } as { id: number; role: string } | null, loading: false }, options: vi.fn(), report: vi.fn() }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/trpc", () => ({ trpc: { productionReports: { options: { useQuery: mocks.options }, flockPerformance: { useQuery: mocks.report } } } }));
import Reports from "../pages/Reports";

describe("page auth boundary (SSR, no API or browser)", () => {
  beforeEach(() => {
    mocks.auth = { user: { id: 1, role: "admin" }, loading: false };
    mocks.options.mockReset().mockReturnValue({ data: options, isError: false, isFetching: false });
    mocks.report.mockReset().mockReturnValue({ data: undefined, isError: false, isFetching: false });
  });
  it.each(["sales_staff", "production_worker", "chicken_house_operator", "unknown"])("does not even mount data queries for denied role %s", role => {
    mocks.auth.user!.role = role;
    const html = renderToStaticMarkup(React.createElement(Reports));
    expect(html).toContain("Access denied");
    expect(mocks.options).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    expect(html).not.toContain("Download CSV");
  });
  it("does not request data while auth is loading, or with no user", () => {
    mocks.auth.loading = true;
    expect(renderToStaticMarkup(React.createElement(Reports))).toContain("Checking report access");
    mocks.auth.loading = false; mocks.auth.user = null;
    expect(renderToStaticMarkup(React.createElement(Reports))).toContain("Access denied");
    expect(mocks.options).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it.each(["admin", "farm_manager", "accountant"])("enables only options until company dates are initialized for %s", role => {
    mocks.auth.user!.role = role;
    const html = renderToStaticMarkup(React.createElement(Reports));
    expect(mocks.options.mock.calls[0][1].enabled).toBe(true);
    expect(mocks.report.mock.calls[0][1].enabled).toBe(false);
    expect(html).toContain("Production Reports");
    expect(html).toContain("Flock Performance");
    expect(html).toContain('role="tab"');
    expect(html).toContain("Mortality");
    expect(html).toContain("Harvest Results");
    expect(html).toContain("Feed Performance/FCR");
    expect(html).not.toContain("planned later—not implemented");
    expect(html).not.toContain("href=");
  });
});
