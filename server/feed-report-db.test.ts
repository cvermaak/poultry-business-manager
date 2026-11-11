import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { catchSessions, companySettings, flockDailyRecords, flocks, harvestRecords, houses } from "../drizzle/schema";

const fake = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[][],
    projections: [] as Record<string, unknown>[],
    tables: [] as unknown[],
    failAt: null as number | null,
    outcome: "not-started" as "not-started" | "active" | "committed" | "rolled-back",
  };
  const result = async (ordinal: number) => {
    if (ordinal === state.failAt) throw new Error("TEST Feed SELECT failed");
    return state.rows[ordinal] ?? [];
  };
  const limit = vi.fn();
  const where = vi.fn((_condition: unknown) => Object.freeze({ limit }));
  const select = vi.fn((projection: Record<string, unknown>) => {
    if (!projection || Object.keys(projection).length === 0) {
      throw new Error("TEST Feed reader must never request all-column SELECTs.");
    }
    const ordinal = state.projections.push(projection) - 1;
    return Object.freeze({
      from: (table: unknown) => {
        state.tables.push(table);
        if (ordinal === 0) {
          limit.mockImplementation(() => result(ordinal));
          return Object.freeze({ where });
        }
        return result(ordinal);
      },
    });
  });
  // This fake exposes SELECT-only capabilities, not a real DB connection.
  // "Committed" / "rolled-back" below describes only the fake wrapper outcome;
  // it does not claim live TiDB READ ONLY enforcement or executed SQL validation.
  const tx = Object.freeze({ select });
  const transaction = vi.fn(async (callback: (transaction: typeof tx) => unknown, _config: unknown) => {
    state.outcome = "active";
    try {
      const value = await callback(tx);
      state.outcome = "committed";
      return value;
    } catch (error) {
      state.outcome = "rolled-back";
      throw error;
    }
  });
  const db = Object.freeze({ transaction });
  return { state, limit, where, select, tx, transaction, db,
    getDb: vi.fn((): unknown => {
      throw new Error("Feed reader tests must never initialize a real database or call getDb during import.");
    }) };
});

// The real DB module is never loaded. The shared production module contributes
// only its accepted SQL-expression builder; its reader is never invoked.
vi.mock("./db", () => ({ getDb: fake.getDb }));
import { productionCalendarDate } from "./production-reports-db";
import { readFeedReportSource } from "./feed-report-db";

const databaseCallsDuringImport = fake.getDb.mock.calls.length;
const dialect = new MySqlDialect();
const tables = [companySettings, houses, flocks, flockDailyRecords, harvestRecords, catchSessions];
const dateSelectors = [
  [2, "placementDate", flocks.placementDate],
  [3, "recordDate", flockDailyRecords.recordDate],
  [4, "harvestDate", harvestRecords.harvestDate],
  [5, "catchDate", catchSessions.catchDate],
] as const;

function testingRows(): unknown[][] {
  return [
    [{ timezone: "Africa/Johannesburg" }],
    [{ id: 11, name: "TEST Feed reader house", houseNumber: "TEST-11" }],
    [{ id: 101, flockNumber: "TEST-Feed-flock", houseId: 11,
      placementDate: "2026-11-01", initialCount: 1000, status: "active" }],
    [
      { id: 2001, flockId: 101, recordDate: "2026-11-01", dayNumber: 0,
        feedConsumed: "12.34", feedType: "starter", mortality: 0, averageWeight: "0.040" },
      { id: 2002, flockId: 101, recordDate: "2026-11-03", dayNumber: 2,
        feedConsumed: "0.00", feedType: null, mortality: 2, averageWeight: "0.100" },
    ],
    [{ id: 1001, flockId: 101, harvestDate: "2026-11-03", chickenCountLoaded: 100,
      totalLoadedWeightKg: "200.000", chickenCountDelivered: 98,
      totalDeliveredWeightKg: "190.000", transportMortalities: 2 }],
    [
      { id: 3001, flockId: 101, catchDate: "2026-11-03", harvestRecordId: 1001, status: "completed" },
      { id: 3002, flockId: 999, catchDate: "2026-11-03", harvestRecordId: 1001, status: "completed" },
    ],
  ];
}
beforeEach(() => {
  expect(databaseCallsDuringImport).toBe(0);
  vi.clearAllMocks();
  fake.state.rows = testingRows();
  fake.state.projections = [];
  fake.state.tables = [];
  fake.state.failAt = null;
  fake.state.outcome = "not-started";
  fake.getDb.mockReset();
  fake.getDb.mockResolvedValue(fake.db);
});

