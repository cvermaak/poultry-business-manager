import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { HarvestReport, HarvestReportSource } from "../shared/harvest-report";
import type { FlockPerformanceFilters, ResolvedFlockPerformanceFilters } from "../shared/production-reports";

const boundaries = vi.hoisted(() => ({
  readProductionReportSource: vi.fn(),
  readMortalityReportSource: vi.fn(),
  readHarvestReportSource: vi.fn(),
  buildFlockPerformanceReport: vi.fn(),
  buildMortalityReport: vi.fn(),
  buildHarvestReport: vi.fn(),
  getDb: vi.fn(() => {
    throw new Error("Harvest API tests must never initialize a database.");
  }),
}));
vi.mock("./db", () => ({ getDb: boundaries.getDb }));
vi.mock("./production-reports-db", () => ({
  readProductionReportSource: boundaries.readProductionReportSource,
}));
vi.mock("./mortality-report-db", () => ({
  readMortalityReportSource: boundaries.readMortalityReportSource,
}));
vi.mock("./harvest-report-db", () => ({
  readHarvestReportSource: boundaries.readHarvestReportSource,
}));
vi.mock("./feed-report-db", () => ({ readFeedReportSource: vi.fn(() => { throw new Error("Unexpected feed read in Harvest API tests."); }) }));
vi.mock("./production-report-engine", () => ({
  buildFlockPerformanceReport: boundaries.buildFlockPerformanceReport,
}));
vi.mock("./mortality-report-engine", () => ({
  buildMortalityReport: boundaries.buildMortalityReport,
}));
vi.mock("./harvest-report-engine", () => ({
  buildHarvestReport: boundaries.buildHarvestReport,
}));
import { productionReportsRouter } from "./production-reports-router";

// Calculation semantics belong to harvest-report-engine.test.ts. Here a typed
// sentinel proves the router passes the original source and resolved filters to
// exactly the Harvest engine, without requiring a live reader or database.
function testingSource(): HarvestReportSource {
  return {
    houses: [
      { id: 22, name: "TEST Beta house", houseNumber: "TEST-B" },
      { id: 11, name: "TEST Alpha house", houseNumber: "TEST-A" },
    ],
    flocks: [
      { id: 202, flockNumber: "TEST-Z", houseId: 22, placementDate: "2026-11-01", status: "active" },
      { id: 101, flockNumber: "TEST-A", houseId: 11, placementDate: "2026-11-01", status: "active" },
    ],
    harvests: [
      { id: 1001, flockId: 101, harvestDate: "2026-11-03", chickenCountLoaded: 100,
        totalLoadedWeightKg: "200.000", chickenCountDelivered: 98,
        totalDeliveredWeightKg: "190.000", transportMortalities: 2 },
    ],
    catches: [
      { id: 3001, flockId: 101, catchDate: "2026-11-03", harvestRecordId: 1001, status: "completed" },
      // Keep global, minimal cross-flock provenance at the calculation boundary.
      { id: 3002, flockId: 202, catchDate: "2026-11-03", harvestRecordId: 1001, status: "completed" },
    ],
  };
}

function testingReport(filters: ResolvedFlockPerformanceFilters, timezone: string, generatedAt: string): HarvestReport {
  return {
    kind: "harvest-results", generatedAt, timezone, filters, rows: [],
    summary: {
      flockCount: 0, catchExceptionCount: 0, reviewedEventCount: 0,
      eligibleEventCount: 0, excludedEventCount: 0, loadedBirds: null,
      loadedKg: null, averageLoadedKg: null, deliveredBirds: null,
      deliveredKg: null, averageDeliveredKg: null, massLossKg: null,
      massLossPct: null, transportMortality: null,
      coverage: { loadedBirdEvents: 0, loadedKgEvents: 0, loadedAveragePairs: 0,
        deliveredBirdEvents: 0, deliveredKgEvents: 0, deliveredAveragePairs: 0,
        massLossPairs: 0, transportMortalityEvents: 0 },
      issues: [],
    },
    notes: ["TEST mocked Harvest calculation boundary"],
  };
}

