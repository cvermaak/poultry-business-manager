import {
  isProductionDate,
  productionDayDifference,
} from "../shared/production-report-dates";
import type {
  FlockPerformanceReport,
  FlockPerformanceRow,
  FlockPerformanceSource,
  ProductionCatchSource,
  ProductionDailyDetail,
  ProductionHarvestDetail,
  ResolvedFlockPerformanceFilters,
} from "../shared/production-reports";

/** This module deliberately has no database, clock, network, or application imports. */
type Identified = { id: number };
type SourceGroup<T> = { value: T; entries: T[]; conflict: boolean };

function groupSources<T extends Identified>(
  records: readonly T[],
  fingerprint: (record: T) => unknown[]
): SourceGroup<T>[] {
  const groups = new Map<number, T[]>();
  for (const record of records) {
    const entries = groups.get(record.id) ?? [];
    entries.push(record);
    groups.set(record.id, entries);
  }
  return Array.from(groups.values()).map(entries => ({
    value: entries[0],
    entries,
    conflict:
      new Set(entries.map(record => JSON.stringify(fingerprint(record)))).size >
      1,
  }));
}

function consensus<T, K extends keyof T>(
  entries: readonly T[],
  key: K
): T[K] | null {
  return entries.every(entry => entry[key] === entries[0][key])
    ? entries[0][key]
    : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function birdCount(value: unknown): number | null {
  const result = numberValue(value);
  return result !== null && Number.isSafeInteger(result) && result >= 0
    ? result
    : null;
}

function weightValue(value: unknown): number | null {
  const result = numberValue(value);
  return result !== null && result > 0 ? result : null;
}

// Null, blank, and zero are not actual positive measurements. A nonblank invalid
// value IS a failed observation: do not skip it to obtain a convenient endpoint.
function hasWeightAttempt(value: unknown): boolean {
  return (
    value != null &&
    !(typeof value === "string" && !value.trim()) &&
    numberValue(value) !== 0
  );
}

function countSum(values: number[]): number | null {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
}

function dateOrNull(value: unknown): string | null {
  return isProductionDate(value) ? value : null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function byDateAndId(
  a: { date: string | null; id: number },
  b: { date: string | null; id: number }
): number {
  return (a.date ?? "~").localeCompare(b.date ?? "~") || a.id - b.id;
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
  for (const id of [filters.houseId, filters.flockId]) {
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) {
      throw new Error(
        "Production report filter IDs must be positive integers."
      );
    }
  }
}

/**
 * Historical outputs use today's supplied/corrected records, dated through E.
 * Counts are recorded activity/balances, not assertions of biological completeness.
 * API authorization and reader scope are the caller's responsibility.
 */
export function buildFlockPerformanceReport(
  source: FlockPerformanceSource,
  filters: ResolvedFlockPerformanceFilters,
  timezone: string,
  generatedAt: string
): FlockPerformanceReport {
  validateFilters(filters);
  const end = filters.endDate;
  const dailyGroups = groupSources(source.dailyRecords, r => [
    r.flockId,
    r.recordDate,
    r.dayNumber,
    r.mortality,
    r.averageWeight,
  ]);
  const harvestGroups = groupSources(source.harvests, r => [
    r.flockId,
    r.harvestDate,
    r.chickenCountLoaded,
  ]);
  const catchGroups = groupSources(source.catches, r => [
    r.flockId,
    r.catchDate,
    r.harvestRecordId,
    r.status,
  ]);
  const flockGroups = groupSources(source.flocks, r => [
    r.flockNumber,
    r.houseId,
    r.placementDate,
    r.initialCount,
    r.status,
  ]);
  const harvestById = new Map(
    harvestGroups.map(group => [group.value.id, group])
  );
  const rows: FlockPerformanceRow[] = [];

  for (const flockGroup of flockGroups) {
    const { value: flock, entries: flockEntries } = flockGroup;
    if (filters.flockId !== null && flock.id !== filters.flockId) continue;
    if (
      filters.houseId !== null &&
      !flockEntries.some(entry => entry.houseId === filters.houseId)
    )
      continue;
    const placement = dateOrNull(consensus(flockEntries, "placementDate"));
    if (
      flockEntries.every(
        entry =>
          isProductionDate(entry.placementDate) && entry.placementDate > end
      )
    )
      continue;

    const issues: string[] = [];
    if (flockEntries.length > 1)
      issues.push(`Repeated flock source ID ${flock.id}; counted once.`);
    if (flockGroup.conflict)
      issues.push(
        `Conflicting master records for flock ID ${flock.id}; calculations requiring master data are unavailable.`
      );
    if (placement === null)
      issues.push(
        "Invalid or missing placement date; the flock remains visible but its history cannot be scoped reliably."
      );
    const usablePlacement = flockGroup.conflict ? null : placement;
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
        "Planned/not-confirmed placement: activity, mortality and remaining birds are not confirmed performance results."
      );
    const initial = flockGroup.conflict ? null : birdCount(flock.initialCount);
    if (initial === null)
      issues.push(
        "Invalid initial bird count; a nonnegative safe integer is required."
      );
    else if (initial === 0)
      issues.push(
        "Initial bird count is zero; a positive placement denominator is required for mortality and remaining birds."
      );

    const houseId = consensus(flockEntries, "houseId") ?? filters.houseId ?? -1;
    const houses = source.houses.filter(house => house.id === houseId);
    const houseValid =
      Number.isSafeInteger(houseId) &&
      houseId > 0 &&
      houses.length > 0 &&
      houses.every(house => house.name === houses[0].name);
    const houseName = houseValid
      ? houses[0].name
      : `House ${houseId} (label unavailable or conflicting)`;
    if (!houseValid)
      issues.push(
        "Missing, invalid or conflicting house identifier/label; master-data reconciliation is required."
      );
    const periodStart =
      usablePlacement === null
        ? null
        : filters.startDate !== null && filters.startDate > usablePlacement
          ? filters.startDate
          : usablePlacement;
    const inSnapshot = (date: string | null): boolean =>
      usablePlacement !== null &&
      date !== null &&
      date >= usablePlacement &&
      date <= end;
    const inPeriod = (date: string | null): boolean =>
      inSnapshot(date) && periodStart !== null && date! >= periodStart;

    const dailyRecords: ProductionDailyDetail[] = [];
    const capturedDates = new Set<string>();
    const periodDates = new Set<string>();
    const cumulativeCounts: number[] = [];
    const periodCounts: number[] = [];
    let cumulativeInvalid = false;
    let periodInvalid = false;
    let unpositionedWeight = false;
    const weightsByDate = new Map<
      string,
      Array<{ weight: number | null; id: number }>
    >();

    for (const group of dailyGroups.filter(group =>
      group.entries.some(entry => entry.flockId === flock.id)
    )) {
      const record = group.value;
      const date = dateOrNull(consensus(group.entries, "recordDate"));
      if (
        group.entries.every(
          entry => isProductionDate(entry.recordDate) && entry.recordDate > end
        )
      )
        continue;
      const recordIssues: string[] = [];
      const mortality = group.conflict ? null : birdCount(record.mortality);
      const weight = group.conflict ? null : weightValue(record.averageWeight);
      const weightAttempt = group.entries.some(entry =>
        hasWeightAttempt(entry.averageWeight)
      );
      if (group.entries.length > 1)
        recordIssues.push(
          `Repeated daily source ID ${record.id}; contributes at most once.`
        );
      if (group.conflict)
        recordIssues.push(
          `Conflicting versions of daily source ID ${record.id}; no arbitrary version selected.`
        );
      if (date === null)
        recordIssues.push(
          "Invalid, missing or conflicting operational date; excluded from dated contributions."
        );
      if (mortality === null)
        recordIssues.push(
          "Mortality is missing or invalid; a nonnegative safe integer is required, not an assumed zero."
        );
      if (weightAttempt && weight === null)
        recordIssues.push(
          "Invalid or conflicting sampled weight; a finite positive kg/bird observation is required."
        );
      if (record.dayNumber < 0 || !Number.isSafeInteger(record.dayNumber))
        recordIssues.push(
          "Invalid recorded day number; elapsed days use placement and operational dates instead."
        );
      else if (
        date !== null &&
        usablePlacement !== null &&
        record.dayNumber !== productionDayDifference(usablePlacement, date)
      )
        recordIssues.push(
          `Recorded day number ${record.dayNumber} differs from placement-day-0 elapsed days ${productionDayDifference(usablePlacement, date)}; operational dates determine scope and elapsed age.`
        );
      if (date !== null && usablePlacement !== null && date < usablePlacement)
        recordIssues.push(
          "Daily record before placement; excluded from the snapshot and period."
        );
      if (usablePlacement === null)
        recordIssues.push(
          "Daily record cannot contribute without a valid confirmed placement date."
        );

      const snapshot = inSnapshot(date);
      const period = inPeriod(date);
      if (snapshot) {
        capturedDates.add(date!);
        if (period) periodDates.add(date!);
        if (mortality === null) cumulativeInvalid = true;
        else cumulativeCounts.push(mortality);
        if (period) {
          if (mortality === null) periodInvalid = true;
          else periodCounts.push(mortality);
        }
        if (weightAttempt) {
          const observations = weightsByDate.get(date!) ?? [];
          observations.push({ weight, id: record.id });
          weightsByDate.set(date!, observations);
        }
      } else if (date === null) {
        // An undated source cannot be safely assigned to the period or the future.
        cumulativeInvalid = true;
        periodInvalid = true;
        if (weightAttempt) unpositionedWeight = true;
      }
      dailyRecords.push({
        id: record.id,
        date,
        dayNumber: consensus(group.entries, "dayNumber") ?? 0,
        mortality,
        weightKg: weight,
        inPeriod: period,
        issues: recordIssues,
      });
    }
    dailyRecords.sort(byDateAndId);
    const dailyByDate = new Map<string, ProductionDailyDetail[]>();
    for (const detail of dailyRecords) {
      if (!inSnapshot(detail.date)) continue;
      const sameDay = dailyByDate.get(detail.date!) ?? [];
      sameDay.push(detail);
      dailyByDate.set(detail.date!, sameDay);
    }
    for (const [date, sameDay] of Array.from(dailyByDate)) {
      if (sameDay.length > 1) {
        const message = `Duplicate daily date ${date}: all ${sameDay.length} unique record IDs are retained and recorded mortality is summed, not automatically deduplicated.`;
        issues.push(message);
        for (const detail of sameDay) detail.issues.push(message);
      }
    }
    for (const detail of dailyRecords) {
      for (const issue of detail.issues)
        issues.push(`Daily record ${detail.id}: ${issue}`);
    }

    const recordedDays = capturedDates.size;
    const periodRecordedDays = periodDates.size;
    const expectedPeriodDays =
      periodStart === null
        ? null
        : productionDayDifference(periodStart, end) + 1;
    const missingPeriodDays =
      expectedPeriodDays === null
        ? null
        : expectedPeriodDays - periodRecordedDays;
    if (recordedDays === 0)
      issues.push(
        "No recorded daily capture through report end; mortality and recorded remaining birds are N/A, not successful zero activity."
      );
    if (periodRecordedDays === 0)
      issues.push(
        "No recorded daily capture in the selected period; period deaths are N/A, not zero."
      );
    if (missingPeriodDays !== null && missingPeriodDays > 0)
      issues.push(
        `${missingPeriodDays} selected-period day(s) have no daily record; missing capture is unknown, not confirmed zero activity.`
      );
    if (
      usablePlacement !== null &&
      recordedDays < productionDayDifference(usablePlacement, end) + 1
    )
      issues.push(
        "Daily history through report end is incomplete; displayed death totals are recorded-only, not proof of complete mortality capture."
      );
    const cumulativeDeaths =
      !planned &&
      usablePlacement !== null &&
      recordedDays > 0 &&
      !cumulativeInvalid
        ? countSum(cumulativeCounts)
        : null;
    const periodDeaths =
      !planned &&
      usablePlacement !== null &&
      periodRecordedDays > 0 &&
      !periodInvalid
        ? countSum(periodCounts)
        : null;
    if (
      (!cumulativeInvalid &&
        recordedDays > 0 &&
        countSum(cumulativeCounts) === null) ||
      (!periodInvalid &&
        periodRecordedDays > 0 &&
        countSum(periodCounts) === null)
    ) {
      issues.push(
        "Recorded death sum exceeds safe integer precision; totals are unavailable."
      );
    }

    const harvestRecords: ProductionHarvestDetail[] = [];
    const catchExceptions: FlockPerformanceRow["catchExceptions"] = [];
    let movementAmbiguous = false;
    let loadedUnknown = usablePlacement === null;
    const eligibleLoads: number[] = [];
    const exception = (
      group: SourceGroup<ProductionCatchSource>,
      reason: string
    ) => {
      catchExceptions.push({
        sessionId: group.value.id,
        harvestRecordId: consensus(group.entries, "harvestRecordId"),
        date: dateOrNull(consensus(group.entries, "catchDate")),
        reason,
      });
    };

    for (const group of harvestGroups.filter(group =>
      group.entries.some(entry => entry.flockId === flock.id)
    )) {
      const harvest = group.value;
      const date = dateOrNull(consensus(group.entries, "harvestDate"));
      if (
        group.entries.every(
          entry =>
            isProductionDate(entry.harvestDate) && entry.harvestDate > end
        )
      )
        continue;
      const links = catchGroups.filter(session =>
        session.entries.some(entry => entry.harvestRecordId === harvest.id)
      );
      const recordIssues: string[] = [];
      const loaded = group.conflict
        ? null
        : birdCount(harvest.chickenCountLoaded);
      let classification = "Completed catch-linked harvest";
      let eligible = true;
      if (group.entries.length > 1)
        recordIssues.push(
          `Repeated harvest source ID ${harvest.id}; contributes at most once.`
        );
      if (usablePlacement === null || date === null || date < usablePlacement) {
        eligible = false;
        classification =
          "Excluded — invalid or out-of-scope placement/harvest date";
        recordIssues.push(
          date === null
            ? "Invalid, missing or conflicting harvest operational date; reconciliation required."
            : usablePlacement === null
              ? "No usable placement date to scope this harvest."
              : "Harvest before placement; excluded and requires reconciliation."
        );
        movementAmbiguous = true;
        if (date === null) loadedUnknown = true;
      }
      if (group.conflict) {
        eligible = false;
        classification = "Excluded — conflicting harvest source ID";
        recordIssues.push(
          "Conflicting versions of this harvest ID; no arbitrary source row selected."
        );
        movementAmbiguous = true;
        loadedUnknown = true;
      }
      if (loaded === null) {
        eligible = false;
        recordIssues.push(
          "Loaded bird count is missing or invalid; a nonnegative safe integer is required."
        );
        movementAmbiguous = true;
        if (inSnapshot(date)) loadedUnknown = true;
      }
      // Linkage is provenance for the harvest, never an extra quantity. Link
      // validation is relevant to an as-of snapshot only for non-future events.
      {
        if (links.length === 0) {
          if (eligible)
            classification = "Recorded harvest — completion status unavailable";
          recordIssues.push(
            "Unlinked recorded harvest: completion status unavailable; source alone does not prove manual entry or historical uniqueness."
          );
        } else if (links.length > 1) {
          eligible = false;
          classification = "Excluded — multiple catch sessions";
          const reason = `Multiple catch sessions link to harvest ${harvest.id}; excluded pending reconciliation.`;
          recordIssues.push(reason);
          for (const link of links) exception(link, reason);
          movementAmbiguous = true;
        } else {
          const link = links[0];
          let reason: string | null = null;
          if (link.conflict)
            reason = `Conflicting versions of catch session ${link.value.id} linked to harvest ${harvest.id}.`;
          else if (link.value.flockId !== flock.id)
            reason = `Catch session flock mismatch for harvest ${harvest.id}.`;
          else if (link.value.status !== "completed")
            reason = `Catch session for harvest ${harvest.id} is not completed (current status: ${link.value.status}).`;
          if (reason !== null) {
            eligible = false;
            classification = "Excluded — incompatible catch linkage";
            recordIssues.push(reason);
            exception(link, reason);
            movementAmbiguous = true;
          } else if (!isProductionDate(link.value.catchDate)) {
            const reason = `Catch session ${link.value.id} has an invalid catch date; the harvest operational date alone scopes the eligible harvest.`;
            recordIssues.push(reason);
            exception(link, reason);
          }
        }
      }
      if (eligible && loaded !== null) eligibleLoads.push(loaded);
      harvestRecords.push({
        id: harvest.id,
        date,
        loadedBirds: loaded,
        eligible,
        classification,
        sessionIds: links.map(link => link.value.id).sort((a, b) => a - b),
        issues: recordIssues,
      });
    }
    harvestRecords.sort(byDateAndId);

    for (const group of catchGroups.filter(group =>
      group.entries.some(entry => entry.flockId === flock.id)
    )) {
      if (!group.entries.some(entry => entry.status === "completed")) continue;
      if (
        group.entries.every(
          entry => isProductionDate(entry.catchDate) && entry.catchDate > end
        )
      )
        continue;
      const linkedId = consensus(group.entries, "harvestRecordId");
      const linkedGroup =
        linkedId === null ? undefined : harvestById.get(linkedId);
      const eligibleHarvest =
        linkedId === null
          ? undefined
          : harvestRecords.find(
              record => record.id === linkedId && record.eligible
            );
      if (group.conflict || !linkedGroup || !eligibleHarvest) {
        const reason = `Completed catch session ${group.value.id} has no valid eligible harvest link through report end${linkedId === null ? " (missing harvest ID)" : ` (harvest ${linkedId})`}; remaining birds require reconciliation.`;
        exception(group, reason);
        movementAmbiguous = true;
      }
    }
    const exceptionKeys = new Set<string>();
    const distinctExceptions = catchExceptions
      .filter(item => {
        const key = `${item.sessionId}:${item.reason}`;
        if (exceptionKeys.has(key)) return false;
        exceptionKeys.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          (a.date ?? "~").localeCompare(b.date ?? "~") ||
          a.sessionId - b.sessionId ||
          a.reason.localeCompare(b.reason)
      );
    for (const detail of harvestRecords) {
      for (const issue of detail.issues)
        issues.push(`Harvest ${detail.id}: ${issue}`);
    }
    for (const item of distinctExceptions)
      issues.push(`Catch session ${item.sessionId}: ${item.reason}`);
    const loadedBirds = loadedUnknown ? null : countSum(eligibleLoads);
    if (!loadedUnknown && loadedBirds === null)
      issues.push(
        "Loaded bird sum exceeds safe integer precision; unavailable."
      );
    if (movementAmbiguous)
      issues.push(
        "Incomplete or ambiguous harvest movements; eligible loaded subtotal excludes source exceptions and recorded remaining birds are N/A/reconciliation required."
      );
    let remainingBirds =
      !planned &&
      usablePlacement !== null &&
      initial !== null &&
      initial > 0 &&
      cumulativeDeaths !== null &&
      loadedBirds !== null &&
      !movementAmbiguous
        ? initial - cumulativeDeaths - loadedBirds
        : null;
    if (remainingBirds !== null && !Number.isSafeInteger(remainingBirds)) {
      remainingBirds = null;
      issues.push(
        "Recorded remaining balance exceeds safe integer precision; unavailable."
      );
    }
    if (remainingBirds !== null && remainingBirds < 0) {
      issues.push(
        `Negative recorded remaining balance ${remainingBirds} birds = initial ${initial} - recorded deaths ${cumulativeDeaths} - eligible loaded ${loadedBirds}; not clamped to zero. Remaining birds are N/A/reconciliation required; raw contributing totals remain visible.`
      );
      remainingBirds = null;
    }
    const cumulativeMortalityPct =
      initial !== null && initial > 0 && cumulativeDeaths !== null
        ? 100 * (cumulativeDeaths / initial)
        : null;
    if (cumulativeMortalityPct !== null && cumulativeMortalityPct > 100)
      issues.push(
        "Recorded cumulative mortality exceeds 100%; requires reconciliation."
      );

    const observations = Array.from(weightsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, samples]) => {
        const values = new Set(samples.map(sample => sample.weight));
        const valid = !values.has(null) && values.size === 1;
        if (!valid) {
          const message = `Invalid or conflicting sampled weights on ${date} (daily IDs ${samples.map(sample => sample.id).join(", ")}); this measurement date is unavailable, not replaced with an earlier/interior sample.`;
          issues.push(message);
          for (const detail of dailyRecords.filter(
            record => record.date === date
          ))
            detail.issues.push(message);
        }
        return { date, weight: valid ? samples[0].weight : null };
      });
    if (unpositionedWeight)
      issues.push(
        "A sampled weight has an invalid/conflicting date; latest weight and growth cannot be positioned reliably."
      );
    const latest = !unpositionedWeight ? observations.at(-1) : undefined;
    const latestWeightKg = latest?.weight ?? null;
    const latestWeightDate = latest?.date ?? null;
    const weightAgeDays =
      latestWeightDate === null
        ? null
        : productionDayDifference(latestWeightDate, end);
    const weightOutsidePeriod =
      latestWeightDate !== null &&
      filters.startDate !== null &&
      latestWeightDate < filters.startDate;
    if (latestWeightKg === null)
      issues.push(
        "Latest sampled average weight is N/A: no unambiguous positive actual observation available at the latest measurement date."
      );
    if (weightOutsidePeriod)
      issues.push(
        "Latest sample is outside the selected period; its actual measurement date is retained, not presented as a new measurement at report end."
      );
    if (weightAgeDays !== null && weightAgeDays > 0)
      issues.push(
        `Latest measurement is ${weightAgeDays} calendar day(s) old at report end; not a current-day weight or a forecast.`
      );
    const periodObservations = observations.filter(observation =>
      inPeriod(observation.date)
    );
    const first =
      periodObservations.length >= 2 ? periodObservations[0] : undefined;
    const last =
      periodObservations.length >= 2 ? periodObservations.at(-1) : undefined;
    let growth =
      !unpositionedWeight && first?.weight != null && last?.weight != null
        ? (1000 * (last.weight - first.weight)) /
          productionDayDifference(first.date, last.date)
        : null;
    if (growth !== null && !Number.isFinite(growth)) growth = null;
    if (growth === null)
      issues.push(
        "Observed mean-weight growth is N/A: two distinct dated observations inside the period with valid, unambiguous first/last endpoints are required; no assumed starting weight or growth is used."
      );
    else if (growth < 0)
      issues.push(
        "Observed sample-mean weight change is negative; preserved without clamping, not a forecast."
      );

    const summaryEligible =
      houseValid &&
      usablePlacement !== null &&
      !planned &&
      initial !== null &&
      initial > 0 &&
      periodDeaths !== null &&
      cumulativeDeaths !== null &&
      loadedBirds !== null &&
      remainingBirds !== null &&
      remainingBirds >= 0;
    rows.push({
      flockId: flock.id,
      flockNumber:
        consensus(flockEntries, "flockNumber") ??
        `Flock ${flock.id} (conflicting labels)`,
      houseId,
      houseName,
      placementDate: placement,
      currentStatus: status,
      initialBirds: initial,
      elapsedDays:
        usablePlacement === null
          ? null
          : productionDayDifference(usablePlacement, end),
      periodDeaths,
      cumulativeDeaths,
      cumulativeMortalityPct,
      loadedBirds,
      remainingBirds,
      latestWeightKg,
      latestWeightDate,
      weightAgeDays,
      weightOutsidePeriod,
      observedGrowthGPerBirdDay: growth,
      growthStartDate: unpositionedWeight ? null : (first?.date ?? null),
      growthEndDate: unpositionedWeight ? null : (last?.date ?? null),
      growthStartWeightKg: unpositionedWeight ? null : (first?.weight ?? null),
      growthEndWeightKg: unpositionedWeight ? null : (last?.weight ?? null),
      recordedDays,
      periodRecordedDays,
      expectedPeriodDays,
      missingPeriodDays,
      summaryEligible,
      issues: unique(issues),
      dailyRecords,
      harvestRecords,
      catchExceptions: distinctExceptions,
    });
  }
  rows.sort((a, b) => a.houseId - b.houseId || a.flockId - b.flockId);
  const eligibleFlockCount = rows.filter(row => row.summaryEligible).length;
  const allEligible = rows.length > 0 && eligibleFlockCount === rows.length;
  const summaryIssues: string[] = [];
  if (rows.length === 0)
    summaryIssues.push(
      "No matching placed flocks through report end; summary is N/A, not a zero-activity cohort."
    );
  else if (!allEligible)
    summaryIssues.push(
      `Incomplete cohort: ${eligibleFlockCount}/${rows.length} flocks have valid recorded count/balance metrics. All aggregate values are N/A; invalid or data-insufficient flocks are not silently omitted.`
    );
  if (
    rows.some(
      row =>
        (row.missingPeriodDays !== null && row.missingPeriodDays > 0) ||
        row.issues.some(issue =>
          issue.includes("Daily history through report end is incomplete")
        )
    )
  )
    summaryIssues.push(
      "Recorded-only totals: missing daily dates are unknown, not confirmed zero activity; capture coverage must accompany the totals."
    );
  if (rows.some(row => row.issues.length > 0))
    summaryIssues.push(
      "Review per-flock data-quality and source-link caveats; summary eligibility concerns count/balance metrics, not completeness of weight observations."
    );
  const sum = (
    field:
      | "initialBirds"
      | "periodDeaths"
      | "cumulativeDeaths"
      | "loadedBirds"
      | "remainingBirds"
  ) => (allEligible ? countSum(rows.map(row => row[field]!)) : null);
  const totals = {
    initialBirds: sum("initialBirds"),
    periodDeaths: sum("periodDeaths"),
    cumulativeDeaths: sum("cumulativeDeaths"),
    loadedBirds: sum("loadedBirds"),
    remainingBirds: sum("remainingBirds"),
  };
  const totalsSafe =
    allEligible && Object.values(totals).every(value => value !== null);
  if (allEligible && !totalsSafe)
    summaryIssues.push(
      "Aggregate count exceeds safe integer precision; all aggregate values are unavailable."
    );
  return {
    kind: "flock-performance",
    generatedAt,
    timezone,
    filters: { ...filters },
    rows,
    summary: {
      flockCount: rows.length,
      eligibleFlockCount,
      excludedFlockCount: rows.length - eligibleFlockCount,
      initialBirds: totalsSafe ? totals.initialBirds : null,
      periodDeaths: totalsSafe ? totals.periodDeaths : null,
      cumulativeDeaths: totalsSafe ? totals.cumulativeDeaths : null,
      cumulativeMortalityPct:
        totalsSafe && totals.initialBirds! > 0
          ? 100 * (totals.cumulativeDeaths! / totals.initialBirds!)
          : null,
      loadedBirds: totalsSafe ? totals.loadedBirds : null,
      remainingBirds: totalsSafe ? totals.remainingBirds : null,
      issues: summaryIssues,
    },
    notes: [
      "Historical results use today's corrected source records dated through the selected end, not an immutable reconstruction of what was known then. Existing actual data/history has not been validated by this report implementation.",
      "House/flock labels, initial counts, placement and current recorded status are today's master data, not historical snapshots. Days since placement at report end use placement day 0, not a completed flock's final slaughter age.",
      "Operational calendar dates are preserved without timezone shifting. Generated-at is the caller-supplied instant; the configured company timezone applies to instant displays.",
      "Period deaths use selected inclusive start/end dates, no earlier than placement. Cumulative deaths, canonical loaded birds and recorded remaining use placement through end, including records before the selected start.",
      "Recorded remaining = initial birds minus recorded cumulative daily deaths minus eligible loaded harvest birds. It is not a verified physical stock count: unrecorded culls, transfers and placement additions are not known zero. Transport deaths are not deducted again.",
      "Missing daily dates are unknown, not zero. Recorded zero mortality is preserved. Totals with partial daily capture describe recorded activity only; planned/no-daily-capture flocks do not become successful zero-mortality flocks.",
      "Each source ID contributes once. Separate daily IDs on the same date remain recorded contributions with duplicate-date warnings; no historical merging, deletion or correction is performed.",
      "A catch session is provenance, not an additional loaded quantity. Only compatible completed links or unlinked recorded harvests are canonical; unlinked records have unavailable completion status and cannot be proven manual or historically unique.",
      "Weight is kg/bird; observed growth is sample-mean change in g/bird/day between the actual first/last distinct dates in the period, not a forecast, ranking or pooled farm average. Zero/blank weight is not a positive actual measurement; invalid/conflicting endpoints are not replaced by convenient samples.",
      "Aggregate mortality is the ratio of summed recorded deaths to summed initial birds for the entire valid selected cohort, never an unweighted mean. If any selected flock lacks valid count/balance metrics, all aggregate numeric values are N/A with coverage counts; no partial subset is silently presented as complete.",
    ],
  };
}
