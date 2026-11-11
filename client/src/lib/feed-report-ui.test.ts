import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  FeedCoverage, FeedDailyDetail, FeedDailySource, FeedFcr, FeedPerformanceReport,
  FeedReportRow, FeedTotals,
} from "@shared/feed-report";
import type { HarvestEventResult, HarvestResultSourceRecord } from "@shared/harvest-report";
import { FeedDetailView, FeedReportView } from "../components/FeedReport";

// Hand-authored synthetic display fixtures only: no engine, business records, API, auth or environment access.
function totals(patch: Partial<FeedTotals> = {}): FeedTotals {
  return { kg: 73.125, stages: { starter: 21, grower: 0, finisher: null, unspecified: 52.125 }, validRecords: 3, validDays: 3, expectedDays: 4, partial: true, issues: ["Synthetic missing day; known-only feed."], ...patch };
}
function coverage(patch: Partial<FeedCoverage> = {}): FeedCoverage {
  return { expectedDays: 4, recordedDays: 3, validFeedDays: 3, validMortalityDays: 2, feedRecords: 3, zeroFeedRecords: 1, missingFeedDays: 1, complete: false, issues: ["Synthetic incomplete mortality coverage."], ...patch };
}
function fcr(patch: Partial<FeedFcr> = {}): FeedFcr {
  return {
    value: null, eligible: false, status: "N/A — incomplete coverage", basis: "output plus estimated remaining live mass",
    endpoint: "2026-11-08", closureDate: null, cumulativeFeedKg: 159.875, cumulativeDeaths: 2, loadedBirds: 20, loadedKg: 40,
    remainingBirds: 78, weightKg: null, weightDate: null, estimatedRemainingKg: null, biomassKg: null,
    coverage: coverage(), reasons: ["Synthetic missing endpoint measurement.", "Synthetic missing calendar-day feed/mortality coverage."], ...patch,
  };
}
function dailySource(patch: Partial<FeedDailySource> = {}): FeedDailySource {
  return { id: 101, flockId: 10, recordDate: "2026-11-01", dayNumber: 0, feedConsumed: "21.0000", feedType: "starter", mortality: "0", averageWeight: "0.5000", ...patch };
}
function daily(patch: Partial<FeedDailyDetail> = {}): FeedDailyDetail {
  return { id: 101, date: "2026-11-01", dayNumber: 0, stage: "starter", feedKg: 21, mortality: 0, weightKg: 0.5, eligible: true, inPeriod: false, inCumulative: true, inFcr: true, issues: [], sourceVersions: [dailySource()], ...patch };
}
function harvestSource(patch: Partial<HarvestResultSourceRecord> = {}): HarvestResultSourceRecord {
  return { id: 701, flockId: 10, harvestDate: "2026-11-06", chickenCountLoaded: "20", totalLoadedWeightKg: "40.000", chickenCountDelivered: null, totalDeliveredWeightKg: null, transportMortalities: 0, ...patch };
}
function harvest(patch: Partial<HarvestEventResult> = {}): HarvestEventResult {
  return {
    id: 701, date: "2026-11-06", inPeriod: true, eligible: true, classification: "Compatible completed catch", sessionIds: [901],
    loadedBirds: 20, loadedKg: 40, averageLoadedKg: 2, deliveredBirds: null, deliveredKg: null, averageDeliveredKg: null,
    massLossKg: null, massLossPct: null, transportMortality: 0, issues: [], sourceVersions: [harvestSource()], ...patch,
  };
}
function row(patch: Partial<FeedReportRow> = {}): FeedReportRow {
  return {
    flockId: 10, flockNumber: "SYNTHETIC F-10", houseId: 3, houseName: "Synthetic House", placementDate: "2026-11-01", currentStatus: "active",
    initialBirds: 100, periodFeed: totals(), cumulativeFeed: totals({ kg: 159.875, validRecords: 7, validDays: 7, expectedDays: 8 }),
    latestWeightKg: 1.875, latestWeightDate: "2026-11-05", fcr: fcr(),
    dailyRecords: [daily(), daily({ id: 102, date: "2026-11-02", dayNumber: 1, stage: "grower", feedKg: 0, inPeriod: true, sourceVersions: [dailySource({ id: 102, recordDate: "2026-11-02", dayNumber: 1, feedConsumed: 0, feedType: "grower" })] })],
    harvestRecords: [harvest()], catchExceptions: [], issues: ["Synthetic current-source warning."], ...patch,
  };
}
function report(selected = row(), patch: Partial<FeedPerformanceReport> = {}): FeedPerformanceReport {
  return {
    kind: "feed-performance", generatedAt: "2026-11-08T22:05:00.000Z", timezone: "Africa/Johannesburg",
    filters: { startDate: "2026-11-02", endDate: "2026-11-08", houseId: null, flockId: null }, rows: [selected],
    summary: { flockCount: 1, qualifyingFlocks: 0, periodFeed: selected.periodFeed, cumulativeFeed: selected.cumulativeFeed, fcr: null, fcrFeedKg: null, biomassKg: null, issues: ["Synthetic full-cohort ratio incomplete."] },
    notes: ["Synthetic report note; no business evidence."], ...patch,
  };
}
const render = (snapshot = report(), onSelectFlock = vi.fn()) => renderToStaticMarkup(React.createElement(FeedReportView, { report: snapshot, onSelectFlock }));
const detail = (selected = row()) => renderToStaticMarkup(React.createElement(FeedDetailView, { row: selected }));
const numberSpan = (value: number, digits = 0) => `class="tabular-nums">${value.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>`;
function body(html: string, caption: string): string {
  const result = html.match(new RegExp(`<caption[^>]*>${caption}</caption>[\\s\\S]*?<tbody[^>]*>([\\s\\S]*?)</tbody>`));
  if (!result) throw new Error(`Missing table: ${caption}`);
  return result[1];
}
function sourceRow(html: string, caption: string, id: number): string {
  const found = body(html, caption).split("</tr>").find(part => part.includes(`>#${id}<`));
  if (!found) throw new Error(`Missing source #${id}`);
  return found;
}
const dailyCaption = "Chronological recorded daily feed and mortality";
const harvestCaption = "Chronological canonical harvest loaded-output sources";
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function findButton(node: React.ReactNode): React.ReactElement<{ onClick: () => void }> | undefined {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void; "aria-label"?: string }>(child)) continue;
    if (child.props["aria-label"] === "View details for SYNTHETIC F-10 (flock #10)") return child as React.ReactElement<{ onClick: () => void }>;
    const found = findButton(child.props.children);
    if (found) return found;
  }
}

