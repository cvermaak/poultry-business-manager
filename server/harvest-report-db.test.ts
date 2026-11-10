import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { catchSessions, companySettings, flocks, harvestRecords, houses } from "../drizzle/schema";

const fake = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[][],
    projections: [] as Record<string, unknown>[],
    tables: [] as unknown[],
    failAt: null as number | null,
    outcome: "not-started" as "not-started" | "active" | "committed" | "rolled-back",
  };
  const result = async (ordinal: number) => {
    if (ordinal === state.failAt) throw new Error("TEST Harvest SELECT failed");
    return state.rows[ordinal] ?? [];
  };
  const limit = vi.fn();
  const where = vi.fn((_condition: unknown) => Object.freeze({ limit }));
  const select = vi.fn((projection: Record<string, unknown>) => {
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
  // The transaction has no execute, mutation, rollback, or root SELECT method.
  // Its outcome below only simulates the transaction wrapper rejecting or
  // committing; this is not evidence of server-enforced READ ONLY or live SQL.
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
  return { state, limit, where, select, tx, transaction, db, getDb: vi.fn() };
});

// Reuse the real calendar projection but replace its DB dependency completely.
// No real getDb implementation, catch-session mutating helper, credentials, or
// network connection is imported or initialized by these tests.
vi.mock("./db", () => ({ getDb: fake.getDb }));
import { productionCalendarDate } from "./production-reports-db";
import { readHarvestReportSource } from "./harvest-report-db";

const dialect = new MySqlDialect();
function testingRows(): unknown[][] {
  return [
    [{ timezone: "Africa/Johannesburg" }],
    [{ id: 11, name: "TEST Harvest reader house", houseNumber: "TEST-11" }],
    [{ id: 101, flockNumber: "TEST-Harvest-flock", houseId: 11, placementDate: "2026-11-01", status: "active" }],
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
  vi.clearAllMocks();
  fake.state.rows = testingRows();
  fake.state.projections = [];
  fake.state.tables = [];
  fake.state.failAt = null;
  fake.state.outcome = "not-started";
  fake.getDb.mockReset();
  fake.getDb.mockResolvedValue(fake.db);
});

