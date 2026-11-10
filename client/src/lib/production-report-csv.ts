import type { FlockPerformanceReport } from "../../../shared/production-reports";
import { formatAuditTimestamp } from "./audit-time";

type Cell = string | number | boolean | null | undefined;
export function productionCsvCell(value: Cell): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';
  if (typeof value === "boolean") return value ? '"yes"' : '"no"';
  let text = value;
  // Text can originate in user-maintained flock/house names. Preserve real
  // numeric negatives but neutralize spreadsheet formulas in text cells.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildFlockPerformanceCsv(report: FlockPerformanceReport): string {
  const headings = [
    "Report", "Generated at (company timezone)", "Generated at (UTC)", "Display timezone", "Period start (blank = from placement)", "As-of end date",
    "House filter ID", "Flock filter ID", "Flock ID", "Flock", "House ID", "House", "Placement date", "Current status (not historical)",
    "Initial birds", "Elapsed days at end (not final slaughter age)", "Recorded deaths in period", "Recorded deaths through end",
    "Cumulative mortality (% initial birds)", "Eligible loaded birds through end", "Recorded birds remaining (excludes unrecorded culls/transfers)",
    "Latest mean weight (kg/bird)", "Weight measurement date", "Weight age at end (days)", "Weight outside selected period",
    "Observed mean-weight growth (g/bird/day)", "Growth first date", "Growth last date", "Growth first kg/bird", "Growth last kg/bird",
    "Recorded days through end", "Recorded days in period", "Expected calendar days in period", "Unrecorded calendar days in period",
    "Eligible for full summary", "Data-quality warnings", "Reviewed daily source IDs (including excluded/unpositionable)", "Daily source warnings", "Eligible harvest record IDs", "Excluded harvest record IDs",
    "Catch exceptions", "Summary coverage (eligible/selected)", "Report basis notes",
  ];
  const rows: Cell[][] = report.rows.map(row => [
    "Flock Performance", formatAuditTimestamp(report.generatedAt, report.timezone), report.generatedAt, report.timezone, report.filters.startDate, report.filters.endDate,
    report.filters.houseId, report.filters.flockId, row.flockId, row.flockNumber, row.houseId, row.houseName, row.placementDate, row.currentStatus,
    row.initialBirds, row.elapsedDays, row.periodDeaths, row.cumulativeDeaths, row.cumulativeMortalityPct, row.loadedBirds, row.remainingBirds,
    row.latestWeightKg, row.latestWeightDate, row.weightAgeDays, row.weightOutsidePeriod,
    row.observedGrowthGPerBirdDay, row.growthStartDate, row.growthEndDate, row.growthStartWeightKg, row.growthEndWeightKg,
    row.recordedDays, row.periodRecordedDays, row.expectedPeriodDays, row.missingPeriodDays, row.summaryEligible, row.issues.join("; "),
    row.dailyRecords.map(r => r.id).join("; "), row.dailyRecords.filter(r => r.issues.length).map(r => `Record ${r.id} (${r.date ?? "undated"}): ${r.issues.join("; ")}`).join(" | "),
    row.harvestRecords.filter(r => r.eligible).map(r => r.id).join("; "),
    row.harvestRecords.filter(r => !r.eligible).map(r => r.id).join("; "),
    row.catchExceptions.map(r => `Session ${r.sessionId}: ${r.reason}`).join("; "),
    `${report.summary.eligibleFlockCount}/${report.summary.flockCount}`, report.notes.join("; "),
  ]);
  return "\uFEFF" + [headings, ...rows].map(row => row.map(productionCsvCell).join(",")).join("\r\n") + "\r\n";
}
