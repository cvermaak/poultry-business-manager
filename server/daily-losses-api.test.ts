import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createDailyTestSource, type SyntheticDailyRow } from "./daily-record-test-source";

// Real appRouter + real db.ts + real mutation helpers; ONLY the driver and
// unrelated credential/media/auth and financial-visibility adapters are mocked.
// This suite isolates daily-loss persistence; role-policy boundaries have their own tests.
// No live connection, policy write, or permission relaxation in application source.
const storedActor = vi.hoisted(() => ({ role: "farm_manager" }));
vi.mock("./business-permission-service", () => ({
  canReadFinancialData: vi.fn(async () => true),
  getBusinessStoredActor: vi.fn(async (id: number) => ({ id, role: storedActor.role, isActive: 1 })),
}));
const driver = vi.hoisted(() => ({ source: null as any, drizzle: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: (...args: unknown[]) => {
  driver.drizzle(...args);
  return {
    insert: (...values: unknown[]) => driver.source.insert(...values),
    transaction: (...values: unknown[]) => driver.source.transaction(...values),
  };
} }));
vi.mock("./_core/env", () => ({ ENV: {} }));
vi.mock("./_core/jwt", () => ({ generateJWT: vi.fn(), verifyJWT: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: {} }));
vi.mock("./_core/email", () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));

import { appRouter } from "./routers";
import * as db from "./db";

const legacy = (): SyntheticDailyRow => ({ id: 1, flockId: 42, mortality: 7, culls: null, cullReason: null, notes: "original", feedConsumed: "12" });
const classified = (): SyntheticDailyRow => ({ ...legacy(), culls: 2, cullReason: "injury" });
const expected = () => ({ mortality: 7, culls: 2, cullReason: "injury" });
const date = new Date("2026-11-10T22:30:00-02:00");
const createInput = () => ({ flockId: 42, recordDate: date, dayNumber: 1 });

function caller(role: NonNullable<TrpcContext["user"]>["role"] | null = "farm_manager") {
  storedActor.role = role ?? "farm_manager";
  const ctx = { user: role === null ? null : { id: 3, role }, req: { headers: {} }, res: {} } as TrpcContext;
  return appRouter.createCaller(ctx);
}
function source(rows = [classified()]) {
  driver.source = createDailyTestSource(rows);
  return driver.source as ReturnType<typeof createDailyTestSource>;
}
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mock-driver-only-no-network");
  vi.clearAllMocks();
  source();
});
afterAll(() => vi.unstubAllEnvs());

