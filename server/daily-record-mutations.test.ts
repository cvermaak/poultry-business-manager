import { describe, expect, it } from "vitest";
import {
  createDailyRecordMutation, updateDailyRecordMutation, deleteDailyRecordMutation,
} from "./daily-record-mutations";
import { createDailyTestSource, type SyntheticDailyRow } from "./daily-record-test-source";

const time = "2026-11-11 04:00:00";
const legacy = (): SyntheticDailyRow => ({ id: 1, flockId: 42, mortality: 7, culls: null, cullReason: null, notes: "original", feedConsumed: "12" });
const split = (): SyntheticDailyRow => ({ ...legacy(), culls: 2, cullReason: "leg injury" });
const expected = () => ({ mortality: 7, culls: 2, cullReason: "leg injury" });
const createInput = () => ({ flockId: 42, recordDate: time, dayNumber: 1, recordedBy: 3 });
function update(source: ReturnType<typeof createDailyTestSource>, patch: any, flockId = 42, id = 1) {
  return updateDailyRecordMutation(source as any, { ...patch, id, flockId }, time);
}

describe("guarded daily creates", () => {
  it("defaults omitted legacy mortality after branching and keeps split NULL", async () => {
    const source = createDailyTestSource();
    await createDailyRecordMutation(source as any, createInput());
    expect(source.rows.get(1)).toMatchObject({ mortality: 0, culls: null, cullReason: null });
    await createDailyRecordMutation(source as any, { ...createInput(), mortality: 9 });
    expect(source.rows.get(2)).toMatchObject({ mortality: 9, culls: null, cullReason: null });
  });

  it.each([
    { losses: { foundDead: 3, culls: 2, cullReason: "  injury  " }, mortality: 5, culls: 2, cullReason: "injury" },
    { losses: { foundDead: 0, culls: 0 }, mortality: 0, culls: 0, cullReason: null },
    { losses: { foundDead: 0, culls: 4 }, mortality: 4, culls: 4, cullReason: null },
    { losses: { foundDead: 4, culls: 0 }, mortality: 4, culls: 0, cullReason: null },
  ])("stores a backend-computed total with explicit culls: $losses", async ({ losses, mortality, culls, cullReason }) => {
    const source = createDailyTestSource();
    await createDailyRecordMutation(source as any, { ...createInput(), losses });
    expect(source.rows.get(1)).toMatchObject({ mortality, culls, cullReason });
    expect(source.rows.get(1)).not.toHaveProperty("losses");
  });

  it.each([
    { mortality: 3, losses: { foundDead: 1, culls: 2 } },
    { mortality: undefined, losses: { foundDead: 1, culls: 2 } },
    { losses: undefined }, { losses: { foundDead: 1 } },
    { losses: { culls: 1 } }, { losses: { foundDead: -1, culls: 1 } },
    { losses: { foundDead: 1.5, culls: 1 } },
    { losses: { foundDead: 2147483647, culls: 1 } },
    { mortality: -1 }, { mortality: 2147483648 }, { mortality: "3" },
    { culls: 0 }, { cullReason: null }, { foundDead: 0 },
    { expectedLosses: { mortality: 0, culls: null, cullReason: null } },
    { createdAt: time },
  ])("rejects malformed and raw-loss backdoors at the helper itself: %j", async patch => {
    const source = createDailyTestSource();
    await expect(createDailyRecordMutation(source as any, { ...createInput(), ...patch } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(source.writes).toEqual([]);
    expect(source.rows.size).toBe(0);
  });
});

describe("guarded daily updates preserve legacy and classified values", () => {
  it.each([legacy(), split(), { ...legacy(), mortality: -4 }, { ...legacy(), mortality: 0 }])(
    "allows unrelated edits while preserving every stored loss field: %j", async original => {
      const source = createDailyTestSource([original]);
      expect(await update(source, { notes: "updated", feedConsumed: "13", averageWeight: undefined })).toEqual({ success: true, flockId: 42 });
      expect(source.rows.get(1)).toEqual({ ...original, notes: "updated", feedConsumed: "13", updatedAt: time });
      expect(source.locks).toEqual(["update"]);
      expect(source.writes[0].patch).not.toHaveProperty("mortality");
      expect(source.writes[0].patch).not.toHaveProperty("culls");
      expect(source.writes[0].patch).not.toHaveProperty("cullReason");
      expect(source.writes[0].params).toEqual([1, 42]);
    },
  );

  it("permits an explicit legacy combined edit and keeps NULL split unknown", async () => {
    const source = createDailyTestSource([legacy()]);
    await update(source, { mortality: 11, notes: "correct combined total" });
    expect(source.rows.get(1)).toMatchObject({ mortality: 11, culls: null, cullReason: null });
  });

  it("accepts classified equal-total old-client fields as ignored no-ops", async () => {
    const source = createDailyTestSource([split()]);
    await update(source, { mortality: 7, notes: "old client notes" });
    expect(source.rows.get(1)).toMatchObject({ ...split(), notes: "old client notes" });
    expect(source.writes[0].patch).not.toHaveProperty("mortality");
    const before = source.writes.length;
    await update(source, { mortality: 7 });
    expect(source.writes.length).toBe(before);
  });

  it("rejects the ENTIRE old-client mutation when a classified total changes", async () => {
    const original = split();
    const source = createDailyTestSource([original]);
    await expect(update(source, { mortality: 8, notes: "must not persist", feedConsumed: "100" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(source.rows.get(1)).toEqual(original);
    expect(source.writes).toEqual([]);
  });

  it("cannot classify historical combined losses, even historical zero", async () => {
    for (const mortality of [0, 7]) {
      const original = { ...legacy(), mortality };
      const source = createDailyTestSource([original]);
      await expect(update(source, {
        losses: { foundDead: mortality, culls: 0 },
        expectedLosses: { mortality, culls: null, cullReason: null },
        notes: "must not persist",
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(source.rows.get(1)).toEqual(original);
      expect(source.writes).toEqual([]);
    }
  });

  it.each([
    { losses: { foundDead: 5, culls: 2 } },
    { expectedLosses: expected() },
    { expectedLosses: undefined },
    { losses: undefined, expectedLosses: undefined },
    { losses: { foundDead: 5 }, expectedLosses: expected() },
    { losses: { foundDead: 5, culls: 2 }, expectedLosses: { mortality: 7, culls: 2 } },
    { losses: { foundDead: 5, culls: 2 }, expectedLosses: expected(), mortality: 7 },
    { culls: null }, { culls: 0 }, { cullReason: "new reason" },
    { foundDead: 5 }, { losses: null, expectedLosses: expected() },
    { id: 5, notes: "x", updatedAt: time },
    { mortality: -1 }, { mortality: 0.5 }, { mortality: "7" },
  ])("rejects incoherent/standalone/raw patches without any read or write: %j", async patch => {
    const source = createDailyTestSource([split()]);
    await expect(update(source, patch)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(source.locks).toEqual([]);
    expect(source.writes).toEqual([]);
    expect(source.rows.get(1)).toEqual(split());
  });

  it.each([
    { losses: { foundDead: 4, culls: 3 }, cullReason: "leg injury" },
    { losses: { foundDead: 4, culls: 3, cullReason: undefined }, cullReason: "leg injury" },
    { losses: { foundDead: 4, culls: 3, cullReason: null }, cullReason: null },
    { losses: { foundDead: 4, culls: 3, cullReason: "  new reason  " }, cullReason: "new reason" },
    { losses: { foundDead: 4, culls: 3, cullReason: "   " }, cullReason: null },
    { losses: { foundDead: 7, culls: 0 }, cullReason: null },
  ])("normalizes/preserves/clears cull reason coherently: $losses", async ({ losses, cullReason }) => {
    const source = createDailyTestSource([split()]);
    await update(source, { losses, expectedLosses: expected(), notes: "updated" });
    expect(source.rows.get(1)).toMatchObject({ mortality: 7, culls: losses.culls, cullReason, notes: "updated" });
    expect(source.writes[0].params).toEqual([1, 42, 7, 2, "leg injury"]);
  });

  it("rejects nonempty zero-cull reason and out-of-range reasons without clearing old note", async () => {
    const source = createDailyTestSource([split()]);
    for (const losses of [
      { foundDead: 7, culls: 0, cullReason: "not allowed" },
      { foundDead: 4, culls: 3, cullReason: "x".repeat(1001) },
    ]) {
      await expect(update(source, { losses, expectedLosses: expected() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(source.rows.get(1)).toEqual(split());
    expect(source.writes).toEqual([]);
  });

  it.each([
    { ...expected(), mortality: 8 },
    { ...expected(), culls: 1 },
    { ...expected(), cullReason: "new reason" },
    { ...expected(), cullReason: null },
  ])("rejects stale full snapshot, including equal-total changed split/reason: %j", async expectedLosses => {
    const source = createDailyTestSource([split()]);
    await expect(update(source, { losses: { foundDead: 4, culls: 3 }, expectedLosses, notes: "do not write" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(source.rows.get(1)).toEqual(split());
    expect(source.writes).toEqual([]);
  });

  it("uses NULL-safe conditional reason and signed-INT backend sum", async () => {
    const source = createDailyTestSource([{ ...split(), cullReason: null }]);
    await update(source, {
      losses: { foundDead: 2147483646, culls: 1 },
      expectedLosses: { ...expected(), cullReason: null },
    });
    expect(source.rows.get(1)).toMatchObject({ mortality: 2147483647, culls: 1, cullReason: null });
    expect(source.writes[0].sql).toContain("`cullReason` is null");
  });
});

describe("invalid stored classified records", () => {
  it.each([
    { ...split(), mortality: -1 },
    { ...split(), culls: 8 },
    { ...split(), culls: -1 },
    { ...split(), culls: 0 },
  ])("preserves invalid losses on unrelated edits but refuses inferred reclassification: %j", async original => {
    const source = createDailyTestSource([original]);
    await update(source, { notes: "allowed unrelated edit" });
    expect(source.rows.get(1)).toMatchObject({ ...original, notes: "allowed unrelated edit" });
    await expect(update(source, { losses: { foundDead: 5, culls: 2 }, expectedLosses: expected(), notes: "do not save" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(source.rows.get(1)?.notes).toBe("allowed unrelated edit");
    expect(source.writes).toHaveLength(1);
  });
});

describe("atomic scoped daily changes", () => {
  it.each(["update", "delete"] as const)("%s rejects mismatched flock and missing ID before any writes", async operation => {
    for (const [id, flockId, code] of [[1, 99, "BAD_REQUEST"], [99, 42, "NOT_FOUND"]] as const) {
      const source = createDailyTestSource([split()]);
      const work = operation === "update"
        ? update(source, { notes: "must not write" }, flockId, id)
        : deleteDailyRecordMutation(source as any, { id, flockId });
      await expect(work).rejects.toMatchObject({ code });
      expect(source.rows.get(1)).toEqual(split());
      expect(source.writes).toEqual([]);
      expect(source.locks).toEqual(["update"]);
    }
  });

  it("deletes only the owned stored record with an ID/flock predicate", async () => {
    const source = createDailyTestSource([split(), { ...legacy(), id: 2, flockId: 99 }]);
    expect(await deleteDailyRecordMutation(source as any, { id: 1, flockId: 42 })).toEqual({ success: true, flockId: 42 });
    expect(source.rows.has(1)).toBe(false);
    expect(source.rows.has(2)).toBe(true);
    expect(source.writes[0].params).toEqual([1, 42]);
  });

  it("serializes interleaved edits: same-total second writer sees changed split/reason and conflicts with no partial note/feed write", async () => {
    const source = createDailyTestSource([split()]);
    const gate = source.pauseNextLockedRead();
    const first = update(source, {
      losses: { foundDead: 4, culls: 3, cullReason: "first writer" }, expectedLosses: expected(), notes: "first notes",
    });
    await gate.entered.promise;
    const second = update(source, {
      losses: { foundDead: 6, culls: 1 }, expectedLosses: expected(), notes: "second notes", feedConsumed: "999",
    });
    const rejected = expect(second).rejects.toMatchObject({ code: "CONFLICT" });
    await Promise.resolve();
    expect(source.writes).toEqual([]);
    gate.release.resolve();
    await first;
    await rejected;
    expect(source.rows.get(1)).toMatchObject({ mortality: 7, culls: 3, cullReason: "first writer", notes: "first notes", feedConsumed: "12" });
    expect(source.writes).toHaveLength(1);
    expect(source.locks).toEqual(["update", "update"]);
  });

  it("rolls back the entire patch on a write failure", async () => {
    const source = createDailyTestSource([split()]);
    source.failNextWrite();
    await expect(update(source, { losses: { foundDead: 4, culls: 3 }, expectedLosses: expected(), notes: "not saved" })).rejects.toThrow("Synthetic conditional write failed");
    expect(source.rows.get(1)).toEqual(split());
    expect(source.writes).toEqual([]);
  });

  it("add/edit/delete contribute recorded TOTAL losses exactly once", async () => {
    const source = createDailyTestSource([legacy()]);
    const remaining = () => 100 - [...source.rows.values()].reduce((sum, row) => sum + row.mortality, 0);
    expect(remaining()).toBe(93);
    await createDailyRecordMutation(source as any, { ...createInput(), losses: { foundDead: 3, culls: 2 } });
    expect(remaining()).toBe(88);
    await update(source, {
      losses: { foundDead: 2, culls: 1 }, expectedLosses: { mortality: 5, culls: 2, cullReason: null },
    }, 42, 2);
    expect(remaining()).toBe(90);
    await deleteDailyRecordMutation(source as any, { id: 2, flockId: 42 });
    expect(remaining()).toBe(93);
  });
});

describe('explicit persistence proof before reporting success', () => {
  it.each([
    { original: split(), patch: { losses: { foundDead: 6, culls: 2 }, expectedLosses: expected(), notes: 'must not persist' } },
    { original: legacy(), patch: { mortality: 8, notes: 'must not persist' } },
  ])('rejects a zero-match changed-loss write and rolls back the whole request', async ({ original, patch }) => {
    const source = createDailyTestSource([original]);
    source.skipNextWrite();
    await expect(update(source, patch)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(source.rows.get(1)).toEqual(original);
    expect(source.writes).toEqual([]);
  });

  it('rejects a zero-match delete without declaring or auditing success', async () => {
    const original = split();
    const source = createDailyTestSource([original]);
    source.skipNextWrite();
    await expect(deleteDailyRecordMutation(source as any, { id: 1, flockId: 42 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(source.rows.get(1)).toEqual(original);
    expect(source.writes).toEqual([]);
  });

  it('does not reject a legitimate equal-loss no-op because no row changed', async () => {
    const original = split();
    const source = createDailyTestSource([original]);
    source.skipNextWrite();
    await expect(update(source, { losses: { foundDead: 5, culls: 2 }, expectedLosses: expected() })).resolves.toEqual({ success: true, flockId: 42 });
    expect(source.rows.get(1)).toEqual(original);
  });
});
