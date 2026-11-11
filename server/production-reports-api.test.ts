import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { FlockPerformanceSource } from "../shared/production-reports";

const reader = vi.hoisted(() => ({ readProductionReportSource: vi.fn() }));
vi.mock("./production-reports-db", () => reader);
vi.mock("./mortality-report-db", () => ({ readMortalityReportSource: vi.fn(() => { throw new Error("Unexpected mortality read in Flock Performance tests."); }) }));
vi.mock("./harvest-report-db", () => ({ readHarvestReportSource: vi.fn(() => { throw new Error("Unexpected harvest read in Flock Performance tests."); }) }));
vi.mock("./feed-report-db", () => ({ readFeedReportSource: vi.fn(() => { throw new Error("Unexpected feed read in Flock Performance tests."); }) }));

// Deliberately use the real engine: these are router integration/security tests,
// not a second implementation of the engine's calculations.
import { productionReportsRouter } from "./production-reports-router";

function testingSource(): FlockPerformanceSource {
  return {
    houses: [
      { id: 22, name: "TEST Beta house", houseNumber: "TEST-B" },
      { id: 11, name: "TEST Alpha house", houseNumber: "TEST-A" },
    ],
    flocks: [
      { id: 202, flockNumber: "TEST-Z", houseId: 22, placementDate: "2026-11-01", initialCount: 40, status: "active" },
      { id: 101, flockNumber: "TEST-A", houseId: 11, placementDate: "2026-11-01", initialCount: 100, status: "active" },
    ],
    dailyRecords: [
      { id: 1001, flockId: 101, recordDate: "2026-11-01", dayNumber: 0, mortality: 1, averageWeight: "0.040" },
      { id: 1002, flockId: 101, recordDate: "2026-11-02", dayNumber: 1, mortality: 2, averageWeight: "0.060" },
      { id: 1003, flockId: 101, recordDate: "2026-11-03", dayNumber: 2, mortality: 3, averageWeight: "0.080" },
      { id: 1004, flockId: 101, recordDate: "2026-11-04", dayNumber: 3, mortality: 4, averageWeight: "0.100" },
      { id: 2001, flockId: 202, recordDate: "2026-11-02", dayNumber: 1, mortality: 0, averageWeight: "0.050" },
    ],
    harvests: [],
    catches: [],
  };
}