describe("Feed applied snapshot UI-only SSR", () => {
  it("shows applied scopes, filter IDs, company-zone AM/PM and separate UTC reference", () => {
    const snapshot = report();
    snapshot.filters.houseId = 3; snapshot.filters.flockId = 10;
    const html = render(snapshot);
    for (const text of ["2026-11-02 (S) → 2026-11-08 (E)", "Period feed S…E", "cumulative recorded feed placement…E", "FCR feed placement…Q", "House ID: 3 · Flock ID: 10", "Generated Nov 9, 2026 at 12:05 AM SAST", "UTC reference: Nov 8, 2026 at 10:05 PM UTC", "Company timezone: Africa/Johannesburg"]) expect(html).toContain(text);
    snapshot.filters.startDate = null;
    expect(render(snapshot)).toContain("Available beginning (S)");
  });
  it("uses existing formatter safeguards instead of guessing ambiguous timestamps or company zones", () => {
    expect(render(report(row(), { generatedAt: "2026-11-08 22:05:00" }))).toContain("Generated Timestamp unavailable");
    expect(render(report(row(), { timezone: "Invalid/Zone" }))).toContain("Generated Timezone unavailable");
    expect(render(report(row(), { generatedAt: "2026-11-08T22:00:00+02:00" }))).toContain("Generated Nov 8, 2026 at 10:00 PM SAST");
  });
  it("labels the approved formula provisionally with capture/movement limitations and no performance score", () => {
    for (const html of [render(), detail()]) {
      for (const text of ["Harvest-adjusted recorded-feed FCR", "provisional — recorded-balance basis", "F / (M + R × W)", "R = initial birds − D − L", "Not net biomass-gain FCR, verified physical stock", "Unknown culls, transfers and additions are not assumed zero", "existing defaults do not establish deliberate zero capture", "Orders, purchases and deliveries are not feed consumption", "Unknown stages remain Unspecified", "Transport deaths are not deducted again"]) expect(html).toContain(text);
      expect(html).not.toMatch(/Good FCR|Bad FCR|Best flock|Performance score|text-green|bg-green|text-emerald/i);
    }
  });
  it("keeps period, cumulative-E and FCR-Q feed values separate and renders supplied ratio without calculating it", () => {
    const selected = row({ fcr: fcr({ value: 1.23456, eligible: true, cumulativeFeedKg: 120.125, reasons: [] }) });
    const snapshot = report(selected);
    snapshot.summary = { ...snapshot.summary, qualifyingFlocks: 1, fcr: 7.89123, fcrFeedKg: 456.25, biomassKg: 789.125 };
    const html = render(snapshot);
    for (const span of [numberSpan(73.125, 2), numberSpan(159.875, 2), numberSpan(120.125, 2), numberSpan(1.23456, 3), numberSpan(7.89123, 3), numberSpan(456.25, 2), numberSpan(789.125, 2)]) expect(html).toContain(span);
    expect(html).toContain("never an average of flock FCRs");
    expect(html).toContain("summed unrounded qualifying feed ÷ summed unrounded biomass");
  });
  it("requires every selected flock for a group ratio while showing explicit qualifying n/N and named subtotals", () => {
    const snapshot = report();
    snapshot.summary = { ...snapshot.summary, flockCount: 2, qualifyingFlocks: 1, fcr: 7.89123, fcrFeedKg: 456.25, biomassKg: 789.125 };
    const html = render(snapshot);
    expect(html).toContain("Qualifying FCR coverage: 1 / 2 flocks");
    expect(html).toContain("N/A / incomplete — every selected flock must qualify");
    expect(html).not.toContain(numberSpan(7.89123, 3));
    expect(html).toContain(numberSpan(456.25, 2));
    expect(html).toContain("Qualifying subtotals do not establish a full-cohort ratio");
  });
  it("shows endpoint Q, closure T and completed-cycle values without requiring a remaining sample", () => {
    const selected = row({ currentStatus: "completed", fcr: fcr({ value: 1.574, eligible: true, endpoint: "2026-11-06", closureDate: "2026-11-06", remainingBirds: 0, weightKg: null, weightDate: null, cumulativeFeedKg: 120.125, loadedKg: 76.25, reasons: [] }) });
    for (const html of [render(report(selected)), detail(selected)]) {
      expect(html).toContain("Calculation endpoint Q: 2026-11-06");
      expect(html).toContain("Final-harvest closure T: 2026-11-06");
      expect(html).toContain("Completed-cycle endpoint within selected as-of E");
      expect(html).toContain("Full harvest needs no remaining-stock sample");
      expect(html).toContain(numberSpan(1.574, 3));
    }
    expect(detail(selected)).toContain("No endpoint weight candidate supplied, or not required when R = 0");
  });
  it("keeps post-closure blockers visible and does not display a supplied ineligible ratio", () => {
    const selected = row({ fcr: fcr({ value: 1.574, eligible: false, closureDate: "2026-11-06", endpoint: "2026-11-06", reasons: ["Reconcile post-closure positive feed through E."] }) });
    for (const html of [render(report(selected)), detail(selected)]) {
      expect(html).toContain("Reconcile post-closure positive feed through E.");
      expect(html).not.toContain(numberSpan(1.574, 3));
      expect(html).toContain("current completed status alone is not closure proof");
    }
  });
  it("keeps old measurements dated, refuses current-endpoint extrapolation, and explains same-partial-harvest-day N/A", () => {
    const html = render();
    expect(html).toContain("Latest measurement date: 2026-11-05");
    expect(html).toContain(numberSpan(1.875, 3));
    expect(html).toContain("Synthetic missing endpoint measurement.");
    expect(html).toContain("Same-day partial harvest and weighing have no recorded ordering: N/A");
    expect(html).toContain("Older samples are dated observations, not today’s weight");
    expect(html).toContain("no carrying forward or growth extrapolation");
    expect(detail()).toContain("Endpoint weight candidate measurement date: N/A");
    const historical = detail(row({ fcr: fcr({ weightKg: 1.875, weightDate: "2026-11-05" }) }));
    expect(historical).toContain("Endpoint weight candidate measurement date: 2026-11-05");
    expect(historical).toContain("A supplied candidate does not certify endpoint qualification");
    expect(historical).not.toContain("W — qualifying endpoint sample");
  });
  it("shows stages with recorded zero distinct from unavailable stage totals and missing days", () => {
    const html = render();
    for (const stage of ["Starter (kg)", "Grower (kg)", "Finisher (kg)", "Unspecified (kg)"]) expect(html).toContain(stage);
    expect(html).toContain(numberSpan(0, 2));
    expect(html).toContain("No valid recorded feed for this stage; not confirmed zero");
    expect(html).toContain("3 valid records · 3 valid dates / 4 calendar days");
    expect(html).toContain("Known-only / partial recorded feed");
    expect(html).toContain("Valid feed days: 3 · Valid mortality days: 2 · Missing feed days: 1");
    expect(html).toContain("Incomplete or unresolved daily coverage — FCR unavailable");
  });
  it("does not convert no-record subtotals to zero even if uncovered supplied fields are zero", () => {
    const none = totals({ kg: 0, stages: { starter: 0, grower: 0, finisher: 0, unspecified: 0 }, validRecords: 0, validDays: 0 });
    const selected = row({ periodFeed: none, cumulativeFeed: none });
    const html = render(report(selected));
    expect(html).toContain("No valid recorded consumption in this scope; missing capture is not zero");
    expect(html).not.toContain(numberSpan(0, 2));
    expect(html).not.toContain(numberSpan(0, 3));
  });
  it.each([0, -1])("does not present a supplied %s ratio as a successful FCR", value => {
    const selected = row({ fcr: fcr({ value, eligible: true, reasons: [] }) });
    const snapshot = report(selected);
    snapshot.summary = { ...snapshot.summary, qualifyingFlocks: 1, fcr: value };
    for (const html of [render(snapshot), detail(selected)]) {
      expect(html).not.toContain(numberSpan(value, 3));
      expect(html).toContain("No qualifying positive recorded-feed / biomass ratio");
    }
  });
  it("makes an empty cohort and empty details unknown rather than inventing activity rows", () => {
    const selected = row({ dailyRecords: [], harvestRecords: [], catchExceptions: [] });
    const snapshot = report(selected, { rows: [] });
    snapshot.summary = { ...snapshot.summary, flockCount: 0, qualifyingFlocks: 0, fcr: 0 };
    const html = render(snapshot);
    expect(html).toContain("No matching flocks placed on or before E");
    expect(html).toContain("An empty cohort does not confirm zero feed consumption");
    expect(html).toContain("Empty cohort; no ratio or zero activity is inferred");
    expect(html).not.toContain("<table");
    expect(html).not.toContain(numberSpan(0, 3));
    const emptyDetail = detail(selected);
    expect(emptyDetail).toContain("No dated daily records; no zero feed or mortality is inferred");
    expect(emptyDetail).toContain("No dated harvest sources supplied");
    expect(emptyDetail).toContain("No catch exceptions supplied");
    expect(emptyDetail).not.toContain("<table");
  });
  it("shows nullable metadata, measurement, endpoint and coverage safely as N/A", () => {
    const selected = row({ houseId: null, placementDate: null, latestWeightKg: null, latestWeightDate: null, fcr: fcr({ endpoint: null, coverage: coverage({ expectedDays: null, missingFeedDays: null }) }) });
    for (const html of [render(report(selected)), detail(selected)]) {
      for (const text of ["House N/A — not linked", "N/A — placement not recorded", "Latest measurement date: N/A", "Calculation endpoint Q: N/A", "Final-harvest closure T: N/A", "N/A — calendar scope unavailable", "Missing feed days: N/A — unknown"]) expect(html).toContain(text);
      expect(html).not.toMatch(/House #null|NaN|Infinity/);
    }
  });
  it("never displays non-finite supplied metrics as numeric values", () => {
    const selected = row({ latestWeightKg: Infinity, periodFeed: totals({ kg: NaN }), fcr: fcr({ eligible: true, value: Infinity, biomassKg: -Infinity, cumulativeFeedKg: NaN }) });
    for (const html of [render(report(selected)), detail(selected)]) { expect(html).toContain("N/A"); expect(html).not.toMatch(/NaN|Infinity/); }
  });
  it("offers accessible details next to flock name and passes the identical row only on selection", () => {
    const snapshot = report(); const onSelect = vi.fn();
    const html = render(snapshot, onSelect);
    expect(html).toMatch(/<span>SYNTHETIC F-10<\/span><button[\s\S]*?>View details<\/button>/);
    expect(html).toContain('aria-label="View details for SYNTHETIC F-10 (flock #10)"');
    expect(html).toContain('type="button"');
    expect(onSelect).not.toHaveBeenCalled();
    const button = findButton(FeedReportView({ report: snapshot, onSelectFlock: onSelect }));
    expect(button).toBeDefined(); button!.props.onClick();
    expect(onSelect).toHaveBeenCalledTimes(1); expect(onSelect.mock.calls[0][0]).toBe(snapshot.rows[0]);
  });
  it("is a read-only snapshot with accessible scroll tables, no forms, mutations, routing or CSV ownership", () => {
    for (const html of [render(), detail()]) {
      expect(html).not.toMatch(/<input|<form|<select|<textarea|href=|Download CSV|Export CSV|Save changes|Delete record|Edit record/i);
      expect(html).toContain("overflow-x-auto"); expect(html).toContain("min-w-max");
      expect(html).toContain('tabindex="0" role="region" aria-label=');
      expect(html).toContain('<caption class="sr-only">'); expect(html).toContain('scope="col"'); expect(html).toContain('scope="row"');
      expect(html).toContain("Current status: active");
    }
  });
});

describe("Feed source details UI-only SSR", () => {
  it("consumes dated engine order ascending date then ID, without mutating arrays, before undated review", () => {
    const selected = row({ dailyRecords: [
      daily({ id: 109, date: null, eligible: false, issues: ["Undated review only."] }),
      daily({ id: 101, date: "2026-11-01" }), daily({ id: 102, date: "2026-11-01" }), daily({ id: 103, date: "2026-11-02" }),
    ], harvestRecords: [harvest({ id: 709, date: null }), harvest({ id: 701, date: "2026-11-04" }), harvest({ id: 702, date: "2026-11-04" }), harvest({ id: 703, date: "2026-11-06" })] });
    const before = JSON.stringify(selected); freeze(selected);
    const html = detail(selected); render(report(selected));
    expect(JSON.stringify(selected)).toBe(before);
    const dated = body(html, dailyCaption); const loaded = body(html, harvestCaption);
    expect(dated.indexOf(">#101<")).toBeLessThan(dated.indexOf(">#102<"));
    expect(dated.indexOf(">#102<")).toBeLessThan(dated.indexOf(">#103<"));
    expect(loaded.indexOf(">#701<")).toBeLessThan(loaded.indexOf(">#702<"));
    expect(loaded.indexOf(">#702<")).toBeLessThan(loaded.indexOf(">#703<"));
    expect(dated).not.toContain(">#109<"); expect(loaded).not.toContain(">#709<");
    expect(html.indexOf(dailyCaption)).toBeLessThan(html.indexOf("Undated daily records — review only"));
    expect(html.indexOf(harvestCaption)).toBeLessThan(html.indexOf("Undated harvest records — review only"));
    expect(body(html, "Undated daily records — review only")).toContain(">#109<");
    expect(body(html, "Undated harvest records — review only")).toContain(">#709<");
  });
  it("shows eligible recorded feed/deaths and independent contribution flags, including before-period evidence", () => {
    const html = detail(); const earlier = sourceRow(html, dailyCaption, 101); const zero = sourceRow(html, dailyCaption, 102);
    expect(earlier).toContain(numberSpan(21, 2)); expect(earlier).toContain(numberSpan(0));
    expect(earlier).toContain("Period S…E: No"); expect(earlier).toContain("Cumulative placement…E: Yes"); expect(earlier).toContain("FCR placement…Q: Yes");
    expect(zero).toContain("Period S…E: Yes"); expect(zero).toContain("Stored zero feed"); expect(zero).toContain("Stored zero deaths");
    expect(html).toContain("No missing dates are filled");
  });
  it("keeps excluded conflicting raw source versions visible without choosing or contributing either version", () => {
    const selected = row({ dailyRecords: [daily({ eligible: false, feedKg: 98765, mortality: 87654, weightKg: 76543, inPeriod: true, inCumulative: true, inFcr: true,
      issues: ["Conflicting same-ID versions; no arbitrary winner.", "Synthetic later warning remains visible."],
      sourceVersions: [dailySource({ feedConsumed: "-4.5000", feedType: "Mystery stage", mortality: "invalid deaths", averageWeight: "bad weight" }), dailySource({ flockId: 11, recordDate: "2026-11-02", dayNumber: 1, feedConsumed: "3.141590", mortality: null })],
    })] });
    const html = detail(selected); const reviewed = sourceRow(html, dailyCaption, 101);
    for (const value of [98765, 87654, 76543]) expect(reviewed).not.toContain(numberSpan(value, value === 87654 ? 0 : value === 76543 ? 3 : 2));
    for (const text of ["Excluded — not a contributor", "Period S…E: No", "Cumulative placement…E: No", "FCR placement…Q: No", "-4.5000", "Mystery stage", "invalid deaths", "bad weight", "3.141590", "Version 1", "Version 2", "Conflicting same-ID versions", "Synthetic later warning remains visible"]) expect(reviewed).toContain(text);
    for (const text of ["Original daily ID (id)", "Original flock ID (flockId)", "Raw operational date (recordDate)", "Raw day number (dayNumber)", "Raw recorded feed (feedConsumed, kg)", "Raw feed stage (feedType)", "Raw mortality (mortality, birds)", "Raw sampled mean (averageWeight, kg/bird)"]) expect(html).toContain(text);
  });
  it("defensively excludes undated daily values despite contradictory flags, preserving originals", () => {
    const html = detail(row({ dailyRecords: [daily({ date: null, eligible: true, inPeriod: true, feedKg: 98765, sourceVersions: [dailySource({ recordDate: null, feedConsumed: "98765" })] })] }));
    const reviewed = body(html, "Undated daily records — review only");
    expect(reviewed).toContain("Excluded — not a contributor"); expect(reviewed).toContain("FCR placement…Q: No");
    expect(reviewed).not.toContain(numberSpan(98765, 2)); expect(reviewed).toContain('data-source-type="string"'); expect(reviewed).toContain(">98765</span>");
  });
  it("preserves raw zero, null, blank, whitespace and text precision distinctly", () => {
    const selected = row({ dailyRecords: [daily({ sourceVersions: [dailySource({ feedConsumed: 0, mortality: null, feedType: "", averageWeight: "   " }), dailySource({ feedConsumed: "21.000000" })] })] });
    const html = detail(selected);
    for (const text of ['data-source-type="number"', ">0</span>", "N/A — not recorded (null)", "Empty string — not recorded", "Whitespace-only string — not recorded", 'class="whitespace-pre-wrap">   </span>', ">21.000000</span>"]) expect(html).toContain(text);
  });
  it("requires both positive loaded values on the same event, never pairing independent field sums", () => {
    const html = detail(row({ harvestRecords: [harvest({ id: 701, loadedBirds: 20, loadedKg: null }), harvest({ id: 702, loadedBirds: null, loadedKg: 40 })] }));
    for (const id of [701, 702]) {
      const reviewed = sourceRow(html, harvestCaption, id);
      expect(reviewed).toContain("Excluded from FCR loaded-output contributions");
      expect(reviewed).not.toContain(numberSpan(20)); expect(reviewed).not.toContain(numberSpan(40, 2));
      expect(reviewed).toContain("raw values remain visible");
    }
    expect(html).toContain("values from different events are never paired");
  });
  it("uses cumulative-Q paired events before S and ignores delivery-only gaps, with catch provenance not added", () => {
    const html = detail(row({ harvestRecords: [harvest({ date: "2026-11-01", inPeriod: false, sourceVersions: [harvestSource({ harvestDate: "2026-11-01" })] })] }));
    const reviewed = sourceRow(html, harvestCaption, 701);
    expect(reviewed).toContain(numberSpan(20)); expect(reviewed).toContain(numberSpan(40, 2));
    expect(reviewed).toContain("Eligible paired FCR loaded-output source");
    expect(reviewed).not.toContain("Period S…E");
    expect(reviewed).toContain("#901"); expect(reviewed).toContain("Catch links are provenance, not additional harvest quantities");
    expect(html).toContain("delivery-only gaps do not block this loaded-output basis");
  });
  it("preserves accepted unlinked classification and rejects post-Q, undated, ineligible and nonpositive pair contributions", () => {
    const selected = row({ fcr: fcr({ endpoint: "2026-11-05" }), harvestRecords: [
      harvest({ id: 701, date: "2026-11-04", sessionIds: [], classification: "Recorded harvest — completion status unavailable", issues: ["Synthetic unlinked uniqueness warning."] }),
      harvest({ id: 702, date: "2026-11-06" }), harvest({ id: 703, eligible: false, date: "2026-11-04" }),
      harvest({ id: 704, date: "2026-11-04", loadedBirds: 0 }), harvest({ id: 705, date: "2026-11-04", loadedBirds: 0.5 }),
      harvest({ id: 706, date: "2026-11-04", loadedKg: 0 }), harvest({ id: 709, date: null }),
    ] });
    const html = detail(selected); const accepted = sourceRow(html, harvestCaption, 701);
    expect(accepted).toContain("Eligible paired FCR loaded-output source"); expect(accepted).toContain("Recorded harvest — completion status unavailable"); expect(accepted).toContain("Synthetic unlinked uniqueness warning");
    for (const id of [702, 703, 704, 705, 706]) expect(sourceRow(html, harvestCaption, id)).toContain("Excluded from FCR loaded-output contributions");
    expect(body(html, "Undated harvest records — review only")).toContain("Excluded from FCR loaded-output contributions");
  });
  it("preserves all raw harvest fields and catch exception versions with reasons and no quantity fallback", () => {
    const selected = row({ harvestRecords: [harvest({ eligible: false, issues: ["Synthetic conflicting harvest."], sourceVersions: [harvestSource({ totalLoadedWeightKg: "-4.5000" }), harvestSource({ flockId: 11, chickenCountDelivered: "999", totalDeliveredWeightKg: "777.000" })] })],
      catchExceptions: [{ sessionId: 801, harvestRecordId: null, date: "2026-11-05", reason: "Synthetic completed catch has no valid harvest link.", sourceVersions: [
        { id: 801, flockId: 10, catchDate: "2026-11-05", harvestRecordId: null, status: "completed" },
        { id: 801, flockId: 11, catchDate: null, harvestRecordId: 999, status: "in_progress" },
      ] }],
    });
    const html = detail(selected);
    for (const text of ["chickenCountLoaded", "totalLoadedWeightKg, kg", "chickenCountDelivered", "totalDeliveredWeightKg, kg", "transportMortalities, birds", "-4.5000", "777.000", "Catch reconciliation exceptions — not additional harvests", "Synthetic completed catch has no valid harvest link", "Original session ID (id)", "Original flock ID (flockId)", "Raw catch date (catchDate)", "Original harvest link (harvestRecordId)", "Raw session status (status)", "in_progress", "Exceptions never contribute quantities", "not recency or an arbitrary winner", "originals are never independently added to totals"]) expect(html).toContain(text);
    const catches = body(html, "Catch reconciliation provenance and original versions");
    expect(catches).toContain("#801"); expect(catches).toContain("N/A — no valid harvest link"); expect(catches).toContain(">999</span>");
  });
  it("shows unavailable raw evidence explicitly without synthesizing versions", () => {
    const html = detail(row({ dailyRecords: [daily({ sourceVersions: [] })], harvestRecords: [harvest({ sourceVersions: [] })] }));
    expect(html).toContain("Original source versions — raw review evidence (0)");
    expect(html).toContain("No original source versions supplied; traceability unavailable");
    expect(html).not.toContain("Version 1");
  });
  it("safely escapes malicious metadata, raw values and warnings as plain text", () => {
    const attack = '<script>alert("synthetic")</script><img src=x onerror=alert(1)>';
    const selected = row({ houseName: attack, flockNumber: attack, issues: [attack], dailyRecords: [daily({ issues: [attack], sourceVersions: [dailySource({ feedConsumed: attack, feedType: attack })] })] });
    for (const html of [render(report(selected)), detail(selected)]) {
      expect(html).toContain("&lt;script&gt;"); expect(html).toContain("&lt;img");
      expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src=x");
    }
  });
});
