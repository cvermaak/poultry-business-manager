import { describe, expect, it } from "vitest";
import { buildFlockPerformanceReport } from "../../../server/production-report-engine";
import { buildMortalityReport } from "../../../server/mortality-report-engine";
import { buildHarvestReport } from "../../../server/harvest-report-engine";
import type { FlockPerformanceReport, FlockPerformanceSource, ResolvedFlockPerformanceFilters } from "../../../shared/production-reports";
import type { MortalityReport, MortalityReportSource } from "../../../shared/mortality-report";
import type { HarvestMetrics, HarvestReport, HarvestReportSource } from "../../../shared/harvest-report";
import { buildFlockPerformanceCsv } from "./production-report-csv";
import { buildMortalityCsv } from "./mortality-report-csv";
import { buildHarvestCsv } from "./harvest-report-csv";

const LOCAL = "Generated at (company timezone)";
const UTC = "Generated at (UTC)";
const ZONE = "Display timezone";
const ROLLOVER = "2026-11-08T22:30:00.000Z";
const HOUSE = 'Huis, "Berg"\r\nKaap – unité';
const filters: ResolvedFlockPerformanceFilters = {
  startDate: "2026-11-02", endDate: "2026-11-03", houseId: 2, flockId: 1,
};

function metadata() {
  return {
    houses: [{ id: 2, name: HOUSE, houseNumber: "H2" }],
    flocks: [{ id: 1, flockNumber: "=SYNTHETIC-ONLY", houseId: 2, placementDate: "2026-11-01", status: "active" }],
  };
}
function flockSource(): FlockPerformanceSource {
  const master = metadata();
  return {
    ...master, flocks: master.flocks.map(flock => ({ ...flock, initialCount: 100 })),
    dailyRecords: [
      { id: 11, flockId: 1, recordDate: "2026-11-02", dayNumber: 1, mortality: 3, averageWeight: "1.500" },
      { id: 12, flockId: 1, recordDate: "2026-11-03", dayNumber: 2, mortality: 0, averageWeight: "1.250" },
    ],
    harvests: [{ id: 21, flockId: 1, harvestDate: "2026-11-03", chickenCountLoaded: 20 }], catches: [],
  };
}
function mortalitySource(): MortalityReportSource {
  const source = flockSource();
  return {
    houses: source.houses, flocks: source.flocks,
    dailyRecords: source.dailyRecords.map(({ averageWeight: _weight, ...record }) => record),
  };
}
function harvestSource(): HarvestReportSource {
  return {
    ...metadata(), // Harvest metadata deliberately has no initial bird denominator.
    harvests: [{ id: 21, flockId: 1, harvestDate: "2026-11-03", chickenCountLoaded: 20,
      totalLoadedWeightKg: "40.000", chickenCountDelivered: 18, totalDeliveredWeightKg: "36.000", transportMortalities: 0 }],
    catches: [{ id: 31, flockId: 1, catchDate: "2026-11-03", harvestRecordId: null, status: "completed" }],
  };
}

type Cell = string | number | boolean | null | undefined;
type Report = FlockPerformanceReport | MortalityReport | HarvestReport;

