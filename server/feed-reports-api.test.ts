import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { FeedPerformanceReport, FeedReportSource, FeedTotals } from "../shared/feed-report";
import type { FlockPerformanceFilters, ResolvedFlockPerformanceFilters } from "../shared/production-reports";

const boundaries = vi.hoisted(() => ({
  readProductionReportSource: vi.fn(),
  readMortalityReportSource: vi.fn(),
  readHarvestReportSource: vi.fn(),
  readFeedReportSource: vi.fn(),
  buildFlockPerformanceReport: vi.fn(),
  buildMortalityReport: vi.fn(),
  buildHarvestReport: vi.fn(),
  buildFeedPerformanceReport: vi.fn(),
  getDb: vi.fn(() => {
    throw new Error("Feed API tests must never initialize a database.");
  }),
}));
vi.mock("./db", () => ({ getDb: boundaries.getDb }));
vi.mock("./production-reports-db", () => ({ readProductionReportSource: boundaries.readProductionReportSource }));
vi.mock("./mortality-report-db", () => ({ readMortalityReportSource: boundaries.readMortalityReportSource }));
vi.mock("./harvest-report-db", () => ({ readHarvestReportSource: boundaries.readHarvestReportSource }));
vi.mock("./feed-report-db", () => ({ readFeedReportSource: boundaries.readFeedReportSource }));
vi.mock("./production-report-engine", () => ({ buildFlockPerformanceReport: boundaries.buildFlockPerformanceReport }));
vi.mock("./mortality-report-engine", () => ({ buildMortalityReport: boundaries.buildMortalityReport }));
vi.mock("./harvest-report-engine", () => ({ buildHarvestReport: boundaries.buildHarvestReport }));
vi.mock("./feed-report-engine", () => ({ buildFeedPerformanceReport: boundaries.buildFeedPerformanceReport }));
import { productionReportsRouter } from "./production-reports-router";

const databaseCallsDuringImport = boundaries.getDb.mock.calls.length;
const generatedAt = "2026-11-07T22:30:00.000Z";
const timezone = "Africa/Johannesburg";
const otherBoundaryNames = [
  "readProductionReportSource", "readMortalityReportSource", "readHarvestReportSource",
  "buildFlockPerformanceReport", "buildMortalityReport", "buildHarvestReport",
] as const;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

// Synthetic fixtures only. Formula, reconciliation, coverage and endpoint
// semantics belong to the independently owned pure feed-engine tests.
function testingSource(): FeedReportSource {
  return {
    houses: [
      { id: 22, name: "TEST Beta house", houseNumber: "TEST-B" },
      { id: 11, name: "TEST Alpha house", houseNumber: "TEST-A" },
    ],
    flocks: [
      { id: 202, flockNumber: "TEST-Z", houseId: 22, placementDate: "2026-11-01", initialCount: 2000, status: "completed" },
      { id: 101, flockNumber: "TEST-A", houseId: 11, placementDate: "2026-11-01", initialCount: 1000, status: "active" },
    ],
    dailyRecords: [
      { id: 2001, flockId: 101, recordDate: "2026-11-01", dayNumber: 0,
        mortality: 0, averageWeight: "0.040", feedConsumed: "12.34", feedType: "starter" },
      { id: 2002, flockId: 101, recordDate: "2026-11-03", dayNumber: 2,
        mortality: 2, averageWeight: "0.100", feedConsumed: "0.00", feedType: null },
      { id: 2003, flockId: 202, recordDate: null, dayNumber: 3,
        mortality: null, averageWeight: null, feedConsumed: "TEST-invalid", feedType: "TEST-unknown" },
    ],
    harvests: [
      { id: 1001, flockId: 101, harvestDate: "2026-11-03", chickenCountLoaded: 100,
        totalLoadedWeightKg: "200.000", chickenCountDelivered: 98,
        totalDeliveredWeightKg: "190.000", transportMortalities: 2 },
    ],
    catches: [
      { id: 3001, flockId: 101, catchDate: "2026-11-03", harvestRecordId: 1001, status: "completed" },
      // Global foreign-flock provenance must reach the engine even for a filter.
      { id: 3002, flockId: 202, catchDate: "2026-11-03", harvestRecordId: 1001, status: "completed" },
    ],
  };
}

