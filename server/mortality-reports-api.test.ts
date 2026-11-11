import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { MortalityReportSource } from "../shared/mortality-report";
import type { FlockPerformanceSource } from "../shared/production-reports";

const readers = vi.hoisted(() => ({
  readProductionReportSource: vi.fn(),
  readMortalityReportSource: vi.fn(),
  getDb: vi.fn(() => {
    throw new Error("API tests must never initialize a database.");
  }),
}));
vi.mock("./production-reports-db", () => ({
  readProductionReportSource: readers.readProductionReportSource,
}));
vi.mock("./mortality-report-db", () => ({
  readMortalityReportSource: readers.readMortalityReportSource,
}));
vi.mock("./harvest-report-db", () => ({ readHarvestReportSource: vi.fn(() => { throw new Error("Unexpected harvest read in Mortality tests."); }) }));
vi.mock("./feed-report-db", () => ({ readFeedReportSource: vi.fn(() => { throw new Error("Unexpected feed read in Mortality tests."); }) }));
vi.mock("./db", () => ({ getDb: readers.getDb }));

// Use the real production and mortality engines: reader mocks are the only
// calculation boundary replaced in these router integration/security tests.
import { productionReportsRouter } from "./production-reports-router";

function testingSource(): MortalityReportSource {
  return {
    houses: [
      { id: 22, name: "TEST Beta house", houseNumber: "TEST-B" },
      { id: 11, name: "TEST Alpha house", houseNumber: "TEST-A" },
    ],
    flocks: [
      {
        id: 202,
        flockNumber: "TEST-Z",
        houseId: 22,
        placementDate: "2026-11-01",
        initialCount: 40,
        status: "active",
      },
      {
        id: 101,
        flockNumber: "TEST-A",
        houseId: 11,
        placementDate: "2026-11-01",
        initialCount: 100,
        status: "active",
      },
    ],
    dailyRecords: [
      {
        id: 1001,
        flockId: 101,
        recordDate: "2026-11-01",
        dayNumber: 0,
        mortality: 1,
      },
      {
        id: 1002,
        flockId: 101,
        recordDate: "2026-11-02",
        dayNumber: 1,
        mortality: 2,
      },
      {
        id: 1003,
        flockId: 101,
        recordDate: "2026-11-03",
        dayNumber: 2,
        mortality: 3,
      },
      {
        id: 1004,
        flockId: 101,
        recordDate: "2026-11-04",
        dayNumber: 3,
        mortality: 4,
      },
      {
        id: 2001,
        flockId: 202,
        recordDate: "2026-11-02",
        dayNumber: 1,
        mortality: 0,
      },
    ],
  };
}

function productionSource(): FlockPerformanceSource {
  const source = testingSource();
  return {
    ...source,
    dailyRecords: source.dailyRecords.map(record => ({
      ...record,
      mortality: Number(record.mortality),
      averageWeight: "0.060",
    })),
    harvests: [],
    catches: [],
  };
}