// Frozen legacy column/row mappings transcribed from git revision 1d675ca6.
// This independent reconstruction never imports/executes old TypeScript, shells
// out to git at test time, or uses the current CSV formatter as its baseline.
const flockHeadings = [
  "Report", UTC, ZONE, "Period start (blank = from placement)", "As-of end date",
  "House filter ID", "Flock filter ID", "Flock ID", "Flock", "House ID", "House", "Placement date", "Current status (not historical)",
  "Initial birds", "Elapsed days at end (not final slaughter age)", "Recorded deaths in period", "Recorded deaths through end",
  "Cumulative mortality (% initial birds)", "Eligible loaded birds through end", "Recorded birds remaining (excludes unrecorded culls/transfers)",
  "Latest mean weight (kg/bird)", "Weight measurement date", "Weight age at end (days)", "Weight outside selected period",
  "Observed mean-weight growth (g/bird/day)", "Growth first date", "Growth last date", "Growth first kg/bird", "Growth last kg/bird",
  "Recorded days through end", "Recorded days in period", "Expected calendar days in period", "Unrecorded calendar days in period",
  "Eligible for full summary", "Data-quality warnings", "Reviewed daily source IDs (including excluded/unpositionable)", "Daily source warnings", "Eligible harvest record IDs", "Excluded harvest record IDs",
  "Catch exceptions", "Summary coverage (eligible/selected)", "Report basis notes",
];
const mortalityHeadings = [
  "Row type", "Report", UTC, ZONE, "Period start (blank = placement)", "As-of end date",
  "House filter ID", "Flock filter ID", "Flock ID", "Flock", "House ID", "House", "Placement date", "Current status (not historical)",
  "Initial birds denominator", "Recorded deaths in period", "Period mortality (% initial birds, not opening live birds)",
  "Recorded deaths through end", "Cumulative mortality (% initial birds)", "Recorded days through end", "Recorded days in period",
  "Calendar days in period", "Unrecorded days in period", "Eligible for period summary", "Eligible for cumulative summary",
  "Operational source date", "Reviewed record IDs", "Raw recorded mortality (not necessarily eligible)", "Eligible source deaths",
  "Source eligible", "Inside selected period", "Recorded cumulative deaths on source date", "Cumulative mortality on date (% initial birds)",
  "Selected flock count", "Period eligible flock count", "Cumulative eligible flock count", "Data-quality warnings", "Report basis notes",
  "Recorded day number", "Validated source count (not contribution eligibility)",
];
const harvestHeadings = [
  "Row type", "Report", UTC, ZONE, "Period start (blank = available beginning)", "Period end (inclusive)",
  "House filter ID", "Flock filter ID", "Flock ID", "Flock", "House ID", "House", "Placement date", "Current status (not historical)",
  "Reviewed event count", "Eligible event count", "Excluded event count", "Recorded loaded birds", "Recorded loaded kg",
  "Paired average loaded kg/bird", "Captured delivered birds", "Captured delivered kg", "Paired average delivered kg/bird",
  "Paired recorded mass loss kg", "Paired recorded mass loss %", "Recorded transport mortality (default-zero caveat)",
  "Loaded bird event coverage", "Loaded kg event coverage", "Loaded average paired events", "Delivered bird event coverage",
  "Delivered kg event coverage", "Delivered average paired events", "Mass loss paired events", "Transport mortality event coverage",
  "Harvest event ID", "Harvest operational date", "Inside selected period", "Event contribution eligible", "Source classification", "Linked catch session IDs",
  "Catch exception session ID", "Catch exception harvest link ID", "Catch exception date", "Catch exception reason", "Catch exception rows", "Selected flock count",
  "Raw source version", "Raw harvest ID", "Raw harvest flock ID", "Raw harvest date", "Raw loaded birds", "Raw loaded kg",
  "Raw delivered birds", "Raw delivered kg", "Raw transport mortality", "Raw catch ID", "Raw catch flock ID", "Raw catch date", "Raw catch harvest link ID", "Raw catch current status",
  "Data-quality warnings", "Report basis notes",
] as const;

