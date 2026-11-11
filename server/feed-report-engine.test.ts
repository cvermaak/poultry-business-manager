import { describe, expect, it } from "vitest";
import { buildFeedPerformanceReport } from "./feed-report-engine";
import type { FeedDailySource, FeedReportSource } from "../shared/feed-report";
import type { ProductionReportFlock, ProductionCatchSource, ResolvedFlockPerformanceFilters } from "../shared/production-reports";
import type { HarvestResultSourceRecord } from "../shared/harvest-report";

// Hand-authored structural SYNTHETIC unit fixtures only; no app data, DB, APIs,
// credentials, environment access, application imports, network or live UAT.
const P = "2026-10-01", E = "2026-10-03", AT = "2026-11-10T19:35:30.000Z";
const FILTERS: ResolvedFlockPerformanceFilters = { startDate: null, endDate: E, houseId: null, flockId: null };
function flock(overrides: Partial<ProductionReportFlock> = {}): ProductionReportFlock {
  return { id: 1, flockNumber: "SYNTHETIC-A", houseId: 1, placementDate: P, initialCount: 1000, status: "active", ...overrides };
}
function daily(overrides: Partial<FeedDailySource> = {}): FeedDailySource {
  return { id: 101, flockId: 1, recordDate: P, dayNumber: 0, mortality: 0, averageWeight: 0, feedConsumed: "100.1", feedType: "starter", ...overrides };
}
function days(): FeedDailySource[] {
  return [daily(), daily({ id: 102, recordDate: "2026-10-02", dayNumber: 1, mortality: 10, feedConsumed: "200.2", feedType: "grower" }),
    daily({ id: 103, recordDate: E, dayNumber: 2, mortality: 10, feedConsumed: "300.3", feedType: "finisher", averageWeight: "2.1" })];
}
function harvest(overrides: Partial<HarvestResultSourceRecord> = {}): HarvestResultSourceRecord {
  return { id: 201, flockId: 1, harvestDate: "2026-10-02", chickenCountLoaded: 300, totalLoadedWeightKg: "600.25", chickenCountDelivered: null, totalDeliveredWeightKg: null, transportMortalities: null, ...overrides };
}
function caught(overrides: Partial<ProductionCatchSource> = {}): ProductionCatchSource {
  return { id: 301, flockId: 1, catchDate: "2026-10-02", harvestRecordId: 201, status: "completed", ...overrides };
}
function source(overrides: Partial<FeedReportSource> = {}): FeedReportSource {
  return { houses: [{ id: 1, name: "Synthetic House A", houseNumber: "A" }, { id: 2, name: "Synthetic House B", houseNumber: "B" }], flocks: [flock()], dailyRecords: days(), harvests: [], catches: [], ...overrides };
}
function report(data = source(), filters: Partial<ResolvedFlockPerformanceFilters> = {}) {
  return buildFeedPerformanceReport(data, { ...FILTERS, ...filters }, "Africa/Johannesburg", AT);
}
function row(data = source(), filters: Partial<ResolvedFlockPerformanceFilters> = {}) { return report(data, filters).rows[0]; }
function reasons(data = source(), filters: Partial<ResolvedFlockPerformanceFilters> = {}) { return row(data, filters).fcr.reasons.join("\n"); }
function full(overrides: Partial<FeedReportSource> = {}): FeedReportSource {
  return source({ harvests: [harvest({ chickenCountLoaded: 990 })], dailyRecords: days().slice(0, 2), ...overrides });
}
function freeze(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
}

