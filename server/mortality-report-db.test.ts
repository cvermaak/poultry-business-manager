import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  companySettings,
  flockDailyRecords,
  flocks,
  houses,
} from "../drizzle/schema";

const fake = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[][],
    projections: [] as Record<string, unknown>[],
    tables: [] as unknown[],
    failAt: null as number | null,
  };
  const result = async (ordinal: number) => {
    if (ordinal === state.failAt)
      throw new Error("TEST mortality SELECT failed");
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
  // Any SQL execution, mutation or root-level SELECT fails: those methods do not
  // exist. This proves the application path, not server-enforced READ ONLY mode.
  const tx = Object.freeze({ select });
  const transaction = vi.fn(
    async (callback: (transaction: typeof tx) => unknown, _config: unknown) =>
      callback(tx)
  );
  const db = Object.freeze({ transaction });
  return { state, limit, where, select, tx, transaction, db, getDb: vi.fn() };
});

// Both imported readers share this mocked DB module. The production module is
// intentionally real here so its canonical SQL expression can be compiled; no
// getDb implementation or credentials from the actual DB module can be reached.
vi.mock("./db", () => ({ getDb: fake.getDb }));
import { productionCalendarDate } from "./production-reports-db";
import { readMortalityReportSource } from "./mortality-report-db";

const dialect = new MySqlDialect();

function testingRows(): unknown[][] {
  return [
    [{ timezone: "Africa/Johannesburg" }],
    [{ id: 11, name: "TEST mortality reader house", houseNumber: "TEST-11" }],
    [
      {
        id: 101,
        flockNumber: "TEST-mortality-flock",
        houseId: 11,
        placementDate: "2026-11-01",
        initialCount: 100,
        status: "active",
      },
    ],
    [
      {
        id: 1001,
        flockId: 101,
        recordDate: "2026-11-02",
        dayNumber: 1,
        mortality: 2,
      },
      {
        id: 1002,
        flockId: 101,
        recordDate: "2026-11-03",
        dayNumber: 2,
        mortality: 0,
      },
    ],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.rows = testingRows();
  fake.state.projections = [];
  fake.state.tables = [];
  fake.state.failAt = null;
  fake.getDb.mockReset();
  fake.getDb.mockResolvedValue(fake.db);
});

