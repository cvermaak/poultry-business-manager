import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  dailyLossCountSchema, optionalDailyLossesSchema, optionalExpectedDailyLossesSchema,
  refineDailyLossContract, MAX_CULL_REASON_LENGTH as SHARED_REASON_LIMIT,
} from "@shared/daily-losses";
import {
  buildDailyLossUpdate,
  changeDailyLossField,
  emptyDailyLossForm,
  hydrateDailyLossForm,
  MAX_CULL_REASON_LENGTH,
  MAX_DAILY_LOSSES,
  parseDailyLossCount,
  recordedLossBasedPreview,
  validateDailyLossForm,
  type DailyLossForm,
} from "./daily-loss-form";

const createForm = (foundDead: string, culls: string, cullReason = ""): DailyLossForm => ({
  ...emptyDailyLossForm(), foundDead, culls, cullReason,
});

describe("explicit daily-loss count input", () => {
  it.each(["", " ", "-1", "1.5", "1.0", "+1", "1e2", "NaN", "Infinity", "0x10", "12birds", "2147483648", "999999999999999999999"])("rejects invalid input %j without coercion", text => {
    expect(parseDailyLossCount(text)).toBeNull();
    expect(validateDailyLossForm(createForm(text, "0")).ok).toBe(false);
    expect(validateDailyLossForm(createForm("0", text)).ok).toBe(false);
  });
  it("requires both counts and starts blank", () => {
    const form = emptyDailyLossForm();
    expect(form.foundDead).toBe("");
    expect(form.culls).toBe("");
    expect(form.reasonDirty).toBe(false);
    expect(validateDailyLossForm(form).ok).toBe(false);
    expect(validateDailyLossForm(createForm("0", "")).ok).toBe(false);
    expect(validateDailyLossForm(createForm("", "0")).ok).toBe(false);
  });
  it.each(["create", "split"] as const)("uses the approved exact field wording in %s without changing limits", mode => {
    const result = validateDailyLossForm({ ...emptyDailyLossForm(), mode });
    expect(result).toMatchObject({
      ok: false,
      errors: {
        foundDead: "Enter an explicit non-negative whole number (0 is allowed)",
        culls: "Enter an explicit non-negative whole number (0 is allowed)",
      },
    });
    expect(parseDailyLossCount("2147483647")).toBe(2147483647);
    expect(parseDailyLossCount("2147483648")).toBeNull();
  });
  it("leaves the legacy combined-total message unchanged", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: null, cullReason: null });
    expect(validateDailyLossForm({ ...form, combinedTotal: "" })).toMatchObject({
      ok: false,
      errors: { combinedTotal: "Enter an explicit non-negative whole number (0 is allowed), up to 2147483647." },
    });
  });
  it.each([["0", "0"], ["3", "0"], ["0", "3"], ["2", "3"], [" 0 ", "000"]])("accepts explicit counts %s/%s", (foundDead, culls) => {
    expect(validateDailyLossForm(createForm(foundDead, culls))).toEqual({
      ok: true, totalLosses: Number(foundDead) + Number(culls),
      losses: { foundDead: Number(foundDead), culls: Number(culls), cullReason: null },
    });
  });
  it("accepts the signed INT limit but rejects combined overflow", () => {
    expect(validateDailyLossForm(createForm(String(MAX_DAILY_LOSSES), "0")).ok).toBe(true);
    expect(validateDailyLossForm(createForm("0", String(MAX_DAILY_LOSSES))).ok).toBe(true);
    expect(validateDailyLossForm(createForm(String(MAX_DAILY_LOSSES - 1), "1")).ok).toBe(true);
    expect(validateDailyLossForm(createForm(String(MAX_DAILY_LOSSES), "1"))).toMatchObject({ ok: false, issue: "Total losses must not exceed 2147483647." });
  });
  it("trims and bounds optional reasons only for positive culls", () => {
    expect(validateDailyLossForm(createForm("0", "1", "  welfare observation  "))).toMatchObject({ losses: { cullReason: "welfare observation" } });
    expect(validateDailyLossForm(createForm("0", "1", "   "))).toMatchObject({ losses: { cullReason: null } });
    expect(validateDailyLossForm(createForm("0", "1", "a".repeat(MAX_CULL_REASON_LENGTH))).ok).toBe(true);
    expect(validateDailyLossForm(createForm("0", "1", "a".repeat(MAX_CULL_REASON_LENGTH + 1))).ok).toBe(false);
    expect(validateDailyLossForm(createForm("0", "0", "a".repeat(MAX_CULL_REASON_LENGTH + 1)))).toMatchObject({ ok: true, losses: { cullReason: null } });
  });
  it("clears reason state when culls become explicit zero", () => {
    const form = changeDailyLossField(createForm("3", "2", "Previous note"), "culls", "0");
    expect(form.cullReason).toBe("");
    expect(form.culls).toBe("0");
    expect(changeDailyLossField(form, "culls", "").culls).toBe("");
  });
});

