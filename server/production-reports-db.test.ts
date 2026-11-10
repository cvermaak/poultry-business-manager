import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { catchSessions, companySettings, flockDailyRecords, flocks, harvestRecords, houses } from "../drizzle/schema";

const fake = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[][],
    projections: [] as Record<string, unknown>[],
    tables: [] as unknown[],
  };
  const limit = vi.fn();
  const where = vi.fn((_condition: unknown) => ({ limit }));
  const select = vi.fn((projection: Record<string, unknown>) => {
    const ordinal = state.projections.push(projection) - 1;
    return {
      from: (table: unknown) => {
        state.tables.push(table);
        if (ordinal === 0) {
          limit.mockImplementation(async () => state.rows[ordinal] ?? []);
          return { where };
        }
        return Promise.resolve(state.rows[ordinal] ?? []);
      },
    };
  });
  // There is intentionally no execute/insert/update/delete or root select:
  // any attempt at SQL execution, writes or reading outside the transaction fails.
  const tx = Object.freeze({ select });
  const transaction = vi.fn(async (callback: (transaction: typeof tx) => unknown, _config: unknown) => callback(tx));
  const db = Object.freeze({ transaction });
  return { state, limit, where, select, transaction, db, getDb: vi.fn() };
});

// Never import the real db module: this suite cannot initialize a SQL connection.
vi.mock("./db", () => ({ getDb: fake.getDb }));
import { productionCalendarDate, readProductionReportSource } from "./production-reports-db";

const dialect = new MySqlDialect();

function testingRows(): unknown[][] {
  return [
    [{ timezone: "Africa/Johannesburg" }],
    [{ id: 11, name: "TEST reader house", houseNumber: "TEST-11" }],
    [{ id: 101, flockNumber: "TEST-reader-flock", houseId: 11, placementDate: "2026-11-01", initialCount: 100, status: "active" }],
    [{ id: 1001, flockId: 101, recordDate: "2026-11-02", dayNumber: 1, mortality: 2, averageWeight: "0.060" }],
    [{ id: 2001, flockId: 101, harvestDate: "2026-11-03", chickenCountLoaded: 10 }],
    [{ id: 3001, flockId: 101, catchDate: "2026-11-03", harvestRecordId: 2001, status: "completed" }],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.rows = testingRows();
  fake.state.projections = [];
  fake.state.tables = [];
  fake.getDb.mockReset();
  fake.getDb.mockResolvedValue(fake.db);
});

