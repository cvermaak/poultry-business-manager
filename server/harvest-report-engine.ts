import { isProductionDate } from "../shared/production-report-dates";
import type {
  ProductionCatchSource,
  ResolvedFlockPerformanceFilters,
} from "../shared/production-reports";
import type {
  HarvestCatchException,
  HarvestEventResult,
  HarvestMetricCoverage,
  HarvestMetrics,
  HarvestReport,
  HarvestReportRow,
  HarvestReportSource,
  HarvestResultFlock,
  HarvestResultSourceRecord,
} from "../shared/harvest-report";

// Pure supplied-source snapshot: deliberately no database, application, clock,
// network, stored averages, catch quantities, buffers, or financial imports.
const MAX = Number.MAX_SAFE_INTEGER;
type Group<T> = { id: number; entries: T[]; conflict: boolean };
type Master = {
  group: Group<HarvestResultFlock>;
  placement: string | null;
  houseId: number | null;
  houseName: string;
  flockNumber: string;
  status: string;
  confirmed: boolean;
  issues: string[];
};
type PreparedHarvest = {
  group: Group<HarvestResultSourceRecord>;
  event: HarvestEventResult;
  validSource: boolean;
  catchWarnings: Array<{ group: Group<ProductionCatchSource>; reason: string }>;
};

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function date(value: unknown): string | null {
  return isProductionDate(value) ? value : null;
}
function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
function fingerprint(values: unknown[]): string {
  // Distinguish null, undefined, numeric/string spellings, and nonfinite numbers.
  return JSON.stringify(values.map(value => [
    typeof value,
    typeof value === "number" && !Number.isFinite(value) ? String(value) : value,
  ]));
}
function groups<T extends { id: number }>(
  records: readonly T[], fields: (record: T) => unknown[],
): Group<T>[] {
  const byId = new Map<number, T[]>();
  for (const record of records) {
    const entries = byId.get(record.id) ?? [];
    entries.push(record);
    byId.set(record.id, entries);
  }
  return Array.from(byId).map(([id, entries]) => ({
    id,
    entries: [...entries].sort((a, b) => fingerprint(fields(a)).localeCompare(fingerprint(fields(b)))),
    conflict: new Set(entries.map(entry => fingerprint(fields(entry)))).size > 1,
  })).sort((a, b) => compareId(a.id, b.id));
}
function compareId(a: number, b: number): number {
  return Number.isFinite(a) && Number.isFinite(b)
    ? a - b : fingerprint([a]).localeCompare(fingerprint([b]));
}
function compareDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}
function consensus<T, K extends keyof T>(entries: readonly T[], key: K): T[K] | null {
  return entries.every(entry => Object.is(entry[key], entries[0][key]))
    ? entries[0][key] : null;
}
function count(value: unknown): number | null {
  if (typeof value === "string") {
    const text = value.trim();
    // Coercion alone can turn rounded fractions or nonzero underflow into integers.
    if (!/^\d+$/.test(text)) return null;
    value = Number(text);
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}
function kg(value: unknown): number | null {
  if (typeof value === "string") {
    const text = value.trim();
    // Only ordinary decimal notation, never exponents/hex or blank coercion.
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const [whole = "", fraction = ""] = text.split(".");
    const integer = whole.replace(/^0+/, "") || "0";
    const max = String(MAX);
    // Check the original magnitude as well: MAX + a small fraction can round to MAX.
    if (integer.length > max.length ||
      (integer.length === max.length && integer > max) ||
      (integer === max && /[1-9]/.test(fraction))) return null;
    value = Number(text);
  }
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX
    ? value : null; // Zero includes decimal underflow, not a positive measurement.
}
function safeSum(values: number[], integer: boolean): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    // Either subtraction may round at the boundary; checking both operands
    // also rejects MAX plus a tiny weight regardless of event ordering.
    if (value > MAX - total || total > MAX - value) return null;
    total += value;
    if (!Number.isFinite(total) || total > MAX || (integer && !Number.isSafeInteger(total))) return null;
  }
  return total;
}
function average(weight: number | null, birds: number | null): number | null {
  if (weight === null || birds === null || birds <= 0) return null;
  const result = weight / birds;
  return Number.isFinite(result) && result > 0 ? result : null;
}
function lossPercent(loaded: number | null, delivered: number | null): number | null {
  if (loaded === null || delivered === null) return null;
  const result = ((loaded - delivered) / loaded) * 100;
  return Number.isFinite(result) ? result : null;
}
function harvestFields(r: HarvestResultSourceRecord): unknown[] {
  return [r.flockId, r.harvestDate, r.chickenCountLoaded, r.totalLoadedWeightKg,
    r.chickenCountDelivered, r.totalDeliveredWeightKg, r.transportMortalities];
}
function catchFields(r: ProductionCatchSource): unknown[] {
  return [r.flockId, r.catchDate, r.harvestRecordId, r.status];
}
function copyHarvest(r: HarvestResultSourceRecord): HarvestResultSourceRecord {
  return { id: r.id, flockId: r.flockId, harvestDate: r.harvestDate,
    chickenCountLoaded: r.chickenCountLoaded, totalLoadedWeightKg: r.totalLoadedWeightKg,
    chickenCountDelivered: r.chickenCountDelivered, totalDeliveredWeightKg: r.totalDeliveredWeightKg,
    transportMortalities: r.transportMortalities };
}
function copyCatch(r: ProductionCatchSource): ProductionCatchSource {
  return { id: r.id, flockId: r.flockId, catchDate: r.catchDate,
    harvestRecordId: r.harvestRecordId, status: r.status };
}
function validateFilters(filters: ResolvedFlockPerformanceFilters): void {
  if (!isProductionDate(filters.endDate) ||
    (filters.startDate !== null && !isProductionDate(filters.startDate))) {
    throw new Error("Invalid production report operational date.");
  }
  if (filters.startDate !== null && filters.startDate > filters.endDate) {
    throw new Error("Production report start date must not be after end date.");
  }
  if ([filters.houseId, filters.flockId].some(id => id !== null && !validId(id))) {
    throw new Error("Production report filter IDs must be positive integers.");
  }
}
function inRange(key: string | null, filters: ResolvedFlockPerformanceFilters): boolean {
  return key !== null && key <= filters.endDate &&
    (filters.startDate === null || key >= filters.startDate);
}
function buildMaster(group: Group<HarvestResultFlock>, source: HarvestReportSource): Master {
  const entries = group.entries;
  const issues: string[] = [];
  if (entries.length > 1) issues.push(`Repeated flock source ID ${group.id}; counted once.`);
  if (group.conflict || !validId(group.id)) issues.push(
    `Invalid or conflicting master records for flock ID ${group.id}; no arbitrary version selected and harvest metrics are N/A.`,
  );
  const placement = date(consensus(entries, "placementDate"));
  if (placement === null) issues.push(
    "Invalid, missing or conflicting placement date; this flock remains visible but harvest history cannot be scoped reliably.",
  );
  const rawStatus = consensus(entries, "status");
  const status = nonblank(rawStatus) ? rawStatus : "Current status unavailable or conflicting";
  const planned = ["planned", "pending", "scheduled", "unconfirmed", "not_started", "not-started"]
    .includes(status.trim().toLowerCase());
  if (planned) issues.push("Planned/not-confirmed placement; harvest records are review-only and result totals are N/A.");
  if (!nonblank(rawStatus)) issues.push("Invalid, missing or conflicting current status; master-data reconciliation is required.");
  const rawLabel = consensus(entries, "flockNumber");
  if (!nonblank(rawLabel)) issues.push("Invalid, missing or conflicting flock label; master-data reconciliation is required.");
  const rawHouseId = consensus(entries, "houseId");
  const houseId = validId(rawHouseId) ? rawHouseId : null;
  const houses = source.houses.filter(house => house.id === houseId);
  const houseVersions = new Set(houses.map(house => fingerprint([house.name, house.houseNumber])));
  const houseValid = houseId !== null && houseVersions.size === 1 && nonblank(houses[0]?.name) &&
    (houses[0].houseNumber === null || typeof houses[0].houseNumber === "string");
  if (houses.length > 1) issues.push(`Repeated house source ID ${houseId}; label counted once.`);
  if (!houseValid) issues.push("Missing, invalid or conflicting house metadata; harvest metrics require master-data reconciliation.");
  return {
    group, placement, houseId,
    houseName: houseValid ? houses[0].name : `House ${houseId ?? "unknown"} (label unavailable or conflicting)`,
    flockNumber: nonblank(rawLabel) ? rawLabel : `Flock ${group.id} (label unavailable or conflicting)`,
    status,
    confirmed: validId(group.id) && !group.conflict && placement !== null && !planned &&
      nonblank(rawStatus) && nonblank(rawLabel) && houseValid,
    issues,
  };
}