function caller(role: string | null = "admin") {
  return productionReportsRouter.createCaller({
    user: role === null ? null : { id: 900004, name: "Synthetic Harvest test user", role },
    req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}

function expectNoOtherBoundaries() {
  expect(boundaries.readProductionReportSource).not.toHaveBeenCalled();
  expect(boundaries.readMortalityReportSource).not.toHaveBeenCalled();
  expect(boundaries.buildFlockPerformanceReport).not.toHaveBeenCalled();
  expect(boundaries.buildMortalityReport).not.toHaveBeenCalled();
  expect(boundaries.getDb).not.toHaveBeenCalled();
}
function expectNoBoundaries() {
  expectNoOtherBoundaries();
  expect(boundaries.readHarvestReportSource).not.toHaveBeenCalled();
  expect(boundaries.buildHarvestReport).not.toHaveBeenCalled();
}
function expectHarvestReadOnly() {
  expectNoOtherBoundaries();
  expect(boundaries.readHarvestReportSource.mock.calls).toEqual([[]]);
  expect(boundaries.buildHarvestReport).not.toHaveBeenCalled();
}

let source: HarvestReportSource;
beforeEach(() => {
  vi.useFakeTimers();
  // Johannesburg is Nov 8 while the UTC generated-at instant is still Nov 7.
  vi.setSystemTime(new Date("2026-11-07T22:30:00.000Z"));
  for (const mock of Object.values(boundaries)) mock.mockReset();
  boundaries.getDb.mockImplementation(() => {
    throw new Error("Harvest API tests must never initialize a database.");
  });
  for (const name of ["readProductionReportSource", "readMortalityReportSource",
    "buildFlockPerformanceReport", "buildMortalityReport"] as const) {
    boundaries[name].mockImplementation(() => {
      throw new Error(`Harvest endpoint must never call ${name}.`);
    });
  }
  source = testingSource();
  boundaries.readHarvestReportSource.mockResolvedValue({ source, timezone: "Africa/Johannesburg" });
  boundaries.buildHarvestReport.mockImplementation((_source: HarvestReportSource,
    filters: ResolvedFlockPerformanceFilters, timezone: string, generatedAt: string) =>
    testingReport(filters, timezone, generatedAt));
});
afterEach(() => {
  expect(boundaries.getDb).not.toHaveBeenCalled();
  if (boundaries.buildHarvestReport.mock.calls.length > 0)
    expect(boundaries.buildHarvestReport).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

describe("Harvest Results access and query-only surface", () => {
  it.each(["admin", "farm_manager", "accountant"])("allows %s through only the Harvest reader and engine", async role => {
    const report = await caller(role).harvestResults({ endDate: "2026-11-03" });
    expect(report).toMatchObject({ kind: "harvest-results", timezone: "Africa/Johannesburg" });
    expect(boundaries.readHarvestReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildHarvestReport).toHaveBeenCalledWith(source, {
      startDate: null, endDate: "2026-11-03", houseId: null, flockId: null,
    }, "Africa/Johannesburg", "2026-11-07T22:30:00.000Z");
    expectNoOtherBoundaries();
  });

  it.each(["sales_staff", "production_worker", "chicken_house_operator", "user", "unknown_test_role", ""])(
    "denies role %j across all four queries before any reader or engine", async role => {
      const reportCaller = caller(role);
      await expect(reportCaller.options()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reportCaller.mortality({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reportCaller.harvestResults({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      expectNoBoundaries();
    }
  );

  it("denies a missing authenticated role before any boundary", async () => {
    const reportCaller = productionReportsRouter.createCaller({ user: { id: 900005 },
      req: { headers: {} }, res: {}, } as unknown as TrpcContext);
    await expect(reportCaller.harvestResults({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoBoundaries();
  });

  it("denies logged-out callers with UNAUTHORIZED across all four queries", async () => {
    const reportCaller = caller(null);
    await expect(reportCaller.options()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(reportCaller.mortality({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(reportCaller.harvestResults({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expectNoBoundaries();
  });

  it("exposes exactly options and the four report endpoints as queries", () => {
    const procedures = productionReportsRouter._def.procedures;
    expect(Object.keys(procedures).sort()).toEqual(["feedPerformance", "flockPerformance", "harvestResults", "mortality", "options"]);
    for (const procedure of Object.values(procedures)) expect(procedure._def.type).toBe("query");
    expectNoBoundaries();
  });

  it("keeps shared options metadata-only without invoking the Harvest reader or any engine", async () => {
    boundaries.readProductionReportSource.mockResolvedValue({
      source: { ...source, flocks: source.flocks.map(flock => ({ ...flock, initialCount: 100 })), dailyRecords: [] },
      timezone: "Africa/Johannesburg",
    });
    const options = await caller().options();
    expect(options).toEqual({
      timezone: "Africa/Johannesburg", today: "2026-11-08",
      houses: [source.houses[1], source.houses[0]], flocks: [source.flocks[1], source.flocks[0]],
    });
    expect(boundaries.readProductionReportSource.mock.calls).toEqual([[false]]);
    expect(boundaries.readHarvestReportSource).not.toHaveBeenCalled();
    expect(boundaries.readMortalityReportSource).not.toHaveBeenCalled();
    expect(boundaries.buildHarvestReport).not.toHaveBeenCalled();
    expect(boundaries.buildFlockPerformanceReport).not.toHaveBeenCalled();
    expect(boundaries.buildMortalityReport).not.toHaveBeenCalled();
    for (const flock of options.flocks) expect(flock).not.toHaveProperty("initialCount");
  });
});

describe("Harvest Results strict filters and no broadening", () => {
  it.each([
    { label: "non-padded date", input: { startDate: "2026-1-01" } },
    { label: "timestamp date", input: { endDate: "2026-11-03T00:00:00Z" } },
    { label: "invalid non-leap February 29", input: { startDate: "2025-02-29" } },
    { label: "impossible February 30", input: { startDate: "2024-02-30" } },
    { label: "impossible April 31", input: { endDate: "2026-04-31" } },
    { label: "blank date", input: { startDate: "" } },
    { label: "null date", input: { endDate: null } },
    { label: "zero house ID", input: { houseId: 0 } },
    { label: "negative flock ID", input: { flockId: -1 } },
    { label: "fractional house ID", input: { houseId: 11.5 } },
    { label: "fractional flock ID", input: { flockId: 101.5 } },
    { label: "string flock ID", input: { flockId: "101" } },
    { label: "null house ID", input: { houseId: null } },
    { label: "infinite house ID", input: { houseId: Infinity } },
    { label: "unexpected private-data filter", input: { includePrivateData: true } },
    { label: "client source override", input: { harvests: [] } },
    { label: "client timezone override", input: { timezone: "UTC" } },
    { label: "client catch-session override", input: { catches: [] } },
  ])("rejects $label before loading any source", async ({ input }) => {
    await expect(caller().harvestResults(input as unknown as FlockPerformanceFilters)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoBoundaries();
  });

  it("rejects an explicitly reversed date range before reading", async () => {
    await expect(caller().harvestResults({ startDate: "2026-11-04", endDate: "2026-11-03" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoBoundaries();
  });

  it("accepts a genuine leap day and passes the exact resolved filters", async () => {
    const filters = { startDate: "2024-02-29", endDate: "2024-02-29", houseId: null, flockId: null };
    const report = await caller().harvestResults({ startDate: filters.startDate, endDate: filters.endDate });
    expect(report.filters).toEqual(filters);
    expect(boundaries.buildHarvestReport).toHaveBeenCalledWith(source, filters, "Africa/Johannesburg", "2026-11-07T22:30:00.000Z");
    expectNoOtherBoundaries();
  });

  it("defaults endDate to company-local today while generatedAt remains the UTC instant", async () => {
    const report = await caller().harvestResults({});
    expect(report).toMatchObject({ kind: "harvest-results", generatedAt: "2026-11-07T22:30:00.000Z", timezone: "Africa/Johannesburg" });
    const filters = { startDate: null, endDate: "2026-11-08", houseId: null, flockId: null };
    expect(report.filters).toEqual(filters);
    expect(boundaries.buildHarvestReport).toHaveBeenCalledWith(source, filters, "Africa/Johannesburg", "2026-11-07T22:30:00.000Z");
    expectNoOtherBoundaries();
  });

  it("uses UTC today when the reader supplies the missing-settings fallback", async () => {
    boundaries.readHarvestReportSource.mockResolvedValue({ source, timezone: "UTC" });
    const report = await caller().harvestResults({});
    expect(report).toMatchObject({ timezone: "UTC", generatedAt: "2026-11-07T22:30:00.000Z", filters: { endDate: "2026-11-07" } });
    expect(boundaries.buildHarvestReport).toHaveBeenCalledWith(source, {
      startDate: null, endDate: "2026-11-07", houseId: null, flockId: null,
    }, "UTC", "2026-11-07T22:30:00.000Z");
    expectNoOtherBoundaries();
  });

  it("rejects a start after default local today after loading timezone but before calculation", async () => {
    await expect(caller().harvestResults({ startDate: "2026-11-09" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectHarvestReadOnly();
  });

  it.each([
    { label: "unknown house", input: { houseId: 999999 } },
    { label: "unknown flock", input: { flockId: 999999 } },
    { label: "flock-house mismatch", input: { houseId: 11, flockId: 202 } },
  ])("rejects $label without calling an engine or retrying an unfiltered reader", async ({ input }) => {
    await expect(caller().harvestResults(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectHarvestReadOnly();
  });

  it.each([
    { label: "house only", input: { houseId: 11 }, houseId: 11, flockId: null },
    { label: "flock only", input: { flockId: 101 }, houseId: null, flockId: 101 },
    { label: "matching house and flock", input: { houseId: 11, flockId: 101 }, houseId: 11, flockId: 101 },
  ])("preserves $label filters and passes the full original provenance source to Harvest", async ({ input, houseId, flockId }) => {
    const filters = { startDate: "2026-11-02", endDate: "2026-11-03", houseId, flockId };
    const report = await caller().harvestResults({ ...input, startDate: filters.startDate, endDate: filters.endDate });
    expect(report.filters).toEqual(filters);
    expect(boundaries.readHarvestReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildHarvestReport).toHaveBeenCalledWith(source, filters, "Africa/Johannesburg", "2026-11-07T22:30:00.000Z");
    expect(boundaries.buildHarvestReport.mock.calls[0][0]).toBe(source);
    expect(boundaries.buildHarvestReport.mock.calls[0][0].catches).toBe(source.catches);
    expectNoOtherBoundaries();
  });
});

describe("Harvest Results boundary failures", () => {
  it.each([
    { label: "unavailable database", error: new Error("Harvest Results database is unavailable.") },
    { label: "failed transaction", error: new Error("TEST Harvest snapshot failed") },
    { label: "invalid stored timezone", error: new RangeError("TEST invalid Harvest timezone") },
  ])("propagates $label without a plausible empty report or another reader", async ({ error }) => {
    boundaries.readHarvestReportSource.mockRejectedValue(error);
    await expect(caller().harvestResults({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: error.message, cause: error });
    expectHarvestReadOnly();
  });

  it("rejects an invalid reader timezone during default-date resolution instead of silently using UTC", async () => {
    boundaries.readHarvestReportSource.mockResolvedValue({ source, timezone: "TEST/Definitely_Not_A_Zone" });
    await expect(caller().harvestResults({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expectHarvestReadOnly();
  });

  it("propagates a thrown Harvest engine without falling back to accepted report engines", async () => {
    const error = new Error("TEST Harvest calculation failed closed");
    boundaries.buildHarvestReport.mockImplementation(() => { throw error; });
    await expect(caller().harvestResults({ endDate: "2026-11-03" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: error });
    expect(boundaries.readHarvestReportSource.mock.calls).toEqual([[]]);
    expect(boundaries.buildHarvestReport).toHaveBeenCalledOnce();
    expectNoOtherBoundaries();
  });

  it("returns the Harvest engine result unchanged rather than merging other report results", async () => {
    const sentinel = testingReport({ startDate: null, endDate: "2026-11-03", houseId: null, flockId: null }, "Africa/Johannesburg", "2026-11-07T22:30:00.000Z");
    boundaries.buildHarvestReport.mockReturnValue(sentinel);
    const result = await caller().harvestResults({ endDate: "2026-11-03" });
    expect(result).toBe(sentinel);
    expect(boundaries.buildHarvestReport).toHaveBeenCalledOnce();
    expectNoOtherBoundaries();
  });
});
