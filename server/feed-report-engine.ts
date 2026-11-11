import { isProductionDate, productionDayDifference } from "../shared/production-report-dates";
import type { ProductionReportFlock, ResolvedFlockPerformanceFilters } from "../shared/production-reports";
import type { HarvestCatchException, HarvestEventResult } from "../shared/harvest-report";
import type { FeedCoverage, FeedDailyDetail, FeedDailySource, FeedPerformanceReport, FeedReportRow, FeedReportSource, FeedStage, FeedTotals } from "../shared/feed-report";
import { buildHarvestReport } from "./harvest-report-engine";

// Pure, caller-supplied snapshot only. No clock, application, database or network.
const MAX = Number.MAX_SAFE_INTEGER;
const STAGES: FeedStage[] = ["starter", "grower", "finisher", "unspecified"];
const BASIS = "Harvest-adjusted recorded-feed FCR — output plus estimated remaining live mass; provisional — recorded-balance basis";
type Group<T> = { id: number; entries: T[]; conflict: boolean };
type Master = { group: Group<ProductionReportFlock>; placement: string | null; initial: number | null; houseId: number | null; houseName: string; label: string; status: string; valid: boolean; issues: string[] };
const unique = (values: string[]) => Array.from(new Set(values));
const date = (value: unknown): string | null => isProductionDate(value) ? value : null;
const validId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonblank = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function fingerprint(values: unknown[]): string {
  return JSON.stringify(values.map(value => [typeof value, typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0)) ? String(value) + (Object.is(value, -0) ? "-0" : "") : value]));
}
function compareId(a: number, b: number): number {
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : fingerprint([a]).localeCompare(fingerprint([b]));
}
function chronological(a: { date: string | null; id: number }, b: { date: string | null; id: number }): number {
  if (a.date === null && b.date !== null) return 1;
  if (b.date === null && a.date !== null) return -1;
  return (a.date ?? "").localeCompare(b.date ?? "") || compareId(a.id, b.id);
}
function groups<T extends { id: number }>(records: readonly T[], fields: (r: T) => unknown[]): Group<T>[] {
  const map = new Map<number, T[]>();
  for (const record of records) map.set(record.id, [...(map.get(record.id) ?? []), record]);
  return Array.from(map, ([id, entries]) => ({ id,
    entries: [...entries].sort((a, b) => fingerprint(fields(a)).localeCompare(fingerprint(fields(b)))),
    conflict: new Set(entries.map(r => fingerprint(fields(r)))).size > 1,
  })).sort((a, b) => compareId(a.id, b.id));
}
function consensus<T, K extends keyof T>(entries: readonly T[], key: K): T[K] | null {
  return entries.every(r => Object.is(r[key], entries[0][key])) ? entries[0][key] : null;
}
function count(value: unknown): number | null {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function kg(value: unknown): number | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const [whole = "", fraction = ""] = text.split(".");
    const integer = whole.replace(/^0+/, "") || "0", max = String(MAX);
    if (integer.length > max.length || (integer.length === max.length && integer > max) ||
      (integer === max && /[1-9]/.test(fraction))) return null;
    value = Number(text);
    if (value === 0 && /[1-9]/.test(text)) return null; // Reject decimal underflow, not genuine zero.
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX ? value : null;
}
function sum(values: number[], emptyZero = false): number | null {
  if (!values.length) return emptyZero ? 0 : null;
  let total = 0;
  for (const value of values) {
    if (value > MAX - total || total > MAX - value) return null;
    total += value;
    if (!Number.isFinite(total) || total > MAX) return null;
  }
  return total;
}
function product(a: number, b: number): number | null {
  if (a === 0 || b === 0) return 0;
  if (a > MAX / b || b > MAX / a) return null;
  const result = a * b;
  return Number.isFinite(result) && result > 0 && result <= MAX ? result : null;
}
function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a <= 0 || b <= 0) return null;
  const value = a / b;
  return Number.isFinite(value) && value > 0 && value <= MAX ? value : null;
}
function weightAttempt(value: unknown): boolean {
  return value != null && !(typeof value === "string" && !value.trim()) && kg(value) !== 0;
}
function dailyFields(r: FeedDailySource): unknown[] {
  return [r.flockId, r.recordDate, r.dayNumber, r.mortality, r.averageWeight, r.feedConsumed, r.feedType];
}
function copyDaily(r: FeedDailySource): FeedDailySource {
  return { id: r.id, flockId: r.flockId, recordDate: r.recordDate, dayNumber: r.dayNumber,
    mortality: r.mortality, averageWeight: r.averageWeight, feedConsumed: r.feedConsumed, feedType: r.feedType };
}
function validateFilters(filters: ResolvedFlockPerformanceFilters): void {
  if (!isProductionDate(filters.endDate) || (filters.startDate !== null && !isProductionDate(filters.startDate))) throw new Error("Invalid production report operational date.");
  if (filters.startDate !== null && filters.startDate > filters.endDate) throw new Error("Production report start date must not be after end date.");
  if ([filters.houseId, filters.flockId].some(id => id !== null && !validId(id))) throw new Error("Production report filter IDs must be positive integers.");
}
function master(group: Group<ProductionReportFlock>, source: FeedReportSource): Master {
  const entries = group.entries, issues: string[] = [];
  const placement = date(consensus(entries, "placementDate"));
  const initial = group.conflict ? null : count(entries[0].initialCount);
  const label = consensus(entries, "flockNumber"), status = consensus(entries, "status");
  const rawHouse = consensus(entries, "houseId"), houseId = validId(rawHouse) ? rawHouse : null;
  const houses = source.houses.filter(h => h.id === houseId);
  const houseValid = houseId !== null && houses.length > 0 &&
    new Set(houses.map(h => fingerprint([h.name, h.houseNumber]))).size === 1 && nonblank(houses[0].name) &&
    (houses[0].houseNumber === null || typeof houses[0].houseNumber === "string");
  const planned = typeof status === "string" && ["planned", "pending", "scheduled", "unconfirmed", "not_started", "not-started"].includes(status.trim().toLowerCase());
  if (entries.length > 1) issues.push(`Repeated flock source ID ${group.id}; exact duplicates counted once.`);
  if (group.conflict || !validId(group.id)) issues.push("Invalid or conflicting flock master records; no arbitrary winner, all quantities are review-only N/A.");
  if (placement === null) issues.push("Invalid, missing or conflicting placement date; history cannot be scoped reliably.");
  if (initial === null || initial <= 0) issues.push("Invalid or zero initial count; a positive safe integer placement count is required.");
  if (!nonblank(label) || !nonblank(status)) issues.push("Invalid or conflicting flock label/current status; master-data reconciliation required.");
  if (planned) issues.push("Planned/not-confirmed placement; records are review-only and report quantities are N/A.");
  if (!houseValid) issues.push("Missing, invalid or conflicting house metadata; report quantities are N/A.");
  if (houses.length > 1) issues.push(`Repeated house source ID ${houseId}; exact duplicate metadata counted once.`);
  return { group, placement, initial, houseId,
    houseName: houseValid ? houses[0].name : `House ${houseId ?? "unknown"} (label unavailable or conflicting)`,
    label: nonblank(label) ? label : `Flock ${group.id} (label unavailable or conflicting)`,
    status: nonblank(status) ? status : "Current status unavailable or conflicting",
    valid: validId(group.id) && !group.conflict && placement !== null && initial !== null && initial > 0 && houseValid && nonblank(label) && nonblank(status) && !planned, issues };
}
function inRange(key: string | null, start: string | null, end: string): boolean {
  return key !== null && start !== null && key >= start && key <= end;
}
function relevant(detail: FeedDailyDetail, start: string | null, end: string): boolean {
  return detail.sourceVersions.some(r => !isProductionDate(r.recordDate) || inRange(date(r.recordDate), start, end));
}
function expected(start: string | null, end: string): number | null {
  return start === null ? null : Math.max(0, productionDayDifference(start, end) + 1);
}
function feedTotals(details: FeedDailyDetail[], start: string | null, end: string, validMaster: boolean): FeedTotals {
  const scoped = details.filter(d => inRange(d.date, start, end));
  const observed = scoped.filter(d => d.eligible && d.feedKg !== null);
  const expectedDays = validMaster ? expected(start, end) : null;
  const validDays = new Set(observed.map(d => d.date)).size;
  const issues: string[] = [];
  const ambiguous = details.some(d => relevant(d, start, end) && (!d.eligible || d.feedKg === null));
  const duplicate = new Set(scoped.map(d => d.date)).size < scoped.length;
  const total = sum(observed.map(d => d.feedKg!));
  const stages = Object.fromEntries(STAGES.map(stage => [stage, !observed.length ? null : sum(observed.filter(d => d.stage === stage).map(d => d.feedKg!), true)])) as FeedTotals["stages"];
  const partial = !validMaster || expectedDays === null || validDays < expectedDays || ambiguous || duplicate || total === null || STAGES.some(s => stages[s] === null);
  if (!observed.length) issues.push("No valid recorded feed observations in this scope; totals/stages are N/A, not invented zero consumption.");
  if (partial) issues.push(`Known-only partial feed subtotal: ${observed.length} valid source record(s), ${validDays}/${expectedDays ?? "unknown"} calendar day(s); missing/invalid/excluded/duplicate capture is not complete consumption.`);
  if (observed.length && total === null) issues.push("Feed subtotal exceeds safe finite numeric sum precision; N/A, never clipped or rounded into range.");
  if (observed.some(d => d.feedKg === 0)) issues.push("Stored valid zero feed is a record-level value; existing defaults do not prove deliberate zero capture.");
  return { kg: total, stages, validRecords: observed.length, validDays, expectedDays, partial, issues };
}
function coverage(details: FeedDailyDetail[], start: string | null, end: string, validMaster: boolean): FeedCoverage {
  const scoped = details.filter(d => inRange(d.date, start, end));
  const byDate = new Map<string, FeedDailyDetail[]>();
  for (const d of scoped) byDate.set(d.date!, [...(byDate.get(d.date!) ?? []), d]);
  const validFeedDays = Array.from(byDate.values()).filter(ds => ds.length === 1 && ds[0].eligible && ds[0].feedKg !== null).length;
  const validMortalityDays = Array.from(byDate.values()).filter(ds => ds.length === 1 && ds[0].eligible && ds[0].mortality !== null).length;
  const expectedDays = validMaster ? expected(start, end) : null;
  const issues: string[] = [];
  if (expectedDays === null || expectedDays === 0 || validFeedDays !== expectedDays || validMortalityDays !== expectedDays) issues.push(`Incomplete daily feed/mortality coverage from placement day 0 through calculation endpoint: ${validFeedDays} feed and ${validMortalityDays} mortality day(s) / ${expectedDays ?? "unknown"} expected; missing days are not zero.`);
  if (details.some(d => relevant(d, start, end) && !d.eligible)) issues.push("Invalid/conflicting/undated or unresolved-attribution daily sources require reconciliation.");
  if (Array.from(byDate.values()).some(ds => ds.length > 1)) issues.push("Different daily source IDs on one operational date block FCR; known valid subtotals remain visible without automatic merging.");
  const observed = scoped.filter(d => d.eligible && d.feedKg !== null);
  return { expectedDays, recordedDays: byDate.size, validFeedDays, validMortalityDays,
    feedRecords: observed.length, zeroFeedRecords: observed.filter(d => d.feedKg === 0).length,
    missingFeedDays: expectedDays === null ? null : expectedDays - validFeedDays,
    complete: issues.length === 0, issues };
}
function combinedTotals(totals: FeedTotals[]): FeedTotals {
  const known = totals.filter(t => t.kg !== null), issues: string[] = [];
  const total = sum(known.map(t => t.kg!));
  const stages = Object.fromEntries(STAGES.map(stage => [stage, sum(totals.map(t => t.stages[stage]).filter((v): v is number => v !== null))])) as FeedTotals["stages"];
  const expectedDays = totals.length && totals.every(t => t.expectedDays !== null) ? sum(totals.map(t => t.expectedDays!)) : null;
  const partial = !totals.length || known.length !== totals.length || totals.some(t => t.partial) || total === null || STAGES.some(s => stages[s] === null);
  if (partial) issues.push(`Known-only partial selected-cohort feed subtotal: ${known.length}/${totals.length} flocks have valid observations; per-flock record/day coverage applies, never a complete-looking hidden subset.`);
  if (known.length && total === null) issues.push("Aggregate feed exceeds safe finite numeric sum precision; N/A.");
  issues.push(...totals.flatMap(t => t.issues));
  return { kg: total, stages, validRecords: totals.reduce((n, t) => n + t.validRecords, 0), validDays: totals.reduce((n, t) => n + t.validDays, 0), expectedDays,
    partial, issues: unique(issues) };
}

