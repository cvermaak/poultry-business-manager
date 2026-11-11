import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MortalityReport, MortalityReportRow, MortalityReportSummary } from "@shared/mortality-report";
import { MortalityDetailView, MortalityReportView } from "../components/MortalityReport";

function makeRow(patch: Partial<MortalityReportRow> = {}): MortalityReportRow {
  return {
    flockId: 10, flockNumber: "F-10", houseId: 3, houseName: "House A", placementDate: "2026-10-01", currentStatus: "completed",
    initialBirds: 100, periodDeaths: 0, periodMortalityPct: 0, cumulativeDeaths: 2, cumulativeMortalityPct: 2,
    recordedDays: 2, periodRecordedDays: 1, calendarDaysInPeriod: 10, unrecordedDaysInPeriod: 9,
    periodSummaryEligible: true, cumulativeSummaryEligible: true,
    issues: ["Missing daily capture is unknown, not confirmed zero.", "Duplicate operational date: review recorded mortality."],
    trend: [
      { date: "2026-10-29", recordIds: [501], recordedDeaths: 2, cumulativeDeaths: 2, cumulativeMortalityPct: 2, inPeriod: false, issues: [] },
      { date: "2026-11-05", recordIds: [502, 503], recordedDeaths: 0, cumulativeDeaths: 2, cumulativeMortalityPct: 2, inPeriod: true, issues: ["Duplicate operational date; both captured IDs reviewed."] },
    ],
    dailyRecords: [
      { id: 501, date: "2026-10-29", dayNumber: 29, rawMortality: "2", deaths: 2, cumulativeDeaths: 2, eligible: true, inPeriod: false, issues: [] },
      { id: 502, date: "2026-11-05", dayNumber: 36, rawMortality: "0", deaths: 0, cumulativeDeaths: 2, eligible: true, inPeriod: true, issues: ["Duplicate operational date."] },
      { id: 503, date: "2026-11-05", dayNumber: 36, rawMortality: 0, deaths: 0, cumulativeDeaths: 2, eligible: true, inPeriod: true, issues: [] },
      { id: 504, date: null, dayNumber: 0, rawMortality: "unknown", deaths: null, cumulativeDeaths: null, eligible: false, inPeriod: false, issues: ["Undated record excluded from mortality."] },
      { id: 505, date: "2026-09-30", dayNumber: -1, rawMortality: "4", deaths: 4, cumulativeDeaths: null, eligible: false, inPeriod: false, issues: ["Before placement; excluded."] },
      { id: 506, date: "2026-11-06", dayNumber: 37, rawMortality: "-1", deaths: null, cumulativeDeaths: null, eligible: false, inPeriod: true, issues: ["Negative mortality is invalid; excluded."] },
    ],
    ...patch,
  };
}

function makeReport(rowPatch: Partial<MortalityReportRow> = {}, summaryPatch: Partial<MortalityReportSummary> = {}): MortalityReport {
  return {
    kind: "mortality", generatedAt: "2026-11-08T20:00:00Z", timezone: "Africa/Johannesburg",
    filters: { startDate: "2026-10-30", endDate: "2026-11-08", houseId: null, flockId: null },
    rows: [makeRow(rowPatch)],
    summary: { flockCount: 1, periodEligibleFlockCount: 1, cumulativeEligibleFlockCount: 1, initialBirds: 100, periodDeaths: 0, periodMortalityPct: 0, cumulativeDeaths: 2, cumulativeMortalityPct: 2, issues: ["Recorded-only totals; incomplete daily capture."], ...summaryPatch },
    notes: ["Each eligible source ID contributes once. Excluded records remain available for review."],
  };
}