function legacyCell(value: Cell): string {
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) return '""';
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? '"yes"' : '"no"';
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function legacyTable(headings: readonly string[], rows: Cell[][], unquotedHeader = false): string {
  const header = unquotedHeader ? headings.join(",") : headings.map(legacyCell).join(",");
  return "\uFEFF" + [header, ...rows.map(row => row.map(legacyCell).join(","))].join("\r\n") + "\r\n";
}
function legacyFlockCsv(report: FlockPerformanceReport): string {
  return legacyTable(flockHeadings, report.rows.map(row => [
    "Flock Performance", report.generatedAt, report.timezone, report.filters.startDate, report.filters.endDate,
    report.filters.houseId, report.filters.flockId, row.flockId, row.flockNumber, row.houseId, row.houseName, row.placementDate, row.currentStatus,
    row.initialBirds, row.elapsedDays, row.periodDeaths, row.cumulativeDeaths, row.cumulativeMortalityPct, row.loadedBirds, row.remainingBirds,
    row.latestWeightKg, row.latestWeightDate, row.weightAgeDays, row.weightOutsidePeriod,
    row.observedGrowthGPerBirdDay, row.growthStartDate, row.growthEndDate, row.growthStartWeightKg, row.growthEndWeightKg,
    row.recordedDays, row.periodRecordedDays, row.expectedPeriodDays, row.missingPeriodDays, row.summaryEligible, row.issues.join("; "),
    row.dailyRecords.map(r => r.id).join("; "), row.dailyRecords.filter(r => r.issues.length).map(r => `Record ${r.id} (${r.date ?? "undated"}): ${r.issues.join("; ")}`).join(" | "),
    row.harvestRecords.filter(r => r.eligible).map(r => r.id).join("; "), row.harvestRecords.filter(r => !r.eligible).map(r => r.id).join("; "),
    row.catchExceptions.map(r => `Session ${r.sessionId}: ${r.reason}`).join("; "),
    `${report.summary.eligibleFlockCount}/${report.summary.flockCount}`, report.notes.join("; "),
  ]));
}
function legacyMortalityCsv(report: MortalityReport): string {
  const metadata: Cell[] = ["Mortality", report.generatedAt, report.timezone, report.filters.startDate, report.filters.endDate, report.filters.houseId, report.filters.flockId];
  const coverage: Cell[] = [report.summary.flockCount, report.summary.periodEligibleFlockCount, report.summary.cumulativeEligibleFlockCount];
  const notes = report.notes.join("; ");
  const s = report.summary;
  const rows: Cell[][] = [["summary", ...metadata, null, null, null, null, null, null,
    s.initialBirds, s.periodDeaths, s.periodMortalityPct, s.cumulativeDeaths, s.cumulativeMortalityPct,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    ...coverage, s.issues.join("; "), notes]];
  for (const r of report.rows) {
    const identity: Cell[] = [r.flockId, r.flockNumber, r.houseId, r.houseName, r.placementDate, r.currentStatus];
    rows.push(["flock", ...metadata, ...identity, r.initialBirds, r.periodDeaths, r.periodMortalityPct, r.cumulativeDeaths, r.cumulativeMortalityPct,
      r.recordedDays, r.periodRecordedDays, r.calendarDaysInPeriod, r.unrecordedDaysInPeriod, r.periodSummaryEligible, r.cumulativeSummaryEligible,
      null, r.dailyRecords.map(d => d.id).join("; "), null, null, null, null, null, null, ...coverage, r.issues.join("; "), notes]);
    for (const p of r.trend) rows.push(["daily-trend", ...metadata, ...identity, r.initialBirds,
      null, null, null, null, null, null, null, null, null, null,
      p.date, p.recordIds.join("; "), null, p.recordedDeaths, null, p.inPeriod, p.cumulativeDeaths, p.cumulativeMortalityPct,
      ...coverage, p.issues.join("; "), notes]);
    for (const d of r.dailyRecords) rows.push(["reviewed-source", ...metadata, ...identity, r.initialBirds,
      null, null, null, null, null, null, null, null, null, null,
      d.date, d.id, d.rawMortality, d.eligible ? d.deaths : null, d.eligible, d.inPeriod, d.eligible ? d.cumulativeDeaths : null, null,
      ...coverage, d.issues.join("; "), notes, d.dayNumber, d.deaths]);
  }
  for (const row of rows) if (row[0] !== "reviewed-source") row.push(null, null);
  return legacyTable(mortalityHeadings, rows);
}
type HarvestLegacyRow = Partial<Record<typeof harvestHeadings[number], Cell>>;
function legacyMetrics(m: HarvestMetrics): HarvestLegacyRow {
  return {
    "Reviewed event count": m.reviewedEventCount, "Eligible event count": m.eligibleEventCount, "Excluded event count": m.excludedEventCount,
    "Recorded loaded birds": m.loadedBirds, "Recorded loaded kg": m.loadedKg, "Paired average loaded kg/bird": m.averageLoadedKg,
    "Captured delivered birds": m.deliveredBirds, "Captured delivered kg": m.deliveredKg, "Paired average delivered kg/bird": m.averageDeliveredKg,
    "Paired recorded mass loss kg": m.massLossKg, "Paired recorded mass loss %": m.massLossPct, "Recorded transport mortality (default-zero caveat)": m.transportMortality,
    "Loaded bird event coverage": m.coverage.loadedBirdEvents, "Loaded kg event coverage": m.coverage.loadedKgEvents,
    "Loaded average paired events": m.coverage.loadedAveragePairs, "Delivered bird event coverage": m.coverage.deliveredBirdEvents,
    "Delivered kg event coverage": m.coverage.deliveredKgEvents, "Delivered average paired events": m.coverage.deliveredAveragePairs,
    "Mass loss paired events": m.coverage.massLossPairs, "Transport mortality event coverage": m.coverage.transportMortalityEvents,
  };
}
function legacyHarvestCsv(report: HarvestReport): string {
  const common: HarvestLegacyRow = {
    Report: "Harvest Results", [UTC]: report.generatedAt, [ZONE]: report.timezone,
    "Period start (blank = available beginning)": report.filters.startDate, "Period end (inclusive)": report.filters.endDate,
    "House filter ID": report.filters.houseId, "Flock filter ID": report.filters.flockId, "Selected flock count": report.summary.flockCount,
    "Report basis notes": report.notes.join("; ") + "; Row types are separate views of one snapshot, not additional totals. Event field values do not imply eligibility; totals use eligible events only. Raw source rows never add quantities.",
  };
  const rows: HarvestLegacyRow[] = [{ ...common, "Row type": "summary", ...legacyMetrics(report.summary), "Catch exception rows": report.summary.catchExceptionCount, "Data-quality warnings": report.summary.issues.join("; ") }];
  for (const r of report.rows) {
    const base: HarvestLegacyRow = { ...common, "Flock ID": r.flockId, Flock: r.flockNumber, "House ID": r.houseId, House: r.houseName, "Placement date": r.placementDate, "Current status (not historical)": r.currentStatus };
    rows.push({ ...base, "Row type": "flock", ...legacyMetrics(r.metrics), "Catch exception rows": r.catchExceptions.length, "Data-quality warnings": [...r.issues, ...r.metrics.issues].join("; ") });
    for (const e of r.events) {
      const contributes = e.eligible && e.inPeriod && e.date !== null;
      const event: HarvestLegacyRow = { ...base, "Harvest event ID": e.id, "Harvest operational date": e.date,
        "Inside selected period": e.inPeriod, "Event contribution eligible": contributes, "Source classification": e.classification,
        "Linked catch session IDs": e.sessionIds.join("; "), "Data-quality warnings": e.issues.join("; ") };
      rows.push({ ...event, "Row type": "event", "Recorded loaded birds": contributes ? e.loadedBirds : null, "Recorded loaded kg": contributes ? e.loadedKg : null,
        "Paired average loaded kg/bird": contributes ? e.averageLoadedKg : null, "Captured delivered birds": contributes ? e.deliveredBirds : null,
        "Captured delivered kg": contributes ? e.deliveredKg : null, "Paired average delivered kg/bird": contributes ? e.averageDeliveredKg : null,
        "Paired recorded mass loss kg": contributes ? e.massLossKg : null, "Paired recorded mass loss %": contributes ? e.massLossPct : null,
        "Recorded transport mortality (default-zero caveat)": contributes ? e.transportMortality : null });
      e.sourceVersions.forEach((v, i) => rows.push({ ...event, "Row type": "raw-harvest-source", "Raw source version": i + 1,
        "Raw harvest ID": v.id, "Raw harvest flock ID": v.flockId, "Raw harvest date": v.harvestDate, "Raw loaded birds": v.chickenCountLoaded,
        "Raw loaded kg": v.totalLoadedWeightKg, "Raw delivered birds": v.chickenCountDelivered, "Raw delivered kg": v.totalDeliveredWeightKg, "Raw transport mortality": v.transportMortalities }));
    }
    for (const c of r.catchExceptions) {
      const exception: HarvestLegacyRow = { ...base, "Catch exception session ID": c.sessionId, "Catch exception harvest link ID": c.harvestRecordId,
        "Catch exception date": c.date, "Catch exception reason": c.reason, "Data-quality warnings": c.reason };
      rows.push({ ...exception, "Row type": "catch-exception" });
      c.sourceVersions.forEach((v, i) => rows.push({ ...exception, "Row type": "raw-catch-source", "Raw source version": i + 1,
        "Raw catch ID": v.id, "Raw catch flock ID": v.flockId, "Raw catch date": v.catchDate, "Raw catch harvest link ID": v.harvestRecordId, "Raw catch current status": v.status }));
    }
  }
  return legacyTable(harvestHeadings, rows.map(row => harvestHeadings.map(key => row[key])), true);
}