describe("approved Feed Performance — pure synthetic unit fixtures", () => {
  it("returns supplied metadata, independent filters, operational dates and required caveats", () => {
    const result = buildFeedPerformanceReport(source(), FILTERS, "Pacific/Kiritimati", AT);
    expect(result).toMatchObject({ kind: "feed-performance", generatedAt: AT, timezone: "Pacific/Kiritimati", filters: FILTERS });
    expect(result.filters).not.toBe(FILTERS);
    expect(result.rows[0].dailyRecords.map(d => d.date)).toEqual([P, "2026-10-02", E]);
    expect(result.notes.join(" ")).toMatch(/not net biomass-gain/);
    expect(result.notes.join(" ")).toMatch(/defaults do not establish deliberate zero capture/);
    expect(result.notes.join(" ")).toMatch(/not immutable historical snapshots/);
  });
  it.each([{ endDate: "2026-02-30" }, { endDate: "" }, { endDate: "2026-10-03T00:00:00Z" }, { startDate: undefined }, { startDate: "2026-10-04" }, { startDate: "2026-13-01" }, { houseId: 0 }, { flockId: -1 }, { flockId: NaN }, { houseId: Infinity }, { flockId: 1.1 }, { houseId: "1" as unknown as number }])("rejects malformed filters %j", filters => {
    expect(() => report(source(), filters)).toThrow(/date|integer/);
  });
  it("intersects house/flock filters and selects all uncertain masters but not definitely future placement", () => {
    const data = source({ flocks: [flock(), flock({ id: 2, houseId: 2 }), flock({ id: 3, placementDate: "2026-10-04" }), flock({ id: 4, placementDate: null })] });
    expect(report(data).rows.map(r => r.flockId)).toEqual([1, 4, 2]);
    expect(report(data, { houseId: 2 }).rows.map(r => r.flockId)).toEqual([2]);
    expect(report(data, { houseId: 1, flockId: 2 }).rows).toEqual([]);
    expect(report(data, { flockId: 4 }).rows[0].fcr.value).toBeNull();
  });
  it("empty selected cohorts and no daily observations have N/A totals and stages, not invented zeros", () => {
    expect(report(source({ flocks: [] })).summary).toMatchObject({ flockCount: 0, qualifyingFlocks: 0, fcr: null, periodFeed: { kg: null, stages: { starter: null, grower: null, finisher: null, unspecified: null } } });
    const actual = row(source({ dailyRecords: [] }));
    expect(actual.periodFeed.kg).toBeNull();
    expect(actual.cumulativeFeed.validDays).toBe(0);
    expect(actual.fcr.value).toBeNull();
    expect(actual.fcr.coverage.missingFeedDays).toBe(3);
  });
  it("pre-harvest uses output-plus-live mass, not biomass gain, and retains unrounded input precision", () => {
    const actual = row();
    expect(actual.fcr).toMatchObject({ eligible: true, endpoint: E, loadedBirds: 0, loadedKg: 0, cumulativeDeaths: 20, remainingBirds: 980, weightKg: 2.1, weightDate: E, closureDate: null });
    expect(actual.fcr.cumulativeFeedKg).toBeCloseTo(100.1 + 200.2 + 300.3, 12);
    expect(actual.fcr.biomassKg).toBe(980 * 2.1);
    expect(actual.fcr.value).toBe((100.1 + 200.2 + 300.3) / (980 * 2.1));
    expect(actual.fcr.coverage).toMatchObject({ complete: true, expectedDays: 3, validFeedDays: 3, validMortalityDays: 3, feedRecords: 3 });
    expect(actual.periodFeed.stages.unspecified).toBe(0);
  });
  it("partial harvest is counted cumulatively before selected S, with no double subtraction of transport deaths", () => {
    const data = source({ harvests: [harvest({ transportMortalities: 80 })], catches: [caught()] });
    const actual = row(data, { startDate: E });
    expect(actual.periodFeed.kg).toBe(300.3);
    expect(actual.periodFeed.expectedDays).toBe(1);
    expect(actual.cumulativeFeed.kg).toBe(100.1 + 200.2 + 300.3);
    expect(actual.fcr).toMatchObject({ eligible: true, loadedBirds: 300, loadedKg: 600.25, remainingBirds: 680, estimatedRemainingKg: 680 * 2.1 });
    expect(actual.fcr.value).toBe((100.1 + 200.2 + 300.3) / (600.25 + 680 * 2.1));
    expect(actual.harvestRecords).toHaveLength(1);
    expect(actual.harvestRecords[0].eligible).toBe(true);
  });
  it("accepts warning-qualified unlinked recorded harvest and delivery-only gaps", () => {
    const actual = row(source({ harvests: [harvest()] }));
    expect(actual.fcr.eligible).toBe(true);
    expect(actual.issues.join(" ")).toMatch(/Unlinked recorded harvest/);
    expect(actual.harvestRecords[0].deliveredKg).toBeNull();
  });
  it("uses inclusive max(S,P) period and all P..E feed independently from completed-cycle P..Q", () => {
    const data = full({ dailyRecords: [...days().slice(0, 2), daily({ id: 103, recordDate: E, dayNumber: 2, feedConsumed: 0, mortality: 0 })] });
    const actual = row(data, { startDate: E });
    expect(actual.periodFeed.kg).toBe(0);
    expect(actual.cumulativeFeed.kg).toBe(100.1 + 200.2);
    expect(actual.fcr.cumulativeFeedKg).toBe(100.1 + 200.2);
    expect(actual.dailyRecords.map(d => d.inFcr)).toEqual([true, true, false]);
    expect(row(source(), { startDate: "2026-09-01" }).periodFeed.expectedDays).toBe(3);
  });
  it.each(["planned", "pending", "scheduled", "unconfirmed", "not_started", "not-started", " PLANNED "])("planned master %s is N/A review-only", status => {
    const actual = row(source({ flocks: [flock({ status })] }));
    expect(actual.periodFeed.kg).toBeNull();
    expect(actual.fcr.value).toBeNull();
    expect(actual.dailyRecords.every(d => !d.eligible)).toBe(true);
  });
  it.each([null, "", "bad", "2026-02-30", "2026-10-01T00:00:00Z"])("invalid placement %s remains visible without invented scope", placementDate => {
    const actual = row(source({ flocks: [flock({ placementDate })] }));
    expect(actual.placementDate).toBeNull();
    expect(actual.fcr.endpoint).toBeNull();
    expect(actual.periodFeed.kg).toBeNull();
  });
  it.each([{ initialCount: 0 }, { initialCount: -1 }, { initialCount: 1.5 }, { initialCount: Infinity }, { flockNumber: "" }, { status: "" }, { houseId: 0 }])("invalid master fields are N/A %j", change => {
    expect(row(source({ flocks: [flock(change)] })).fcr.value).toBeNull();
    expect(row(source({ flocks: [flock(change)] })).cumulativeFeed.kg).toBeNull();
  });
  it("initialCount is included in master identity fingerprint and exact master duplicates warn", () => {
    expect(row(source({ flocks: [flock(), flock()] })).fcr.eligible).toBe(true);
    const actual = row(source({ flocks: [flock(), flock({ initialCount: 999 })] }));
    expect(actual.initialBirds).toBeNull();
    expect(actual.fcr.value).toBeNull();
    expect(actual.cumulativeFeed.kg).toBeNull();
  });
  it("house metadata cannot be missing, conflicting, or arbitrarily assigned to a filter", () => {
    expect(row(source({ houses: [] })).periodFeed.kg).toBeNull();
    const data = source(); data.houses.push({ ...data.houses[0], houseNumber: "conflict" });
    expect(row(data).fcr.value).toBeNull();
    expect(row(source({ flocks: [flock(), flock({ houseId: 2 })] }), { houseId: 1 }).houseId).toBeNull();
  });
  it("placement day 0 and all dates require feed plus mortality coverage; known partial feed remains", () => {
    const data = source({ dailyRecords: days().slice(1) });
    const actual = row(data);
    expect(actual.cumulativeFeed).toMatchObject({ kg: 200.2 + 300.3, validRecords: 2, validDays: 2, expectedDays: 3, partial: true });
    expect(actual.fcr.value).toBeNull();
    expect(actual.fcr.coverage.missingFeedDays).toBe(1);
    expect(row(data, { startDate: E }).periodFeed.partial).toBe(false);
    data.dailyRecords[0].mortality = null;
    expect(row(data).fcr.coverage.validMortalityDays).toBe(1);
  });
  it("stored feed/death zeros count at record level with caveat, but all-zero cumulative feed blocks ratio", () => {
    const data = source({ dailyRecords: days().map(d => ({ ...d, feedConsumed: "0.00", mortality: 0 })) });
    const actual = row(data);
    expect(actual.cumulativeFeed.kg).toBe(0);
    expect(actual.fcr.coverage).toMatchObject({ complete: true, zeroFeedRecords: 3 });
    expect(actual.fcr.value).toBeNull();
    expect(reasons(data)).toMatch(/Positive cumulative recorded feed/);
    data.dailyRecords[0].feedConsumed = 10;
    expect(row(data).fcr.eligible).toBe(true);
  });
  it.each([null, "", " ", -1, "-0", "-1", NaN, Infinity, "1kg", "1e2", "0x10", "+1", "1,000", "9007199254740991.1", "0." + "0".repeat(400) + "1"])("rejects invalid feed spelling/magnitude %s without zero fallback", value => {
    const ds = days(); ds[0].feedConsumed = value;
    const actual = row(source({ dailyRecords: ds }));
    expect(actual.dailyRecords[0].feedKg).toBeNull();
    expect(actual.cumulativeFeed.kg).toBe(200.2 + 300.3);
    expect(actual.cumulativeFeed.partial).toBe(true);
    expect(actual.fcr.value).toBeNull();
  });
  it.each(["1.0", "1e0", "0x0", "0.00000000000000000001", "1.00000000000000000001", "", null, -1, 1.2, Infinity, "9007199254740992"])("strict integer mortality rejects %s", value => {
    const ds = days(); ds[0].mortality = value;
    expect(row(source({ dailyRecords: ds })).dailyRecords[0].mortality).toBeNull();
    expect(row(source({ dailyRecords: ds })).fcr.value).toBeNull();
  });
  it.each(["0", "0.0", ".0", "001.25", ".25", "1.", " 1.20 "])("accepts ordinary nonnegative decimal feed %s", value => {
    const ds = days(); ds[0].feedConsumed = value;
    expect(row(source({ dailyRecords: ds })).dailyRecords[0].feedKg).toBe(Number(value));
  });
  it("pre-placement observations are review-only and definitely future all-version groups cannot poison report", () => {
    const ds = [...days(), daily({ id: 110, recordDate: "2026-09-30", feedConsumed: 999 }), daily({ id: 111, recordDate: "2026-10-04", feedConsumed: -1 }), daily({ id: 111, recordDate: "2026-10-05", mortality: -1 })];
    const actual = row(source({ dailyRecords: ds, harvests: [harvest({ harvestDate: "2026-10-04" }), harvest({ harvestDate: "2026-10-05" })], catches: [caught({ harvestRecordId: null, catchDate: "2026-10-05" })] }));
    expect(actual.fcr.eligible).toBe(true);
    expect(actual.cumulativeFeed.kg).toBe(100.1 + 200.2 + 300.3);
    expect(actual.dailyRecords.map(d => d.id)).toEqual([110, 101, 102, 103]);
    expect(actual.dailyRecords[0].eligible).toBe(false);
    expect(actual.harvestRecords).toEqual([]);
  });
  it("unknown stage remains Unspecified and keeps quantity; stage absence becomes zero only with valid observations", () => {
    const ds = days().map(d => ({ ...d, feedType: null }));
    ds[1].feedType = "Starter" as never;
    const actual = row(source({ dailyRecords: ds }));
    expect(actual.cumulativeFeed.stages).toEqual({ starter: 0, grower: 0, finisher: 0, unspecified: 100.1 + 200.2 + 300.3 });
    expect(actual.fcr.eligible).toBe(true);
    expect(actual.issues.join(" ")).toMatch(/Unspecified/);
  });
  it("exact daily ID repetitions count once with every source version preserved", () => {
    const data = source(); data.dailyRecords.push({ ...data.dailyRecords[0] });
    const actual = row(data);
    expect(actual.cumulativeFeed.validRecords).toBe(3);
    expect(actual.fcr.eligible).toBe(true);
    expect(actual.dailyRecords[0].sourceVersions).toHaveLength(2);
    expect(actual.dailyRecords[0].issues.join(" ")).toMatch(/count once/);
  });
  it.each([ { feedConsumed: "100.10" }, { mortality: "0" }, { dayNumber: 99 }, { averageWeight: "1" }, { feedType: "finisher" }, { recordDate: "2026-10-04" } ])("fingerprints all relevant daily fields: conflict %j excludes ID everywhere", change => {
    const data = source(); data.dailyRecords.push({ ...data.dailyRecords[0], ...change });
    const actual = row(data);
    expect(actual.dailyRecords.find(d => d.id === 101)?.sourceVersions).toHaveLength(2);
    expect(actual.dailyRecords.find(d => d.id === 101)?.eligible).toBe(false);
    expect(actual.cumulativeFeed.kg).toBe(200.2 + 300.3);
    expect(actual.fcr.value).toBeNull();
  });
  it("conflicting daily ownership is excluded in both flocks and does not double-count known totals", () => {
    const data = source({ flocks: [flock(), flock({ id: 2, houseId: 2 })] });
    data.dailyRecords.push({ ...data.dailyRecords[0], flockId: 2 });
    const result = report(data);
    expect(result.rows.every(r => r.dailyRecords.find(d => d.id === 101)?.eligible === false)).toBe(true);
    expect(result.summary.cumulativeFeed.kg).toBe(200.2 + 300.3);
    expect(result.summary.cumulativeFeed.partial).toBe(true);
    expect(result.summary.fcr).toBeNull();
  });
  it("different daily IDs on same date retain known subtotals but block FCR", () => {
    const data = source(); data.dailyRecords.push(daily({ id: 104, feedConsumed: 1 }));
    const actual = row(data);
    expect(actual.cumulativeFeed.kg).toBe(100.1 + 1 + 200.2 + 300.3);
    expect(actual.cumulativeFeed).toMatchObject({ validRecords: 4, validDays: 3, partial: true });
    expect(actual.fcr.coverage).toMatchObject({ complete: false, validFeedDays: 2 });
    expect(actual.fcr.value).toBeNull();
  });
  it("undated and undecodable/unscoped ownership raw versions remain review-only and block uncertain FCR", () => {
    const ds = [...days(), daily({ id: 104, recordDate: null }), daily({ id: 105, flockId: 0 })];
    const actual = row(source({ dailyRecords: ds }));
    expect(actual.dailyRecords.at(-1)?.date).toBeNull();
    expect(actual.dailyRecords.find(d => d.id === 105)?.eligible).toBe(false);
    expect(actual.cumulativeFeed.kg).toBe(100.1 + 200.2 + 300.3);
    expect(actual.fcr.value).toBeNull();
    expect(row(source({ harvests: [harvest({ flockId: 0 })] })).harvestRecords[0].sourceVersions[0].flockId).toBe(0);
    expect(row(source({ harvests: [harvest({ flockId: 0 })] })).fcr.value).toBeNull();
    expect(row(source({ catches: [caught({ flockId: 0, harvestRecordId: null, catchDate: null })] })).catchExceptions[0].sourceVersions[0].flockId).toBe(0);
  });
  it("preserves positive-but-unattached owner IDs as unscoped review, not a silent omitted activity", () => {
    const actual = row(source({ dailyRecords: [...days(), daily({ id: 104, flockId: 999 })], harvests: [harvest({ flockId: 999 })], catches: [caught({ flockId: 999, harvestRecordId: null })] }));
    expect(actual.dailyRecords.find(d => d.id === 104)?.sourceVersions[0].flockId).toBe(999);
    expect(actual.harvestRecords[0].sourceVersions[0].flockId).toBe(999);
    expect(actual.catchExceptions[0].sourceVersions[0].flockId).toBe(999);
    expect(actual.fcr.value).toBeNull();
  });
  it("invalid or conflicting weight at latest attempted date cannot select earlier convenient observation", () => {
    const ds = days(); ds[1].averageWeight = 1.5; ds[2].averageWeight = "bad";
    const actual = row(source({ dailyRecords: ds }));
    expect(actual.latestWeightKg).toBeNull(); expect(actual.latestWeightDate).toBe(E);
    expect(actual.fcr.value).toBeNull();
    ds[2].averageWeight = 0;
    const old = row(source({ dailyRecords: ds }));
    expect(old.latestWeightKg).toBe(1.5); expect(old.latestWeightDate).toBe("2026-10-02");
    expect(old.fcr.value).toBeNull();
  });
  it.each([0, "0.00", null, ""])("zero/null/blank endpoint weight %s is unmeasured, not an invented live mass", value => {
    const ds = days(); ds[2].averageWeight = value;
    expect(row(source({ dailyRecords: ds })).fcr.value).toBeNull();
  });
  it("same-day partial harvest sample is N/A until a strictly later E sample, not assumed after catch", () => {
    const data = source({ harvests: [harvest({ harvestDate: E })] });
    expect(reasons(data)).toMatch(/strictly after/);
    expect(row(data).fcr.value).toBeNull();
    data.harvests[0].harvestDate = "2026-10-02";
    expect(row(data).fcr.eligible).toBe(true);
  });
  it("sample conflict across daily IDs or undated measurement cannot produce a current or earlier winner", () => {
    const data = source(); data.dailyRecords.push(daily({ id: 104, recordDate: E, averageWeight: "3" }));
    expect(row(data).latestWeightKg).toBeNull(); expect(row(data).fcr.value).toBeNull();
    const ds = days(); ds.push(daily({ id: 105, recordDate: null, averageWeight: "1" }));
    expect(row(source({ dailyRecords: ds })).latestWeightDate).toBeNull();
  });
  it("same-event positive count and kg pairs are mandatory; cannot pair separate count-only/mass-only events", () => {
    const data = source({ harvests: [harvest({ totalLoadedWeightKg: null }), harvest({ id: 202, chickenCountLoaded: null, totalLoadedWeightKg: "500" })] });
    expect(reasons(data)).toMatch(/same event/);
    expect(row(data).fcr.value).toBeNull();
    expect(row(data).fcr.loadedKg).toBeNull();
  });
  it.each([{ chickenCountLoaded: 0 }, { totalLoadedWeightKg: "0" }, { chickenCountLoaded: "300.0" }, { totalLoadedWeightKg: "1e2" }])("invalid loaded pair %j blocks FCR", change => {
    expect(row(source({ harvests: [harvest(change)] })).fcr.value).toBeNull();
  });
  it("exact harvest/catch duplicate IDs count once while conflicting IDs, multiple/noncompleted/mismatched links exclude", () => {
    expect(row(source({ harvests: [harvest(), harvest()], catches: [caught(), caught()] })).fcr.eligible).toBe(true);
    expect(row(source({ harvests: [harvest(), harvest({ totalDeliveredWeightKg: 1 })] })).fcr.value).toBeNull();
    expect(row(source({ harvests: [harvest()], catches: [caught(), caught({ id: 302 })] })).fcr.value).toBeNull();
    expect(row(source({ harvests: [harvest()], catches: [caught({ status: "pending" })] })).fcr.value).toBeNull();
    expect(row(source({ harvests: [harvest()], catches: [caught({ flockId: 2 })] })).fcr.value).toBeNull();
  });
  it("completed orphan/undated/pre-placement removals block; no session quantities fabricate output", () => {
    expect(row(source({ catches: [caught({ harvestRecordId: null })] })).fcr.value).toBeNull();
    expect(row(source({ catches: [caught({ harvestRecordId: null, catchDate: null })] })).fcr.value).toBeNull();
    expect(row(source({ harvests: [harvest({ harvestDate: null })] })).fcr.value).toBeNull();
    expect(row(source({ harvests: [harvest({ harvestDate: "2026-09-30" })] })).fcr.value).toBeNull();
  });
  it("accepted linked catch date warnings do not blanket-block when both dates are through endpoint", () => {
    const data = source({ harvests: [harvest()], catches: [caught({ catchDate: P })] });
    expect(row(data).fcr.eligible).toBe(true);
    expect(row(data).catchExceptions[0].reason).toMatch(/differs/);
    data.catches[0].catchDate = null;
    expect(row(data).fcr.eligible).toBe(true);
    data.catches[0].catchDate = "2026-10-04";
    expect(row(data).fcr.value).toBeNull();
    expect(reasons(data)).toMatch(/cross calculation endpoint/);
  });
  it("requires endpoint sample strictly after a known linked catch even if canonical harvest date is earlier", () => {
    const data = source({ harvests: [harvest()], catches: [caught({ catchDate: E })] });
    expect(row(data).fcr.value).toBeNull();
    expect(reasons(data)).toMatch(/same-day catch\/sample ordering/);
    data.catches[0].catchDate = P;
    expect(row(data).fcr.eligible).toBe(true);
    data.catches[0].catchDate = "2026-10-04";
    expect(row(data).fcr.value).toBeNull();
    expect(reasons(data)).toMatch(/cross calculation endpoint/);
  });
  it("past catch referencing definitely future harvest blocks cross-E uncertainty rather than becoming safe future activity", () => {
    const actual = row(source({ harvests: [harvest({ harvestDate: "2026-10-04" })], catches: [caught()] }));
    expect(actual.fcr.value).toBeNull();
    expect(actual.catchExceptions).toHaveLength(1);
  });
  it("completed-cycle F(T)/M(T) needs no sample, includes same-day feed, and expects no later empty days", () => {
    const actual = row(full());
    expect(actual.fcr).toMatchObject({ eligible: true, endpoint: "2026-10-02", closureDate: "2026-10-02", remainingBirds: 0, cumulativeDeaths: 10, loadedBirds: 990, loadedKg: 600.25, weightKg: null, estimatedRemainingKg: 0 });
    expect(actual.fcr.value).toBe((100.1 + 200.2) / 600.25);
    expect(actual.fcr.coverage.expectedDays).toBe(2);
    expect(actual.cumulativeFeed).toMatchObject({ expectedDays: 3, partial: true });
  });
  it("missing or conflicting mortality prefix cannot invent a closure date from a known-only zero balance", () => {
    const data = full({ dailyRecords: [days()[1]] });
    expect(row(data).fcr.closureDate).toBeNull();
    expect(row(data).fcr.endpoint).toBe(E);
    expect(row(data).fcr.value).toBeNull();
    const conflict = full(); conflict.dailyRecords.push({ ...conflict.dailyRecords[0], mortality: 1 });
    expect(row(conflict).fcr.closureDate).toBeNull();
  });
  it("missing feed at a proven count/output closure retains T but blocks FCR coverage", () => {
    const ds = days().slice(0, 2); ds[0].feedConsumed = null;
    const actual = row(full({ dailyRecords: ds }));
    expect(actual.fcr.closureDate).toBe("2026-10-02");
    expect(actual.fcr.value).toBeNull();
    expect(actual.fcr.coverage.expectedDays).toBe(2);
  });
  it("completed status is not closure proof; deaths-only empty balance has N/A output denominator", () => {
    const ds = days().map(d => ({ ...d, mortality: 0 })); ds[2].mortality = 1000;
    const actual = row(source({ flocks: [flock({ status: "completed" })], dailyRecords: ds }));
    expect(actual.fcr.remainingBirds).toBe(0); expect(actual.fcr.loadedKg).toBe(0);
    expect(actual.fcr.value).toBeNull(); expect(actual.fcr.closureDate).toBeNull();
    expect(actual.fcr.reasons.join(" ")).toMatch(/Deaths-only/);
    expect(row(source({ flocks: [flock({ status: "completed" })] })).fcr.endpoint).toBe(E);
  });
  it("valid later zero daily rows and later weights alone are permitted without new coverage expectation", () => {
    const actual = row(full({ dailyRecords: [...days().slice(0, 2), daily({ id: 103, recordDate: E, dayNumber: 2, feedConsumed: 0, mortality: 0, averageWeight: "3" })] }));
    expect(actual.fcr.eligible).toBe(true); expect(actual.latestWeightDate).toBe(E);
    expect(actual.fcr.coverage.expectedDays).toBe(2); expect(actual.fcr.weightKg).toBeNull();
  });
  it.each(["bad", "-1", "1e2", Infinity])("invalid post-closure attempted weight %j requires reconciliation even with zero feed/deaths", averageWeight => {
    const data = full({ dailyRecords: [...days().slice(0, 2), daily({ id: 103, recordDate: E, dayNumber: 2, feedConsumed: 0, mortality: 0, averageWeight })] });
    expect(row(data).fcr.value).toBeNull();
    expect(reasons(data)).toMatch(/post-closure/);
  });
  it.each([null, "", " ", "0.000", 0, "3.0"])("post-closure unmeasured defaults or valid weight %j do not create a false blocker", averageWeight => {
    const data = full({ dailyRecords: [...days().slice(0, 2), daily({ id: 103, recordDate: E, dayNumber: 2, feedConsumed: 0, mortality: 0, averageWeight })] });
    expect(row(data).fcr.eligible).toBe(true);
    expect(row(data).fcr.endpoint).toBe("2026-10-02");
  });
  it.each([{ feedConsumed: 1, mortality: 0 }, { feedConsumed: 0, mortality: 1 }, { feedConsumed: null, mortality: 0 }, { feedConsumed: 0, mortality: null }, { feedConsumed: 0, mortality: 0, recordDate: null }])("post-closure activity %j blocks instead of disappearing at T", change => {
    const actual = row(full({ dailyRecords: [...days().slice(0, 2), daily({ id: 103, recordDate: E, dayNumber: 2, ...change })] }));
    expect(actual.fcr.value).toBeNull();
    expect(actual.fcr.reasons.join(" ")).toMatch(/post-closure/);
  });
  it("additional post-closure loads and catch-date crossing T require reconciliation", () => {
    const data = full(); data.harvests.push(harvest({ id: 202, harvestDate: E, chickenCountLoaded: 1, totalLoadedWeightKg: 1 }));
    expect(row(data).fcr.value).toBeNull(); expect(reasons(data)).toMatch(/post-closure/);
    expect(row(full({ catches: [caught({ catchDate: E })] })).fcr.value).toBeNull();
    expect(reasons(full({ catches: [caught({ catchDate: E })] }))).toMatch(/cross calculation endpoint/);
  });
  it("checks every operational date's potential remaining balance without clipping negative intermediate/end values", () => {
    const ds = days(); ds[0].mortality = 1001;
    const actual = row(source({ dailyRecords: ds }));
    expect(actual.fcr.value).toBeNull();
    expect(actual.fcr.remainingBirds).toBe(1000 - 1001 - 10 - 10);
    expect(actual.fcr.reasons.join(" ")).toMatch(/Negative recorded balance at 2026-10-01/);
  });
  it("safe numeric subtotal/product/ratio guards prevent clipped MAX, overflow, underflow or Infinity", () => {
    const ds = days(); ds[0].feedConsumed = Number.MAX_SAFE_INTEGER; ds[1].feedConsumed = ".1";
    expect(row(source({ dailyRecords: ds })).cumulativeFeed.kg).toBeNull();
    const weights = days(); weights[2].averageWeight = Number.MAX_SAFE_INTEGER;
    expect(row(source({ dailyRecords: weights })).fcr.biomassKg).toBeNull();
    const tiny = source({ flocks: [flock({ initialCount: 1 })], dailyRecords: [daily({ feedConsumed: Number.MIN_VALUE, averageWeight: Number.MAX_SAFE_INTEGER })] });
    expect(row(tiny, { endDate: P }).fcr.value).toBeNull();
  });
  it("full-cohort aggregation divides unrounded sums, never means ratios; one failure produces N/A n/N", () => {
    const data = source({ flocks: [flock(), flock({ id: 2, houseId: 2, initialCount: 2000 })], dailyRecords: [...days(), ...days().map(d => ({ ...d, id: d.id + 1000, flockId: 2, feedConsumed: "50.125", mortality: 0, averageWeight: d.recordDate === E ? "1.5" : 0 }))] });
    const result = report(data);
    const feeds = result.rows.map(r => r.fcr.cumulativeFeedKg!); const biomass = result.rows.map(r => r.fcr.biomassKg!);
    expect(result.summary).toMatchObject({ flockCount: 2, qualifyingFlocks: 2 });
    expect(result.summary.fcr).toBe((feeds[0] + feeds[1]) / (biomass[0] + biomass[1]));
    expect(result.summary.fcr).not.toBe((result.rows[0].fcr.value! + result.rows[1].fcr.value!) / 2);
    data.dailyRecords.pop();
    const incomplete = report(data);
    expect(incomplete.summary).toMatchObject({ qualifyingFlocks: 1, fcr: null, fcrFeedKg: null, biomassKg: null });
    expect(incomplete.summary.issues.join(" ")).toMatch(/1\/2/);
    expect(incomplete.summary.cumulativeFeed.partial).toBe(true);
    expect(incomplete.summary.cumulativeFeed.kg).not.toBeNull();
  });
  it("cohort can mix completed-cycle and remaining-stock endpoints explicitly without averaging", () => {
    const data = full({ flocks: [flock(), flock({ id: 2, houseId: 2 })], dailyRecords: [...days().slice(0, 2), ...days().map(d => ({ ...d, id: d.id + 1000, flockId: 2 }))] });
    const result = report(data);
    expect(result.rows.map(r => r.fcr.endpoint)).toEqual(["2026-10-02", E]);
    expect(result.summary.qualifyingFlocks).toBe(2);
    expect(result.summary.fcr).toBe((result.rows[0].fcr.cumulativeFeedKg! + result.rows[1].fcr.cumulativeFeedKg!) / (result.rows[0].fcr.biomassKg! + result.rows[1].fcr.biomassKg!));
  });
  it("is deterministic under source reorder, chronologically sorted with IDs then undated last, and immutable/no output aliases", () => {
    const data = source({ dailyRecords: [daily({ id: 109, recordDate: null }), ...days().reverse(), daily({ id: 104 })], harvests: [harvest(), harvest({ id: 202, harvestDate: null })], catches: [caught(), caught({ id: 302, harvestRecordId: null, catchDate: null })] });
    const before = JSON.stringify(data); freeze(data); freeze(FILTERS);
    const result = buildFeedPerformanceReport(data, FILTERS, "Africa/Johannesburg", AT);
    expect(JSON.stringify(data)).toBe(before);
    const reordered = { ...data, houses: [...data.houses].reverse(), flocks: [...data.flocks].reverse(), dailyRecords: [...data.dailyRecords].reverse(), harvests: [...data.harvests].reverse(), catches: [...data.catches].reverse() };
    expect(report(reordered)).toEqual(result);
    expect(result.rows[0].dailyRecords.map(d => d.id)).toEqual([101, 104, 102, 103, 109]);
    expect(result.rows[0].dailyRecords[0].sourceVersions[0]).not.toBe(data.dailyRecords[3]);
    result.rows[0].dailyRecords[0].sourceVersions[0].feedConsumed = 900;
    result.rows[0].harvestRecords[0].sourceVersions[0].totalLoadedWeightKg = 900;
    result.rows[0].catchExceptions[0].sourceVersions[0].status = "output-only";
    result.rows[0].periodFeed.stages.starter = 900;
    expect(JSON.stringify(data)).toBe(before);
    expect(result.rows[0].cumulativeFeed.stages.starter).not.toBe(900);
    expect(result.summary.periodFeed.stages.starter).not.toBe(900);
  });
});