function caller(role: string | null | undefined = "admin") {
  return productionReportsRouter.createCaller({
    user: role === null ? null : { id: 900001, name: "Synthetic report test user", role },
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
}

beforeEach(() => {
  vi.useFakeTimers();
  // Johannesburg is already Nov 8, while UTC is still on the previous day.
  vi.setSystemTime(new Date("2026-11-07T22:30:00.000Z"));
  reader.readProductionReportSource.mockReset();
  reader.readProductionReportSource.mockImplementation(async () => ({
    source: testingSource(), timezone: "Africa/Johannesburg",
  }));
});

afterEach(() => vi.useRealTimers());

describe("productionReports direct-caller access", () => {
  it.each(["admin", "farm_manager", "accountant"])("allows %s to read options and the real report", async role => {
    const reportCaller = caller(role);
    await expect(reportCaller.options()).resolves.toMatchObject({ timezone: "Africa/Johannesburg" });
    await expect(reportCaller.flockPerformance({ endDate: "2026-11-03" })).resolves.toMatchObject({
      kind: "flock-performance", timezone: "Africa/Johannesburg",
    });
    expect(reader.readProductionReportSource.mock.calls).toEqual([[false], []]);
  });

  it.each(["sales_staff", "production_worker", "chicken_house_operator", "unknown_test_role", ""])(
    "denies role %j before either procedure reads source data", async role => {
      const reportCaller = caller(role);
      await expect(reportCaller.options()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(reader.readProductionReportSource).not.toHaveBeenCalled();
    },
  );

  it("denies an unauthenticated caller before either procedure reads source data", async () => {
    const reportCaller = caller(null);
    await expect(reportCaller.options()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(reader.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("exposes only the five implemented query procedures and no mutations or subscriptions", () => {
    const procedures = productionReportsRouter._def.procedures;
    expect(Object.keys(procedures).sort()).toEqual(["feedPerformance", "flockPerformance", "harvestResults", "mortality", "options"]);
    for (const procedure of Object.values(procedures)) {
      expect(procedure._def.type).toBe("query");
    }
  });
});

describe("productionReports options", () => {
  it("requests metadata only and returns sorted, minimal filter metadata", async () => {
    // The mock intentionally supplies full records even when metadata is requested,
    // so response redaction is checked independently of the reader's optimization.
    const options = await caller().options();
    expect(reader.readProductionReportSource.mock.calls).toEqual([[false]]);
    expect(options).toEqual({
      timezone: "Africa/Johannesburg", today: "2026-11-08",
      houses: [
        { id: 11, name: "TEST Alpha house", houseNumber: "TEST-A" },
        { id: 22, name: "TEST Beta house", houseNumber: "TEST-B" },
      ],
      flocks: [
        { id: 101, flockNumber: "TEST-A", houseId: 11, placementDate: "2026-11-01", status: "active" },
        { id: 202, flockNumber: "TEST-Z", houseId: 22, placementDate: "2026-11-01", status: "active" },
      ],
    });
    for (const key of ["source", "dailyRecords", "harvests", "catches", "initialCount", "summary", "rows"]) {
      expect(options).not.toHaveProperty(key);
    }
    for (const flock of options.flocks) expect(flock).not.toHaveProperty("initialCount");
  });
});

describe("productionReports filter validation", () => {
  it.each([
    { label: "non-padded date", input: { startDate: "2026-1-01" } },
    { label: "date-time instead of operational date", input: { endDate: "2026-11-03T00:00:00Z" } },
    { label: "invalid non-leap February 29", input: { startDate: "2025-02-29" } },
    { label: "impossible leap-year February 30", input: { startDate: "2024-02-30" } },
    { label: "impossible April 31", input: { endDate: "2026-04-31" } },
    { label: "zero house ID", input: { houseId: 0 } },
    { label: "negative flock ID", input: { flockId: -1 } },
    { label: "fractional house ID", input: { houseId: 11.5 } },
    { label: "string flock ID", input: { flockId: "101" } },
    { label: "unexpected input key", input: { includePrivateData: true } },
  ])("rejects $label before loading source data", async ({ input }) => {
    await expect(caller().flockPerformance(input as unknown as Parameters<ReturnType<typeof caller>["flockPerformance"]>[0]))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(reader.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("rejects an explicitly reversed date period before loading source data", async () => {
    await expect(caller().flockPerformance({ startDate: "2026-11-04", endDate: "2026-11-03" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(reader.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("accepts a real leap day", async () => {
    const report = await caller().flockPerformance({ startDate: "2024-02-29", endDate: "2024-02-29" });
    expect(report.kind).toBe("flock-performance");
    expect(report.filters).toEqual({ startDate: "2024-02-29", endDate: "2024-02-29", houseId: null, flockId: null });
  });

  it("defaults the end to company-local today, not the previous UTC calendar date", async () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-11-07");
    const report = await caller().flockPerformance({});
    expect(report.filters).toEqual({ startDate: null, endDate: "2026-11-08", houseId: null, flockId: null });
    expect(report.generatedAt).toBe("2026-11-07T22:30:00.000Z");
    expect(report.timezone).toBe("Africa/Johannesburg");
    expect(reader.readProductionReportSource.mock.calls).toEqual([[]]);
  });

  it("rejects a start after the default company-local end date", async () => {
    await expect(caller().flockPerformance({ startDate: "2026-11-09" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(reader.readProductionReportSource).toHaveBeenCalledOnce();
  });

  it.each([
    { label: "unknown house", input: { houseId: 999999 } },
    { label: "unknown flock", input: { flockId: 999999 } },
    { label: "flock belonging to another house", input: { houseId: 11, flockId: 202 } },
  ])("rejects $label after checking the current metadata", async ({ input }) => {
    await expect(caller().flockPerformance(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(reader.readProductionReportSource).toHaveBeenCalledOnce();
  });

  it("passes the requested house, flock and date period through the real engine", async () => {
    const report = await caller().flockPerformance({
      startDate: "2026-11-02", endDate: "2026-11-03", houseId: 11, flockId: 101,
    });
    expect(report.kind).toBe("flock-performance");
    expect(report.filters).toEqual({ startDate: "2026-11-02", endDate: "2026-11-03", houseId: 11, flockId: 101 });
    expect(report.rows.map(row => row.flockId)).toEqual([101]);
    expect(report.rows[0].dailyRecords.filter(record => record.inPeriod).map(record => record.date).sort())
      .toEqual(["2026-11-02", "2026-11-03"]);
    expect(reader.readProductionReportSource.mock.calls).toEqual([[]]);
  });
});