describe("Feed Performance dedicated SELECT-only snapshot reader", () => {
  it("never calls getDb or starts a transaction during import", () => {
    expect(databaseCallsDuringImport).toBe(0);
    expect(fake.getDb).not.toHaveBeenCalled();
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("assembles exactly six SELECTs including initial birds, feed observations, actual harvests and minimal catches", async () => {
    const result = await readFeedReportSource();
    expect(fake.getDb).toHaveBeenCalledOnce();
    expect(fake.getDb.mock.calls).toEqual([[]]);
    expect(fake.select).toHaveBeenCalledTimes(6);
    expect(fake.state.tables).toEqual(tables);
    expect(fake.state.tables.map(table => getTableName(table as typeof houses))).toEqual([
      "company_settings", "houses", "flocks", "flock_daily_records", "harvest_records", "catch_sessions",
    ]);
    expect(result).toEqual({ timezone: "Africa/Johannesburg", source: {
      houses: fake.state.rows[1], flocks: fake.state.rows[2], dailyRecords: fake.state.rows[3],
      harvests: fake.state.rows[4], catches: fake.state.rows[5],
    } });
    expect(Object.keys(result.source).sort()).toEqual(["catches", "dailyRecords", "flocks", "harvests", "houses"]);
    for (const [key, ordinal] of [["houses", 1], ["flocks", 2], ["dailyRecords", 3], ["harvests", 4], ["catches", 5]] as const) {
      expect(result.source[key]).toBe(fake.state.rows[ordinal]);
    }
    expect(result.source.flocks[0].initialCount).toBe(1000);
    expect(result.source.dailyRecords[0].feedConsumed).toBe("12.34");
    expect(result.source.harvests[0].totalLoadedWeightKg).toBe("200.000");
    expect(fake.state.outcome).toBe("committed");
  });

  it("uses one portable repeatable-read transaction without unsupported TiDB read-only flags or session commands", async () => {
    await readFeedReportSource();
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "repeatable read" });
    expect(Object.keys(fake.transaction.mock.calls[0][1] as object)).toEqual(["isolationLevel"]);
    expect(Object.isFrozen(fake.db)).toBe(true);
    expect(Object.isFrozen(fake.tx)).toBe(true);
    expect(Object.keys(fake.db)).toEqual(["transaction"]);
    expect(Object.keys(fake.tx)).toEqual(["select"]);
    for (const key of ["select", "execute", "insert", "update", "delete", "rollback", "getCatchSession", "getCatchSessions"]) {
      expect(fake.db).not.toHaveProperty(key);
      if (key !== "select") expect(fake.tx).not.toHaveProperty(key);
    }
    expect(fake.select).toHaveBeenCalledTimes(6);
  });

  it("projects exactly the approved source allowlists, never finance, personal data, capture-user IDs or all columns", async () => {
    await readFeedReportSource();
    const expected = [
      { timezone: companySettings.timezone },
      { id: houses.id, name: houses.name, houseNumber: houses.houseNumber },
      { id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId,
        placementDate: null, initialCount: flocks.initialCount, status: flocks.status },
      { id: flockDailyRecords.id, flockId: flockDailyRecords.flockId, recordDate: null,
        dayNumber: flockDailyRecords.dayNumber, feedConsumed: flockDailyRecords.feedConsumed,
        feedType: flockDailyRecords.feedType, mortality: flockDailyRecords.mortality,
        averageWeight: flockDailyRecords.averageWeight },
      { id: harvestRecords.id, flockId: harvestRecords.flockId, harvestDate: null,
        chickenCountLoaded: harvestRecords.chickenCountLoaded, totalLoadedWeightKg: harvestRecords.totalLoadedWeightKg,
        chickenCountDelivered: harvestRecords.chickenCountDelivered, totalDeliveredWeightKg: harvestRecords.totalDeliveredWeightKg,
        transportMortalities: harvestRecords.transportMortalities },
      { id: catchSessions.id, flockId: catchSessions.flockId, catchDate: null,
        harvestRecordId: catchSessions.harvestRecordId, status: catchSessions.status },
    ];
    const dateColumns: Record<string, SQLWrapper> = {
      placementDate: flocks.placementDate, recordDate: flockDailyRecords.recordDate,
      harvestDate: harvestRecords.harvestDate, catchDate: catchSessions.catchDate,
    };
    expected.forEach((projection, ordinal) => {
      const actual = fake.state.projections[ordinal];
      expect(Object.keys(actual).sort()).toEqual(Object.keys(projection).sort());
      const compiledExpectedFields: SQLWrapper[] = [];
      for (const [key, column] of Object.entries(projection)) {
        if (column !== null) {
          expect(actual[key]).toBe(column);
          compiledExpectedFields.push(column);
        } else {
          const expectedDate = productionCalendarDate(dateColumns[key]);
          expect(dialect.sqlToQuery(actual[key] as SQL)).toEqual(dialect.sqlToQuery(expectedDate));
          compiledExpectedFields.push(expectedDate);
        }
      }
      // Compile expression lists using the real dialect, without driver/session
      // creation or execution. Exact SQL equality guards all SQL field refs.
      const actualFields = Object.values(actual).map(value => sql`${value as SQLWrapper}`);
      const expectedFields = compiledExpectedFields.map(value => sql`${value}`);
      const table = fake.state.tables[ordinal] as SQLWrapper;
      const query = dialect.sqlToQuery(sql`SELECT ${sql.join(actualFields, sql`, `)} FROM ${table}`);
      expect(query).toEqual(dialect.sqlToQuery(sql`SELECT ${sql.join(expectedFields, sql`, `)} FROM ${table}`));
      expect(query.sql).toMatch(/^SELECT /);
      expect(query.sql).not.toContain("*");
      expect(query.params).toEqual([]);
      expect(query.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|SET|CALL)\b/i);
      expect(query.sql).not.toMatch(/weightSamples|currentCount|catchPlan|target|allocation|forecast|starterFeedType|growerFeedType|finisherFeedType|waterConsumed|temperature|humidity|password|email|username|openId|notes|reason|recordedBy|createdBy|updatedBy|statusChangedBy|administeredBy|createdAt|updatedAt|revenue|cost|price|invoice|payment|bank|gps|destination|amount|customer|supplier|driver|feed_orders|feed_deliveries|purchase_orders/i);
    });
  });

  it("restricts company timezone to singleton id = 1 and LIMIT 1", async () => {
    await readFeedReportSource();
    expect(fake.state.projections[0]).toEqual({ timezone: companySettings.timezone });
    expect(fake.where).toHaveBeenCalledOnce();
    expect(dialect.sqlToQuery(fake.where.mock.calls[0][0] as SQL)).toMatchObject({
      sql: "`company_settings`.`id` = ?", params: [1],
    });
    expect(fake.limit.mock.calls).toEqual([[1]]);
    const fields = sql`${companySettings.timezone}`;
    const where = fake.where.mock.calls[0][0] as SQL;
    expect(dialect.sqlToQuery(sql`SELECT ${fields} FROM ${companySettings} WHERE ${where} LIMIT ${1}`))
      .toMatchObject({ sql: "SELECT `company_settings`.`timezone` FROM `company_settings` WHERE `company_settings`.`id` = ? LIMIT ?", params: [1, 1] });
  });

  it("retains global minimal catch provenance and pre-period observations without filtered or mutating helper calls", async () => {
    const result = await readFeedReportSource();
    expect(result.source.catches).toBe(fake.state.rows[5]);
    expect(result.source.catches.map(record => record.flockId)).toEqual([101, 999]);
    expect(result.source.catches.map(record => record.harvestRecordId)).toEqual([1001, 1001]);
    expect(Object.keys(fake.state.projections[5]).sort()).toEqual(["catchDate", "flockId", "harvestRecordId", "id", "status"]);
    expect(result.source.dailyRecords[0].recordDate).toBe("2026-11-01");
    // Only the singleton settings chain exposes WHERE/LIMIT; business chains
    // expose neither filter nor mutation capabilities on this strict fake.
    expect(fake.where).toHaveBeenCalledOnce();
    expect(fake.limit).toHaveBeenCalledOnce();
    expect(fake.state.tables[5]).toBe(catchSessions);
    expect(fake.select).toHaveBeenCalledTimes(6);
  });

  it.each([
    { label: "missing settings row", settings: [] },
    { label: "blank timezone", settings: [{ timezone: "" }] },
    { label: "null timezone", settings: [{ timezone: null }] },
    { label: "absent timezone field", settings: [{}] },
  ])("falls back to UTC for $label while preserving operational dates", async ({ settings }) => {
    fake.state.rows[0] = settings;
    const result = await readFeedReportSource();
    expect(result.timezone).toBe("UTC");
    expect(result.source.flocks[0].placementDate).toBe("2026-11-01");
    expect(result.source.dailyRecords[0].recordDate).toBe("2026-11-01");
    expect(result.source.harvests[0].harvestDate).toBe("2026-11-03");
    expect(result.source.catches[0].catchDate).toBe("2026-11-03");
    expect(fake.select).toHaveBeenCalledTimes(6);
    expect(fake.state.outcome).toBe("committed");
  });

  it.each(["UTC", "Africa/Johannesburg", "America/Los_Angeles"])("preserves configured timezone %s without shifting operational dates", async zone => {
    fake.state.rows[0] = [{ timezone: zone }];
    const result = await readFeedReportSource();
    expect(result.timezone).toBe(zone);
    expect(result.source.flocks[0].placementDate).toBe("2026-11-01");
    expect(result.source.dailyRecords[0].recordDate).toBe("2026-11-01");
    expect(fake.select).toHaveBeenCalledTimes(6);
  });

  it.each(["TEST/Definitely_Not_A_Timezone", " ", "Africa/Johannesburg "])("fails invalid stored timezone %j before business SELECTs", async zone => {
    fake.state.rows[0] = [{ timezone: zone }];
    await expect(readFeedReportSource()).rejects.toThrow(RangeError);
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledOnce();
    expect(fake.state.tables).toEqual([companySettings]);
    expect(fake.state.outcome).toBe("rolled-back");
  });

  it.each([null, undefined])("fails closed when the DB factory returns %j without starting a transaction", async unavailable => {
    fake.getDb.mockResolvedValue(unavailable);
    await expect(readFeedReportSource()).rejects.toThrow("Feed Performance database is unavailable.");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
    expect(fake.state.outcome).toBe("not-started");
  });

  it("propagates a thrown DB factory without returning an empty source", async () => {
    const error = new Error("TEST Feed DB factory failed closed");
    fake.getDb.mockImplementation(() => { throw error; });
    await expect(readFeedReportSource()).rejects.toBe(error);
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("propagates a rejected transaction wrapper without retry or source fallback", async () => {
    const error = new Error("TEST Feed transaction could not start");
    fake.transaction.mockRejectedValueOnce(error);
    await expect(readFeedReportSource()).rejects.toBe(error);
    expect(fake.getDb).toHaveBeenCalledOnce();
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it.each([
    { label: "settings", ordinal: 0 }, { label: "houses", ordinal: 1 },
    { label: "flocks", ordinal: 2 }, { label: "daily feed/weight/mortality", ordinal: 3 },
    { label: "actual harvests", ordinal: 4 }, { label: "minimal global catches", ordinal: 5 },
  ])("propagates a $label SELECT failure rather than returning a partial snapshot", async ({ ordinal }) => {
    fake.state.failAt = ordinal;
    await expect(readFeedReportSource()).rejects.toThrow("TEST Feed SELECT failed");
    expect(fake.getDb).toHaveBeenCalledOnce();
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledTimes(ordinal + 1);
    expect(fake.state.tables).toEqual(tables.slice(0, ordinal + 1));
    expect(fake.state.outcome).toBe("rolled-back");
  });

  it("returns all empty business collections only after a successful six-SELECT snapshot", async () => {
    fake.state.rows = [[{ timezone: "UTC" }], [], [], [], [], []];
    await expect(readFeedReportSource()).resolves.toEqual({ timezone: "UTC", source: {
      houses: [], flocks: [], dailyRecords: [], harvests: [], catches: [],
    } });
    expect(fake.select).toHaveBeenCalledTimes(6);
    expect(fake.state.outcome).toBe("committed");
  });

  it("preserves malformed, null, zero, unknown-stage and duplicate observations for pure-engine reconciliation", async () => {
    fake.state.rows[2] = [{ id: 101, flockNumber: "TEST-null-placement", houseId: 11,
      placementDate: null, initialCount: -1, status: "completed" }];
    const zero = { id: 2001, flockId: 101, recordDate: "2026-11-01", dayNumber: 0,
      feedConsumed: "0.00", feedType: null, mortality: 0, averageWeight: "0.000" };
    fake.state.rows[3] = [
      { id: 2002, flockId: 101, recordDate: null, dayNumber: -1,
        feedConsumed: "TEST-invalid", feedType: "TEST-unknown", mortality: null, averageWeight: null },
      zero, { ...zero }, { ...zero, feedConsumed: "12.34" },
    ];
    fake.state.rows[4] = [{ id: 1001, flockId: 101, harvestDate: null,
      chickenCountLoaded: "TEST-invalid", totalLoadedWeightKg: null,
      chickenCountDelivered: 0, totalDeliveredWeightKg: "0.000", transportMortalities: 0 }];
    fake.state.rows[5] = [{ id: 3001, flockId: 101, catchDate: null, harvestRecordId: null, status: "draft" }];
    const before = structuredClone(fake.state.rows);
    for (const rows of fake.state.rows) {
      for (const row of rows) Object.freeze(row);
      Object.freeze(rows);
    }
    const result = await readFeedReportSource();
    expect(result.source.flocks).toBe(fake.state.rows[2]);
    expect(result.source.dailyRecords).toBe(fake.state.rows[3]);
    expect(result.source.harvests).toBe(fake.state.rows[4]);
    expect(result.source.catches).toBe(fake.state.rows[5]);
    expect(result.source.dailyRecords).toHaveLength(4);
    expect(result.source.dailyRecords[0]).toMatchObject({ recordDate: null, feedConsumed: "TEST-invalid", feedType: "TEST-unknown", mortality: null });
    expect(result.source.dailyRecords[1]).toMatchObject({ feedConsumed: "0.00", mortality: 0, feedType: null });
    expect(result.source.harvests[0].chickenCountLoaded).toBe("TEST-invalid");
    expect(result.source.harvests[0].totalLoadedWeightKg).toBeNull();
    expect(result.source.harvests[0].transportMortalities).toBe(0);
    expect(fake.state.rows).toEqual(before);
    expect(fake.select).toHaveBeenCalledTimes(6);
  });

  it("keeps loaded count and actual kg paired on their own event instead of filling missing quantities from another harvest", async () => {
    fake.state.rows[4] = [
      { id: 1001, flockId: 101, harvestDate: "2026-11-02", chickenCountLoaded: 100,
        totalLoadedWeightKg: null, chickenCountDelivered: null, totalDeliveredWeightKg: null, transportMortalities: 0 },
      { id: 1002, flockId: 101, harvestDate: "2026-11-03", chickenCountLoaded: null,
        totalLoadedWeightKg: "200.000", chickenCountDelivered: null, totalDeliveredWeightKg: null, transportMortalities: null },
    ];
    const result = await readFeedReportSource();
    expect(result.source.harvests).toBe(fake.state.rows[4]);
    expect(result.source.harvests.map(event => [event.id, event.chickenCountLoaded, event.totalLoadedWeightKg]))
      .toEqual([[1001, 100, null], [1002, null, "200.000"]]);
    expect(fake.select).toHaveBeenCalledTimes(6);
  });

  it("compiles all four operational dates as the guarded epoch-based UTC calendar expression without DB execution", async () => {
    await readFeedReportSource();
    for (const [ordinal, key, column] of dateSelectors) {
      const columnSql = dialect.sqlToQuery(sql`${column}`).sql;
      const query = dialect.sqlToQuery(fake.state.projections[ordinal][key] as SQL);
      const normalized = query.sql.replace(/\s+/g, " ").trim();
      expect(normalized).toBe(`CASE WHEN ${columnSql} IS NULL OR CAST(${columnSql} AS CHAR) LIKE '0000-%' THEN NULL ELSE DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(${columnSql}), CAST('1970-01-01 00:00:00' AS DATETIME)), '%Y-%m-%d') END`);
      expect(query).toEqual(dialect.sqlToQuery(productionCalendarDate(column)));
      expect(query.params).toEqual([]);
      expect(normalized).not.toMatch(/\bDATE\s*\(|CONVERT_TZ|FROM_UNIXTIME|@@(?:session|global)\.time_zone|CURDATE|CURRENT_DATE|READ\s+ONLY/i);
    }
  });
});