function prepareHarvest(
  group: Group<HarvestResultSourceRecord>,
  links: Group<ProductionCatchSource>[],
  masters: Map<number, Master>,
  filters: ResolvedFlockPerformanceFilters,
): PreparedHarvest {
  const record = group.entries[0]; // Used for quantities only when every relevant field agrees.
  const key = date(consensus(group.entries, "harvestDate"));
  const owner = consensus(group.entries, "flockId");
  const master = owner === null ? undefined : masters.get(owner);
  const issues: string[] = [];
  const catchWarnings: PreparedHarvest["catchWarnings"] = [];
  let validSource = true;
  let classification = links.length === 0
    ? "Recorded harvest — completion status unavailable" : "Completed catch-linked harvest";
  const exclude = (label: string, reason: string) => {
    validSource = false;
    classification = `Excluded — ${label}`;
    issues.push(reason);
  };
  if (group.entries.length > 1) issues.push(
    `Repeated harvest source ID ${group.id}; contributes at most once, exact duplicates counted once.`,
  );
  if (!master?.confirmed) exclude("invalid or unconfirmed flock metadata",
    "No valid confirmed placement/master data; this harvest is review-only and supplies no result quantities.");
  if (key === null) exclude("invalid or ambiguous harvest date",
    "Invalid, missing or conflicting harvest operational date; excluded from dated contributions and retained for ambiguous reconciliation review.");
  else if (master?.placement !== null && master?.placement !== undefined && key < master.placement) {
    exclude("harvest before placement", "Harvest before placement; excluded from result quantities and retained for reconciliation review.");
  }
  if (!validId(group.id)) exclude("invalid harvest source ID", "Invalid harvest source ID; excluded pending identity reconciliation.");
  if (group.conflict) exclude("conflicting harvest source ID",
    "Conflicting versions of this harvest ID; every original relevant version is retained, no arbitrary source row selected.");
  if (owner === null || !validId(owner)) {
    exclude("conflicting or invalid flock ownership",
      "Conflicting or invalid flock ownership for this harvest ID; quantities cannot be assigned to different flocks and are excluded everywhere.");
  }
  if (links.length === 0) {
    issues.push("Unlinked recorded harvest: completion status unavailable; source alone does not prove manual entry or historical uniqueness.");
  } else if (links.length > 1) {
    const reason = `Multiple catch sessions link to harvest ${group.id}; excluded pending reconciliation; sessions are provenance, not extra quantities.`;
    exclude("multiple catch sessions", reason);
    for (const link of links) catchWarnings.push({ group: link, reason });
  } else {
    const link = links[0];
    const session = link.entries[0];
    let reason: string | null = null;
    if (link.conflict || !validId(link.id)) reason = `Invalid or conflicting versions of catch session ${link.id} linked to harvest ${group.id}; no arbitrary version selected.`;
    else if (session.flockId !== owner) reason = `Catch session flock mismatch for harvest ${group.id}; referenced external-flock work cannot validate this event.`;
    else if (session.status !== "completed") reason = `Catch session for harvest ${group.id} is not completed (current status: ${session.status}); excluded pending reconciliation.`;
    if (link.entries.length > 1) issues.push(`Repeated catch source ID ${link.id}; exact duplicates count as one provenance session.`);
    if (reason !== null) {
      exclude("incompatible catch linkage", reason);
      catchWarnings.push({ group: link, reason });
    } else if (!isProductionDate(session.catchDate)) {
      const reason = `Catch session ${link.id} has an invalid or missing catch date; the harvest operational date alone scopes the eligible harvest.`;
      issues.push(reason);
      catchWarnings.push({ group: link, reason });
    } else if (key !== null && session.catchDate !== key) {
      const reason = `Catch session ${link.id} date ${session.catchDate} differs from harvest date ${key}; the harvest operational date alone scopes the eligible harvest.`;
      issues.push(reason);
      catchWarnings.push({ group: link, reason });
    }
  }
  const loadedBirds = group.conflict ? null : count(record.chickenCountLoaded);
  const loadedKg = group.conflict ? null : kg(record.totalLoadedWeightKg);
  const deliveredBirds = group.conflict ? null : count(record.chickenCountDelivered);
  const deliveredKg = group.conflict ? null : kg(record.totalDeliveredWeightKg);
  const transportMortality = group.conflict ? null : count(record.transportMortalities);
  for (const [label, value] of [["Loaded birds", loadedBirds], ["Actual delivered birds", deliveredBirds],
    ["Transport mortality", transportMortality]] as const) {
    if (value === null) issues.push(`${label} is missing, invalid or conflicting; a nonnegative safe decimal-integer count is required, never an assumed zero or loaded/session/planned fallback.`);
  }
  for (const [label, value] of [["Loaded net kg", loadedKg], ["Actual delivered kg", deliveredKg]] as const) {
    if (value === null) issues.push(`${label} is missing, zero, invalid or conflicting; a positive finite safe-magnitude decimal kg measurement is required. Raw values are preserved; no loaded/planned fallback.`);
  }
  if (loadedBirds === 0) issues.push("Loaded birds are recorded zero; average loaded kg/bird requires a positive paired bird count.");
  if (deliveredBirds === 0) issues.push("Delivered birds are recorded zero; average delivered kg/bird requires a positive paired bird count.");
  if (transportMortality === 0) issues.push("Recorded transport mortality is zero; the schema default cannot prove zero was explicitly captured. Never inferred from loaded minus delivered birds.");
  if (loadedBirds !== null && deliveredBirds !== null && deliveredBirds > loadedBirds) {
    issues.push("Actual delivered birds exceed loaded birds; preserved for review, not clamped or inferred transport mortality.");
  }
  const inPeriod = inRange(key, filters);
  const eligible = validSource && inPeriod;
  const averageLoadedKg = eligible ? average(loadedKg, loadedBirds) : null;
  const averageDeliveredKg = eligible ? average(deliveredKg, deliveredBirds) : null;
  const pairedMass = eligible && loadedKg !== null && deliveredKg !== null;
  const massLossKg = pairedMass ? loadedKg - deliveredKg : null;
  const massLossPct = pairedMass ? lossPercent(loadedKg, deliveredKg) : null;
  if (massLossKg !== null && massLossKg < 0) issues.push("Negative recorded load-to-delivery mass loss; actual delivered kg exceed loaded kg. Preserved without clamping.");
  if (pairedMass && massLossPct === null) issues.push("Mass-loss percentage exceeds finite numeric precision; N/A, not Infinity.");
  if (eligible && loadedKg !== null && loadedBirds !== null && loadedBirds > 0 && averageLoadedKg === null) issues.push("Average loaded kg/bird underflows or exceeds finite precision; N/A.");
  if (eligible && deliveredKg !== null && deliveredBirds !== null && deliveredBirds > 0 && averageDeliveredKg === null) issues.push("Average delivered kg/bird underflows or exceeds finite precision; N/A.");
  return { group, validSource, catchWarnings, event: {
    id: group.id, date: key, inPeriod, eligible, classification,
    sessionIds: links.map(link => link.id).sort(compareId), loadedBirds, loadedKg,
    averageLoadedKg, deliveredBirds, deliveredKg, averageDeliveredKg, massLossKg, massLossPct,
    transportMortality, issues: unique(issues), sourceVersions: group.entries.map(copyHarvest),
  } };
}

