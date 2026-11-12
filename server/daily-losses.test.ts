import { describe, expect, it } from "vitest";
import {
  MAX_DAILY_LOSSES,
  describeDailyLosses,
  expectedDailyLossesSchema,
  splitDailyLossesSchema,
  type DailyLossSnapshot,
  type SplitDailyLosses,
} from "../shared/daily-losses";

describe("shared daily loss normalization (UI contract)", () => {
  it.each([0, 7, MAX_DAILY_LOSSES])("never invents a historical split for total %s", mortality => {
    expect(describeDailyLosses({ mortality, culls: null, cullReason: null })).toEqual({
      mode: "legacy", totalLosses: mortality, foundDead: null, culls: null, cullReason: null, issue: null,
    });
    expect(describeDailyLosses({ mortality }).mode).toBe("legacy");
  });

  it.each([
    { mortality: 0, culls: 0, foundDead: 0 },
    { mortality: 5, culls: 0, foundDead: 5 },
    { mortality: 5, culls: 5, foundDead: 0 },
    { mortality: 9, culls: 2, foundDead: 7 },
  ])("derives split once without subtracting culls twice: $mortality/$culls", ({ mortality, culls, foundDead }) => {
    const record = { mortality, culls, cullReason: null };
    expect(describeDailyLosses(record)).toEqual({
      mode: "split", totalLosses: mortality, foundDead, culls, cullReason: null, issue: null,
    });
    expect(record).toEqual({ mortality, culls, cullReason: null });
  });

  it("returns a trimmed optional reason for display", () => {
    expect(describeDailyLosses({ mortality: 5, culls: 1, cullReason: "  leg injury  " }).cullReason).toBe("leg injury");
    expect(describeDailyLosses({ mortality: 5, culls: 0, cullReason: "   " }).mode).toBe("invalid");
  });

  it.each([-1, 0.2, NaN, Infinity, -Infinity, MAX_DAILY_LOSSES + 1, "7", "", null, undefined])(
    "rejects an invalid stored total without coercion: %s", mortality => {
      expect(describeDailyLosses({ mortality, culls: null })).toMatchObject({
        mode: "invalid", totalLosses: null, foundDead: null, culls: null,
      });
    },
  );

  it.each([-1, 0.1, NaN, Infinity, MAX_DAILY_LOSSES + 1, "2", 6])(
    "retains valid total but makes invalid cull split unavailable: %s", culls => {
      expect(describeDailyLosses({ mortality: 5, culls })).toMatchObject({
        mode: "invalid", totalLosses: 5, foundDead: null, culls: null,
      });
    },
  );

  it.each([
    { mortality: 5, culls: 0, cullReason: "invalid zero reason" },
    { mortality: 5, culls: null, cullReason: "invalid unknown reason" },
    { mortality: 5, culls: 1, cullReason: 3 },
    { mortality: 5, culls: 1, cullReason: "x".repeat(1001) },
    { mortality: 5, culls: 1, cullReason: " " + "x".repeat(1000) + " " },
    { mortality: 5, culls: null, cullReason: "   " },
    { mortality: 5, cullReason: "   " },
  ])("flags malformed reason consistency: %j", record => {
    expect(describeDailyLosses(record).mode).toBe("invalid");
    expect(describeDailyLosses(record).issue).toBeTruthy();
  });
});

describe("shared strict split inputs and expected snapshots", () => {
  it("exports frontend-compatible pair and stored snapshot types", () => {
    const pair: SplitDailyLosses = { foundDead: 3, culls: 2, cullReason: null };
    const snapshot: DailyLossSnapshot = { mortality: 5, culls: 2, cullReason: null };
    expect(splitDailyLossesSchema.parse(pair)).toEqual(pair);
    expect(expectedDailyLossesSchema.parse(snapshot)).toEqual(snapshot);
  });

  it.each([
    { foundDead: 0, culls: 0 },
    { foundDead: MAX_DAILY_LOSSES, culls: 0 },
    { foundDead: 0, culls: MAX_DAILY_LOSSES },
    { foundDead: 1, culls: 1, cullReason: null },
    { foundDead: 1, culls: 1, cullReason: "  reason  " },
  ])("accepts valid explicit pairs: %j", losses => {
    expect(splitDailyLossesSchema.safeParse(losses).success).toBe(true);
  });

  it.each([
    {}, { foundDead: 0 }, { culls: 0 }, { foundDead: "1", culls: 1 },
    { foundDead: 1, culls: "1" }, { foundDead: -1, culls: 1 },
    { foundDead: 1, culls: -1 }, { foundDead: 0.5, culls: 0 },
    { foundDead: 0, culls: 0.5 }, { foundDead: Infinity, culls: 0 },
    { foundDead: 0, culls: NaN }, { foundDead: MAX_DAILY_LOSSES, culls: 1 },
    { foundDead: 0, culls: MAX_DAILY_LOSSES + 1 },
    { foundDead: 0, culls: 0, mortality: 0 },
    { foundDead: 0, culls: 0, cullReason: "not allowed" },
    { foundDead: 0, culls: 1, cullReason: "x".repeat(1001) },
  ])("rejects invalid, half, overflow, and unknown-field pairs: %j", losses => {
    expect(splitDailyLossesSchema.safeParse(losses).success).toBe(false);
  });

  it("trims bounded reasons, normalizes blanks, and retains omission", () => {
    expect(splitDailyLossesSchema.parse({ foundDead: 0, culls: 1, cullReason: "  reason  " }).cullReason).toBe("reason");
    expect(splitDailyLossesSchema.parse({ foundDead: 0, culls: 0, cullReason: "  " }).cullReason).toBeNull();
    expect(splitDailyLossesSchema.parse({ foundDead: 0, culls: 1 })).not.toHaveProperty("cullReason");
    expect(splitDailyLossesSchema.safeParse({ foundDead: 0, culls: 1, cullReason: " " + "x".repeat(1000) + " " }).success).toBe(true);
  });

  it.each([
    { mortality: 3 }, { mortality: 3, culls: 1 },
    { mortality: 3, culls: 4, cullReason: null },
    { mortality: 3, culls: 0, cullReason: "reason" },
    { mortality: 3, culls: null, cullReason: "reason" },
    { mortality: -1, culls: null, cullReason: null },
    { mortality: 3, culls: 1, cullReason: null, extra: true },
  ])("rejects incomplete or incoherent expected snapshots: %j", snapshot => {
    expect(expectedDailyLossesSchema.safeParse(snapshot).success).toBe(false);
  });

  it("does not normalize an expected stored reason (stale checks remain exact)", () => {
    expect(expectedDailyLossesSchema.parse({ mortality: 3, culls: 1, cullReason: " raw " }).cullReason).toBe(" raw ");
  });
});