describe("loss edit hydration and payload ownership", () => {
  it.each([0, 4])("keeps legacy NULL total %s unknown rather than inferred split zero", mortality => {
    const form = hydrateDailyLossForm({ mortality, culls: null, cullReason: null });
    expect(form).toMatchObject({ mode: "legacy", combinedTotal: String(mortality), foundDead: "", culls: "", snapshot: { mortality, culls: null, cullReason: null } });
    expect(buildDailyLossUpdate(form)).toEqual({ ok: true, fields: {} });
  });
  it("preserves omitted legacy culls as unknown", () => {
    expect(hydrateDailyLossForm({ mortality: 0 }).mode).toBe("legacy");
  });
  it("legacy edits remain total-only without classified-loss or snapshot fields", () => {
    const form = hydrateDailyLossForm({ mortality: 4, culls: null, cullReason: null });
    const update = buildDailyLossUpdate(changeDailyLossField(form, "combinedTotal", "5"));
    expect(update).toEqual({ ok: true, fields: { mortality: 5 } });
    expect(update.ok && Object.hasOwn(update.fields, "losses")).toBe(false);
    expect(update.ok && Object.hasOwn(update.fields, "expectedLosses")).toBe(false);
    expect(buildDailyLossUpdate(changeDailyLossField(form, "combinedTotal", "")).ok).toBe(false);
  });
  it.each([{ mortality: 0, culls: 0 }, { mortality: 3, culls: 0 }, { mortality: 3, culls: 3 }, { mortality: 5, culls: 2 }])("hydrates validated split %j including explicit zero", record => {
    const form = hydrateDailyLossForm({ ...record, cullReason: null });
    expect(form).toMatchObject({ mode: "split", foundDead: String(record.mortality - record.culls), culls: String(record.culls), snapshot: { ...record, cullReason: null } });
    expect(form.reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(form)).toEqual({ ok: true, fields: {} });
  });
  it("count reclassification with unchanged total is still a split change", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "note" });
    const update = buildDailyLossUpdate({ ...form, foundDead: "2", culls: "3" });
    expect(update).toEqual({ ok: true, fields: { losses: { foundDead: 2, culls: 3 }, expectedLosses: { mortality: 5, culls: 2, cullReason: "note" } } });
    expect(update.ok && Object.hasOwn(update.fields, "mortality")).toBe(false);
  });
  it("reason-only changes and clearing carry the original expected snapshot", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "  original reason  " });
    expect(buildDailyLossUpdate(form)).toEqual({ ok: true, fields: {} });
    expect(buildDailyLossUpdate(changeDailyLossField(form, "cullReason", "new reason"))).toMatchObject({
      fields: { losses: { foundDead: 3, culls: 2, cullReason: "new reason" }, expectedLosses: { mortality: 5, culls: 2, cullReason: "  original reason  " } },
    });
    expect(buildDailyLossUpdate(changeDailyLossField(form, "cullReason", ""))).toMatchObject({ fields: { losses: { cullReason: null } } });
  });
  it.each(["  note  ", "   ", "", null])("omits an untouched raw reason %j on count-only changes", cullReason => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason });
    expect(form.reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(form)).toEqual({ ok: true, fields: {} });
    const changed = changeDailyLossField(form, "foundDead", "4");
    expect(changed.reasonDirty).toBe(false);
    expect(validateDailyLossForm(changed)).toEqual({ ok: true, totalLosses: 6, losses: { foundDead: 4, culls: 2 } });
    expect(buildDailyLossUpdate(changed)).toEqual({
      ok: true, fields: { losses: { foundDead: 4, culls: 2 }, expectedLosses: { mortality: 5, culls: 2, cullReason } },
    });
  });
  it.each(["   ", ""])("explicitly clears raw non-NULL blank reason %j even with unchanged counts", cullReason => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason });
    expect(form.cullReason).toBe("");
    const cleared = changeDailyLossField(form, "cullReason", "");
    expect(cleared.reasonDirty).toBe(true);
    expect(buildDailyLossUpdate(cleared)).toEqual({
      ok: true, fields: { losses: { foundDead: 3, culls: 2, cullReason: null }, expectedLosses: { mortality: 5, culls: 2, cullReason } },
    });
  });
  it("ignores semantically unchanged count spelling and normalized edits to a canonical reason", () => {
    const original = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "note" });
    const counts = changeDailyLossField(changeDailyLossField(original, "foundDead", " 003 "), "culls", "02");
    expect(counts.reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(counts)).toEqual({ ok: true, fields: {} });
    const reason = changeDailyLossField(counts, "cullReason", "  note  ");
    expect(reason.reasonDirty).toBe(true);
    expect(buildDailyLossUpdate(reason)).toEqual({ ok: true, fields: {} });
    expect(buildDailyLossUpdate(changeDailyLossField(reason, "foundDead", "4"))).toMatchObject({ fields: { losses: { foundDead: 4, culls: 2, cullReason: "note" } } });
  });
  it("compares explicit normalized reason edits with the original raw reason, not old display text", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "  note  " });
    expect(buildDailyLossUpdate(changeDailyLossField(form, "cullReason", "  note  "))).toEqual({
      ok: true, fields: { losses: { foundDead: 3, culls: 2, cullReason: "note" }, expectedLosses: { mortality: 5, culls: 2, cullReason: "  note  " } },
    });
  });
  it("treats an explicit blank edit of a NULL reason as a semantic no-op", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: null });
    expect(buildDailyLossUpdate(changeDailyLossField(form, "cullReason", "   "))).toEqual({ ok: true, fields: {} });
  });
  it("trims and bounds newly edited reasons while preserving the raw snapshot", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "  note  " });
    const edited = changeDailyLossField(form, "cullReason", `  ${"a".repeat(MAX_CULL_REASON_LENGTH)}  `);
    expect(buildDailyLossUpdate(edited)).toMatchObject({ fields: { losses: { cullReason: "a".repeat(MAX_CULL_REASON_LENGTH) }, expectedLosses: { cullReason: "  note  " } } });
    expect(buildDailyLossUpdate(changeDailyLossField(form, "cullReason", "a".repeat(MAX_CULL_REASON_LENGTH + 1))).ok).toBe(false);
  });
  it("zero-cull edits clear reason and preserve original snapshot", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "note" });
    expect(buildDailyLossUpdate(changeDailyLossField(form, "culls", "0"))).toEqual({
      ok: true, fields: { losses: { foundDead: 3, culls: 0, cullReason: null }, expectedLosses: { mortality: 5, culls: 2, cullReason: "note" } },
    });
  });
  it.each(["  note  ", "   ", null])("zero culls always clear reason %j without a reason edit", cullReason => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason });
    const zero = changeDailyLossField(form, "culls", "0");
    expect(zero.reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(zero)).toEqual({
      ok: true, fields: { losses: { foundDead: 3, culls: 0, cullReason: null }, expectedLosses: { mortality: 5, culls: 2, cullReason } },
    });
  });
  it("does not infer a reason edit from zero-cull display clearing when counts are restored", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "  note  " });
    const restored = changeDailyLossField(changeDailyLossField(form, "culls", "0"), "culls", "2");
    expect(restored.cullReason).toBe("");
    expect(restored.reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(restored)).toEqual({ ok: true, fields: {} });
  });
  it("unrelated split edits omit all loss properties rather than sending equal counts", () => {
    const result = buildDailyLossUpdate(hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "note" }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Unexpected error");
    const payload = { id: 1, flockId: 2, feedConsumed: 3, notes: "feed edit", ...result.fields };
    expect(Object.keys(payload)).toEqual(["id", "flockId", "feedConsumed", "notes"]);
  });
  it.each([
    { mortality: 2, culls: 3 }, { mortality: -1, culls: 0 }, { mortality: 1.5, culls: 0 }, { mortality: null, culls: null }, { mortality: 3, culls: -1 },
    { mortality: 5, culls: 0, cullReason: "   " }, { mortality: 5, culls: null, cullReason: "   " },
    { mortality: 5, culls: 2, cullReason: ` ${"a".repeat(MAX_CULL_REASON_LENGTH)} ` },
  ])("disables invalid stored losses %j but permits unrelated payloads", record => {
    const form = hydrateDailyLossForm(record);
    expect(form.mode).toBe("invalid");
    expect(form.foundDead).toBe("");
    expect(form.culls).toBe("");
    expect(form.snapshot).toBeNull();
    expect(validateDailyLossForm(form).ok).toBe(false);
    expect(changeDailyLossField(form, "foundDead", "0")).toBe(form);
    expect(buildDailyLossUpdate(form)).toEqual({ ok: true, fields: {} });
  });
  it("does not replace an open edit's expected snapshot after a newer row arrives", () => {
    const openForm = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "original" });
    const newerForm = hydrateDailyLossForm({ mortality: 8, culls: 4, cullReason: "another user" });
    const update = buildDailyLossUpdate({ ...openForm, foundDead: "4" });
    expect(update).toMatchObject({ fields: { expectedLosses: { mortality: 5, culls: 2, cullReason: "original" } } });
    expect(newerForm.snapshot).not.toEqual(openForm.snapshot);
    expect(openForm.snapshot).toEqual({ mortality: 5, culls: 2, cullReason: "original" });
  });
  it("resets add state completely after an edit or cancellation", () => {
    const edited = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "old" });
    expect(edited.mode).toBe("split");
    const reset = emptyDailyLossForm();
    expect(reset).toEqual({ mode: "create", foundDead: "", culls: "", combinedTotal: "", cullReason: "", reasonDirty: false, snapshot: null, issue: null });
    reset.foundDead = "1";
    expect(emptyDailyLossForm().foundDead).toBe("");
  });
  it("does not produce an edit payload from a new form", () => {
    expect(buildDailyLossUpdate(createForm("0", "0")).ok).toBe(false);
  });
});