function aggregate(events: HarvestEventResult[]): HarvestMetrics {
  // Ownership-conflicting IDs may appear as review rows under several flocks,
  // but each unique source identity is reviewed/excluded only once in the summary.
  const distinct = Array.from(new Map(events.map(event => [event.id, event])).values());
  const eligible = distinct.filter(event => event.eligible && event.inPeriod);
  const excludedEventCount = distinct.length - eligible.length;
  const issues: string[] = [];
  const coverage: HarvestMetricCoverage = {
    loadedBirdEvents: 0, loadedKgEvents: 0, loadedAveragePairs: 0,
    deliveredBirdEvents: 0, deliveredKgEvents: 0, deliveredAveragePairs: 0,
    massLossPairs: 0, transportMortalityEvents: 0,
  };
  if (distinct.length === 0) issues.push("No recorded harvests in the selected period; result metrics are N/A, not fabricated zero activity.");
  else if (eligible.length === 0) issues.push("No eligible dated harvest events in the selected period; result metrics are N/A, not zero.");
  if (excludedEventCount > 0) issues.push(`Partial recorded-only subtotals: ${excludedEventCount} unique reviewed event(s) excluded for source/date/master reconciliation; excluded events supply no quantities and ambiguous dates cannot prove period completeness.`);
  const subtotal = (field: "loadedBirds" | "loadedKg" | "deliveredBirds" | "deliveredKg" | "transportMortality",
    key: keyof HarvestMetricCoverage, label: string, integer: boolean): number | null => {
    const values = eligible.map(event => event[field]).filter((value): value is number => value !== null);
    coverage[key] = values.length;
    if (values.length < eligible.length) issues.push(`Partial ${label}: ${values.length}/${eligible.length} eligible events have valid observations; missing/invalid values remain N/A, not zero.`);
    const result = safeSum(values, integer);
    if (values.length > 0 && result === null) issues.push(`${label} subtotal exceeds safe numeric sum precision; N/A, no rounded overflow substituted.`);
    return result;
  };
  const loadedBirds = subtotal("loadedBirds", "loadedBirdEvents", "loaded birds", true);
  const loadedKg = subtotal("loadedKg", "loadedKgEvents", "loaded kg", false);
  const deliveredBirds = subtotal("deliveredBirds", "deliveredBirdEvents", "actual delivered birds", true);
  const deliveredKg = subtotal("deliveredKg", "deliveredKgEvents", "actual delivered kg", false);
  const transportMortality = subtotal("transportMortality", "transportMortalityEvents", "recorded transport mortality", true);
  const pairedAverage = (birds: "loadedBirds" | "deliveredBirds", weight: "loadedKg" | "deliveredKg",
    key: "loadedAveragePairs" | "deliveredAveragePairs", label: string): number | null => {
    const pairs = eligible.filter(event => event[birds] !== null && event[birds]! > 0 && event[weight] !== null);
    coverage[key] = pairs.length;
    if (pairs.length < eligible.length) issues.push(`Partial ${label} paired coverage: ${pairs.length}/${eligible.length} eligible events; only positive same-event kg/bird pairs contribute, never averages or unmatched populations.`);
    const result = average(safeSum(pairs.map(event => event[weight]!), false), safeSum(pairs.map(event => event[birds]!), true));
    if (pairs.length > 0 && result === null) issues.push(`${label} is N/A: paired sums exceed safe precision or the ratio underflows; no unsafe ratio substituted.`);
    return result;
  };
  const averageLoadedKg = pairedAverage("loadedBirds", "loadedKg", "loadedAveragePairs", "average loaded kg/bird");
  const averageDeliveredKg = pairedAverage("deliveredBirds", "deliveredKg", "deliveredAveragePairs", "average actual delivered kg/bird");
  const massPairs = eligible.filter(event => event.loadedKg !== null && event.deliveredKg !== null);
  coverage.massLossPairs = massPairs.length;
  if (massPairs.length < eligible.length) issues.push(`Partial mass-loss paired coverage: ${massPairs.length}/${eligible.length} eligible events; both positive actual weights on the same event are required.`);
  const pairedLoaded = safeSum(massPairs.map(event => event.loadedKg!), false);
  const pairedDelivered = safeSum(massPairs.map(event => event.deliveredKg!), false);
  const massLossKg = pairedLoaded !== null && pairedDelivered !== null ? pairedLoaded - pairedDelivered : null;
  const massLossPct = lossPercent(pairedLoaded, pairedDelivered);
  if (massPairs.length > 0 && (massLossKg === null || massLossPct === null)) issues.push("Mass loss is N/A where paired weight sums exceed safe magnitude or percentage exceeds finite precision.");
  if (massLossKg !== null && massLossKg < 0) issues.push("Negative recorded aggregate mass loss is retained without clamping; review the paired actual observations.");
  if (eligible.some(event => event.transportMortality === 0)) issues.push("Recorded transport mortality includes schema-default zero: source cannot prove explicitly captured zero. It is separate and is never inferred or subtracted again.");
  if (eligible.some(event => event.classification === "Recorded harvest — completion status unavailable")) issues.push("Recorded-only source limitation: unlinked harvest completion and historical uniqueness are unavailable; eligible subtotals do not establish complete or independently verified capture.");
  if (distinct.some(event => event.issues.length > 0)) issues.push("Review event-level raw source, delivery, linkage and measurement warnings; coverage is valid observations / eligible events, not proof of complete capture.");
  return { reviewedEventCount: distinct.length, eligibleEventCount: eligible.length, excludedEventCount,
    loadedBirds, loadedKg, averageLoadedKg, deliveredBirds, deliveredKg, averageDeliveredKg,
    massLossKg, massLossPct, transportMortality, coverage, issues: unique(issues) };
}