// Parse quoted CSV while retaining each original encoded token. Removing the
// primary column can therefore prove byte equality, not just decoded equality.
function parseCsv(csv: string): Array<Array<{ value: string; raw: string }>> {
  const rows: Array<Array<{ value: string; raw: string }>> = [];
  let row: Array<{ value: string; raw: string }> = [];
  let raw = "";
  let quoted = false;
  const finishCell = () => {
    row.push({ raw, value: raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw });
    raw = "";
  };
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      raw += c;
      if (quoted && text[i + 1] === '"') { raw += text[++i]; } else quoted = !quoted;
    } else if (!quoted && c === ",") finishCell();
    else if (!quoted && c === "\r" && text[i + 1] === "\n") { finishCell(); rows.push(row); row = []; i++; }
    else raw += c;
  }
  expect(quoted).toBe(false);
  expect(raw).toBe("");
  expect(row).toEqual([]);
  return rows;
}
function removeLocalColumn(csv: string): string {
  const rows = parseCsv(csv);
  const index = rows[0].findIndex(cell => cell.value === LOCAL);
  expect(index).toBeGreaterThanOrEqual(0);
  return "\uFEFF" + rows.map(row => row.filter((_, i) => i !== index).map(cell => cell.raw).join(",")).join("\r\n") + "\r\n";
}
function objects(csv: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(csv);
  return rows.map(row => Object.fromEntries(header.map((cell, i) => [cell.value, row[i].value])));
}
function reportCase<T extends Report>(name: string, create: (timezone: string, generatedAt: string) => T,
  build: (report: T) => string, legacy: (report: T) => string, rowTypes: string[], startHeading: string, endHeading: string) {
  return { name, rowTypes, startHeading, endHeading, render(timezone: string, generatedAt: string, empty = false) {
    const report = create(timezone, generatedAt);
    if (empty) report.rows = [];
    const before = structuredClone(report);
    const csv = build(report);
    expect(report).toEqual(before);
    expect(removeLocalColumn(csv)).toBe(legacy(before));
    return { csv, report };
  } };
}
const cases = [
  reportCase("Flock Performance", (zone, instant) => buildFlockPerformanceReport(flockSource(), filters, zone, instant),
    buildFlockPerformanceCsv, legacyFlockCsv, ["Flock Performance"], "Period start (blank = from placement)", "As-of end date"),
  reportCase("Mortality", (zone, instant) => buildMortalityReport(mortalitySource(), filters, zone, instant),
    buildMortalityCsv, legacyMortalityCsv, ["summary", "flock", "daily-trend", "daily-trend", "reviewed-source", "reviewed-source"], "Period start (blank = placement)", "As-of end date"),
  reportCase("Harvest Results", (zone, instant) => buildHarvestReport(harvestSource(), filters, zone, instant),
    buildHarvestCsv, legacyHarvestCsv, ["summary", "flock", "event", "raw-harvest-source", "catch-exception", "raw-catch-source"], "Period start (blank = available beginning)", "Period end (inclusive)"),
];