/** Authorization, SELECT-only reading and filter relationship validation belong to the caller. */
export function buildFeedPerformanceReport(source: FeedReportSource, filters: ResolvedFlockPerformanceFilters, timezone: string, generatedAt: string): FeedPerformanceReport {
  validateFilters(filters);
  const end = filters.endDate;
  // Never use selected S for cumulative harvest quantities. Feed applies its own
  // stricter same-event positive load-pair and endpoint/closure safeguards below.
  const canonical = buildHarvestReport(source, { ...filters, startDate: null }, timezone, generatedAt);
  const dailyGroups = groups(source.dailyRecords, dailyFields);
  const catchGroups = groups(source.catches, r => [r.flockId, r.catchDate, r.harvestRecordId, r.status]);
  const harvestGroups = groups(source.harvests, r => [r.flockId, r.harvestDate, r.chickenCountLoaded, r.totalLoadedWeightKg, r.chickenCountDelivered, r.totalDeliveredWeightKg, r.transportMortalities]);
  const masters = groups(source.flocks, f => [f.flockNumber, f.houseId, f.placementDate, f.initialCount, f.status]).map(g => master(g, source));
  const masterIds = new Set(masters.filter(m => validId(m.group.id)).map(m => m.group.id));
  const scopedOwner = (owner: unknown): boolean => validId(owner) && masterIds.has(owner);
  const rows: FeedReportRow[] = [];
  for (const m of masters) {
    const id = m.group.id;
    if (filters.flockId !== null && id !== filters.flockId) continue;
    if (filters.houseId !== null && !m.group.entries.some(f => f.houseId === filters.houseId)) continue;
    if (m.group.entries.every(f => isProductionDate(f.placementDate) && f.placementDate > end)) continue;
    const start = m.placement, periodStart = start === null ? null : filters.startDate !== null && filters.startDate > start ? filters.startDate : start;
    const issues = [...m.issues], reasons: string[] = [];
    if (!m.valid) reasons.push("Invalid/unconfirmed flock or house master data; reconcile before calculating FCR.");
    const dailyRecords: FeedDailyDetail[] = [];
    for (const group of dailyGroups) {
      // Invalid ownership cannot establish irrelevance to this selected flock.
      const unscoped = group.entries.some(r => !scopedOwner(r.flockId));
      if (!unscoped && !group.entries.some(r => r.flockId === id)) continue;
      if (group.entries.every(r => isProductionDate(r.recordDate) && r.recordDate > end)) continue;
      const r = group.entries[0], key = date(consensus(group.entries, "recordDate"));
      const owner = consensus(group.entries, "flockId"), recordIssues: string[] = [];
      const identity = !group.conflict && validId(group.id) && owner === id && !unscoped;
      const feed = group.conflict ? null : kg(r.feedConsumed), deaths = group.conflict ? null : count(r.mortality);
      const measured = group.conflict ? null : kg(r.averageWeight);
      const rawStage = consensus(group.entries, "feedType");
      const stage: FeedStage = rawStage === "starter" || rawStage === "grower" || rawStage === "finisher" ? rawStage : "unspecified";
      if (group.entries.length > 1) recordIssues.push(`Repeated daily source ID ${group.id}; exact ID duplicates count once; every raw version retained.`);
      if (group.conflict) recordIssues.push("Conflicting daily source ID versions; excluded everywhere, no arbitrary winner.");
      if (!validId(group.id)) recordIssues.push("Invalid daily source ID; review-only pending identity reconciliation.");
      if (owner !== id || unscoped) recordIssues.push("Invalid/conflicting or unscoped flock ownership; review-only, cannot attribute these raw versions to this flock.");
      if (key === null) recordIssues.push("Invalid/missing/conflicting operational date; undated review only, never an invented date.");
      if (key !== null && start !== null && key < start) recordIssues.push("Daily record before placement; excluded from contributions, raw record retained for review.");
      if (!m.valid) recordIssues.push("No valid confirmed master data; daily source is review-only.");
      if (feed === null) recordIssues.push("Feed kg is null/blank/negative/invalid or unsafe; ordinary finite nonnegative decimal kg required, never an assumed zero.");
      if (deaths === null) recordIssues.push("Mortality is null/blank/negative/invalid or unsafe; nonnegative integer spelling/count required.");
      if (group.entries.some(v => weightAttempt(v.averageWeight)) && (measured === null || measured <= 0)) recordIssues.push("Invalid/conflicting sampled weight attempt; cannot choose an earlier convenient measurement.");
      if (stage === "unspecified") recordIssues.push("Missing/unknown/conflicting stored feed stage; Unspecified, quantity is not discarded or silently Starter.");
      const dayNumber = count(consensus(group.entries, "dayNumber"));
      if (dayNumber === null) recordIssues.push("Invalid/conflicting recorded day number; operational dates determine placement-day-0 scope.");
      else if (key !== null && start !== null && dayNumber !== productionDayDifference(start, key)) recordIssues.push("Recorded day number differs from placement-day-0 elapsed age; operational date determines scope.");
      const inCumulative = inRange(key, start, end), inPeriod = inRange(key, periodStart, end);
      dailyRecords.push({ id: group.id, date: key, dayNumber, stage, feedKg: feed, mortality: deaths,
        weightKg: measured !== null && measured > 0 ? measured : null,
        eligible: m.valid && identity && inCumulative, inPeriod, inCumulative, inFcr: false,
        issues: recordIssues, sourceVersions: group.entries.map(copyDaily) });
    }
    dailyRecords.sort(chronological);
    const dates = new Map<string, FeedDailyDetail[]>();
    for (const d of dailyRecords.filter(d => d.inCumulative)) dates.set(d.date!, [...(dates.get(d.date!) ?? []), d]);
    for (const [key, ds] of Array.from(dates)) if (ds.length > 1) for (const d of ds) d.issues.push(`Different daily IDs on ${key}; valid observations are known-only subtotals, FCR blocked pending reconciliation.`);
    const weights = dailyRecords.filter(d => d.sourceVersions.some(r => weightAttempt(r.averageWeight)) && relevant(d, start, end));
    const unpositionedWeight = weights.some(d => d.date === null || d.sourceVersions.some(r => r.flockId !== id));
    const latestDate = unpositionedWeight ? null : weights.at(-1)?.date ?? null;
    const latestSamples = weights.filter(d => d.date === latestDate);
    const latestWeight = latestDate !== null && latestSamples.length === 1 && latestSamples[0].eligible ? latestSamples[0].weightKg : null;
    if (latestDate !== null && latestWeight === null) issues.push("Invalid/conflicting latest sampled weight attempt; no earlier measurement substituted.");
    if (unpositionedWeight) issues.push("Unpositioned/excluded sampled weight attempt; latest observation cannot be selected reliably.");
    if (latestDate !== null && latestDate !== end) issues.push(`Latest sample retains actual date ${latestDate}; not carried forward or extrapolated to ${end}.`);

    const harvestRow = canonical.rows.find(r => Object.is(r.flockId, id));
    const harvestRecords: HarvestEventResult[] = (harvestRow?.events ?? []).map(event => ({ ...event, eligible: event.eligible && m.valid,
      issues: [...event.issues], sessionIds: [...event.sessionIds], sourceVersions: event.sourceVersions.map(r => ({ ...r })) }));
    const catchExceptions: HarvestCatchException[] = (harvestRow?.catchExceptions ?? []).map(c => ({ ...c, sourceVersions: c.sourceVersions.map(r => ({ ...r })) }));
    // Canonical harvest report cannot assign undecodable ownership to a row.
    // Preserve such supplied raw groups explicitly as unscoped review, never loads.
    for (const g of harvestGroups.filter(g => g.entries.some(r => !scopedOwner(r.flockId)) && !g.entries.every(r => isProductionDate(r.harvestDate) && r.harvestDate > end))) {
      if (harvestRecords.some(e => Object.is(e.id, g.id))) continue;
      harvestRecords.push({ id: g.id, date: date(consensus(g.entries, "harvestDate")), inPeriod: false, eligible: false,
        classification: "Excluded — unscoped harvest ownership", sessionIds: [], loadedBirds: null, loadedKg: null, averageLoadedKg: null,
        deliveredBirds: null, deliveredKg: null, averageDeliveredKg: null, massLossKg: null, massLossPct: null, transportMortality: null,
        issues: ["Undecodable/unscoped ownership: all raw versions are review-only, no arbitrary flock attribution."], sourceVersions: g.entries.map(r => ({ ...r })) });
    }
    harvestRecords.sort(chronological);
    const pairs = harvestRecords.filter(e => e.eligible && e.loadedBirds !== null && e.loadedBirds > 0 && e.loadedKg !== null && e.loadedKg > 0);
    for (const e of harvestRecords) {
      if (!e.eligible) reasons.push(`Harvest ${e.id}: excluded or ambiguous potentially unaccounted past removal; reconcile source/date/linkage.`);
      else if (!pairs.includes(e)) reasons.push(`Harvest ${e.id}: positive loaded birds and actual loaded net kg must be paired on this same event; no cross-event pairing.`);
    }

    // A daily end-of-calendar-date ledger, never clipped. Missing days are not
    // inserted as zeros: prefix coverage separately determines qualification.
    const ledgerDates = unique([...Array.from(dates.keys()), ...harvestRecords.filter(e => e.eligible && e.date !== null).map(e => e.date!)]).sort();
    let runningDeaths: number | null = 0, runningLoads: number | null = 0, closure: string | null = null;
    let potentialClosure: string | null = null; // Diagnostic only, never accepted Q/T.
    for (const key of ledgerDates) {
      runningDeaths = runningDeaths === null ? null : sum([runningDeaths, ...(dates.get(key) ?? []).filter(d => d.eligible && d.mortality !== null).map(d => d.mortality!)]);
      // All known eligible loaded counts affect potential balances, even an event
      // whose mass is missing (that event independently blocks the ratio).
      runningLoads = runningLoads === null ? null : sum([runningLoads, ...harvestRecords.filter(e => e.eligible && e.date === key && e.loadedBirds !== null).map(e => e.loadedBirds!)]);
      const remaining = m.valid && runningDeaths !== null && runningLoads !== null ? m.initial! - runningDeaths - runningLoads : null;
      if (remaining !== null && remaining < 0) reasons.push(`Negative recorded balance at ${key}; no arbitrary clipping of initial minus deaths minus loaded birds.`);
      if (closure === null && remaining === 0 && pairs.some(e => e.date === key)) {
        potentialClosure ??= key;
        const prefix = coverage(dailyRecords, start, key, m.valid);
        const mortalityProof = prefix.expectedDays !== null && prefix.validMortalityDays === prefix.expectedDays &&
          !dailyRecords.some(d => relevant(d, start, key) && !d.eligible);
        const outputProof = harvestRecords.every(e => (e.date !== null && e.date > key) || pairs.includes(e));
        if (mortalityProof && outputProof) closure = key;
      }
    }
    if (runningDeaths === null || runningLoads === null) reasons.push("Daily balance sums exceed safe numeric precision.");
    const endpoint = closure ?? end;
    // Accepted date mismatch warnings are not blanket blockers. Only uncertainty
    // crossing the chosen endpoint (including T) requires reconciliation.
    const knownCatchRemovalDates: string[] = [];
    for (const g of catchGroups) {
      const linkedEvents = harvestRecords.filter(e => g.entries.some(c => c.harvestRecordId === e.id));
      const attributed = g.entries.some(c => c.flockId === id || !scopedOwner(c.flockId));
      if (!attributed && !linkedEvents.length) continue;
      const possiblyCompleted = g.entries.some(c => c.status === "completed" || !nonblank(c.status));
      const definitelyFuture = g.entries.every(c => isProductionDate(c.catchDate) && c.catchDate > end);
      const owner = consensus(g.entries, "flockId"), linkedId = consensus(g.entries, "harvestRecordId");
      const validLinked = !g.conflict && validId(g.id) && owner === id && g.entries[0].status === "completed" &&
        linkedEvents.length === 1 && linkedEvents[0].eligible && linkedEvents[0].id === linkedId && linkedEvents[0].sessionIds.length === 1 && linkedEvents[0].sessionIds[0] === g.id;
      if (validLinked) {
        const key = date(consensus(g.entries, "catchDate"));
        // Quantities retain the canonical harvest date, but a known later catch
        // cannot establish that a same-day sample measures post-removal stock.
        if (key !== null && pairs.includes(linkedEvents[0])) knownCatchRemovalDates.push(key);
        if (key !== null && ((key > endpoint) !== (linkedEvents[0].date! > endpoint))) reasons.push(`Catch ${g.id}: catch/harvest dates cross calculation endpoint ${endpoint}; removal timing needs reconciliation.`);
        continue; // Including accepted invalid/mismatched linked-date warnings.
      }
      if (!possiblyCompleted || (definitelyFuture && linkedEvents.length === 0)) continue;
      reasons.push(`Catch ${g.id}: completed orphan/conflicting/unscoped removal linkage through report end requires reconciliation.`);
      if (!catchExceptions.some(c => Object.is(c.sessionId, g.id))) catchExceptions.push({ sessionId: g.id, harvestRecordId: linkedId,
        date: date(consensus(g.entries, "catchDate")), reason: "Completed catch has no valid canonical harvest through the calculation scope; unscoped/conflicting raw versions are review-only.", sourceVersions: g.entries.map(c => ({ ...c })) });
    }
    catchExceptions.sort((a, b) => chronological({ date: a.date, id: a.sessionId }, { date: b.date, id: b.sessionId }));
    const activityCheckpoint = closure ?? potentialClosure;
    if (activityCheckpoint !== null) {
      const later = dailyRecords.filter(d => d.sourceVersions.some(r => !isProductionDate(r.recordDate) || (r.recordDate > activityCheckpoint && r.recordDate <= end)));
      const invalidLaterWeight = later.some(d => d.sourceVersions.some(r => {
        const value = kg(r.averageWeight);
        return weightAttempt(r.averageWeight) && (value === null || value <= 0);
      }));
      if (invalidLaterWeight || later.some(d => !d.eligible || d.feedKg === null || d.mortality === null || d.feedKg > 0 || d.mortality > 0 || (d.date !== null && (dates.get(d.date)?.length ?? 0) > 1)) || harvestRecords.some(e => e.date === null || e.date > activityCheckpoint)) reasons.push("Reconcile post-closure activity: positive feed/deaths/additional loads or invalid/undated/ambiguous activity after or unpositioned around the final-harvest checkpoint; an unproven checkpoint never establishes closure.");
    }
    for (const d of dailyRecords) d.inFcr = inRange(d.date, start, endpoint);
    const fcrCoverage = coverage(dailyRecords, start, endpoint, m.valid);
    reasons.push(...fcrCoverage.issues);
    const fcrFeed = feedTotals(dailyRecords, start, endpoint, m.valid).kg;
    const fcrDaily = dailyRecords.filter(d => d.eligible && d.inFcr);
    const deaths = sum(fcrDaily.filter(d => d.mortality !== null).map(d => d.mortality!));
    const fcrEvents = harvestRecords.filter(e => e.eligible && inRange(e.date, start, endpoint));
    const fcrPairs = pairs.filter(e => inRange(e.date, start, endpoint));
    const loadedBirds = m.valid ? sum(fcrEvents.filter(e => e.loadedBirds !== null).map(e => e.loadedBirds!), fcrEvents.length === 0) : null;
    const loadedKg = m.valid ? sum(fcrPairs.map(e => e.loadedKg!), fcrEvents.length === 0) : null;
    const remaining = m.valid && deaths !== null && loadedBirds !== null ? m.initial! - deaths - loadedBirds : null;
    if (fcrFeed === null || fcrFeed <= 0) reasons.push("Positive cumulative recorded feed through Q is required; no-observation/all-default-zero capture is not successful zero FCR.");
    if (deaths === null || loadedBirds === null || loadedKg === null || remaining === null) reasons.push("Required count/output sums are unavailable or exceed safe numeric precision.");
    if (remaining !== null && remaining < 0) reasons.push("Negative remaining balance at calculation endpoint; N/A, never clamped.");
    let remainingMass: number | null = null;
    const lastRemoval = [...fcrPairs.map(e => e.date!), ...knownCatchRemovalDates].sort().at(-1) ?? null;
    if (remaining !== null && remaining > 0) {
      if (latestDate !== end || latestWeight === null) reasons.push("Remaining birds require a valid unambiguous positive measured weight on E; older weights retain their actual date only.");
      else if (lastRemoval !== null && latestDate <= lastRemoval) reasons.push("Remaining-stock sample must be strictly after latest loaded-removal date; same-day catch/sample ordering is unknown.");
      else remainingMass = product(remaining, latestWeight);
      if (remainingMass === null && latestDate === end && latestWeight !== null && (lastRemoval === null || latestDate > lastRemoval)) reasons.push("Estimated remaining mass exceeds safe magnitude or underflows; N/A.");
    } else if (remaining === 0) {
      remainingMass = 0;
      if (loadedKg === null || loadedKg <= 0) reasons.push("Deaths-only empty balance has no positive loaded output denominator.");
      if (closure === null) reasons.push("Zero remaining balance lacks a reconciled dated final-harvest checkpoint; current completed status is not closure proof.");
    }
    const biomass = loadedKg !== null && remainingMass !== null ? sum([loadedKg, remainingMass]) : null;
    if (biomass === null || biomass <= 0) reasons.push("Positive safe output-plus-remaining biomass denominator is unavailable.");
    const rawRatio = ratio(fcrFeed, biomass);
    if (fcrFeed !== null && fcrFeed > 0 && biomass !== null && biomass > 0 && rawRatio === null) reasons.push("FCR exceeds finite safe precision or underflows; N/A.");
    const finalReasons = unique(reasons), eligible = finalReasons.length === 0 && rawRatio !== null;
    issues.push(...dailyRecords.flatMap(d => d.issues.map(i => `Daily ${d.id}: ${i}`)), ...harvestRecords.flatMap(e => e.issues.map(i => `Harvest ${e.id}: ${i}`)), ...catchExceptions.map(c => `Catch ${c.sessionId}: ${c.reason}`), ...finalReasons);
    const periodFeed = feedTotals(dailyRecords, periodStart, end, m.valid), cumulativeFeed = feedTotals(dailyRecords, start, end, m.valid);
    issues.push(...periodFeed.issues, ...cumulativeFeed.issues);
    rows.push({ flockId: id, flockNumber: m.label, houseId: m.houseId, houseName: m.houseName, placementDate: start,
      currentStatus: m.status, initialBirds: m.initial, periodFeed, cumulativeFeed,
      latestWeightKg: latestWeight, latestWeightDate: latestDate,
      fcr: { value: eligible ? rawRatio : null, eligible, status: eligible ? closure !== null ? "Completed-cycle endpoint — provisional recorded-balance basis" : "Provisional — recorded-balance basis" : "N/A — reconciliation/data coverage required",
        basis: BASIS, endpoint: m.valid ? endpoint : null, closureDate: closure, cumulativeFeedKg: fcrFeed, cumulativeDeaths: deaths,
        loadedBirds, loadedKg, remainingBirds: remaining, weightKg: remaining !== null && remaining > 0 ? latestWeight : null,
        weightDate: remaining !== null && remaining > 0 ? latestDate : null, estimatedRemainingKg: remainingMass, biomassKg: biomass,
        coverage: fcrCoverage, reasons: finalReasons }, dailyRecords, harvestRecords, catchExceptions, issues: unique(issues) });
  }
  rows.sort((a, b) => compareId(a.houseId ?? -1, b.houseId ?? -1) || compareId(a.flockId, b.flockId));
  const qualifyingFlocks = rows.filter(r => r.fcr.eligible).length, all = rows.length > 0 && qualifyingFlocks === rows.length;
  const feed = all ? sum(rows.map(r => r.fcr.cumulativeFeedKg!)) : null, biomass = all ? sum(rows.map(r => r.fcr.biomassKg!)) : null;
  const aggregate = all ? ratio(feed, biomass) : null, summaryIssues: string[] = [];
  if (!rows.length) summaryIssues.push("No matching placed flocks through E; no-observation totals and FCR are N/A, not a zero-activity cohort.");
  else if (!all) summaryIssues.push(`Incomplete full cohort: ${qualifyingFlocks}/${rows.length} selected flocks qualify; FCR is N/A, not a ratio from a silently reduced population. See each flock's reasons.`);
  else if (aggregate === null) summaryIssues.push("Full-cohort sums/ratio exceed safe finite numeric precision; aggregate FCR is N/A.");
  return { kind: "feed-performance", generatedAt, timezone, filters: { ...filters }, rows,
    summary: { flockCount: rows.length, qualifyingFlocks, periodFeed: combinedTotals(rows.map(r => r.periodFeed)), cumulativeFeed: combinedTotals(rows.map(r => r.cumulativeFeed)),
      fcr: aggregate, fcrFeedKg: aggregate === null ? null : feed, biomassKg: aggregate === null ? null : biomass, issues: summaryIssues },
    notes: [
      BASIS + ". F / (M + R × W) for R > 0; F / M for R = 0. R = initial birds − daily deaths − eligible loaded birds. This is not net biomass-gain FCR, verified physical stock or a certified benchmark.",
      "Period feed is max(S, placement)…E; cumulative display is placement…E; FCR feed/deaths/output are placement day 0…Q inclusive. Q = E except a reconciled completed-cycle final-harvest checkpoint T. Same-day final-harvest feed is included; no daily capture is expected after T, but subsequent contradictions through E block FCR.",
      "Remaining-stock W must be positive measured kg/bird on E, strictly after the latest removal calendar date. Older/invalid/conflicting latest observations are never carried forward, extrapolated or replaced by a convenient earlier sample. Fully harvested flocks need no sample.",
      "Missing daily dates are unknown, not zero. Numeric FCR requires complete valid unambiguous daily feed and mortality coverage from placement day 0 through Q. Stored valid zero feed/deaths are record-level values; existing defaults do not establish deliberate zero capture or biological completeness. Cumulative feed must be positive.",
      "Canonical harvest IDs count once with positive actual loaded count and net kg paired on the same event. Catch sessions are provenance, never extra quantities. Accepted unlinked harvests warn about unavailable completion/uniqueness; delivery-only gaps do not block this loaded-output formula. Transport deaths are not deducted again.",
      "Exact repeated IDs warn and count once. Conflicting IDs/ownership retain all relevant raw versions but supply no quantities anywhere. Different daily IDs on one date retain known-only subtotals but block FCR. Undated/unscoped records are review-only; definitely future groups are outside this snapshot. No repair/merge/deletion is performed.",
      "Feed stage uses stored starter/grower/finisher only; missing or unknown stages are Unspecified with quantities retained. Purchases, orders and deliveries are not consumption. Feed totals are qualified known subtotals with record/day/cohort coverage; absent observations and unknown masters are N/A, not invented zero.",
      "Whole-cohort FCR divides summed unrounded qualifying feed by summed unrounded output-plus-remaining biomass, never averages flock ratios. Every selected flock must qualify; otherwise show N/A and n/N coverage. No calculation inputs are rounded for display.",
      "Unknown culls/transfers/additions and unrecorded movements cannot be assumed zero; known unresolved movement or harvest-link ambiguity blocks FCR. Dead-bird mass, assumed chick mass, breed targets, forecast growth, carcass/delivery kg and planning shrinkage are not added or substituted.",
      "Historical results use today's supplied/corrected source and current master labels/status, not immutable historical snapshots. Source history has not been validated or repaired. Operational date labels are preserved without timezone shifting; generatedAt is the caller-supplied instant and timezone applies only to genuine instant displays.",
    ] };
}