/** The caller owns authorization, source SELECTs, and house/flock mismatch validation. */
export function buildHarvestReport(
  source: HarvestReportSource,
  filters: ResolvedFlockPerformanceFilters,
  timezone: string,
  generatedAt: string,
): HarvestReport {
  validateFilters(filters);
  const flockGroups = groups(source.flocks, f => [f.flockNumber, f.houseId, f.placementDate, f.status]);
  const masters = new Map(flockGroups.map(group => [group.id, buildMaster(group, source)]));
  const harvestGroups = groups(source.harvests, harvestFields);
  const catchGroups = groups(source.catches, catchFields);
  // Index every raw catch version, including external-flock references and conflicting links.
  const linksByHarvest = new Map<number, Group<ProductionCatchSource>[]>();
  for (const group of catchGroups) {
    for (const id of Array.from(new Set(group.entries.map(entry => entry.harvestRecordId)))) {
      if (id === null) continue;
      const links = linksByHarvest.get(id) ?? [];
      links.push(group);
      linksByHarvest.set(id, links);
    }
  }
  const prepared = harvestGroups.map(group => prepareHarvest(group, linksByHarvest.get(group.id) ?? [], masters, filters));
  const harvestById = new Map(prepared.map(item => [item.group.id, item]));
  const rows: HarvestReportRow[] = [];
  for (const master of Array.from(masters.values())) {
    const { group } = master;
    if (filters.flockId !== null && group.id !== filters.flockId) continue;
    if (filters.houseId !== null && !group.entries.some(entry => entry.houseId === filters.houseId)) continue;
    if (group.entries.every(entry => isProductionDate(entry.placementDate) && entry.placementDate > filters.endDate)) continue;
    const issues = [...master.issues];
    const relevant = prepared.filter(item => item.group.entries.some(entry => entry.flockId === group.id) &&
      item.group.entries.some(entry => !isProductionDate(entry.harvestDate) || inRange(date(entry.harvestDate), filters) ||
        (master.placement !== null && entry.harvestDate! < master.placement && entry.harvestDate! <= filters.endDate)));
    // Return independently owned output objects, not aliases into supplied source or other rows.
    const events = relevant.map(item => ({ ...item.event, issues: [...item.event.issues],
      sessionIds: [...item.event.sessionIds], sourceVersions: item.event.sourceVersions.map(copyHarvest) }))
      .sort((a, b) => compareDate(a.date, b.date) || compareId(a.id, b.id));
    const exceptionMap = new Map<number, { group: Group<ProductionCatchSource>; reasons: string[] }>();
    const exception = (catchGroup: Group<ProductionCatchSource>, reason: string) => {
      const item = exceptionMap.get(catchGroup.id) ?? { group: catchGroup, reasons: [] };
      item.reasons.push(reason);
      exceptionMap.set(catchGroup.id, item);
    };
    for (const item of relevant) for (const warning of item.catchWarnings) exception(warning.group, warning.reason);
    for (const catchGroup of catchGroups) {
      if (!catchGroup.entries.some(entry => entry.flockId === group.id)) continue;
      if (!catchGroup.entries.some(entry => entry.status === "completed")) continue;
      if (!catchGroup.entries.some(entry => !isProductionDate(entry.catchDate) || inRange(date(entry.catchDate), filters))) continue;
      const linkedId = consensus(catchGroup.entries, "harvestRecordId");
      const linked = linkedId === null ? undefined : harvestById.get(linkedId);
      // Source validity, NOT selected-period eligibility. A genuine harvest outside
      // S..E is still a valid source link and must not become a phantom orphan.
      const validLink = !catchGroup.conflict && validId(catchGroup.id) && linked?.validSource === true &&
        consensus(linked.group.entries, "flockId") === group.id &&
        linked.event.sessionIds.length === 1 && linked.event.sessionIds[0] === catchGroup.id;
      if (!validLink) {
        if (!exceptionMap.has(catchGroup.id)) exception(catchGroup,
          `Completed catch session ${catchGroup.id} has no valid harvest source linkage${linkedId === null ? " (missing or conflicting harvest ID)" : ` (harvest ${linkedId})`}; reconciliation only, no quantities supplied.`);
      } else if (!relevant.some(item => item.group.id === linkedId)) {
        const catchDate = date(consensus(catchGroup.entries, "catchDate"));
        if (catchDate === null || catchDate !== linked.event.date) issues.push(
          `Catch session ${catchGroup.id} date is invalid or differs from its valid linked harvest ${linkedId} outside the selected period; harvest operational date scopes results, not a missing/invalid harvest link.`,
        );
      }
    }
    const catchExceptions: HarvestCatchException[] = Array.from(exceptionMap.values()).map(item => ({
      sessionId: item.group.id,
      harvestRecordId: consensus(item.group.entries, "harvestRecordId"),
      date: date(consensus(item.group.entries, "catchDate")),
      reason: unique([
        ...(item.group.entries.length > 1 ? [`Repeated catch source ID ${item.group.id}; exact duplicates count once; all original relevant versions retained.`] : []),
        ...(item.group.conflict ? ["Conflicting catch versions; no arbitrary version selected."] : []),
        ...item.reasons,
      ]).sort().join(" "),
      sourceVersions: item.group.entries.map(copyCatch),
    })).sort((a, b) => compareDate(a.date, b.date) || compareId(a.sessionId, b.sessionId));
    const metrics = aggregate(events);
    if (catchExceptions.length > 0) metrics.issues.push(`Partial/reconciliation limitation: ${catchExceptions.length} catch session exception(s) are separate from harvest quantities; no orphan/session totals added.`);
    for (const event of events) issues.push(...event.issues.map(issue => `Harvest ${event.id}: ${issue}`));
    for (const item of catchExceptions) issues.push(`Catch session ${item.sessionId}: ${item.reason}`);
    issues.push(...metrics.issues);
    rows.push({ flockId: group.id, flockNumber: master.flockNumber, houseId: master.houseId,
      houseName: master.houseName, placementDate: master.placement, currentStatus: master.status,
      events, catchExceptions, metrics, issues: unique(issues) });
  }
  rows.sort((a, b) => compareId(a.houseId ?? -1, b.houseId ?? -1) || compareId(a.flockId, b.flockId));
  const summary = aggregate(rows.flatMap(row => row.events));
  const catchExceptionCount = new Set(rows.flatMap(row => row.catchExceptions.map(item => item.sessionId))).size;
  if (catchExceptionCount > 0) summary.issues.push(`Partial/reconciliation limitation: ${catchExceptionCount} unique catch session exception(s); they never supply extra harvest quantities.`);
  const observedFlocks = rows.filter(row => row.metrics.eligibleEventCount > 0).length;
  if (observedFlocks < rows.length) summary.issues.push(`Partial selected-flock coverage: ${observedFlocks}/${rows.length} flocks have eligible period harvest events; no-event, excluded or unconfirmed flocks remain N/A, not fabricated zeros in a complete-looking cohort.`);
  if (rows.some(row => row.issues.length > 0)) summary.issues.push("Review per-flock source, current master-data and coverage warnings; known-only metric subtotals are not assertions of complete farm results.");
  return { kind: "harvest-results", generatedAt, timezone, filters: { ...filters }, rows,
    summary: { ...summary, issues: unique(summary.issues), flockCount: rows.length, catchExceptionCount },
    notes: [
      "Historical results use today's supplied/corrected source records, not an immutable reconstruction of what was known then. Existing actual history has not been validated or repaired by this report.",
      "House/flock labels, placement and current recorded status are today's master data, not historical snapshots. Planned/not-confirmed or invalid metadata is review-only; no-event flocks are N/A, not zero-weight harvests.",
      "Operational calendar date labels are preserved without timezone shifting. Harvest operational dates scope the inclusive selected period, no earlier than placement. Generated-at is the caller-supplied instant; the company timezone applies only to genuine instant displays.",
      "One canonical unique harvest ID contributes once. Exact duplicate IDs warn and count once; conflicting versions/ownership are excluded with all original relevant fields retained. Separate same-day partial harvest IDs are not fuzzy merged.",
      "A single compatible completed same-flock catch link is provenance only, never another quantity. Non-completed, multiple or conflicting/mismatched links exclude the event. Catch date mismatch/invalidity is a warning; it never replaces the harvest date. Completed catches without valid source linkage are separate reconciliation exceptions, not extra quantities; valid harvest links outside the selected period are not orphans.",
      "Unlinked recorded harvests are included with completion status unavailable. Source alone does not prove manual entry, historical uniqueness or complete capture; no automatic deduplication repair is performed.",
      "Birds are nonnegative safe integer counts; meaningful recorded zero counts remain zero but averages require positive paired birds. Loaded/delivered weights are positive actual kg measurements. Invalid/zero/missing weights remain raw review values and N/A.",
      "Actual delivery fields only: no fallback to loaded/caught/session/planned quantities, stored averages, configured shrinkage, target weights, invoice amounts or a 5.5% planning buffer. No forecasts, diagnosis or finances are reported.",
      "Grouped loaded/delivered average kg/bird is sum positive paired kg / sum positive paired birds on the same events, not mean event/flock averages. Mass loss uses only events with both positive actual weights: sum paired loaded minus sum paired delivered; percent divides that loss by sum paired loaded. Negative losses and over-delivery warnings are preserved without clamping.",
      "Metrics are independent recorded-only subtotals from eligible period events with valid respective observations; absent observations are N/A. Coverage is valid metric observations or pairs / eligible events; reviewed/excluded event counts, missing fields and no-event flock warnings must accompany totals. Summary deduplicates event IDs across selected rows, never averages flock ratios.",
      "Transport mortality is a separate recorded field; zero has a schema-default caveat and cannot prove explicit capture. Never infer it from loaded minus delivered birds or deduct it again from farm stock or delivered counts. Orphan catches never supply quantities.",
    ] };
}