describe("mortality report source reader", () => {
  it("assembles exactly four SELECT results from settings, houses, flocks and daily records", async () => {
    const result = await readMortalityReportSource();
    expect(fake.getDb).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledTimes(4);
    expect(fake.state.tables).toEqual([
      companySettings,
      houses,
      flocks,
      flockDailyRecords,
    ]);
    expect(
      fake.state.tables.map(table => getTableName(table as typeof houses))
    ).toEqual(["company_settings", "houses", "flocks", "flock_daily_records"]);
    expect(result).toEqual({
      timezone: "Africa/Johannesburg",
      source: {
        houses: fake.state.rows[1],
        flocks: fake.state.rows[2],
        dailyRecords: fake.state.rows[3],
      },
    });
    expect(Object.keys(result.source).sort()).toEqual([
      "dailyRecords",
      "flocks",
      "houses",
    ]);
    expect(result.source.dailyRecords[1].mortality).toBe(0);
  });

  it("uses one portable repeatable-read snapshot with a frozen SELECT-only transaction and no server READ ONLY flag", async () => {
    await readMortalityReportSource();
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
    });
    expect(Object.keys(fake.transaction.mock.calls[0][1] as object)).toEqual([
      "isolationLevel",
    ]);
    expect(Object.isFrozen(fake.db)).toBe(true);
    expect(Object.isFrozen(fake.tx)).toBe(true);
    expect(Object.keys(fake.db)).toEqual(["transaction"]);
    expect(Object.keys(fake.tx)).toEqual(["select"]);
    expect(fake.select).toHaveBeenCalledTimes(4);
    // No execute, root select, insert, update, delete or session SQL exists on
    // the test doubles, so no live SQL side effect can be hidden by a spy.
    for (const key of ["execute", "insert", "update", "delete", "rollback"]) {
      expect(fake.tx).not.toHaveProperty(key);
      expect(fake.db).not.toHaveProperty(key);
    }
  });

  it("projects the exact mortality allowlist and excludes weights, feed, harvest, financial, free-text and personal fields", async () => {
    await readMortalityReportSource();
    const expected = [
      { timezone: companySettings.timezone },
      { id: houses.id, name: houses.name, houseNumber: houses.houseNumber },
      {
        id: flocks.id,
        flockNumber: flocks.flockNumber,
        houseId: flocks.houseId,
        placementDate: null,
        initialCount: flocks.initialCount,
        status: flocks.status,
      },
      {
        id: flockDailyRecords.id,
        flockId: flockDailyRecords.flockId,
        recordDate: null,
        dayNumber: flockDailyRecords.dayNumber,
        mortality: flockDailyRecords.mortality,
      },
    ];
    const dateColumns: Record<string, SQLWrapper> = {
      placementDate: flocks.placementDate,
      recordDate: flockDailyRecords.recordDate,
    };
    expected.forEach((projection, ordinal) => {
      const actual = fake.state.projections[ordinal];
      expect(Object.keys(actual).sort()).toEqual(
        Object.keys(projection).sort()
      );
      for (const [key, column] of Object.entries(projection)) {
        if (column !== null) expect(actual[key]).toBe(column);
        else
          expect(dialect.sqlToQuery(actual[key] as SQL)).toEqual(
            dialect.sqlToQuery(productionCalendarDate(dateColumns[key]))
          );
      }
      const fields = Object.values(actual).map(
        value => sql`${value as SQLWrapper}`
      );
      const query = dialect.sqlToQuery(
        sql`SELECT ${sql.join(fields, sql`, `)} FROM ${fake.state.tables[ordinal] as SQLWrapper}`
      );
      expect(query.sql).toMatch(/^SELECT /);
      expect(query.sql).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i
      );
      expect(query.sql).not.toMatch(
        /weight|feed|harvest|catch_sessions|mortality_records|password|email|username|notes|reason|recordedBy|revenue|cost|price|invoice|payment|bank|gps|destination|currentCount/i
      );
    });
  });

  it("queries only singleton timezone settings with WHERE id = 1 and LIMIT 1", async () => {
    await readMortalityReportSource();
    expect(fake.state.projections[0]).toEqual({
      timezone: companySettings.timezone,
    });
    expect(fake.where).toHaveBeenCalledOnce();
    expect(
      dialect.sqlToQuery(fake.where.mock.calls[0][0] as SQL)
    ).toMatchObject({ sql: "`company_settings`.`id` = ?", params: [1] });
    expect(fake.limit).toHaveBeenCalledOnce();
    expect(fake.limit).toHaveBeenCalledWith(1);
  });

  it.each([
    { label: "missing settings row", settings: [] },
    { label: "blank timezone", settings: [{ timezone: "" }] },
    { label: "null timezone", settings: [{ timezone: null }] },
  ])(
    "falls back to UTC for $label without changing date labels",
    async ({ settings }) => {
      fake.state.rows[0] = settings;
      const result = await readMortalityReportSource();
      expect(result.timezone).toBe("UTC");
      expect(result.source.flocks[0].placementDate).toBe("2026-11-01");
      expect(result.source.dailyRecords[0].recordDate).toBe("2026-11-02");
      expect(fake.select).toHaveBeenCalledTimes(4);
    }
  );

  it("preserves an explicitly stored UTC timezone", async () => {
    fake.state.rows[0] = [{ timezone: "UTC" }];
    await expect(readMortalityReportSource()).resolves.toMatchObject({
      timezone: "UTC",
    });
    expect(fake.select).toHaveBeenCalledTimes(4);
  });

  it("rejects an invalid initial settings timezone before selecting any business table", async () => {
    fake.state.rows[0] = [{ timezone: "TEST/Definitely_Not_A_Timezone" }];
    await expect(readMortalityReportSource()).rejects.toThrow(RangeError);
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledOnce();
    expect(fake.state.tables).toEqual([companySettings]);
  });

  it("fails when the database is unavailable without opening a transaction", async () => {
    fake.getDb.mockResolvedValue(undefined);
    await expect(readMortalityReportSource()).rejects.toThrow(
      "Mortality report database is unavailable."
    );
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("propagates an initial settings SELECT failure without reading houses, flocks or daily records", async () => {
    fake.state.failAt = 0;
    await expect(readMortalityReportSource()).rejects.toThrow(
      "TEST mortality SELECT failed"
    );
    expect(fake.select).toHaveBeenCalledOnce();
    expect(fake.state.tables).toEqual([companySettings]);
  });

  it("propagates a later SELECT failure instead of returning an incomplete report source", async () => {
    fake.state.failAt = 2;
    await expect(readMortalityReportSource()).rejects.toThrow(
      "TEST mortality SELECT failed"
    );
    expect(fake.select).toHaveBeenCalledTimes(3);
    expect(fake.state.tables).toEqual([companySettings, houses, flocks]);
  });

  it("passes through null dates and malformed mortality observations for the real engine to audit", async () => {
    fake.state.rows[2] = [
      {
        id: 101,
        flockNumber: "TEST-null-date",
        houseId: 11,
        placementDate: null,
        initialCount: 100,
        status: "active",
      },
    ];
    fake.state.rows[3] = [
      {
        id: 1001,
        flockId: 101,
        recordDate: null,
        dayNumber: 0,
        mortality: "TEST-invalid",
      },
    ];
    const result = await readMortalityReportSource();
    expect(result.source.flocks).toEqual(fake.state.rows[2]);
    expect(result.source.dailyRecords).toEqual(fake.state.rows[3]);
    expect(fake.select).toHaveBeenCalledTimes(4);
  });

  it("compiles the exact captured date projections as epoch-based UTC calendar reconstruction, with null and zero-date guards", async () => {
    await readMortalityReportSource();
    for (const [ordinal, key, column] of [
      [2, "placementDate", flocks.placementDate],
      [3, "recordDate", flockDailyRecords.recordDate],
    ] as const) {
      const columnSql = dialect.sqlToQuery(sql`${column}`).sql;
      const query = dialect.sqlToQuery(
        fake.state.projections[ordinal][key] as SQL
      );
      const normalized = query.sql.replace(/\s+/g, " ").trim();
      expect(normalized).toBe(
        `CASE WHEN ${columnSql} IS NULL OR CAST(${columnSql} AS CHAR) LIKE '0000-%' THEN NULL ELSE DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(${columnSql}), CAST('1970-01-01 00:00:00' AS DATETIME)), '%Y-%m-%d') END`
      );
      expect(query).toEqual(dialect.sqlToQuery(productionCalendarDate(column)));
      expect(query.params).toEqual([]);
      expect(normalized).not.toMatch(
        /\bDATE\s*\(|CONVERT_TZ|FROM_UNIXTIME|@@(?:session|global)\.time_zone|CURDATE|CURRENT_DATE|READ\s+ONLY/i
      );
    }
  });
});