describe("frontend payload parity with the shared additive loss contract", () => {
  const contract = (operation: "create" | "update") => z.object({
    mortality: dailyLossCountSchema.optional(),
    losses: optionalDailyLossesSchema,
    expectedLosses: optionalExpectedDailyLossesSchema,
  }).strict().superRefine((value, context) => refineDailyLossContract(value, context, operation));
  it("uses the shared reason bound and does not block an unchanged long valid record note", () => {
    expect(MAX_CULL_REASON_LENGTH).toBe(SHARED_REASON_LIMIT);
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "a".repeat(SHARED_REASON_LIMIT) });
    expect(form.mode).toBe("split");
    expect(buildDailyLossUpdate(form)).toEqual({ ok: true, fields: {} });
  });
  it("create supplies losses without mortality or expectedLosses", () => {
    const result = validateDailyLossForm(createForm("3", "2", " welfare "));
    if (!result.ok) throw new Error("Expected valid pair");
    expect(contract("create").safeParse({ losses: result.losses }).success).toBe(true);
  });
  it("split count/reason updates supply a coherent pair and original snapshot", () => {
    const result = buildDailyLossUpdate(changeDailyLossField(hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "original" }), "cullReason", "replacement"));
    if (!result.ok) throw new Error("Expected valid update");
    expect(contract("update").safeParse(result.fields).success).toBe(true);
  });
  it.each(["  note  ", "   "])("count-only omission and explicit clear of raw reason %j satisfy the additive contract", cullReason => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason });
    for (const edited of [changeDailyLossField(form, "foundDead", "4"), changeDailyLossField(form, "cullReason", "")]) {
      const result = buildDailyLossUpdate(edited);
      if (!result.ok) throw new Error("Expected valid update");
      const parsed = contract("update").parse(result.fields);
      expect(parsed.expectedLosses).toEqual({ mortality: 5, culls: 2, cullReason });
      expect(Object.hasOwn(parsed.losses!, "cullReason")).toBe(edited.reasonDirty);
    }
  });
  it("legacy total-only updates satisfy the contract without inventing a classified split", () => {
    const result = buildDailyLossUpdate({ ...hydrateDailyLossForm({ mortality: 5, culls: null, cullReason: null }), combinedTotal: "6" });
    if (!result.ok) throw new Error("Expected valid update");
    expect(contract("update").safeParse(result.fields).success).toBe(true);
    expect(Object.keys(result.fields)).toEqual(["mortality"]);
  });
  it.each([
    { mortality: 0, culls: null, cullReason: null },
    { mortality: 5, culls: 2, cullReason: "note" },
    { mortality: 2, culls: 3, cullReason: null },
  ])("unrelated edit satisfies the contract with no loss properties for %j", record => {
    const result = buildDailyLossUpdate(hydrateDailyLossForm(record));
    if (!result.ok) throw new Error("Expected valid unrelated update");
    expect(result.fields).toEqual({});
    expect(contract("update").safeParse(result.fields).success).toBe(true);
  });
});