function caller(role: string | null | undefined = "admin") {
  return productionReportsRouter.createCaller({
    user:
      role === null
        ? null
        : { id: 900002, name: "Synthetic mortality test user", role },
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
}
type MortalityInput = Parameters<ReturnType<typeof caller>["mortality"]>[0];

function expectNoReaders() {
  expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  expect(readers.readMortalityReportSource).not.toHaveBeenCalled();
  expect(readers.getDb).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers();
  // Johannesburg is Nov 8, but UTC has not yet reached midnight.
  vi.setSystemTime(new Date("2026-11-07T22:30:00.000Z"));
  readers.readProductionReportSource.mockReset();
  readers.readMortalityReportSource.mockReset();
  readers.getDb.mockClear();
  readers.readProductionReportSource.mockImplementation(async () => ({
    source: productionSource(),
    timezone: "Africa/Johannesburg",
  }));
  readers.readMortalityReportSource.mockImplementation(async () => ({
    source: testingSource(),
    timezone: "Africa/Johannesburg",
  }));
});
afterEach(() => {
  expect(readers.getDb).not.toHaveBeenCalled();
  vi.useRealTimers();
});

describe("mortality direct-caller access and query-only surface", () => {
  it.each(["admin", "farm_manager", "accountant"])(
    "allows %s to read all three report queries",
    async role => {
      const reportCaller = caller(role);
      await expect(reportCaller.options()).resolves.toMatchObject({
        timezone: "Africa/Johannesburg",
      });
      await expect(
        reportCaller.flockPerformance({ endDate: "2026-11-03" })
      ).resolves.toMatchObject({ kind: "flock-performance" });
      await expect(
        reportCaller.mortality({ endDate: "2026-11-03" })
      ).resolves.toMatchObject({
        kind: "mortality",
        timezone: "Africa/Johannesburg",
      });
      expect(readers.readProductionReportSource.mock.calls).toEqual([
        [false],
        [],
      ]);
      expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    }
  );

  it.each([
    "sales_staff",
    "production_worker",
    "chicken_house_operator",
    "user",
    "unknown_test_role",
    "",
  ])("denies role %j before any reader is invoked", async role => {
    const reportCaller = caller(role);
    await expect(reportCaller.options()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(reportCaller.mortality({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expectNoReaders();
  });

  it("denies an authenticated user whose role is missing", async () => {
    const reportCaller = productionReportsRouter.createCaller({
      user: { id: 900003 },
      req: { headers: {} },
      res: {},
    } as unknown as TrpcContext);
    await expect(reportCaller.mortality({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expectNoReaders();
  });

  it("denies an unauthenticated caller before any reader is invoked", async () => {
    const reportCaller = caller(null);
    await expect(reportCaller.options()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(reportCaller.flockPerformance({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(reportCaller.mortality({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expectNoReaders();
  });

  it("exposes exactly the five implemented report/options queries, never mutations or subscriptions", () => {
    const procedures = productionReportsRouter._def.procedures;
    expect(Object.keys(procedures).sort()).toEqual([
      "feedPerformance",
      "flockPerformance",
      "harvestResults",
      "mortality",
      "options",
    ]);
    for (const procedure of Object.values(procedures))
      expect(procedure._def.type).toBe("query");
    expectNoReaders();
  });

  it("keeps shared filter options metadata-only without invoking the mortality reader", async () => {
    const options = await caller().options();
    expect(options).toEqual({
      timezone: "Africa/Johannesburg",
      today: "2026-11-08",
      houses: [
        { id: 11, name: "TEST Alpha house", houseNumber: "TEST-A" },
        { id: 22, name: "TEST Beta house", houseNumber: "TEST-B" },
      ],
      flocks: [
        {
          id: 101,
          flockNumber: "TEST-A",
          houseId: 11,
          placementDate: "2026-11-01",
          status: "active",
        },
        {
          id: 202,
          flockNumber: "TEST-Z",
          houseId: 22,
          placementDate: "2026-11-01",
          status: "active",
        },
      ],
    });
    expect(readers.readProductionReportSource.mock.calls).toEqual([[false]]);
    expect(readers.readMortalityReportSource).not.toHaveBeenCalled();
    for (const key of [
      "source",
      "dailyRecords",
      "mortalityRecords",
      "harvests",
      "catches",
      "summary",
      "rows",
    ]) {
      expect(options).not.toHaveProperty(key);
    }
    for (const flock of options.flocks)
      expect(flock).not.toHaveProperty("initialCount");
  });
});

describe("mortality strict filter validation", () => {
  it.each([
    { label: "non-padded date", input: { startDate: "2026-1-01" } },
    {
      label: "timestamp instead of operational date",
      input: { endDate: "2026-11-03T00:00:00Z" },
    },
    {
      label: "invalid non-leap February 29",
      input: { startDate: "2025-02-29" },
    },
    {
      label: "impossible leap-year February 30",
      input: { startDate: "2024-02-30" },
    },
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
    { label: "unexpected input key", input: { includePrivateData: true } },
    {
      label: "unknown legacy mortality source override",
      input: { mortalityRecords: [] },
    },
  ])("rejects $label before loading any source", async ({ input }) => {
    await expect(
      caller().mortality(input as unknown as MortalityInput)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoReaders();
  });

  it("rejects an explicitly reversed date range before loading any source", async () => {
    await expect(
      caller().mortality({ startDate: "2026-11-04", endDate: "2026-11-03" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoReaders();
  });

  it("accepts a real leap day", async () => {
    const report = await caller().mortality({
      startDate: "2024-02-29",
      endDate: "2024-02-29",
    });
    expect(report.kind).toBe("mortality");
    expect(report.filters).toEqual({
      startDate: "2024-02-29",
      endDate: "2024-02-29",
      houseId: null,
      flockId: null,
    });
    expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("defaults endDate to company-local today rather than the previous UTC date", async () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-11-07");
    const report = await caller().mortality({});
    expect(report).toMatchObject({
      kind: "mortality",
      generatedAt: "2026-11-07T22:30:00.000Z",
      timezone: "Africa/Johannesburg",
    });
    expect(report.filters).toEqual({
      startDate: null,
      endDate: "2026-11-08",
      houseId: null,
      flockId: null,
    });
    expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("uses UTC today when the reader supplies the UTC fallback", async () => {
    readers.readMortalityReportSource.mockResolvedValue({
      source: testingSource(),
      timezone: "UTC",
    });
    const report = await caller().mortality({});
    expect(report.timezone).toBe("UTC");
    expect(report.filters.endDate).toBe("2026-11-07");
  });

  it("rejects a start after the default local end date only after obtaining company timezone", async () => {
    await expect(
      caller().mortality({ startDate: "2026-11-09" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it.each([
    { label: "unknown house", input: { houseId: 999999 } },
    { label: "unknown flock", input: { flockId: 999999 } },
    {
      label: "flock assigned to another house",
      input: { houseId: 11, flockId: 202 },
    },
  ])(
    "rejects $label after checking mortality source metadata",
    async ({ input }) => {
      await expect(caller().mortality(input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
      expect(readers.readProductionReportSource).not.toHaveBeenCalled();
    }
  );
});

describe("mortality real-engine integration and failure handling", () => {
  it("keeps period deaths separate from placement-to-end cumulative deaths using the requested filters", async () => {
    const report = await caller().mortality({
      startDate: "2026-11-02",
      endDate: "2026-11-03",
      houseId: 11,
      flockId: 101,
    });
    expect(report.filters).toEqual({
      startDate: "2026-11-02",
      endDate: "2026-11-03",
      houseId: 11,
      flockId: 101,
    });
    expect(report.rows.map(row => row.flockId)).toEqual([101]);
    expect(report.rows[0]).toMatchObject({
      initialBirds: 100,
      periodDeaths: 5,
      periodMortalityPct: 5,
      cumulativeDeaths: 6,
      cumulativeMortalityPct: 6,
      periodRecordedDays: 2,
      periodSummaryEligible: true,
      cumulativeSummaryEligible: true,
    });
    expect(report.summary).toMatchObject({
      flockCount: 1,
      initialBirds: 100,
      periodDeaths: 5,
      cumulativeDeaths: 6,
    });
    expect(
      report.rows[0].dailyRecords
        .filter(record => record.inPeriod)
        .map(record => record.date)
        .sort()
    ).toEqual(["2026-11-02", "2026-11-03"]);
    expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("treats an explicitly captured zero as a recorded, eligible mortality observation", async () => {
    const report = await caller().mortality({
      startDate: "2026-11-02",
      endDate: "2026-11-02",
      flockId: 202,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      initialBirds: 40,
      periodDeaths: 0,
      cumulativeDeaths: 0,
      periodMortalityPct: 0,
      cumulativeMortalityPct: 0,
      recordedDays: 1,
      periodRecordedDays: 1,
      periodSummaryEligible: true,
      cumulativeSummaryEligible: true,
    });
    expect(report.rows[0].dailyRecords).toEqual([
      expect.objectContaining({
        id: 2001,
        rawMortality: 0,
        deaths: 0,
        eligible: true,
        inPeriod: true,
      }),
    ]);
    expect(report.summary).toMatchObject({
      periodDeaths: 0,
      cumulativeDeaths: 0,
      periodMortalityPct: 0,
      cumulativeMortalityPct: 0,
    });
  });

  it("does not invent recorded zero deaths when a flock has no mortality observations", async () => {
    const source = testingSource();
    source.dailyRecords = [];
    readers.readMortalityReportSource.mockResolvedValue({
      source,
      timezone: "Africa/Johannesburg",
    });
    const report = await caller().mortality({
      startDate: "2026-11-02",
      endDate: "2026-11-02",
      flockId: 202,
    });
    expect(report.rows[0]).toMatchObject({
      periodDeaths: null,
      cumulativeDeaths: null,
      recordedDays: 0,
      periodRecordedDays: 0,
    });
    expect(report.rows[0].dailyRecords).toEqual([]);
    expect(report.summary.periodDeaths).toBeNull();
    expect(report.summary.cumulativeDeaths).toBeNull();
  });

  it("does not depend on weights, feed, harvests, current counts, free text or legacy mortality records", async () => {
    const input = {
      startDate: "2026-11-02",
      endDate: "2026-11-03",
      flockId: 101,
    };
    const baseline = await caller().mortality(input);
    const source = testingSource();
    const poison = (object: object, keys: string[]) => {
      for (const key of keys)
        Object.defineProperty(object, key, {
          enumerable: true,
          get: () => {
            throw new Error(`Mortality must not read unrelated field ${key}.`);
          },
        });
    };
    poison(source, [
      "harvests",
      "catches",
      "mortalityRecords",
      "mortality_records",
      "feedRecords",
    ]);
    for (const record of source.dailyRecords)
      poison(record, [
        "averageWeight",
        "weightSamples",
        "feedConsumed",
        "notes",
        "recordedBy",
      ]);
    for (const flock of source.flocks)
      poison(flock, ["currentCount", "costPerChick", "notes"]);
    readers.readMortalityReportSource.mockResolvedValue({
      source,
      timezone: "Africa/Johannesburg",
    });
    await expect(caller().mortality(input)).resolves.toEqual(baseline);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("propagates an unavailable mortality database as an internal error without fallback to the production reader", async () => {
    readers.readMortalityReportSource.mockRejectedValue(
      new Error("Mortality report database is unavailable.")
    );
    await expect(caller().mortality({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Mortality report database is unavailable.",
    });
    expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("propagates a transaction failure rather than returning a plausible empty report", async () => {
    readers.readMortalityReportSource.mockRejectedValue(
      new Error("TEST snapshot failed")
    );
    await expect(
      caller().mortality({ endDate: "2026-11-03" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "TEST snapshot failed",
    });
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("propagates invalid stored timezone failure from the reader", async () => {
    readers.readMortalityReportSource.mockRejectedValue(
      new RangeError("TEST invalid stored timezone")
    );
    await expect(caller().mortality({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });

  it("does not silently use UTC when an invalid timezone is supplied to default-date resolution", async () => {
    readers.readMortalityReportSource.mockResolvedValue({
      source: testingSource(),
      timezone: "TEST/Definitely_Not_A_Zone",
    });
    await expect(caller().mortality({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(readers.readMortalityReportSource.mock.calls).toEqual([[]]);
    expect(readers.readProductionReportSource).not.toHaveBeenCalled();
  });
});