describe("Harvest Results minimal read-only source reader", () => {
  it("assembles exactly five SELECTs from company, houses, flocks, harvest records and catch sessions", async () => {
    const result = await readHarvestReportSource();
    expect(fake.getDb).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledTimes(5);
    expect(fake.state.tables).toEqual([companySettings, houses, flocks, harvestRecords, catchSessions]);
    expect(fake.state.tables.map(table => getTableName(table as typeof houses))).toEqual([
      "company_settings", "houses", "flocks", "harvest_records", "catch_sessions",
    ]);
    expect(result).toEqual({ timezone: "Africa/Johannesburg", source: {
      houses: fake.state.rows[1], flocks: fake.state.rows[2], harvests: fake.state.rows[3], catches: fake.state.rows[4],
    } });
    expect(Object.keys(result.source).sort()).toEqual(["catches", "flocks", "harvests", "houses"]);
    expect(result.source.harvests[0].totalLoadedWeightKg).toBe("200.000");
    expect(result.source.flocks[0]).not.toHaveProperty("initialCount");
    expect(fake.state.outcome).toBe("committed");
  });

  it("uses a single portable repeatable-read SELECT-only transaction, never server READ ONLY or session SQL", async () => {
    await readHarvestReportSource();
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "repeatable read" });
    expect(Object.keys(fake.transaction.mock.calls[0][1] as object)).toEqual(["isolationLevel"]);
    expect(Object.isFrozen(fake.db)).toBe(true);
    expect(Object.isFrozen(fake.tx)).toBe(true);
    expect(Object.keys(fake.db)).toEqual(["transaction"]);
    expect(Object.keys(fake.tx)).toEqual(["select"]);
    for (const key of ["execute", "insert", "update", "delete", "rollback", "getCatchSession"]) {
      expect(fake.tx).not.toHaveProperty(key);
      expect(fake.db).not.toHaveProperty(key);
    }
    expect(fake.select).toHaveBeenCalledTimes(5);
  });

  it("projects exactly the Harvest allowlist without finance, catch amounts, daily observations or private fields", async () => {
    await readHarvestReportSource();
    const expected = [
      { timezone: companySettings.timezone },
      { id: houses.id, name: houses.name, houseNumber: houses.houseNumber },
      { id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId,
        placementDate: null, status: flocks.status },
      { id: harvestRecords.id, flockId: harvestRecords.flockId, harvestDate: null,
        chickenCountLoaded: harvestRecords.chickenCountLoaded,
        totalLoadedWeightKg: harvestRecords.totalLoadedWeightKg,
        chickenCountDelivered: harvestRecords.chickenCountDelivered,
        totalDeliveredWeightKg: harvestRecords.totalDeliveredWeightKg,
        transportMortalities: harvestRecords.transportMortalities },
      { id: catchSessions.id, flockId: catchSessions.flockId, catchDate: null,
        harvestRecordId: catchSessions.harvestRecordId, status: catchSessions.status },
    ];
    const dateColumns: Record<string, SQLWrapper> = {
      placementDate: flocks.placementDate, harvestDate: harvestRecords.harvestDate, catchDate: catchSessions.catchDate,
    };
    expected.forEach((projection, ordinal) => {
      const actual = fake.state.projections[ordinal];
      expect(Object.keys(actual).sort()).toEqual(Object.keys(projection).sort());
      for (const [key, column] of Object.entries(projection)) {
        if (column !== null) expect(actual[key]).toBe(column);
        else expect(dialect.sqlToQuery(actual[key] as SQL)).toEqual(dialect.sqlToQuery(productionCalendarDate(dateColumns[key])));
      }
      const fields = Object.values(actual).map(value => sql`${value as SQLWrapper}`);
      const query = dialect.sqlToQuery(sql`SELECT ${sql.join(fields, sql`, `)} FROM ${fake.state.tables[ordinal] as SQLWrapper}`);
      expect(query.sql).toMatch(/^SELECT /);
      expect(query.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|SET|CALL)\b/i);
      expect(query.sql).not.toMatch(/flock_daily_records|mortality_records|feed|weightSamples|averageWeight|initialCount|currentCount|password|email|username|notes|reason|recordedBy|revenue|cost|price|invoice|payment|bank|gps|destination|amount|customer|supplier|driver/i);
    });
  });

  it("restricts settings to singleton id = 1 and LIMIT 1", async () => {
    await readHarvestReportSource();
    expect(fake.state.projections[0]).toEqual({ timezone: companySettings.timezone });
    expect(fake.where).toHaveBeenCalledOnce();
    expect(dialect.sqlToQuery(fake.where.mock.calls[0][0] as SQL)).toMatchObject({ sql: "`company_settings`.`id` = ?", params: [1] });
    expect(fake.limit).toHaveBeenCalledOnce();
    expect(fake.limit).toHaveBeenCalledWith(1);
  });

  it("retains global minimal catches to detect foreign-flock links without a flock filter or mutating catch reader", async () => {
    const result = await readHarvestReportSource();
    expect(result.source.catches).toBe(fake.state.rows[4]);
    expect(result.source.catches.map(record => record.flockId)).toEqual([101, 999]);
    expect(result.source.catches.map(record => record.harvestRecordId)).toEqual([1001, 1001]);
    expect(Object.keys(fake.state.projections[4]).sort()).toEqual(["catchDate", "flockId", "harvestRecordId", "id", "status"]);
    // The only supported WHERE belongs to singleton company settings. Other
    // .from() calls expose no filtering or mutation methods on the fake.
    expect(fake.where).toHaveBeenCalledOnce();
    expect(fake.state.tables[4]).toBe(catchSessions);
    expect(fake.select).toHaveBeenCalledTimes(5);
  });

  it.each([
    { label: "missing settings row", settings: [] },
    { label: "blank timezone", settings: [{ timezone: "" }] },
    { label: "null timezone", settings: [{ timezone: null }] },
  ])("uses UTC for $label without relabeling operational source dates", async ({ settings }) => {
    fake.state.rows[0] = settings;
    const result = await readHarvestReportSource();
    expect(result.timezone).toBe("UTC");
    expect(result.source.flocks[0].placementDate).toBe("2026-11-01");
    expect(result.source.harvests[0].harvestDate).toBe("2026-11-03");
    expect(result.source.catches[0].catchDate).toBe("2026-11-03");
    expect(fake.select).toHaveBeenCalledTimes(5);
    expect(fake.state.outcome).toBe("committed");
  });

  it("preserves an explicitly stored UTC timezone", async () => {
    fake.state.rows[0] = [{ timezone: "UTC" }];
    await expect(readHarvestReportSource()).resolves.toMatchObject({ timezone: "UTC" });
    expect(fake.select).toHaveBeenCalledTimes(5);
  });

  it("rejects invalid stored timezone before business SELECTs and lets the transaction wrapper roll back", async () => {
    fake.state.rows[0] = [{ timezone: "TEST/Definitely_Not_A_Timezone" }];
    await expect(readHarvestReportSource()).rejects.toThrow(RangeError);
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledOnce();
    expect(fake.state.tables).toEqual([companySettings]);
    expect(fake.state.outcome).toBe("rolled-back");
  });

  it.each([null, undefined])("fails closed when getDb returns %j without starting a transaction", async unavailable => {
    fake.getDb.mockResolvedValue(unavailable);
    await expect(readHarvestReportSource()).rejects.toThrow("Harvest Results database is unavailable.");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
    expect(fake.state.outcome).toBe("not-started");
  });

  it("propagates a thrown getDb function without returning an empty source", async () => {
    const error = new Error("TEST Harvest DB factory failed closed");
    fake.getDb.mockImplementation(() => { throw error; });
    await expect(readHarvestReportSource()).rejects.toBe(error);
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it.each([
    { label: "settings", ordinal: 0 }, { label: "houses", ordinal: 1 },
    { label: "flocks", ordinal: 2 }, { label: "harvest records", ordinal: 3 },
    { label: "catch sessions", ordinal: 4 },
  ])("propagates a $label SELECT failure and rolls back rather than returning a partial source", async ({ ordinal }) => {
    fake.state.failAt = ordinal;
    await expect(readHarvestReportSource()).rejects.toThrow("TEST Harvest SELECT failed");
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledTimes(ordinal + 1);
    expect(fake.state.tables).toEqual([companySettings, houses, flocks, harvestRecords, catchSessions].slice(0, ordinal + 1));
    expect(fake.state.outcome).toBe("rolled-back");
  });

  it("preserves null dates, captured zeroes and malformed observations for engine reconciliation", async () => {
    fake.state.rows[2] = [{ id: 101, flockNumber: "TEST-null-placement", houseId: 11, placementDate: null, status: "active" }];
    fake.state.rows[3] = [{ id: 1001, flockId: 101, harvestDate: null,
      chickenCountLoaded: "TEST-invalid", totalLoadedWeightKg: null,
      chickenCountDelivered: 0, totalDeliveredWeightKg: "0.000", transportMortalities: 0 }];
    fake.state.rows[4] = [{ id: 3001, flockId: 101, catchDate: null, harvestRecordId: null, status: "draft" }];
    const result = await readHarvestReportSource();
    expect(result.source.flocks).toBe(fake.state.rows[2]);
    expect(result.source.harvests).toBe(fake.state.rows[3]);
    expect(result.source.catches).toBe(fake.state.rows[4]);
    expect(result.source.harvests[0].chickenCountLoaded).toBe("TEST-invalid");
    expect(result.source.harvests[0].chickenCountDelivered).toBe(0);
    expect(result.source.harvests[0].transportMortalities).toBe(0);
    expect(fake.select).toHaveBeenCalledTimes(5);
  });

  it("compiles all three date selectors as the accepted guarded epoch-based UTC calendar projection", async () => {
    await readHarvestReportSource();
    for (const [ordinal, key, column] of [
      [2, "placementDate", flocks.placementDate], [3, "harvestDate", harvestRecords.harvestDate],
      [4, "catchDate", catchSessions.catchDate],
    ] as const) {
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