function testingTotals(kg: number): FeedTotals {
  return { kg, stages: { starter: kg, grower: null, finisher: 0, unspecified: null },
    validRecords: 1, validDays: 1, expectedDays: 3, partial: true,
    issues: ["TEST preserve recorded-only partial totals"] };
}
function testingReport(filters: ResolvedFlockPerformanceFilters, zone: string, instant: string): FeedPerformanceReport {
  return {
    kind: "feed-performance", generatedAt: instant, timezone: zone, filters,
    rows: [{
      flockId: 101, flockNumber: "TEST-A", houseId: 11, houseName: "TEST Alpha house",
      placementDate: "2026-11-01", currentStatus: "active", initialBirds: 1000,
      periodFeed: testingTotals(12.34), cumulativeFeed: testingTotals(123.456789),
      latestWeightKg: 0.1, latestWeightDate: "2026-11-03",
      fcr: {
        value: null, eligible: false, status: "TEST reconciliation required",
        basis: "TEST harvest-adjusted recorded-feed sentinel", endpoint: filters.endDate,
        closureDate: null, cumulativeFeedKg: 123.456789, cumulativeDeaths: 2,
        loadedBirds: 100, loadedKg: 200, remainingBirds: 898, weightKg: null,
        weightDate: null, estimatedRemainingKg: null, biomassKg: null,
        coverage: { expectedDays: 3, recordedDays: 2, validFeedDays: 2, validMortalityDays: 2,
          feedRecords: 2, zeroFeedRecords: 1, missingFeedDays: 1, complete: false,
          issues: ["TEST preserve incomplete coverage"] },
        reasons: ["TEST preserve N/A endpoint reason"],
      },
      dailyRecords: [{ id: 2001, date: "2026-11-01", dayNumber: 0, stage: "starter",
        feedKg: 12.34, mortality: 0, weightKg: 0.04, eligible: true,
        inPeriod: false, inCumulative: true, inFcr: false,
        issues: ["TEST original detail"], sourceVersions: [source.dailyRecords[0]] }],
      harvestRecords: [], catchExceptions: [], issues: ["TEST provisional limitation"],
    }],
    summary: { flockCount: 1, qualifyingFlocks: 0, periodFeed: testingTotals(12.34),
      cumulativeFeed: testingTotals(123.456789), fcr: null, fcrFeedKg: null,
      biomassKg: null, issues: ["TEST full cohort remains incomplete"] },
    notes: ["TEST mocked calculation boundary; not business data or computed FCR"],
  };
}