const timestampCases = [
  { name: "SAST UTC+02:00 date rollover", zone: "Africa/Johannesburg", instant: ROLLOVER,
    offsetInstant: "2026-11-09T00:30:00.000+02:00", expected: "Nov 9, 2026 at 12:30 AM SAST" },
  { name: "configured UTC UTC+00:00", zone: "UTC", instant: ROLLOVER,
    offsetInstant: "2026-11-08T22:30:00.000+00:00", expected: "Nov 8, 2026 at 10:30 PM UTC" },
  { name: "configured New York UTC-05:00", zone: "America/New_York", instant: ROLLOVER,
    offsetInstant: "2026-11-08T17:30:00.000-05:00", expected: "Nov 8, 2026 at 5:30 PM America/New_York" },
  { name: "New York summer DST UTC-04:00 previous-date rollover", zone: "America/New_York", instant: "2026-07-01T00:30:00.123Z",
    offsetInstant: "2026-06-30T20:30:00.123-04:00", expected: "Jun 30, 2026 at 8:30 PM America/New_York" },
  { name: "New York winter UTC-05:00 previous-year rollover", zone: "America/New_York", instant: "2026-01-01T00:30:00.987Z",
    offsetInstant: "2025-12-31T19:30:00.987-05:00", expected: "Dec 31, 2025 at 7:30 PM America/New_York" },
];