describe("production report source reader", () => {
  it("assembles the six projected SELECT results without transforming operational date labels", async () => {
    const result = await readProductionReportSource();
    expect(fake.getDb).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledTimes(6);
    expect(fake.state.tables).toEqual([companySettings, houses, flocks, flockDailyRecords, harvestRecords, catchSessions]);
    expect(result).toEqual({
      timezone: "Africa/Johannesburg",
      source: {
        houses: fake.state.rows[1], flocks: fake.state.rows[2], dailyRecords: fake.state.rows[3],
        harvests: fake.state.rows[4], catches: fake.state.rows[5],
      },
    });
  });

  it("runs SELECT-only reads inside one portable repeatable-read snapshot", async () => {
    await readProductionReportSource();
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
    });
    expect(Object.keys(fake.db)).toEqual(["transaction"]);
    expect(fake.select).toHaveBeenCalledTimes(6);
  });

  it("uses exactly three SELECTs for metadata and does not read daily, harvest or catch tables", async () => {
    const result = await readProductionReportSource(false);
    expect(fake.select).toHaveBeenCalledTimes(3);
    expect(fake.state.tables).toEqual([companySettings, houses, flocks]);
    expect(result).toEqual({
      timezone: "Africa/Johannesburg",
      source: { houses: fake.state.rows[1], flocks: fake.state.rows[2], dailyRecords: [], harvests: [], catches: [] },
    });
    expect(fake.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
    });
  });

  it("projects only the explicit report column allowlist, never financial, personal or free-text columns", async () => {
    await readProductionReportSource();
    const expected = [
      { timezone: companySettings.timezone },
      { id: houses.id, name: houses.name, houseNumber: houses.houseNumber },
      { id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId, placementDate: null, initialCount: flocks.initialCount, status: flocks.status },
      { id: flockDailyRecords.id, flockId: flockDailyRecords.flockId, recordDate: null, dayNumber: flockDailyRecords.dayNumber, mortality: flockDailyRecords.mortality, averageWeight: flockDailyRecords.averageWeight },
      { id: harvestRecords.id, flockId: harvestRecords.flockId, harvestDate: null, chickenCountLoaded: harvestRecords.chickenCountLoaded },
      { id: catchSessions.id, flockId: catchSessions.flockId, catchDate: null, harvestRecordId: catchSessions.harvestRecordId, status: catchSessions.status },
    ];
    const dateColumns: Record<string, SQLWrapper> = {
      placementDate: flocks.placementDate, recordDate: flockDailyRecords.recordDate,
      harvestDate: harvestRecords.harvestDate, catchDate: catchSessions.catchDate,
    };
    expected.forEach((projection, ordinal) => {
      const actual = fake.state.projections[ordinal];
      expect(Object.keys(actual).sort()).toEqual(Object.keys(projection).sort());
      for (const [key, column] of Object.entries(projection)) {
        if (column !== null) expect(actual[key]).toBe(column);
        else expect(dialect.sqlToQuery(actual[key] as SQL)).toEqual(dialect.sqlToQuery(productionCalendarDate(dateColumns[key])));
      }
      // Compile the exact captured projection with Drizzle's dialect, not a DB.
      const fields = Object.values(actual).map(value => sql`${value as SQLWrapper}`);
      const query = dialect.sqlToQuery(sql`SELECT ${sql.join(fields, sql`, `)} FROM ${fake.state.tables[ordinal] as SQLWrapper}`);
      expect(query.sql).toMatch(/^SELECT /);
      expect(query.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i);
      expect(query.sql).not.toMatch(/password|email|username|notes|revenue|pricePerKg|invoiceReference|paymentTerms|bank|gps|destinationAddress|weightSamples|currentCount/i);
    });
    expect(fake.state.tables.map(table => getTableName(table as typeof houses))).toEqual([
      "company_settings", "houses", "flocks", "flock_daily_records", "harvest_records", "catch_sessions",
    ]);
  });

  it("loads only singleton company timezone settings with WHERE id = 1 and LIMIT 1", async () => {
    await readProductionReportSource(false);
    expect(fake.state.projections[0]).toEqual({ timezone: companySettings.timezone });
    expect(fake.where).toHaveBeenCalledOnce();
    expect(dialect.sqlToQuery(fake.where.mock.calls[0][0] as SQL)).toMatchObject({
      sql: "`company_settings`.`id` = ?", params: [1],
    });
    expect(fake.limit).toHaveBeenCalledOnce();
    expect(fake.limit).toHaveBeenCalledWith(1);
  });

  it.each([
    { label: "missing settings row", settings: [] },
    { label: "blank company timezone", settings: [{ timezone: "" }] },
  ])("falls back to UTC for $label", async ({ settings }) => {
    fake.state.rows[0] = settings;
    await expect(readProductionReportSource(false)).resolves.toMatchObject({ timezone: "UTC" });
    expect(fake.select).toHaveBeenCalledTimes(3);
  });

  it("fails rather than silently replacing an invalid stored timezone", async () => {
    fake.state.rows[0] = [{ timezone: "TEST/Definitely_Not_A_Timezone" }];
    await expect(readProductionReportSource()).rejects.toThrow(RangeError);
    expect(fake.select).toHaveBeenCalledOnce();
    expect(fake.state.tables).toEqual([companySettings]);
  });

  it("reports an unavailable database without starting a transaction", async () => {
    fake.getDb.mockResolvedValue(undefined);
    await expect(readProductionReportSource()).rejects.toThrow("Production report database is unavailable.");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("emits epoch-based UTC calendar reconstruction with null/zero-date guards, not a server-zone DATE conversion", () => {
    for (const column of [flocks.placementDate, flockDailyRecords.recordDate, harvestRecords.harvestDate, catchSessions.catchDate]) {
      const compiledColumn = dialect.sqlToQuery(sql`${column}`).sql;
      const query = dialect.sqlToQuery(productionCalendarDate(column));
      const normalized = query.sql.replace(/\s+/g, " ").trim();
      expect(normalized).toContain(`CASE WHEN ${compiledColumn} IS NULL OR CAST(${compiledColumn} AS CHAR) LIKE '0000-%' THEN NULL`);
      expect(normalized).toContain(`ELSE DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(${compiledColumn}), CAST('1970-01-01 00:00:00' AS DATETIME)), '%Y-%m-%d') END`);
      expect(normalized).not.toMatch(/\bDATE\s*\(|CONVERT_TZ|FROM_UNIXTIME|@@(?:session|global)\.time_zone|CURDATE|CURRENT_DATE/i);
      expect(query.params).toEqual([]);
    }
  });
});
