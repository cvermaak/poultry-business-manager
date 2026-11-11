import {
  isProductionDate,
  productionDayDifference,
} from "../shared/production-report-dates";
import type { ResolvedFlockPerformanceFilters } from "../shared/production-reports";
import type {
  MortalityReport,
  MortalityReportRow,
  MortalityReportSource,
  MortalitySourceDetail,
  MortalityTrendPoint,
} from "../shared/mortality-report";

// Pure snapshot calculation: no database, application, clock, or network imports.
function groupById<T extends { id: number }>(entries: readonly T[]): T[][] {
  const groups = new Map<number, T[]>();
  for (const entry of entries) {
    const group = groups.get(entry.id) ?? [];
    group.push(entry);
    groups.set(entry.id, group);
  }
  return Array.from(groups.values());
}
function consensus<T, K extends keyof T>(
  entries: readonly T[],
  key: K
): T[K] | null {
  return entries.every(entry => entry[key] === entries[0][key])
    ? entries[0][key]
    : null;
}
function distinct<T>(
  entries: readonly T[],
  fields: (entry: T) => unknown[]
): T[] {
  // Explicit field fingerprints do not depend on source object property ordering.
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = JSON.stringify(
      fields(entry).map(value => [
        typeof value,
        typeof value === "number" && !Number.isFinite(value)
          ? String(value)
          : value,
      ])
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function count(value: unknown): number | null {
  if (typeof value === "string") {
    const text = value.trim();
    // Validate the original decimal integer spelling before binary conversion;
    // coercion alone can round fractions or underflow nonzero strings to zero.
    if (!/^\d+$/.test(text)) return null;
    value = Number(text);
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}
function sum(values: number[]): number | null {
  const total = values.reduce((a, b) => a + b, 0);
  return Number.isSafeInteger(total) ? total : null;
}
function date(value: unknown): string | null {
  return isProductionDate(value) ? value : null;
}
function validId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
function percent(deaths: number | null, initial: number | null): number | null {
  return deaths !== null && initial !== null && initial > 0 && deaths <= initial
    ? 100 * (deaths / initial)
    : null;
}
function validateFilters(filters: ResolvedFlockPerformanceFilters): void {
  if (
    !isProductionDate(filters.endDate) ||
    (filters.startDate !== null && !isProductionDate(filters.startDate))
  ) {
    throw new Error("Invalid production report operational date.");
  }
  if (filters.startDate !== null && filters.startDate > filters.endDate) {
    throw new Error("Production report start date must not be after end date.");
  }
  if (
    [filters.houseId, filters.flockId].some(id => id !== null && !validId(id))
  ) {
    throw new Error("Production report filter IDs must be positive integers.");
  }
}

/** Uses only supplied daily mortality; operational date labels are not instants. */
export function buildMortalityReport(
  source: MortalityReportSource,
  filters: ResolvedFlockPerformanceFilters,
  timezone: string,
  generatedAt: string
): MortalityReport {
  validateFilters(filters);
  const end = filters.endDate;
  // Known future rows are wholly outside this snapshot, including review details.
  const dailyGroups = groupById(
    source.dailyRecords.filter(
      record => !isProductionDate(record.recordDate) || record.recordDate <= end
    )
  );
  const rows: MortalityReportRow[] = [];

  for (const flockEntries of groupById(source.flocks)) {
    const flockId = flockEntries[0].id;
    if (filters.flockId !== null && flockId !== filters.flockId) continue;
    if (
      filters.houseId !== null &&
      !flockEntries.some(f => f.houseId === filters.houseId)
    )
      continue;
    if (
      flockEntries.every(
        f => isProductionDate(f.placementDate) && f.placementDate > end
      )
    )
      continue;

    const issues: string[] = [];
    const flockVersions = distinct(flockEntries, f => [
      f.flockNumber,
      f.houseId,
      f.placementDate,
      f.initialCount,
      f.status,
    ]);
    const masterConflict = flockVersions.length > 1 || !validId(flockId);
    if (flockEntries.length > 1)
      issues.push(`Repeated flock source ID ${flockId}; counted once.`);
    if (masterConflict)
      issues.push(
        `Invalid or conflicting master records for flock ID ${flockId}; no arbitrary version selected and mortality calculations are N/A.`
      );
    const placement = date(consensus(flockEntries, "placementDate"));
    if (placement === null)
      issues.push(
        "Invalid, missing or conflicting placement date; this flock remains visible but its history cannot be scoped reliably."
      );
    const status =
      consensus(flockEntries, "status") ?? "Conflicting current statuses";
    const planned = [
      "planned",
      "pending",
      "scheduled",
      "unconfirmed",
      "not_started",
      "not-started",
    ].includes(status.trim().toLowerCase());
    if (planned)
      issues.push(
        "Planned/not-confirmed placement; recorded activity is not confirmed mortality performance, so totals are N/A."
      );
    const initial = masterConflict ? null : count(flockEntries[0].initialCount);
    if (initial === null)
      issues.push(
        "Invalid initial bird count; a nonnegative safe integer is required."
      );
    else if (initial === 0)
      issues.push(
        "Initial bird count is zero; mortality percentages require a positive initial-bird denominator."
      );

    // An ambiguous house is not assigned to the selected house as a silent winner.
    const houseId = consensus(flockEntries, "houseId") ?? -1;
    const houses = source.houses.filter(house => house.id === houseId);
    const houseVersions = distinct(houses, house => [
      house.name,
      house.houseNumber,
    ]);
    const houseValid = validId(houseId) && houseVersions.length === 1;
    if (houses.length > 1)
      issues.push(`Repeated house source ID ${houseId}; label counted once.`);
    if (!houseValid)
      issues.push(
        "Missing, invalid or conflicting house metadata; full-cohort summaries require master-data reconciliation."
      );
    const houseName = houseValid
      ? houses[0].name
      : `House ${houseId} (label unavailable or conflicting)`;
    const scopedPlacement = masterConflict ? null : placement;
    const periodStart =
      scopedPlacement === null
        ? null
        : filters.startDate !== null && filters.startDate > scopedPlacement
          ? filters.startDate
          : scopedPlacement;
    const inSnapshot = (key: string | null): boolean =>
      scopedPlacement !== null &&
      key !== null &&
      key >= scopedPlacement &&
      key <= end;
    const inPeriod = (key: string | null): boolean =>
      inSnapshot(key) && periodStart !== null && key! >= periodStart;
    const confirmed = !masterConflict && !planned && scopedPlacement !== null;
    let cumulativeInvalid = false;
    let periodInvalid = false;
    let unpositioned = false;
    const details: MortalitySourceDetail[] = [];

    for (const entries of dailyGroups) {
      if (!entries.some(record => record.flockId === flockId)) continue;
      const versions = distinct(entries, r => [
        r.flockId,
        r.recordDate,
        r.dayNumber,
        r.mortality,
      ]);
      const conflict = versions.length > 1;
      const identityConflict = consensus(entries, "flockId") === null;
      const unknownDate = entries.some(
        record => !isProductionDate(record.recordDate)
      );
      const relevantCumulative =
        unknownDate ||
        entries.some(record => inSnapshot(date(record.recordDate)));
      const relevantPeriod =
        unknownDate ||
        entries.some(record => inPeriod(date(record.recordDate)));
      // Unknown positions or ownership cannot safely be assigned to any date/cohort.
      if (unknownDate || identityConflict) {
        cumulativeInvalid = true;
        periodInvalid = true;
        unpositioned = true;
      } else if (conflict || !validId(entries[0].id)) {
        if (relevantCumulative) cumulativeInvalid = true;
        if (relevantPeriod) periodInvalid = true;
      }
      // Conflicting unique versions remain separate review details, never a winner.
      for (const record of versions) {
        if (record.flockId !== flockId) continue;
        const key = date(record.recordDate);
        const deaths = count(record.mortality);
        const recordIssues: string[] = [];
        if (entries.length > 1)
          recordIssues.push(
            `Repeated daily source ID ${record.id}; contributes at most once, exact duplicates counted once.`
          );
        if (conflict)
          recordIssues.push(
            `Conflicting versions of daily source ID ${record.id}; excluded from contributions, raw values retained for review.`
          );
        if (identityConflict)
          recordIssues.push(
            "Conflicting flock ownership for this daily source ID; period and cumulative mortality are ambiguous and N/A."
          );
        if (!validId(record.id))
          recordIssues.push(
            "Invalid daily source ID; excluded from contributions pending identity reconciliation."
          );
        if (key === null)
          recordIssues.push(
            "Invalid or missing operational date; excluded from dated contributions and both totals are ambiguous, not zero."
          );
        if (key !== null && scopedPlacement !== null && key < scopedPlacement)
          recordIssues.push(
            "Daily record before placement; excluded from period and cumulative contributions, retained for review."
          );
        if (!confirmed)
          recordIssues.push(
            "No valid confirmed placement/master data; this record is review-only."
          );
        if (deaths === null) {
          recordIssues.push(
            "Mortality is null, missing or invalid; a nonnegative safe integer is required, not an assumed zero."
          );
          if (inSnapshot(key)) cumulativeInvalid = true;
          if (inPeriod(key)) periodInvalid = true;
        }
        if (!Number.isSafeInteger(record.dayNumber) || record.dayNumber < 0) {
          recordIssues.push(
            "Invalid recorded day number; operational dates determine scope, not day number."
          );
        } else if (
          key !== null &&
          scopedPlacement !== null &&
          record.dayNumber !== productionDayDifference(scopedPlacement, key)
        ) {
          recordIssues.push(
            "Recorded day number differs from placement-day-0 elapsed days; the operational date determines scope."
          );
        }
        details.push({
          id: record.id,
          date: key,
          dayNumber: record.dayNumber,
          rawMortality: record.mortality,
          deaths,
          inPeriod: inPeriod(key),
          eligible:
            confirmed &&
            inSnapshot(key) &&
            !conflict &&
            validId(record.id) &&
            deaths !== null,
          cumulativeDeaths: null,
          issues: recordIssues,
        });
      }
    }
    details.sort(
      (a, b) =>
        (a.date ?? "~").localeCompare(b.date ?? "~") ||
        a.id - b.id ||
        JSON.stringify([a.dayNumber, a.rawMortality]).localeCompare(
          JSON.stringify([b.dayNumber, b.rawMortality])
        )
    );
    const byDate = new Map<string, MortalitySourceDetail[]>();
    for (const detail of details) {
      if (!inSnapshot(detail.date)) continue;
      const sameDay = byDate.get(detail.date!) ?? [];
      sameDay.push(detail);
      byDate.set(detail.date!, sameDay);
    }
    const trend: MortalityTrendPoint[] = [];
    let running: number | null = confirmed && !unpositioned ? 0 : null;
    let previousDate: string | null = scopedPlacement;
    for (const [key, sameDay] of Array.from(byDate)) {
      const ids = Array.from(new Set(sameDay.map(detail => detail.id))).sort(
        (a, b) => a - b
      );
      const dayIssues: string[] = [];
      if (ids.length > 1) {
        const message = `Duplicate daily date ${key}: ${ids.length} distinct source IDs; mortality summed once per ID, not repaired or merged.`;
        dayIssues.push(message);
        for (const detail of sameDay) detail.issues.push(message);
      }
      if (
        previousDate !== null &&
        productionDayDifference(previousDate, key) >
          (trend.length === 0 ? 0 : 1)
      ) {
        dayIssues.push(
          "Unrecorded dates precede this observation; cumulative recorded totals carry across the gap without fabricated zero-death days."
        );
      }
      const recordedDeaths = sameDay.every(detail => detail.eligible)
        ? sum(sameDay.map(detail => detail.deaths!))
        : null;
      if (recordedDeaths === null)
        dayIssues.push(
          "This day's recorded death total is unavailable because source counts, identity or placement are invalid/ambiguous."
        );
      running =
        running !== null && recordedDeaths !== null
          ? sum([running, recordedDeaths])
          : null;
      if (running !== null && initial !== null && running > initial)
        dayIssues.push(
          "Cumulative deaths exceed initial birds; invalid mortality ratio/negative mortality-only balance requires reconciliation, not clamping."
        );
      // Every same-date detail receives the entire day's end-of-day recorded total.
      for (const detail of sameDay) detail.cumulativeDeaths = running;
      trend.push({
        date: key,
        recordIds: ids,
        recordedDeaths,
        cumulativeDeaths: running,
        cumulativeMortalityPct: percent(running, initial),
        inPeriod: inPeriod(key),
        issues: unique([
          ...dayIssues,
          ...sameDay.flatMap(detail => detail.issues),
        ]),
      });
      previousDate = key;
    }
    for (const detail of details)
      issues.push(
        ...detail.issues.map(issue => `Daily record ${detail.id}: ${issue}`)
      );
    issues.push(
      ...trend.flatMap(point =>
        point.issues.map(issue => `Date ${point.date}: ${issue}`)
      )
    );

    const recordedDays = byDate.size;
    const periodRecordedDays = trend.filter(point => point.inPeriod).length;
    const calendarDaysInPeriod =
      periodStart === null
        ? null
        : productionDayDifference(periodStart, end) + 1;
    const unrecordedDaysInPeriod =
      calendarDaysInPeriod === null
        ? null
        : calendarDaysInPeriod - periodRecordedDays;
    if (recordedDays === 0)
      issues.push(
        "No recorded daily capture through report end; cumulative mortality is N/A, not successful zero activity."
      );
    if (periodRecordedDays === 0)
      issues.push(
        "No recorded daily capture in the selected period; period deaths are N/A, not zero."
      );
    if (unrecordedDaysInPeriod !== null && unrecordedDaysInPeriod > 0)
      issues.push(
        `${unrecordedDaysInPeriod} selected-period day(s) are unrecorded; missing capture is unknown, not confirmed zero mortality.`
      );
    if (
      scopedPlacement !== null &&
      recordedDays < productionDayDifference(scopedPlacement, end) + 1
    )
      issues.push(
        "Daily history through E is incomplete; cumulative totals describe recorded deaths only, not biological completeness."
      );
    const total = (period: boolean): number | null => {
      const observations = trend.filter(point => !period || point.inPeriod);
      if (
        !confirmed ||
        observations.length === 0 ||
        (period ? periodInvalid : cumulativeInvalid) ||
        observations.some(point => point.recordedDeaths === null)
      )
        return null;
      return sum(observations.map(point => point.recordedDeaths!));
    };
    const periodDeaths = total(true);
    const cumulativeDeaths = total(false);
    if (
      confirmed &&
      ((!periodInvalid && periodRecordedDays > 0 && periodDeaths === null) ||
        (!cumulativeInvalid && recordedDays > 0 && cumulativeDeaths === null))
    ) {
      issues.push(
        "Recorded death sum is unavailable or exceeds safe integer precision; no rounded/clamped count is substituted."
      );
    }
    for (const [label, deaths] of [
      ["Period", periodDeaths],
      ["Cumulative", cumulativeDeaths],
    ] as const) {
      if (deaths !== null && initial !== null && deaths > initial)
        issues.push(
          `${label} deaths exceed initial birds; invalid mortality ratio/negative mortality-only balance requires reconciliation. Raw recorded totals are preserved, not clamped.`
        );
    }
    const periodMortalityPct = percent(periodDeaths, initial);
    const cumulativeMortalityPct = percent(cumulativeDeaths, initial);
    rows.push({
      flockId,
      flockNumber:
        consensus(flockEntries, "flockNumber") ??
        `Flock ${flockId} (conflicting labels)`,
      houseId,
      houseName,
      placementDate: placement,
      currentStatus: status,
      initialBirds: initial,
      periodDeaths,
      periodMortalityPct,
      cumulativeDeaths,
      cumulativeMortalityPct,
      recordedDays,
      periodRecordedDays,
      calendarDaysInPeriod,
      unrecordedDaysInPeriod,
      periodSummaryEligible:
        houseValid && confirmed && periodMortalityPct !== null,
      cumulativeSummaryEligible:
        houseValid && confirmed && cumulativeMortalityPct !== null,
      issues: unique(issues),
      dailyRecords: details,
      trend,
    });
  }
  rows.sort((a, b) => a.houseId - b.houseId || a.flockId - b.flockId);
  const periodEligibleFlockCount = rows.filter(
    row => row.periodSummaryEligible
  ).length;
  const cumulativeEligibleFlockCount = rows.filter(
    row => row.cumulativeSummaryEligible
  ).length;
  const allPeriod = rows.length > 0 && periodEligibleFlockCount === rows.length;
  const allCumulative =
    rows.length > 0 && cumulativeEligibleFlockCount === rows.length;
  const summaryIssues: string[] = [];
  if (rows.length === 0)
    summaryIssues.push(
      "No matching placed flocks through report end; summary is N/A, not a zero-activity cohort."
    );
  else {
    if (!allPeriod)
      summaryIssues.push(
        `Incomplete period cohort: ${periodEligibleFlockCount}/${rows.length} flocks eligible; period aggregate deaths and percentage are N/A, with no silent partial subtotal.`
      );
    if (!allCumulative)
      summaryIssues.push(
        `Incomplete cumulative cohort: ${cumulativeEligibleFlockCount}/${rows.length} flocks eligible; cumulative aggregate deaths and percentage are N/A, with no silent partial subtotal.`
      );
  }
  const initialBirds =
    allPeriod || allCumulative ? sum(rows.map(row => row.initialBirds!)) : null;
  const periodDeaths =
    allPeriod && initialBirds !== null
      ? sum(rows.map(row => row.periodDeaths!))
      : null;
  const cumulativeDeaths =
    allCumulative && initialBirds !== null
      ? sum(rows.map(row => row.cumulativeDeaths!))
      : null;
  if (
    ((allPeriod || allCumulative) && initialBirds === null) ||
    (allPeriod && periodDeaths === null) ||
    (allCumulative && cumulativeDeaths === null)
  ) {
    summaryIssues.push(
      "Aggregate count exceeds safe integer precision; affected aggregate values are N/A."
    );
  }
  if (rows.some(row => row.issues.length > 0))
    summaryIssues.push(
      "Review per-flock source and coverage warnings; numeric eligibility does not establish complete biological capture."
    );
  if (
    rows.some(
      row =>
        (row.unrecordedDaysInPeriod ?? 0) > 0 ||
        row.issues.some(issue =>
          issue.includes("Daily history through E is incomplete")
        )
    )
  ) {
    summaryIssues.push(
      "Recorded-only totals: missing daily dates are unknown, not confirmed zero mortality; coverage must accompany the totals."
    );
  }
  return {
    kind: "mortality",
    generatedAt,
    timezone,
    filters: { ...filters },
    rows,
    summary: {
      flockCount: rows.length,
      periodEligibleFlockCount,
      cumulativeEligibleFlockCount,
      initialBirds,
      periodDeaths,
      periodMortalityPct: percent(periodDeaths, initialBirds),
      cumulativeDeaths,
      cumulativeMortalityPct: percent(cumulativeDeaths, initialBirds),
      issues: summaryIssues,
    },
    notes: [
      "Source is the existing daily-record mortality entry only. No separate cull count, cause-of-death analysis or diagnosis is supported; no transport mortality or other mortality source is added.",
      "Historical results use today's supplied/corrected records dated through E, not an immutable reconstruction of what was known then. Source history has not been validated or repaired by this report.",
      "House/flock labels, placement counts and current recorded status are today's master data, not historical snapshots. Planned/not-confirmed and no-capture flocks remain visible as N/A.",
      "Operational calendar date labels are preserved without timezone shifting. Generated-at is the caller-supplied instant; the company timezone applies only to genuine instant displays.",
      "Period deaths use inclusive S through E, no earlier than placement; a blank start means placement through E. Cumulative deaths use placement through E, including dates before S.",
      "Both mortality percentages divide recorded deaths by initial birds, not opening live stock or bird-days. Multi-flock percentages use unrounded ratios of sums for the entire selected eligible cohort, never means of flock percentages. Period and cumulative eligibility are independent; incomplete cohorts are N/A with coverage.",
      "Missing dates are unknown, not zero; recorded zero mortality is preserved. Trends include actual recorded dates only. Cumulative recorded totals carry across gaps without invented zero days and do not prove biological completeness.",
      "Each authentic source ID contributes once; exact duplicates warn and count once. Conflicting versions retain raw values for review and cannot contribute. Multiple distinct IDs on a date are summed with duplicate-date warnings; every same-date detail has the same end-of-day cumulative total.",
      "Invalid counts are not clamped or repaired; null/invalid or ambiguous source values make affected totals N/A. Known future records are excluded entirely. Pre-placement/undated records are excluded from contributions and flagged for review; undated or conflicting ownership makes scope ambiguous.",
    ],
  };
}
