import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { companySettings, userActivityLogs, users } from "../drizzle/schema";

// Never load credentials or instantiate a real database driver. The synthetic
// URL merely allows getDb's lazy initialization to return the mocked instance.
const mockDb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("./_core/env", () => ({ ENV: {} }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => mockDb) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));

import * as db from "./db";
import { systemRouter } from "./_core/systemRouter";

const dialect = new MySqlDialect();
const epochMs = Date.parse("2026-11-08T17:14:09.123Z");
const expectedIso = "2026-11-08T17:14:09.123Z";

function queryResult(rows: unknown[], error?: Error) {
  const result = error ? Promise.reject(error) : Promise.resolve(rows);
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: result.then.bind(result),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function context(role: NonNullable<TrpcContext["user"]>["role"] | null): TrpcContext {
  return {
    user: role === null ? null : { id: 1, role },
    req: { headers: {} },
    res: {},
  } as TrpcContext;
}

function render(expression: SQL) {
  const { sql, params } = dialect.sqlToQuery(expression);
  return { sql, params };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://mock.invalid/audit_time_tests_only");
  vi.clearAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("activity reader timestamp projection and normalization (mocked database)", () => {
  const readers = [
    { name: "all activity", read: () => db.getAllActivityLogs(), flock: false },
    { name: "flock activity", read: () => db.getFlockActivityLogs(42), flock: true },
  ];

  it.each(readers)("$name selects SQL epoch milliseconds without changing other fields or query behavior", async ({ read, flock }) => {
    const fields = {
      id: 7,
      userId: 3,
      action: "update",
      entityType: "flock",
      entityId: 42,
      details: '{"note":"unchanged"}',
      userName: "Farm operator",
    };
    const original = { ...fields, createdAt: `${epochMs}.000000` };
    const chain = queryResult([original]);

    expect(await read()).toEqual([{ ...fields, createdAt: expectedIso }]);
    expect(original.createdAt).toBe(`${epochMs}.000000`);

    const projection = mockDb.select.mock.calls[0][0];
    expect(Object.keys(projection).sort()).toEqual([
      "id", "userId", "action", "entityType", "entityId", "details", "createdAt", "userName",
    ].sort());
    for (const key of ["id", "userId", "action", "entityType", "entityId", "details"] as const) {
      expect(projection[key]).toBe(userActivityLogs[key]);
    }
    expect(projection.userName).toBe(users.name);
    expect(render(projection.createdAt)).toEqual({
      sql: "CASE WHEN YEAR(`user_activity_logs`.`createdAt`) = 0 THEN NULL ELSE UNIX_TIMESTAMP(`user_activity_logs`.`createdAt`) * 1000 END",
      params: [],
    });
    expect(chain.from).toHaveBeenCalledWith(userActivityLogs);
    expect(chain.leftJoin.mock.calls[0][0]).toBe(users);
    expect(render(chain.leftJoin.mock.calls[0][1])).toEqual({
      sql: "`user_activity_logs`.`userId` = `users`.`id`",
      params: [],
    });
    expect(render(chain.orderBy.mock.calls[0][0])).toEqual({
      sql: "`user_activity_logs`.`createdAt` desc",
      params: [],
    });
    if (flock) {
      expect(chain.limit).not.toHaveBeenCalled();
      expect(render(chain.where.mock.calls[0][0])).toEqual({
        sql: "(`user_activity_logs`.`entityType` = ? and `user_activity_logs`.`entityId` = ?)",
        params: ["flock", 42],
      });
    } else {
      expect(chain.where).not.toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1000);
    }
  });

  it.each(readers)("$name returns null for null, invalid, or ambiguous timestamps, not fabricated UTC", async ({ read }) => {
    const values = [epochMs, "0.000000", null, undefined, "bad", "2026-11-08 17:14:09", expectedIso, Number.NaN, "9007199254740993", 8640000000000001];
    queryResult(values.map((createdAt, id) => ({ id, createdAt })));
    expect(await read()).toEqual([
      { id: 0, createdAt: expectedIso },
      { id: 1, createdAt: "1970-01-01T00:00:00.000Z" },
      ...values.slice(2).map((_, index) => ({ id: index + 2, createdAt: null })),
    ]);
  });

  it.each(readers)("$name preserves empty results", async ({ read }) => {
    queryResult([]);
    expect(await read()).toEqual([]);
  });
});

describe("display timezone reader (mocked database)", () => {
  it("throws when the database is unavailable instead of returning UTC", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    const isolatedDb = await import("./db");
    await expect(isolatedDb.getDisplayTimezone()).rejects.toThrow("Database not available");
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("selects only company_settings.timezone, never identity or banking data", async () => {
    const chain = queryResult([{ timezone: "Africa/Johannesburg", bankName: "must-not-leak", accountNumber: "must-not-leak" }]);
    expect(await db.getDisplayTimezone()).toBe("Africa/Johannesburg");
    expect(mockDb.select).toHaveBeenCalledWith({ timezone: companySettings.timezone });
    const projection = mockDb.select.mock.calls[0][0];
    expect(render(sql`${projection.timezone}`)).toEqual({
      sql: "`company_settings`.`timezone`",
      params: [],
    });
    expect(chain.from).toHaveBeenCalledWith(companySettings);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it.each([
    { rows: [] },
    { rows: [{ timezone: null }] },
    { rows: [{ timezone: "" }] },
    { rows: [{ timezone: "   " }] },
  ])(
    "defaults to UTC only when no timezone is configured: $rows",
    async ({ rows }) => {
      queryResult(rows);
      expect(await db.getDisplayTimezone()).toBe("UTC");
    },
  );

  it("does not mask an invalid configured timezone as UTC", async () => {
    queryResult([{ timezone: "Not/A_Real_Zone" }]);
    expect(await db.getDisplayTimezone()).toBe("Not/A_Real_Zone");
  });

  it("propagates query errors rather than pretending UTC was configured", async () => {
    const failure = new Error("synthetic timezone query failure");
    queryResult([], failure);
    await expect(db.getDisplayTimezone()).rejects.toBe(failure);
  });
});

describe("system.getDisplayTimezone protection and limited response", () => {
  it("rejects unauthenticated access without querying the database", async () => {
    const caller = systemRouter.createCaller(context(null));
    await expect(caller.getDisplayTimezone()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it.each(["admin", "farm_manager", "production_worker", "chicken_house_operator"] as const)(
    "allows authenticated %s users and exposes only the timezone string",
    async role => {
      queryResult([{ timezone: "America/New_York", companyName: "must-not-leak", bankName: "must-not-leak", accountNumber: "must-not-leak" }]);
      const caller = systemRouter.createCaller(context(role));
      const output = await caller.getDisplayTimezone();
      expect(output).toEqual({ timezone: "America/New_York" });
      expect(Object.keys(output)).toEqual(["timezone"]);
      expect(mockDb.select).toHaveBeenCalledWith({ timezone: companySettings.timezone });
    },
  );

  it("surfaces database failures as API errors, not a false UTC response", async () => {
    queryResult([], new Error("synthetic settings read failed"));
    const caller = systemRouter.createCaller(context("farm_manager"));
    await expect(caller.getDisplayTimezone()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "synthetic settings read failed",
    });
  });

  it("keeps the existing activity endpoint protected", async () => {
    const caller = systemRouter.createCaller(context(null));
    await expect(caller.getAllActivityLogs()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns canonical UTC or null through the authenticated activity endpoint", async () => {
    queryResult([{ id: 1, createdAt: String(epochMs) }, { id: 2, createdAt: null }]);
    const caller = systemRouter.createCaller(context("farm_manager"));
    expect(await caller.getAllActivityLogs()).toEqual([
      { id: 1, createdAt: expectedIso },
      { id: 2, createdAt: null },
    ]);
  });

  it("does not relax administrator protection on the full Company Settings endpoints", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const settingsRouter = source.slice(source.indexOf("companySettings: router({"), source.indexOf("invoices: router({"));
    expect(settingsRouter).toContain("get: adminProcedure.query");
    expect(settingsRouter).toContain("update: adminProcedure");
  });
});