describe("daily API preserves protected create/update and admin-only delete", () => {
  it.each(["create", "update", "delete"] as const)("rejects anonymous %s before DB/audit", async operation => {
    const api = caller(null).flocks;
    const work = operation === "create" ? api.createDailyRecord(createInput())
      : operation === "update" ? api.updateDailyRecord({ id: 1, flockId: 42, notes: "no" })
      : api.deleteDailyRecord({ id: 1, flockId: 42 });
    await expect(work).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(driver.source.writes).toEqual([]);
    expect(driver.source.audits).toEqual([]);
    expect(driver.source.locks).toEqual([]);
  });

  it.each(["admin", "farm_manager", "production_worker", "chicken_house_operator", "accountant", "sales_staff"] as const)(
    "retains existing authenticated %s create/update permission", async role => {
      const fixture = source();
      const api = caller(role).flocks;
      await expect(api.createDailyRecord({ ...createInput(), losses: { foundDead: 1, culls: 0 } })).resolves.toEqual({ success: true });
      await expect(api.updateDailyRecord({ id: 1, flockId: 42, notes: "permitted" })).resolves.toEqual({ success: true });
      expect(fixture.audits).toHaveLength(2);
      expect(fixture.audits.map(audit => audit.userId)).toEqual([3, 3]);
    },
  );

  it.each(["farm_manager", "production_worker", "chicken_house_operator", "accountant", "sales_staff"] as const)(
    "denies %s deletion without reading/writing/auditing", async role => {
      await expect(caller(role).flocks.deleteDailyRecord({ id: 1, flockId: 42 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(driver.source.writes).toEqual([]);
      expect(driver.source.audits).toEqual([]);
      expect(driver.source.locks).toEqual([]);
    },
  );

  it("allows admin deletion and audits the actual stored flock after scoped deletion", async () => {
    const fixture = source();
    await expect(caller("admin").flocks.deleteDailyRecord({ id: 1, flockId: 42 })).resolves.toEqual({ success: true });
    expect(fixture.rows.has(1)).toBe(false);
    expect(fixture.writes[0].params).toEqual([1, 42]);
    expect(fixture.audits).toEqual([expect.objectContaining({
      userId: 3, action: "delete_daily_record", entityType: "flock_daily_record", entityId: 42,
      details: "Deleted daily record 1 from flock 42",
    })]);
  });
});

describe("strict daily API contracts and old-client compatibility", () => {
  it("computes the sum server-side, normalizes reason, and preserves feed/weight/date behaviors", async () => {
    const fixture = source([]);
    await caller().flocks.createDailyRecord({
      ...createInput(), losses: { foundDead: 4, culls: 2, cullReason: "  leg injury  " },
      feedConsumed: 12.5, feedType: "starter", waterConsumed: 24, averageWeight: 0.125,
      weightSamples: "0.120,0.130", temperature: 29.5, humidity: 67, notes: "unchanged note",
    });
    expect(fixture.rows.get(1)).toMatchObject({
      mortality: 6, culls: 2, cullReason: "leg injury", recordDate: "2026-11-11 00:30:00", dayNumber: 1,
      feedConsumed: "12.5", feedType: "starter", waterConsumed: "24", averageWeight: "0.125",
      weightSamples: "0.120,0.130", temperature: "29.5", humidity: "67", notes: "unchanged note", recordedBy: 3,
    });
    expect(fixture.audits[0]).toMatchObject({ action: "create_daily_record", entityId: 42, userId: 3 });
  });

  it("keeps omitted or explicit legacy creates NULL and new zero-pair classified", async () => {
    const fixture = source([]);
    const api = caller().flocks;
    await api.createDailyRecord(createInput());
    await api.createDailyRecord({ ...createInput(), mortality: 5 });
    await api.createDailyRecord({ ...createInput(), losses: { foundDead: 0, culls: 0 } });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 0, culls: null, cullReason: null, feedConsumed: "0" });
    expect(fixture.rows.get(2)).toMatchObject({ mortality: 5, culls: null, cullReason: null });
    expect(fixture.rows.get(3)).toMatchObject({ mortality: 0, culls: 0, cullReason: null });
  });

  it.each([
    { mortality: 3, losses: { foundDead: 1, culls: 2 } },
    { mortality: undefined, losses: { foundDead: 1, culls: 2 } },
    { losses: { foundDead: 1 } }, { losses: { culls: 1 } }, { losses: {} },
    { losses: { foundDead: -1, culls: 1 } }, { losses: { foundDead: 1, culls: -1 } },
    { losses: { foundDead: 0.5, culls: 1 } }, { losses: { foundDead: 1, culls: 0.5 } },
    { losses: { foundDead: Infinity, culls: 0 } }, { losses: { foundDead: 0, culls: NaN } },
    { losses: { foundDead: 2147483647, culls: 1 } },
    { losses: { foundDead: "2", culls: 1 } }, { losses: { foundDead: 1, culls: "2" } },
    { losses: { foundDead: 0, culls: 0, cullReason: "invalid zero reason" } },
    { losses: { foundDead: 0, culls: 1, cullReason: "x".repeat(1001) } },
    { mortality: -1 }, { mortality: 0.2 }, { mortality: 2147483648 }, { mortality: "3" },
    { culls: 0 }, { culls: null }, { cullReason: null }, { foundDead: 0 },
    { expectedLosses: { mortality: 7, culls: 2, cullReason: null } },
    { losses: { foundDead: 0, culls: 0, extra: true } },
  ])("rejects invalid create contract before any insert/audit: %j", async patch => {
    const fixture = source([]);
    await expect(caller().flocks.createDailyRecord({ ...createInput(), ...patch } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });

  it.each([
    { losses: { foundDead: 4, culls: 3 } }, { expectedLosses: expected() },
    { expectedLosses: undefined }, { losses: undefined, expectedLosses: undefined },
    { losses: { foundDead: 4 }, expectedLosses: expected() },
    { losses: { foundDead: 4, culls: 3 }, expectedLosses: { mortality: 7, culls: 3 } },
    { losses: { foundDead: 4, culls: 3 }, expectedLosses: { mortality: 7, culls: 8, cullReason: null } },
    { losses: { foundDead: 4, culls: 3 }, expectedLosses: expected(), mortality: 7 },
    { culls: null }, { culls: 0 }, { cullReason: "reason" }, { foundDead: 7 },
    { mortality: -1 }, { mortality: 1.5 }, { mortality: 2147483648 },
    { losses: null, expectedLosses: expected() },
  ])("rejects incoherent update contract before locked read and audit: %j", async patch => {
    const fixture = source();
    await expect(caller().flocks.updateDailyRecord({ id: 1, flockId: 42, ...patch } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.rows.get(1)).toEqual(classified());
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
    expect(fixture.locks).toEqual([]);
  });

  it("preserves legacy NULL across unrelated edits, allows explicit combined correction", async () => {
    const fixture = source([legacy()]);
    await caller().flocks.updateDailyRecord({ id: 1, flockId: 42, feedConsumed: 15.5, averageWeight: 0.2 });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 7, culls: null, cullReason: null, feedConsumed: "15.5", averageWeight: "0.2" });
    expect(fixture.rows.get(1)?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await caller().flocks.updateDailyRecord({ id: 1, flockId: 42, mortality: 9 });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 9, culls: null, cullReason: null });
  });

  it("lets invalid historical total pass unchanged on an unrelated edit", async () => {
    const fixture = source([{ ...legacy(), mortality: -5 }]);
    await caller().flocks.updateDailyRecord({ id: 1, flockId: 42, notes: "legacy unchanged" });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: -5, culls: null, cullReason: null, notes: "legacy unchanged" });
  });

  it("accepts equal-total old client notes edits; changed total rejects notes AND audit", async () => {
    const fixture = source();
    await caller().flocks.updateDailyRecord({ id: 1, flockId: 42, mortality: 7, notes: "accepted equal total" });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 7, culls: 2, cullReason: "injury", notes: "accepted equal total" });
    await expect(caller().flocks.updateDailyRecord({ id: 1, flockId: 42, mortality: 8, notes: "not saved" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.rows.get(1)?.notes).toBe("accepted equal total");
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.writes).toHaveLength(1);
  });

  it("rejects classification of legacy rows before any writes or audit", async () => {
    const fixture = source([legacy()]);
    await expect(caller().flocks.updateDailyRecord({
      id: 1, flockId: 42, losses: { foundDead: 7, culls: 0 },
      expectedLosses: { mortality: 7, culls: null, cullReason: null }, notes: "not saved",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.rows.get(1)).toEqual(legacy());
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });

  it("handles classified pair changes and coherent reason edits via complete stored snapshots", async () => {
    const fixture = source();
    const api = caller().flocks;
    await api.updateDailyRecord({ id: 1, flockId: 42, losses: { foundDead: 3, culls: 2 }, expectedLosses: expected() });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 5, culls: 2, cullReason: "injury" });
    await api.updateDailyRecord({
      id: 1, flockId: 42, losses: { foundDead: 3, culls: 2, cullReason: "  new reason  " },
      expectedLosses: { mortality: 5, culls: 2, cullReason: "injury" },
    });
    expect(fixture.rows.get(1)?.cullReason).toBe("new reason");
    await api.updateDailyRecord({
      id: 1, flockId: 42, losses: { foundDead: 5, culls: 0 },
      expectedLosses: { mortality: 5, culls: 2, cullReason: "new reason" },
    });
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 5, culls: 0, cullReason: null });
    expect(fixture.audits).toHaveLength(3);
  });
});

