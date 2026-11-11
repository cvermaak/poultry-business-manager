import type { HarvestMetrics, HarvestReport, HarvestReportRow } from "@shared/harvest-report";
import { productionCsvCell } from "./production-report-csv";
import { formatAuditTimestamp } from "./audit-time";

type Cell = string | number | boolean | null | undefined;
const headings = [
  "Row type", "Report", "Generated at (company timezone)", "Generated at (UTC)", "Display timezone", "Period start (blank = available beginning)", "Period end (inclusive)",
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
type Column = typeof headings[number];
type Row = Partial<Record<Column, Cell>>;
function metricCells(m: HarvestMetrics): Row {
  return {
    "Reviewed event count": m.reviewedEventCount, "Eligible event count": m.eligibleEventCount, "Excluded event count": m.excludedEventCount,
    "Recorded loaded birds": m.loadedBirds, "Recorded loaded kg": m.loadedKg, "Paired average loaded kg/bird": m.averageLoadedKg,
    "Captured delivered birds": m.deliveredBirds, "Captured delivered kg": m.deliveredKg, "Paired average delivered kg/bird": m.averageDeliveredKg,
    "Paired recorded mass loss kg": m.massLossKg, "Paired recorded mass loss %": m.massLossPct,
    "Recorded transport mortality (default-zero caveat)": m.transportMortality,
    "Loaded bird event coverage": m.coverage.loadedBirdEvents, "Loaded kg event coverage": m.coverage.loadedKgEvents,
    "Loaded average paired events": m.coverage.loadedAveragePairs, "Delivered bird event coverage": m.coverage.deliveredBirdEvents,
    "Delivered kg event coverage": m.coverage.deliveredKgEvents, "Delivered average paired events": m.coverage.deliveredAveragePairs,
    "Mass loss paired events": m.coverage.massLossPairs, "Transport mortality event coverage": m.coverage.transportMortalityEvents,
  };
}
function identity(r: HarvestReportRow): Row {
  return { "Flock ID": r.flockId, "Flock": r.flockNumber, "House ID": r.houseId, "House": r.houseName, "Placement date": r.placementDate, "Current status (not historical)": r.currentStatus };
}
/** Multiple row types are traceability layers, not additional quantities to sum together. */
export function buildHarvestCsv(report: HarvestReport): string {
  const common: Row = {
    "Report": "Harvest Results", "Generated at (company timezone)": formatAuditTimestamp(report.generatedAt, report.timezone), "Generated at (UTC)": report.generatedAt, "Display timezone": report.timezone,
    "Period start (blank = available beginning)": report.filters.startDate, "Period end (inclusive)": report.filters.endDate,
    "House filter ID": report.filters.houseId, "Flock filter ID": report.filters.flockId,
    "Selected flock count": report.summary.flockCount,
    "Report basis notes": report.notes.join("; ") + "; Row types are separate views of one snapshot, not additional totals. Event field values do not imply eligibility; totals use eligible events only. Raw source rows never add quantities.",
  };
  const rows: Row[] = [{ ...common, "Row type": "summary", ...metricCells(report.summary), "Catch exception rows": report.summary.catchExceptionCount, "Data-quality warnings": report.summary.issues.join("; ") }];
  for (const r of report.rows) {
    const base = { ...common, ...identity(r) };
    rows.push({ ...base, "Row type": "flock", ...metricCells(r.metrics), "Catch exception rows": r.catchExceptions.length,
      "Data-quality warnings": [...r.issues, ...r.metrics.issues].join("; ") });
    for (const e of r.events) {
      const contributes = e.eligible && e.inPeriod && e.date !== null;
      const event: Row = { ...base, "Harvest event ID": e.id, "Harvest operational date": e.date,
        "Inside selected period": e.inPeriod, "Event contribution eligible": contributes, "Source classification": e.classification,
        "Linked catch session IDs": e.sessionIds.join("; "), "Data-quality warnings": e.issues.join("; ") };
      rows.push({ ...event, "Row type": "event", "Recorded loaded birds": contributes ? e.loadedBirds : null, "Recorded loaded kg": contributes ? e.loadedKg : null,
        "Paired average loaded kg/bird": contributes ? e.averageLoadedKg : null, "Captured delivered birds": contributes ? e.deliveredBirds : null,
        "Captured delivered kg": contributes ? e.deliveredKg : null, "Paired average delivered kg/bird": contributes ? e.averageDeliveredKg : null,
        "Paired recorded mass loss kg": contributes ? e.massLossKg : null, "Paired recorded mass loss %": contributes ? e.massLossPct : null,
        "Recorded transport mortality (default-zero caveat)": contributes ? e.transportMortality : null });
      e.sourceVersions.forEach((v, i) => rows.push({ ...event, "Row type": "raw-harvest-source", "Raw source version": i + 1,
        "Raw harvest ID": v.id, "Raw harvest flock ID": v.flockId, "Raw harvest date": v.harvestDate,
        "Raw loaded birds": v.chickenCountLoaded, "Raw loaded kg": v.totalLoadedWeightKg,
        "Raw delivered birds": v.chickenCountDelivered, "Raw delivered kg": v.totalDeliveredWeightKg, "Raw transport mortality": v.transportMortalities }));
    }
    for (const c of r.catchExceptions) {
      const exception: Row = { ...base, "Catch exception session ID": c.sessionId, "Catch exception harvest link ID": c.harvestRecordId,
        "Catch exception date": c.date, "Catch exception reason": c.reason, "Data-quality warnings": c.reason };
      rows.push({ ...exception, "Row type": "catch-exception" });
      c.sourceVersions.forEach((v, i) => rows.push({ ...exception, "Row type": "raw-catch-source", "Raw source version": i + 1,
        "Raw catch ID": v.id, "Raw catch flock ID": v.flockId, "Raw catch date": v.catchDate,
        "Raw catch harvest link ID": v.harvestRecordId, "Raw catch current status": v.status }));
    }
  }
  return "\uFEFF" + [headings.join(","), ...rows.map(row => headings.map(key => productionCsvCell(row[key])).join(","))].join("\r\n") + "\r\n";
}
