import type { MortalityReport } from "@shared/mortality-report";
import { productionCsvCell } from "./production-report-csv";
import { formatAuditTimestamp } from "./audit-time";

type Cell = string | number | boolean | null | undefined;
export function buildMortalityCsv(report: MortalityReport): string {
  const headings = [
    "Row type", "Report", "Generated at (company timezone)", "Generated at (UTC)", "Display timezone", "Period start (blank = placement)", "As-of end date",
    "House filter ID", "Flock filter ID", "Flock ID", "Flock", "House ID", "House", "Placement date", "Current status (not historical)",
    "Initial birds denominator", "Recorded deaths in period", "Period mortality (% initial birds, not opening live birds)",
    "Recorded deaths through end", "Cumulative mortality (% initial birds)", "Recorded days through end", "Recorded days in period",
    "Calendar days in period", "Unrecorded days in period", "Eligible for period summary", "Eligible for cumulative summary",
    "Operational source date", "Reviewed record IDs", "Raw recorded mortality (not necessarily eligible)", "Eligible source deaths",
    "Source eligible", "Inside selected period", "Recorded cumulative deaths on source date", "Cumulative mortality on date (% initial birds)",
    "Selected flock count", "Period eligible flock count", "Cumulative eligible flock count", "Data-quality warnings", "Report basis notes",
    "Recorded day number", "Validated source count (not contribution eligibility)",
  ];
  const rows: Cell[][] = [];
  const metadata: Cell[] = ["Mortality", formatAuditTimestamp(report.generatedAt, report.timezone), report.generatedAt, report.timezone, report.filters.startDate, report.filters.endDate, report.filters.houseId, report.filters.flockId];
  const coverage: Cell[] = [report.summary.flockCount, report.summary.periodEligibleFlockCount, report.summary.cumulativeEligibleFlockCount];
  const notes = report.notes.join("; ");
  const s = report.summary;
  rows.push(["summary", ...metadata, null, null, null, null, null, null,
    s.initialBirds, s.periodDeaths, s.periodMortalityPct, s.cumulativeDeaths, s.cumulativeMortalityPct,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    ...coverage, s.issues.join("; "), notes]);
  for (const r of report.rows) {
    const identity: Cell[] = [r.flockId, r.flockNumber, r.houseId, r.houseName, r.placementDate, r.currentStatus];
    rows.push(["flock", ...metadata, ...identity, r.initialBirds, r.periodDeaths, r.periodMortalityPct, r.cumulativeDeaths, r.cumulativeMortalityPct,
      r.recordedDays, r.periodRecordedDays, r.calendarDaysInPeriod, r.unrecordedDaysInPeriod, r.periodSummaryEligible, r.cumulativeSummaryEligible,
      null, r.dailyRecords.map(d => d.id).join("; "), null, null, null, null, null, null,
      ...coverage, r.issues.join("; "), notes]);
    for (const p of r.trend) rows.push(["daily-trend", ...metadata, ...identity, r.initialBirds,
      null, null, null, null, null, null, null, null, null, null,
      p.date, p.recordIds.join("; "), null, p.recordedDeaths, null, p.inPeriod, p.cumulativeDeaths, p.cumulativeMortalityPct,
      ...coverage, p.issues.join("; "), notes]);
    for (const d of r.dailyRecords) rows.push(["reviewed-source", ...metadata, ...identity, r.initialBirds,
      null, null, null, null, null, null, null, null, null, null,
      d.date, d.id, d.rawMortality, d.eligible ? d.deaths : null, d.eligible, d.inPeriod, d.eligible ? d.cumulativeDeaths : null, null,
      ...coverage, d.issues.join("; "), notes, d.dayNumber, d.deaths]);
  }
  // These two fields describe individual raw records, not aggregate rows.
  for (const row of rows) if (row[0] !== "reviewed-source") row.push(null, null);
  if (rows.some(row => row.length !== headings.length)) throw new Error("Mortality CSV column alignment failed.");
  return "\uFEFF" + [headings, ...rows].map(row => row.map(productionCsvCell).join(",")).join("\r\n") + "\r\n";
}