const render = (report = makeReport(), onSelectFlock?: (row: MortalityReportRow) => void) => renderToStaticMarkup(React.createElement(MortalityReportView, { report, onSelectFlock }));
const detail = (row = makeRow()) => renderToStaticMarkup(React.createElement(MortalityDetailView, { row }));
const formatted = (value: number, digits = 0) => value.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits });
function tableBody(html: string, caption: string): string {
  const result = html.match(new RegExp(`<caption[^>]*>${caption}</caption>[\\s\\S]*?<tbody[^>]*>([\\s\\S]*?)</tbody>`));
  if (!result) throw new Error(`Missing table: ${caption}`);
  return result[1];
}
const rawBody = (html: string) => tableBody(html, "Reviewed raw daily mortality records and eligibility");
const trendBody = (html: string) => tableBody(html, "Captured-date mortality trend and reviewed record IDs");
function rawRecord(html: string, id: number): string {
  const result = rawBody(html).match(new RegExp(`<tr><th[^>]*>#${id}</th>([\\s\\S]*?)</tr>`));
  if (!result) throw new Error(`Missing raw record ${id}`);
  return result[1];
}

const originalTimezone = process.env.TZ;
afterEach(() => { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; });

describe("Mortality applied snapshot SSR", () => {
  it("shows the inclusive applied period, cumulative end scope, and applied IDs", () => {
    const report = makeReport(); report.filters.houseId = 3; report.filters.flockId = 10;
    const html = render(report);
    expect(html).toContain("Period (inclusive): 2026-10-30 → 2026-11-08 (E)");
    expect(html).toContain("Cumulative scope: placement through E");
    expect(html).toContain("House ID: 3 · Flock ID: 10");
    expect(html).toContain('aria-label="Applied Mortality results"');
  });
  it("labels an open period start explicitly rather than inventing a date", () => {
    const report = makeReport(); report.filters.startDate = null;
    expect(render(report)).toContain("Period (inclusive): Available beginning → 2026-11-08");
  });
  it("labels current metadata, placement, and status without claiming historical status", () => {
    const html = render(makeReport({ houseName: "Corrected house", flockNumber: "Corrected F-10", currentStatus: "completed" }));
    expect(html).toContain("Corrected house");
    expect(html).toContain("Corrected F-10");
    expect(html).toContain("2026-10-01");
    expect(html).toContain("Current status: completed");
    expect(html).toContain("current recorded metadata, not historical snapshots");
    expect(html).toContain("today’s corrected source records");
    expect(html).not.toContain("Status at E: completed");
  });
  it.each(["UTC", "America/Los_Angeles", "Pacific/Auckland"])("uses company-zone 12-hour generated time independently of host zone %s", zone => {
    process.env.TZ = zone;
    const report = makeReport(); report.generatedAt = "2026-11-08T22:05:00Z";
    const html = render(report);
    expect(html).toContain("Nov 9, 2026 at 12:05 AM SAST");
    expect(html).toContain("Company timezone: Africa/Johannesburg");
    expect(html).toContain("2026-10-30 → 2026-11-08");
    expect(detail()).toContain("2026-11-05");
    expect(detail()).not.toContain("Nov 5");
  });
  it("does not convert an explicit timestamp offset twice", () => {
    const report = makeReport(); report.generatedAt = "2026-11-08T22:00:00+02:00";
    expect(render(report)).toContain("Nov 8, 2026 at 10:00 PM SAST");
  });
  it("shows ambiguous timestamps and invalid zones as unavailable", () => {
    const report = makeReport(); report.generatedAt = "2026-11-08 20:00:00";
    expect(render(report)).toContain("Generated Timestamp unavailable");
    report.generatedAt = "2026-11-08T20:00:00Z"; report.timezone = "Not/AZone";
    expect(render(report)).toContain("Generated Timezone unavailable");
  });
  it("labels both ratios as percent of initial and explains denominators, not bird-days", () => {
    const html = render();
    for (const label of ["Recorded period deaths (birds)", "Period mortality (% of initial)", "Recorded cumulative deaths through E (birds)", "Cumulative mortality (% of initial)", "Initial birds (birds)"]) expect(html).toContain(label);
    expect(html).toContain("Period mortality = recorded period deaths ÷ initial birds × 100");
    expect(html).toContain("cumulative mortality = recorded deaths from placement through E ÷ initial birds × 100");
    expect(html).toContain("Neither rate uses opening live birds or bird-days as its denominator");
    expect(html).toContain("not an average of flock percentages");
  });
  it("renders supplied ratios rather than recomputing or clamping them in the client", () => {
    const html = render(makeReport({ periodMortalityPct: 6.25, cumulativeMortalityPct: 125 }, { periodMortalityPct: 6.25, cumulativeMortalityPct: 125 }));
    expect(html).toContain(`class="tabular-nums">${formatted(6.25, 2)}</span>`);
    expect(html).toContain(`class="tabular-nums">${formatted(125, 2)}</span>`);
  });
  it("gives explicit reasons for all null counts and ratios instead of defaulting to zero", () => {
    const missing = { initialBirds: null, periodDeaths: null, periodMortalityPct: null, cumulativeDeaths: null, cumulativeMortalityPct: null };
    const html = render(makeReport(missing, missing));
    expect(html).toContain("N/A");
    expect(html).toContain("No valid positive placement count");
    expect(html).toContain("Period recorded mortality unavailable");
    expect(html).toContain("Cumulative recorded mortality unavailable");
    expect(html).toContain("positive initial-bird denominator");
    expect(html).toContain("No valid/comparable whole-cohort total");
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).not.toContain('class="tabular-nums">0</span>');
  });
  it("guards non-finite metric values without displaying NaN or Infinity", () => {
    const html = render(makeReport({ periodDeaths: NaN, periodMortalityPct: Infinity, cumulativeDeaths: -Infinity }, { cumulativeMortalityPct: NaN }));
    expect(html).toContain("N/A");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("keeps recorded zero visible and distinct from unknown mortality", () => {
    const html = render(makeReport({ periodDeaths: 0, periodMortalityPct: 0, cumulativeDeaths: null, cumulativeMortalityPct: null }));
    expect(html).toContain('class="tabular-nums">0</span>');
    expect(html).toContain(`class="tabular-nums">${formatted(0, 2)}</span>`);
    expect(html).toContain("Cumulative recorded mortality unavailable");
    expect(html).toContain("Gaps remain unknown, not zero");
  });
  it("separates period and cumulative cohort eligibility and never hides a partial subtotal", () => {
    const html = render(makeReport({ periodSummaryEligible: true, cumulativeSummaryEligible: false }, { flockCount: 2, periodEligibleFlockCount: 2, cumulativeEligibleFlockCount: 1, cumulativeDeaths: null, cumulativeMortalityPct: null }));
    expect(html).toContain("Period cohort coverage: 2 / 2 eligible flocks");
    expect(html).toContain("Cumulative cohort coverage: 1 / 2 eligible flocks");
    expect(html).toContain("Period summary: Eligible, subject to capture caveats");
    expect(html).toContain("Cumulative summary: Excluded — see issues");
    expect(html).toContain("not a hidden eligible-only subtotal");
    expect(html).toContain("A partial subtotal is not shown");
  });
  it("exposes calendar coverage, capture warnings, and report notes without certification", () => {
    const html = render();
    expect(html).toContain("Period: 1 recorded / 10 calendar days in scope · 9 without a record");
    expect(html).toContain("Through E: 2 recorded days");
    expect(html).toContain("recorded totals, not a complete count of losses");
    expect(html).toContain("Recorded-only totals; incomplete daily capture");
    expect(html).toContain("Each eligible source ID contributes once");
    expect(html).not.toMatch(/text-green|bg-green|text-emerald|bg-emerald|certified zero|Best flock/i);
  });
  it("does not present unavailable calendar coverage as zero missing days", () => {
    const html = render(makeReport({ calendarDaysInPeriod: null, unrecordedDaysInPeriod: null, placementDate: null }));
    expect(html).toContain("N/A — calendar scope unavailable");
    expect(html).toContain("N/A — missing-day coverage unknown");
    expect(html).toContain("N/A — placement not recorded");
    expect(html).not.toContain("0 without a record");
  });
  it("makes an empty cohort no matching flocks, not successful zero mortality", () => {
    const report = makeReport({}, { flockCount: 0, periodEligibleFlockCount: 0, cumulativeEligibleFlockCount: 0, initialBirds: null, periodDeaths: null, periodMortalityPct: null, cumulativeDeaths: null, cumulativeMortalityPct: null });
    report.rows = [];
    const html = render(report);
    expect(html).toContain("No matching flocks placed on or before E");
    expect(html).toContain("An empty cohort does not confirm zero mortality");
    expect(html).toContain("No matching flocks; no mortality total or rate is inferred");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('class="tabular-nums">0</span>');
  });
  it("keeps main comparison IDs and accessible details buttons beside flock names, with no dead links or CSV ownership", () => {
    const html = render(makeReport(), () => {});
    expect(html).toContain("House #3 · Flock #10");
    expect(html).toContain('aria-label="View details for F-10 (flock #10)"');
    expect(html).toContain('type="button"');
    expect(html).toMatch(/<span>F-10<\/span><button[\s\S]*?>View details<\/button>/);
    expect(html).not.toContain("href=");
    expect(html).not.toMatch(/Download CSV|Export CSV|\.csv/);
  });
  it("does not offer an inert details control when the parent supplies no callback", () => {
    expect(render()).not.toContain("<button");
    expect(render()).not.toContain("View details</button>");
  });
  it("invokes the parent callback with the exact snapshot row only when the details action is called", () => {
    const report = makeReport(); const onSelect = vi.fn();
    render(report, onSelect);
    expect(onSelect).not.toHaveBeenCalled();
    const tree = MortalityReportView({ report, onSelectFlock: onSelect });
    function findButton(node: React.ReactNode): React.ReactElement<{ onClick: () => void; "aria-label": string }> | undefined {
      for (const child of React.Children.toArray(node)) {
        if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void; "aria-label"?: string }>(child)) continue;
        if (child.props["aria-label"] === "View details for F-10 (flock #10)") return child as React.ReactElement<{ onClick: () => void; "aria-label": string }>;
        const found = findButton(child.props.children); if (found) return found;
      }
    }
    const button = findButton(tree); expect(button).toBeDefined(); button!.props.onClick();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(report.rows[0]);
    expect(onSelect.mock.calls[0][0]).toBe(report.rows[0]);
  });
  it("keeps all wide tables keyboard-accessible and horizontally scrollable, with responsive summaries", () => {
    const html = render();
    expect(html).toContain("sm:flex-row");
    expect(html).toContain("sm:grid-cols-2");
    for (const output of [html, detail()]) {
      expect(output).toContain("overflow-x-auto");
      expect(output).toContain("min-w-max");
      expect(output).toContain('tabindex="0" role="region" aria-label=');
      expect(output).toContain('<caption class="sr-only">');
      expect(output).toContain('scope="col"');
      expect(output).toContain('scope="row"');
    }
    expect(detail().match(/role="region"/g)).toHaveLength(2);
  });
});