describe("real daily DB helper scope, atomicity and audit boundaries", () => {
  it.each(["update", "delete"] as const)("%s rejects missing ID and mismatch with no success audit", async operation => {
    for (const [id, flockId, code] of [[99, 42, "NOT_FOUND"], [1, 99, "BAD_REQUEST"]] as const) {
      const fixture = source();
      const api = caller("admin").flocks;
      const work = operation === "update" ? api.updateDailyRecord({ id, flockId, notes: "must not write" }) : api.deleteDailyRecord({ id, flockId });
      await expect(work).rejects.toMatchObject({ code });
      expect(fixture.rows.get(1)).toEqual(classified());
      expect(fixture.audits).toEqual([]);
      expect(fixture.writes).toEqual([]);
    }
  });

  it("rejects same-total stale reason snapshots as CONFLICT and does not partially save notes/feed", async () => {
    const fixture = source();
    await expect(caller().flocks.updateDailyRecord({
      id: 1, flockId: 42, losses: { foundDead: 4, culls: 3 },
      expectedLosses: { ...expected(), cullReason: "stale reason" }, notes: "not saved", feedConsumed: 99,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fixture.rows.get(1)).toEqual(classified());
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });

  it("exercises locking via the real DB path: second overlapping stale request rejects without success audit", async () => {
    const fixture = source();
    const gate = fixture.pauseNextLockedRead();
    const api = caller().flocks;
    const first = api.updateDailyRecord({
      id: 1, flockId: 42, losses: { foundDead: 4, culls: 3 }, expectedLosses: expected(), notes: "first",
    });
    await gate.entered.promise;
    const second = api.updateDailyRecord({
      id: 1, flockId: 42, losses: { foundDead: 6, culls: 1 }, expectedLosses: expected(), notes: "second", feedConsumed: 500,
    });
    const rejection = expect(second).rejects.toMatchObject({ code: "CONFLICT" });
    gate.release.resolve();
    await first;
    await rejection;
    expect(fixture.rows.get(1)).toMatchObject({ mortality: 7, culls: 3, notes: "first", feedConsumed: "12" });
    expect(fixture.writes).toHaveLength(1);
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.locks).toEqual(["update", "update"]);
  });

  it("fails an underlying write without partial data or a success audit", async () => {
    const fixture = source();
    fixture.failNextWrite();
    await expect(caller().flocks.updateDailyRecord({ id: 1, flockId: 42, losses: { foundDead: 4, culls: 3 }, expectedLosses: expected(), notes: "must not save" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(fixture.rows.get(1)).toEqual(classified());
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });

  it("guards the real exported DB helpers themselves against raw inferred loss patches", async () => {
    const fixture = source();
    await expect(db.createFlockDailyRecord({ ...createInput(), recordDate: "2026-11-11 00:30:00", culls: 1 } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.updateFlockDailyRecord(1, 42, { culls: null } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.updateFlockDailyRecord(1, 42, { cullReason: "standalone" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.updateFlockDailyRecord(1, 99, { notes: "not saved" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.deleteFlockDailyRecord(99, 42)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fixture.rows.get(1)).toEqual(classified());
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });
});

describe('unconfirmed persistence never creates a success audit', () => {
  it.each(['update', 'delete'] as const)('blocks a zero-match %s and leaves the row/audit untouched', async operation => {
    const fixture = source();
    fixture.skipNextWrite();
    const api = caller('admin').flocks;
    const work = operation === 'update'
      ? api.updateDailyRecord({ id: 1, flockId: 42, losses: { foundDead: 6, culls: 2 }, expectedLosses: expected(), notes: 'must not persist' })
      : api.deleteDailyRecord({ id: 1, flockId: 42 });
    await expect(work).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fixture.rows.get(1)).toEqual(classified());
    expect(fixture.writes).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });
});