function caller(role: unknown = "admin") {
  return productionReportsRouter.createCaller({
    user: role === null ? null : { id: 900006, name: "Synthetic Feed test user", role },
    req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}
function expectNoOtherBoundaries() {
  for (const name of otherBoundaryNames) expect(boundaries[name]).not.toHaveBeenCalled();
  expect(boundaries.getDb).not.toHaveBeenCalled();
}
function expectNoBoundaries() {
  expectNoOtherBoundaries();
  expect(boundaries.readFeedReportSource).not.toHaveBeenCalled();
  expect(boundaries.buildFeedPerformanceReport).not.toHaveBeenCalled();
}
function expectFeedReadOnly() {
  expectNoOtherBoundaries();
  expect(boundaries.readFeedReportSource.mock.calls).toEqual([[]]);
  expect(boundaries.buildFeedPerformanceReport).not.toHaveBeenCalled();
}
async function expectDeniedAcrossAllQueries(reportCaller: ReturnType<typeof caller>, code: string) {
  await expect(reportCaller.options()).rejects.toMatchObject({ code });
  await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({ code });
  await expect(reportCaller.mortality({})).rejects.toMatchObject({ code });
  await expect(reportCaller.harvestResults({})).rejects.toMatchObject({ code });
  await expect(reportCaller.feedPerformance({})).rejects.toMatchObject({ code });
  expectNoBoundaries();
}

let source: FeedReportSource;
beforeEach(() => {
  expect(databaseCallsDuringImport).toBe(0);
  vi.useFakeTimers();
  // SAST has rolled over to Nov 8, but the generated instant is Nov 7 UTC.
  vi.setSystemTime(new Date(generatedAt));
  for (const mock of Object.values(boundaries)) mock.mockReset();
  boundaries.getDb.mockImplementation(() => { throw new Error("Feed API tests must never initialize a database."); });
  for (const name of otherBoundaryNames) boundaries[name].mockImplementation(() => {
    throw new Error(`Feed endpoint must never call ${name}.`);
  });
  source = freeze(testingSource());
  boundaries.readFeedReportSource.mockResolvedValue({ source, timezone });
  boundaries.buildFeedPerformanceReport.mockImplementation((_source: FeedReportSource,
    filters: ResolvedFlockPerformanceFilters, zone: string, instant: string) => testingReport(filters, zone, instant));
});
afterEach(() => {
  expect(boundaries.getDb).not.toHaveBeenCalled();
  vi.useRealTimers();
});

describe("Feed Performance server allowlist and query-only surface", () => {
  it("does not initialize a database during router import", () => {
    expect(databaseCallsDuringImport).toBe(0);
    expectNoBoundaries();
  });

  it.each(["admin", "farm_manager", "accountant"])("allows %s through only the Feed reader and engine", async role => {
    const report = await caller(role).feedPerformance({ endDate: "2026-11-03" });
    expect(report).toMatchObject({ kind: "feed-performance", timezone });
    expect(boundaries.readFeedReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildFeedPerformanceReport.mock.calls).toEqual([[source, {
      startDate: null, endDate: "2026-11-03", houseId: null, flockId: null,
    }, timezone, generatedAt]]);
    expectNoOtherBoundaries();
  });

  it.each(["sales_staff", "production_worker", "chicken_house_operator", "user",
    "unknown_test_role", "", "Admin", "admin ", "constructor", "__proto__", undefined, 1, {}])(
    "denies role %j across all five queries before every source and engine", async role => {
      // An explicitly absent role must not take the caller helper's default.
      const reportCaller = productionReportsRouter.createCaller({ user: { id: 900007, role },
        req: { headers: {} }, res: {} } as unknown as TrpcContext);
      await expectDeniedAcrossAllQueries(reportCaller, "FORBIDDEN");
    }
  );

  it("denies a missing authenticated role before every source", async () => {
    const reportCaller = productionReportsRouter.createCaller({ user: { id: 900008 },
      req: { headers: {} }, res: {} } as unknown as TrpcContext);
    await expectDeniedAcrossAllQueries(reportCaller, "FORBIDDEN");
  });

  it("denies unauthenticated callers across all five queries", async () => {
    await expectDeniedAcrossAllQueries(caller(null), "UNAUTHORIZED");
  });

  it("enforces the allowlist even when the client supplies an invalid private-data request", async () => {
    await expect(caller("production_worker").feedPerformance({ includePrivateData: true } as unknown as FlockPerformanceFilters))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoBoundaries();
  });

  it("exposes exactly the five accepted query endpoints and no mutation", () => {
    const procedures = productionReportsRouter._def.procedures;
    expect(Object.keys(procedures).sort()).toEqual(["feedPerformance", "flockPerformance", "harvestResults", "mortality", "options"]);
    for (const procedure of Object.values(procedures)) expect(procedure._def.type).toBe("query");
    expectNoBoundaries();
  });

  it("keeps shared options metadata-only without any report engine or Feed source", async () => {
    boundaries.readProductionReportSource.mockResolvedValue({ source, timezone });
    const options = await caller().options();
    const metadata = source.flocks.map(({ id, flockNumber, houseId, placementDate, status }) =>
      ({ id, flockNumber, houseId, placementDate, status }));
    expect(options).toEqual({ timezone, today: "2026-11-08",
      houses: [source.houses[1], source.houses[0]], flocks: [metadata[1], metadata[0]] });
    expect(boundaries.readProductionReportSource.mock.calls).toEqual([[false]]);
    for (const name of otherBoundaryNames.filter(name => name !== "readProductionReportSource")) {
      expect(boundaries[name]).not.toHaveBeenCalled();
    }
    expect(boundaries.readFeedReportSource).not.toHaveBeenCalled();
    expect(boundaries.buildFeedPerformanceReport).not.toHaveBeenCalled();
    for (const flock of options.flocks) expect(flock).not.toHaveProperty("initialCount");
    expect(options).not.toHaveProperty("dailyRecords");
    expect(source.flocks.map(flock => flock.id)).toEqual([202, 101]);
  });
});

describe("Feed Performance strict filters and no broadening", () => {
  it.each([
    { label: "missing input object", input: undefined },
    { label: "null input object", input: null },
    { label: "array input", input: [] },
    { label: "non-padded date", input: { startDate: "2026-1-01" } },
    { label: "timestamp", input: { endDate: "2026-11-03T00:00:00Z" } },
    { label: "non-leap February 29", input: { startDate: "2025-02-29" } },
    { label: "February 30", input: { endDate: "2024-02-30" } },
    { label: "April 31", input: { endDate: "2026-04-31" } },
    { label: "month zero", input: { endDate: "2026-00-01" } },
    { label: "month thirteen", input: { endDate: "2026-13-01" } },
    { label: "day zero", input: { startDate: "2026-11-00" } },
    { label: "blank date", input: { startDate: "" } },
    { label: "padded whitespace", input: { endDate: " 2026-11-03 " } },
    { label: "null date", input: { endDate: null } },
    { label: "numeric date", input: { startDate: 20261101 } },
    { label: "Date object", input: { endDate: new Date("2026-11-03T00:00:00Z") } },
    { label: "zero house ID", input: { houseId: 0 } },
    { label: "negative house ID", input: { houseId: -11 } },
    { label: "zero flock ID", input: { flockId: 0 } },
    { label: "negative flock ID", input: { flockId: -1 } },
    { label: "fractional house ID", input: { houseId: 11.5 } },
    { label: "fractional flock ID", input: { flockId: 101.5 } },
    { label: "string house ID", input: { houseId: "11" } },
    { label: "string flock ID", input: { flockId: "101" } },
    { label: "null house ID", input: { houseId: null } },
    { label: "null flock ID", input: { flockId: null } },
    { label: "infinite house ID", input: { houseId: Infinity } },
    { label: "NaN flock ID", input: { flockId: NaN } },
    { label: "unexpected private filter", input: { includePrivateData: true } },
    { label: "client role override", input: { role: "admin" } },
    { label: "client source override", input: { source: {} } },
    { label: "client daily-record override", input: { dailyRecords: [] } },
    { label: "client harvest override", input: { harvests: [] } },
    { label: "client catch override", input: { catches: [] } },
    { label: "client timezone override", input: { timezone: "UTC" } },
    { label: "client endpoint policy override", input: { sampleAgeDays: 99 } },
    { label: "unknown field with undefined value", input: { unknown: undefined } },
  ])("rejects $label before loading any source", async ({ input }) => {
    await expect(caller().feedPerformance(input as unknown as FlockPerformanceFilters)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoBoundaries();
  });

  it("rejects an explicitly reversed range before reading", async () => {
    await expect(caller().feedPerformance({ startDate: "2026-11-04", endDate: "2026-11-03" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoBoundaries();
  });

  it("accepts a genuine leap day and equal inclusive boundaries", async () => {
    const filters = { startDate: "2024-02-29", endDate: "2024-02-29", houseId: null, flockId: null };
    const report = await caller().feedPerformance({ startDate: filters.startDate, endDate: filters.endDate });
    expect(report.filters).toEqual(filters);
    expect(boundaries.buildFeedPerformanceReport.mock.calls).toEqual([[source, filters, timezone, generatedAt]]);
    expectNoOtherBoundaries();
  });

  it("defaults to company-local today at SAST rollover and retains a separate UTC generated instant", async () => {
    const report = await caller().feedPerformance({});
    const filters = { startDate: null, endDate: "2026-11-08", houseId: null, flockId: null };
    expect(report).toMatchObject({ kind: "feed-performance", generatedAt, timezone, filters });
    expect(boundaries.buildFeedPerformanceReport.mock.calls).toEqual([[source, filters, timezone, generatedAt]]);
    expectNoOtherBoundaries();
  });

  it("uses UTC today only when the reader supplies its missing-settings fallback", async () => {
    boundaries.readFeedReportSource.mockResolvedValue({ source, timezone: "UTC" });
    const report = await caller().feedPerformance({});
    const filters = { startDate: null, endDate: "2026-11-07", houseId: null, flockId: null };
    expect(report).toMatchObject({ timezone: "UTC", generatedAt, filters });
    expect(boundaries.buildFeedPerformanceReport.mock.calls).toEqual([[source, filters, "UTC", generatedAt]]);
    expectNoOtherBoundaries();
  });

  it("rejects start after default local today after one snapshot and before calculation", async () => {
    await expect(caller().feedPerformance({ startDate: "2026-11-09" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectFeedReadOnly();
  });

  it.each([
    { label: "unknown house", input: { houseId: 999999 } },
    { label: "unknown flock", input: { flockId: 999999 } },
    { label: "house/flock mismatch", input: { houseId: 11, flockId: 202 } },
  ])("rejects $label without engine invocation or unfiltered retry", async ({ input }) => {
    await expect(caller().feedPerformance(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectFeedReadOnly();
  });

  it.each([
    { label: "house only", input: { houseId: 11 }, houseId: 11, flockId: null },
    { label: "flock only", input: { flockId: 101 }, houseId: null, flockId: 101 },
    { label: "matching house and flock", input: { houseId: 11, flockId: 101 }, houseId: 11, flockId: 101 },
  ])("preserves $label and the complete original cumulative/provenance source", async ({ input, houseId, flockId }) => {
    const filters = { startDate: "2026-11-02", endDate: "2026-11-03", houseId, flockId };
    const report = await caller().feedPerformance({ ...input, startDate: filters.startDate, endDate: filters.endDate });
    expect(report.filters).toEqual(filters);
    expect(boundaries.readFeedReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildFeedPerformanceReport.mock.calls).toEqual([[source, filters, timezone, generatedAt]]);
    const passedSource = boundaries.buildFeedPerformanceReport.mock.calls[0][0];
    expect(passedSource).toBe(source);
    for (const key of ["houses", "flocks", "dailyRecords", "harvests", "catches"] as const) {
      expect(passedSource[key]).toBe(source[key]);
    }
    expect(passedSource.dailyRecords[0].recordDate).toBe("2026-11-01");
    expect(passedSource.catches.map((record: { flockId: number }) => record.flockId)).toEqual([101, 202]);
    expect(source).toEqual(testingSource());
    expectNoOtherBoundaries();
  });
});

describe("Feed Performance boundary errors and unchanged output", () => {
  it.each([
    { label: "unavailable database", error: new Error("Feed Performance database is unavailable.") },
    { label: "failed snapshot transaction", error: new Error("TEST Feed snapshot failed") },
    { label: "invalid stored timezone", error: new RangeError("TEST invalid Feed timezone") },
  ])("propagates $label without an empty-success report, retry or fallback reader", async ({ error }) => {
    boundaries.readFeedReportSource.mockRejectedValue(error);
    await expect(caller().feedPerformance({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: error.message, cause: error });
    expectFeedReadOnly();
  });

  it("fails invalid reader timezone during default-date resolution rather than silently using UTC", async () => {
    boundaries.readFeedReportSource.mockResolvedValue({ source, timezone: "TEST/Definitely_Not_A_Zone" });
    await expect(caller().feedPerformance({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expectFeedReadOnly();
  });

  it("propagates an engine error without switching reports or retrying", async () => {
    const error = new Error("TEST Feed calculation failed closed");
    boundaries.buildFeedPerformanceReport.mockImplementation(() => { throw error; });
    await expect(caller().feedPerformance({ endDate: "2026-11-03" }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: error.message, cause: error });
    expect(boundaries.readFeedReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildFeedPerformanceReport).toHaveBeenCalledOnce();
    expectNoOtherBoundaries();
  });

  it("returns the typed engine sentinel by identity, preserving nested totals, N/A reasons and source details", async () => {
    const sentinel = freeze(testingReport({ startDate: null, endDate: "2026-11-03", houseId: null, flockId: null }, timezone, generatedAt));
    boundaries.buildFeedPerformanceReport.mockReturnValue(sentinel);
    const result = await caller().feedPerformance({ endDate: "2026-11-03" });
    expect(result).toBe(sentinel);
    expect(result.rows).toBe(sentinel.rows);
    expect(result.summary).toBe(sentinel.summary);
    expect(result.rows[0].cumulativeFeed.kg).toBe(123.456789);
    expect(result.rows[0].fcr.value).toBeNull();
    expect(result.rows[0].fcr.reasons).toEqual(["TEST preserve N/A endpoint reason"]);
    expect(result.rows[0].dailyRecords[0].sourceVersions[0]).toBe(source.dailyRecords[0]);
    expect(boundaries.readFeedReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildFeedPerformanceReport).toHaveBeenCalledOnce();
    expectNoOtherBoundaries();
  });
});