describe("Mortality detail SSR traceability", () => {
  it("shows actual captured trend dates and grouped IDs without fabricated missing dates", () => {
    const html = detail(); const body = trendBody(html);
    expect(body.match(/<tr>/g)).toHaveLength(2);
    expect(body).toContain("2026-10-29"); expect(body).toContain("2026-11-05");
    expect(body).toContain("#501"); expect(body).toContain("#502, #503");
    expect(body).not.toContain("2026-11-04"); expect(body).not.toContain("#504"); expect(body).not.toContain("#505");
    expect(html).toContain("Missing dates are not filled with zero");
    expect(html).toContain("Cumulative values run from placement through each captured date");
    expect(html).toContain("Duplicate operational date; both captured IDs reviewed");
  });
  it("shows daily deaths, cumulative deaths and percentages with explicit units and visible recorded zero", () => {
    const html = detail();
    expect(html).toContain("Recorded deaths (birds)");
    expect(html).toContain("Recorded cumulative deaths (birds)");
    expect(html).toContain("Cumulative mortality (% of initial)");
    expect(trendBody(html)).toContain("Recorded zero deaths");
    expect(trendBody(html)).toContain(`class="tabular-nums">${formatted(2, 2)}</span>`);
    expect(rawRecord(html, 502)).toContain("Recorded zero deaths");
  });
  it("renders null trend values as unavailable with reasons rather than zero interpolation", () => {
    const row = makeRow(); row.trend[0] = { ...row.trend[0], recordedDeaths: null, cumulativeDeaths: null, cumulativeMortalityPct: null, issues: ["Missing mortality; cumulative unavailable."] };
    const first = trendBody(detail(row)).split("</tr>")[0];
    expect(first).toContain("Captured mortality is missing or invalid; not confirmed zero");
    expect(first).toContain("Cumulative recorded mortality unavailable");
    expect(first).toContain("positive initial-bird denominator");
    expect(first).toContain("Missing mortality; cumulative unavailable");
    expect(first).not.toContain('class="tabular-nums">0</span>');
  });
  it("keeps raw records separate, preserving IDs, operational dates, raw values, day numbers and validated counts", () => {
    const html = detail();
    for (const id of [501, 502, 503, 504, 505, 506]) expect(rawBody(html)).toContain(`#${id}`);
    expect(html).toContain("Raw mortality"); expect(html).toContain("Validated count (birds)");
    expect(rawRecord(html, 501)).toContain(">2</span>");
    expect(rawRecord(html, 502)).toContain(">0</span>");
    expect(rawRecord(html, 506)).toContain(">-1</span>");
    expect(rawRecord(html, 506)).toContain("no validated count");
    expect(rawRecord(html, 505)).toContain("<td>-1</td>");
    expect(html).toContain("Raw mortality is preserved as recorded, separately from the validated count");
  });
  it("does not describe excluded, undated, pre-placement or invalid raw rows as contributors", () => {
    const html = detail();
    for (const id of [504, 505, 506]) {
      const record = rawRecord(html, id);
      expect(record).toContain("Excluded — not a contributor");
      expect(record).toContain("Excluded or undated record; not a cumulative contributor");
      expect(record).not.toContain("Eligible for recorded cumulative mortality");
    }
    expect(rawRecord(html, 504)).toContain("N/A — undated or invalid operational date");
    expect(rawRecord(html, 504)).toContain("N/A — undated record; excluded");
    expect(rawRecord(html, 505)).toContain("Before placement; excluded");
    expect(rawRecord(html, 506)).toContain("Dated inside selected period; excluded");
    expect(html).toContain("Being dated inside the period alone does not make a record eligible");
  });
  it("defensively refuses a supplied cumulative value for an undated review item", () => {
    const row = makeRow(); row.dailyRecords[3] = { ...row.dailyRecords[3], eligible: true, inPeriod: true, cumulativeDeaths: 999 };
    const record = rawRecord(detail(row), 504);
    expect(record).toContain("Excluded — not a contributor");
    expect(record).toContain("N/A — undated record; excluded");
    expect(record).not.toContain("999");
  });
  it("does not certify all IDs in a captured-date group as eligible contributions", () => {
    const row = makeRow(); row.trend.push({ date: "2026-11-06", recordIds: [506], recordedDeaths: null, cumulativeDeaths: null, cumulativeMortalityPct: null, inPeriod: true, issues: ["Invalid recorded mortality; date total unavailable."] });
    const html = detail(row);
    expect(trendBody(html)).toContain("#506");
    expect(trendBody(html)).toContain("Invalid recorded mortality; date total unavailable");
    expect(html).toContain("An ID in a date group does not certify contribution eligibility");
    expect(rawRecord(html, 506)).toContain("Excluded — not a contributor");
    expect(html).not.toContain("contributing record IDs");
  });
  it("retains conflicting versions with the same source ID as distinct excluded raw review rows", () => {
    const base = makeRow().dailyRecords[0];
    const row = makeRow({ dailyRecords: [
      { ...base, rawMortality: "7", deaths: 7, eligible: false, cumulativeDeaths: null, issues: ["Conflicting source versions; excluded."] },
      { ...base, rawMortality: "9", deaths: 9, eligible: false, cumulativeDeaths: null, issues: ["Conflicting source versions; excluded."] },
    ] });
    const body = rawBody(detail(row));
    expect(body.match(/#501<\/th>/g)).toHaveLength(2);
    expect(body).toContain(">7</span>"); expect(body).toContain(">9</span>");
    expect(body.match(/Excluded — not a contributor/g)).toHaveLength(2);
  });
  it("explains valid pre-period dates support cumulative scope without period contribution", () => {
    const html = detail();
    expect(rawRecord(html, 501)).toContain("Eligible for recorded cumulative mortality");
    expect(rawRecord(html, 501)).toContain("Outside selected period — cumulative scope only");
    expect(trendBody(html)).toContain("Outside selected period — cumulative scope only");
    expect(rawRecord(html, 502)).toContain("Inside selected period");
  });
  it("preserves missing and empty raw mortality distinctly from recorded zero", () => {
    const row = makeRow(); row.dailyRecords[0].rawMortality = null; row.dailyRecords[1].rawMortality = "";
    const html = detail(row);
    expect(rawRecord(html, 501)).toContain("N/A — mortality not recorded");
    expect(rawRecord(html, 502)).toContain("Empty value — mortality not recorded");
    expect(rawRecord(html, 503)).toContain(">0</span>");
  });
  it("makes absent trend and raw data unknown rather than generating zero-death rows", () => {
    const html = detail(makeRow({ dailyRecords: [], trend: [], recordedDays: 0, periodRecordedDays: 0 }));
    expect(html).toContain("No captured dates in cumulative scope for the trend. This does not confirm zero deaths");
    expect(html).toContain("No reviewed raw daily records. Missing capture remains unknown");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Recorded zero deaths</p>");
  });
  it("shows all detail issues, not just the comparison preview", () => {
    const row = makeRow({ issues: ["Issue one", "Issue two", "Issue three", "Issue four"] });
    expect(render(makeReport(row))).toContain("1 more issues in source details");
    expect(detail(row)).toContain("Issue four");
  });
  it("keeps injection-like formulas and markup as escaped React text, not executable HTML or spreadsheet exports", () => {
    const dangerous = '=HYPERLINK("javascript:alert(1)","<script>alert(1)</script>")';
    const row = makeRow({ flockNumber: dangerous, houseName: "<img src=x onerror=alert(1)>", currentStatus: "<svg onload=alert(1)>" });
    row.dailyRecords[0].rawMortality = dangerous; row.dailyRecords[0].issues = ["<script>bad()</script>"];
    const report = makeReport(row); report.notes = [dangerous]; report.summary.issues = ["<img src=x onerror=alert(1)>"];
    const main = render(report, () => {}); const raw = detail(row);
    for (const html of [main, raw]) {
      expect(html).toContain("=HYPERLINK(&quot;");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img");
      expect(html).not.toMatch(/<script|<img|<svg|href=|dangerouslySetInnerHTML|Download CSV/i);
    }
    expect(rawRecord(raw, 501)).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("does not infer diagnosis, cause categories, combined cull/transport losses, forecasts or green certification", () => {
    const html = render();
    expect(html).toContain("Daily mortality is not merged with culls or transport deaths");
    expect(html).toContain("Causes of death and forecasts are not inferred");
    expect(html).not.toMatch(/Diagnosis:|Cause:|Forecast mortality|Culls \+ transport|text-green|bg-green|text-emerald|Mortality certified/i);
    expect(detail()).not.toContain("href=");
  });
});
