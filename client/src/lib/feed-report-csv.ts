import type { FeedPerformanceReport, FeedReportRow, FeedTotals } from "../../../shared/feed-report";
import { formatAuditTimestamp } from "./audit-time";
import { productionCsvCell } from "./production-report-csv";

type Cell = string | number | boolean | null | undefined;
type RecordRow = Record<string, Cell>;
const headings = [
  "Row type", "Report", "Generated at (company timezone)", "Generated at (UTC)", "Display timezone",
  "Period start (blank = from placement)", "As-of end date", "House filter ID", "Flock filter ID",
  "Flock ID", "Flock", "House ID", "House", "Placement date", "Current status (not historical)", "Initial birds",
  "Recorded feed in period (kg)", "Period Starter (kg)", "Period Grower (kg)", "Period Finisher (kg)", "Period Unspecified (kg)",
  "Period valid records", "Period valid feed days", "Period expected days", "Period subtotal partial",
  "Recorded feed through end (kg)", "Cumulative Starter (kg)", "Cumulative Grower (kg)", "Cumulative Finisher (kg)", "Cumulative Unspecified (kg)",
  "Cumulative valid records", "Cumulative valid feed days", "Cumulative expected days", "Cumulative subtotal partial",
  "Latest measured weight (kg/bird)", "Latest weight date", "Harvest-adjusted recorded-feed FCR", "FCR status", "FCR basis",
  "FCR endpoint (Q)", "Final harvest date (T)", "FCR cumulative feed through Q (kg)", "FCR recorded deaths through Q",
  "FCR known eligible loaded-count balance through Q (may include unpaired events)", "FCR paired loaded net kg through Q", "Recorded remaining birds at Q",
  "FCR sampled mean kg/bird", "FCR sample date", "Estimated remaining live kg", "FCR biomass denominator (kg)",
  "FCR expected capture days", "FCR recorded days", "FCR valid feed days", "FCR valid mortality days", "FCR capture complete",
  "FCR qualifying flocks / selected", "FCR reasons", "Data-quality warnings", "Source ID", "Operational source date", "Recorded day number",
  "Recorded feed stage", "Validated source feed kg (review value)", "Validated source deaths (review value)", "Validated source mean kg/bird (review value)",
  "Source eligible", "In selected period", "In cumulative scope", "In FCR scope", "Period feed contribution (kg)", "Cumulative feed contribution (kg)", "FCR feed contribution (kg)",
  "Harvest classification", "Paired harvest contributes to FCR", "Validated loaded birds (review value)", "Validated loaded kg (review value)",
  "Catch session IDs", "Linked harvest ID", "Catch status", "Raw source flock ID", "Raw feed kg", "Raw mortality", "Raw mean kg/bird", "Raw feed stage",
  "Raw loaded birds", "Raw loaded net kg", "Raw delivered birds", "Raw delivered kg", "Raw transport deaths", "Report basis notes",
];
function totals(period: FeedTotals, cumulative: FeedTotals): RecordRow {
  return {
    "Recorded feed in period (kg)": period.kg, "Period Starter (kg)": period.stages.starter,
    "Period Grower (kg)": period.stages.grower, "Period Finisher (kg)": period.stages.finisher,
    "Period Unspecified (kg)": period.stages.unspecified, "Period valid records": period.validRecords,
    "Period valid feed days": period.validDays, "Period expected days": period.expectedDays, "Period subtotal partial": period.partial,
    "Recorded feed through end (kg)": cumulative.kg, "Cumulative Starter (kg)": cumulative.stages.starter,
    "Cumulative Grower (kg)": cumulative.stages.grower, "Cumulative Finisher (kg)": cumulative.stages.finisher,
    "Cumulative Unspecified (kg)": cumulative.stages.unspecified, "Cumulative valid records": cumulative.validRecords,
    "Cumulative valid feed days": cumulative.validDays, "Cumulative expected days": cumulative.expectedDays, "Cumulative subtotal partial": cumulative.partial,
  };
}
function flockFields(row: FeedReportRow): RecordRow {
  const f = row.fcr;
  return { "Flock ID": row.flockId, "Flock": row.flockNumber, "House ID": row.houseId, "House": row.houseName,
    "Placement date": row.placementDate, "Current status (not historical)": row.currentStatus, "Initial birds": row.initialBirds,
    ...totals(row.periodFeed, row.cumulativeFeed), "Latest measured weight (kg/bird)": row.latestWeightKg, "Latest weight date": row.latestWeightDate,
    "Harvest-adjusted recorded-feed FCR": f.eligible ? f.value : null, "FCR status": f.status, "FCR basis": f.basis,
    "FCR endpoint (Q)": f.endpoint, "Final harvest date (T)": f.closureDate, "FCR cumulative feed through Q (kg)": f.cumulativeFeedKg,
    "FCR recorded deaths through Q": f.cumulativeDeaths, "FCR known eligible loaded-count balance through Q (may include unpaired events)": f.loadedBirds,
    "FCR paired loaded net kg through Q": f.loadedKg, "Recorded remaining birds at Q": f.remainingBirds,
    "FCR sampled mean kg/bird": f.weightKg, "FCR sample date": f.weightDate, "Estimated remaining live kg": f.estimatedRemainingKg,
    "FCR biomass denominator (kg)": f.biomassKg, "FCR expected capture days": f.coverage.expectedDays,
    "FCR recorded days": f.coverage.recordedDays, "FCR valid feed days": f.coverage.validFeedDays,
    "FCR valid mortality days": f.coverage.validMortalityDays, "FCR capture complete": f.coverage.complete,
    "FCR reasons": f.reasons.join("; "), "Data-quality warnings": row.issues.join("; "),
  };
}
/** Row types are separate traceability views, never additional quantities to sum. */
export function buildFeedPerformanceCsv(report: FeedPerformanceReport): string {
  const common: RecordRow = { "Report": "Feed Performance/FCR", "Generated at (company timezone)": formatAuditTimestamp(report.generatedAt, report.timezone),
    "Generated at (UTC)": report.generatedAt, "Display timezone": report.timezone,
    "Period start (blank = from placement)": report.filters.startDate, "As-of end date": report.filters.endDate,
    "House filter ID": report.filters.houseId, "Flock filter ID": report.filters.flockId,
    "FCR qualifying flocks / selected": `${report.summary.qualifyingFlocks}/${report.summary.flockCount}`, "Report basis notes": report.notes.join("; ") };
  const records: RecordRow[] = [{ ...common, "Row type": "Summary", ...totals(report.summary.periodFeed, report.summary.cumulativeFeed),
    "Harvest-adjusted recorded-feed FCR": report.summary.fcr, "FCR basis": "Provisional — recorded output plus estimated remaining stock; ratio of sums, not mean flock ratios",
    "FCR cumulative feed through Q (kg)": report.summary.fcrFeedKg, "FCR biomass denominator (kg)": report.summary.biomassKg,
    "Data-quality warnings": report.summary.issues.join("; ") }];
  for (const row of report.rows) {
    const identity: RecordRow = { ...common, "Flock ID": row.flockId, "Flock": row.flockNumber, "House ID": row.houseId, "House": row.houseName,
      "Placement date": row.placementDate, "FCR endpoint (Q)": row.fcr.endpoint, "Final harvest date (T)": row.fcr.closureDate };
    records.push({ ...common, "Row type": "Flock", ...flockFields(row) });
    for (const daily of row.dailyRecords) {
      records.push({ ...identity, "Row type": "Daily source", "Source ID": daily.id, "Operational source date": daily.date,
        "Recorded day number": daily.dayNumber, "Recorded feed stage": daily.stage, "Validated source feed kg (review value)": daily.feedKg,
        "Validated source deaths (review value)": daily.mortality, "Validated source mean kg/bird (review value)": daily.weightKg,
        "Source eligible": daily.eligible, "In selected period": daily.inPeriod, "In cumulative scope": daily.inCumulative, "In FCR scope": daily.inFcr,
        "Period feed contribution (kg)": daily.eligible && daily.inPeriod ? daily.feedKg : null,
        "Cumulative feed contribution (kg)": daily.eligible && daily.inCumulative ? daily.feedKg : null,
        "FCR feed contribution (kg)": daily.eligible && daily.inFcr ? daily.feedKg : null,
        "Data-quality warnings": daily.issues.join("; ") });
      for (const raw of daily.sourceVersions) records.push({ ...identity, "Row type": "Raw daily source (review only)", "Source ID": raw.id,
        "Raw source flock ID": raw.flockId, "Operational source date": raw.recordDate, "Recorded day number": raw.dayNumber,
        "Raw feed kg": raw.feedConsumed, "Raw mortality": raw.mortality, "Raw mean kg/bird": raw.averageWeight, "Raw feed stage": raw.feedType,
        "Data-quality warnings": daily.issues.join("; ") });
    }
    for (const event of row.harvestRecords) {
      const paired = event.eligible && event.loadedBirds !== null && event.loadedBirds > 0 && event.loadedKg !== null && event.loadedKg > 0 &&
        event.date !== null && row.fcr.endpoint !== null && event.date <= row.fcr.endpoint;
      records.push({ ...identity, "Row type": "Harvest source", "Source ID": event.id, "Operational source date": event.date,
        "Harvest classification": event.classification, "Source eligible": event.eligible, "Paired harvest contributes to FCR": paired,
        "Validated loaded birds (review value)": event.loadedBirds, "Validated loaded kg (review value)": event.loadedKg,
        "Catch session IDs": event.sessionIds.join("; "), "Data-quality warnings": event.issues.join("; ") });
      for (const raw of event.sourceVersions) records.push({ ...identity, "Row type": "Raw harvest source (review only)", "Source ID": raw.id,
        "Raw source flock ID": raw.flockId, "Operational source date": raw.harvestDate, "Raw loaded birds": raw.chickenCountLoaded,
        "Raw loaded net kg": raw.totalLoadedWeightKg, "Raw delivered birds": raw.chickenCountDelivered, "Raw delivered kg": raw.totalDeliveredWeightKg,
        "Raw transport deaths": raw.transportMortalities, "Data-quality warnings": event.issues.join("; ") });
    }
    for (const exception of row.catchExceptions) {
      records.push({ ...identity, "Row type": "Catch reconciliation (no quantities)", "Source ID": exception.sessionId,
        "Operational source date": exception.date, "Linked harvest ID": exception.harvestRecordId, "Data-quality warnings": exception.reason });
      for (const raw of exception.sourceVersions) records.push({ ...identity, "Row type": "Raw catch provenance (no quantities)",
        "Source ID": raw.id, "Raw source flock ID": raw.flockId, "Operational source date": raw.catchDate,
        "Linked harvest ID": raw.harvestRecordId, "Catch status": raw.status, "Data-quality warnings": exception.reason });
    }
  }
  return "\uFEFF" + [headings.map(productionCsvCell).join(","), ...records.map(record => headings.map(key => productionCsvCell(record[key])).join(","))].join("\r\n") + "\r\n";
}