describe.each(cases)("$name CSV company timezone regression", adapter => {
  it.each(timestampCases)("uses literal 12-hour company time for $name and leaves the UTC instant exact", timestamp => {
    // Explicit, independently supplied offsets document the expected DST rule;
    // neither the audit helper nor Intl is an expected-value oracle here.
    expect(Date.parse(timestamp.offsetInstant)).toBe(Date.parse(timestamp.instant));
    const { csv } = adapter.render(timestamp.zone, timestamp.instant);
    const parsed = parseCsv(csv);
    const headings = parsed[0].map(cell => cell.value);
    const localIndex = headings.indexOf(LOCAL);
    expect(headings.filter(heading => heading === LOCAL)).toHaveLength(1);
    expect(headings.slice(localIndex, localIndex + 3)).toEqual([LOCAL, UTC, ZONE]);
    expect(localIndex).toBe(adapter.name === "Flock Performance" ? 1 : 2);
    expect(parsed.slice(1).map(row => row[0].value)).toEqual(adapter.rowTypes);
    expect(new Set(parsed.map(row => row.length)).size).toBe(1);
    for (const row of objects(csv)) {
      expect(row[LOCAL]).toBe(timestamp.expected);
      expect(row[UTC]).toBe(timestamp.instant);
      expect(row[ZONE]).toBe(timestamp.zone);
      expect(row[adapter.startHeading]).toBe("2026-11-02");
      expect(row[adapter.endHeading]).toBe("2026-11-03");
      expect(row["House filter ID"]).toBe("2");
      expect(row["Flock filter ID"]).toBe("1");
    }
  });

  it.each(["2026-11-08 22:30:00", "2026-11-08T22:30:00", "not-an-instant", "2026-99-08T22:30:00Z", ""])("does not pretend invalid/offsetless instant %j is local time", instant => {
    const { csv } = adapter.render("Africa/Johannesburg", instant);
    for (const row of objects(csv)) {
      expect(row[LOCAL]).toBe("Timestamp unavailable");
      expect(row[UTC]).toBe(instant);
      expect(row[ZONE]).toBe("Africa/Johannesburg");
    }
  });

  it.each(["Invalid/Timezone", ""])("does not fall back to UTC/browser time for invalid configured zone %j", zone => {
    const { csv } = adapter.render(zone, ROLLOVER);
    for (const row of objects(csv)) {
      expect(row[LOCAL]).toBe("Timezone unavailable");
      expect(row[UTC]).toBe(ROLLOVER);
      expect(row[ZONE]).toBe(zone);
    }
  });

  it("retains CSV quoting, formula safety, Unicode, BOM and CRLF and all pre-change fields", () => {
    const { csv } = adapter.render("Africa/Johannesburg", ROLLOVER);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const parsed = parseCsv(csv);
    const localIndex = parsed[0].findIndex(cell => cell.value === LOCAL);
    for (const row of parsed.slice(1)) expect(row[localIndex].raw).toBe('"Nov 9, 2026 at 12:30 AM SAST"');
    const flock = objects(csv).find(row => row["Flock ID"] === "1")!;
    expect(flock.House).toBe(HOUSE);
    expect(flock.Flock).toBe("'=SYNTHETIC-ONLY");
    expect(flock["Placement date"]).toBe("2026-11-01");
  });

  it("preserves selected operational dates and representative raw metrics rather than rerendering them as instants", () => {
    const { csv, report } = adapter.render("America/New_York", ROLLOVER);
    expect(report.filters).toEqual(filters);
    const rows = objects(csv);
    const flock = rows.find(row => row["Flock ID"] === "1")!;
    if (adapter.name === "Flock Performance") {
      expect(flock["Recorded deaths in period"]).toBe("3");
      expect(flock["Recorded deaths through end"]).toBe("3");
      expect(flock["Recorded birds remaining (excludes unrecorded culls/transfers)"]).toBe("77");
      expect(flock["Latest mean weight (kg/bird)"]).toBe("1.25");
      expect(flock["Weight measurement date"]).toBe("2026-11-03");
      expect(flock["Observed mean-weight growth (g/bird/day)"]).toBe("-250");
      expect(flock["Growth first date"]).toBe("2026-11-02");
      expect(flock["Growth last date"]).toBe("2026-11-03");
    } else if (adapter.name === "Mortality") {
      expect(rows[0]["Initial birds denominator"]).toBe("100");
      expect(rows[0]["Recorded deaths in period"]).toBe("3");
      expect(rows.filter(row => row["Row type"] === "daily-trend").map(row => row["Operational source date"])).toEqual(["2026-11-02", "2026-11-03"]);
      const zero = rows.find(row => row["Row type"] === "reviewed-source" && row["Reviewed record IDs"] === "12")!;
      expect(zero["Raw recorded mortality (not necessarily eligible)"]).toBe("0");
      expect(zero["Eligible source deaths"]).toBe("0");
      expect(zero["Recorded day number"]).toBe("2");
    } else {
      expect(rows[0]["Recorded loaded birds"]).toBe("20");
      expect(rows[0]["Captured delivered birds"]).toBe("18");
      expect(rows[0]["Recorded transport mortality (default-zero caveat)"]).toBe("0");
      expect(rows.find(row => row["Row type"] === "event")!["Harvest operational date"]).toBe("2026-11-03");
      const raw = rows.find(row => row["Row type"] === "raw-harvest-source")!;
      expect(raw["Raw loaded kg"]).toBe("40.000");
      expect(raw["Raw delivered kg"]).toBe("36.000");
      expect(raw["Raw harvest date"]).toBe("2026-11-03");
      expect(rows.find(row => row["Row type"] === "raw-catch-source")!["Raw catch date"]).toBe("2026-11-03");
    }
  });

  it("retains existing empty-cohort row behavior and adds only the one heading", () => {
    const { csv } = adapter.render("Africa/Johannesburg", ROLLOVER, true);
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(adapter.name === "Flock Performance" ? 1 : 2);
    expect(parsed[0].filter(cell => cell.value === LOCAL)).toHaveLength(1);
    expect(new Set(parsed.map(row => row.length)).size).toBe(1);
  });
});