describe("recorded-loss-based previews restore and replace combined losses once", () => {
  it("subtracts the combined add total once, not culls again", () => {
    const valid = validateDailyLossForm(createForm("3", "2"));
    if (!valid.ok) throw new Error("Expected valid form");
    expect(recordedLossBasedPreview(100, valid.totalLosses)).toBe(100 - (3 + 2));
  });
  it("restores the old total before subtracting edit replacement", () => {
    expect(recordedLossBasedPreview(100, 8, 5)).toBe(100 + 5 - 8);
    expect(recordedLossBasedPreview(100, 5, 5)).toBe(100);
    expect(recordedLossBasedPreview(100, 0, 5)).toBe(100 + 5);
  });
  it("uses the same replacement rule for legacy unknown splits", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: null, cullReason: null });
    const valid = validateDailyLossForm({ ...form, combinedTotal: "8" });
    expect(valid.ok && recordedLossBasedPreview(100, valid.totalLosses, form.snapshot!.mortality)).toBe(100 + 5 - 8);
  });
  it.each([[100, null, 0], [100, 0, null], [NaN, 0, 0], [100, -1, 0], [100, 1.5, 0], [100, MAX_DAILY_LOSSES + 1, 0]])("does not invent counts for invalid preview arguments %j", (current, replacement, previous) => {
    expect(recordedLossBasedPreview(current!, replacement, previous)).toBeNull();
  });
});
