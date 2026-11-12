import {
  describeDailyLosses,
  MAX_DAILY_LOSSES,
  MAX_CULL_REASON_LENGTH,
  type DailyLossSnapshot,
  type SplitDailyLosses,
} from "@shared/daily-losses";

export { MAX_DAILY_LOSSES, MAX_CULL_REASON_LENGTH };

export type DailyLossForm = {
  mode: "create" | "split" | "legacy" | "invalid";
  foundDead: string;
  culls: string;
  combinedTotal: string;
  cullReason: string;
  reasonDirty: boolean;
  snapshot: DailyLossSnapshot | null;
  issue: string | null;
};

export type DailyLossField = "foundDead" | "culls" | "combinedTotal" | "cullReason";
export type LossValidation =
  | { ok: true; totalLosses: number; losses: SplitDailyLosses | null }
  | { ok: false; issue: string; errors: Partial<Record<DailyLossField, string>> };

// Blank means unrecorded. An operator must explicitly enter zero.
export function emptyDailyLossForm(): DailyLossForm {
  return {
    mode: "create", foundDead: "", culls: "", combinedTotal: "", cullReason: "",
    reasonDirty: false, snapshot: null, issue: null,
  };
}

export function parseDailyLossCount(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return Number.isSafeInteger(count) && count >= 0 && count <= MAX_DAILY_LOSSES ? count : null;
}

export function changeDailyLossField(form: DailyLossForm, field: DailyLossField, value: string): DailyLossForm {
  if (form.mode === "invalid") return form;
  return {
    ...form,
    [field]: value,
    ...(field === "cullReason" ? { reasonDirty: true } : {}),
    // Zero culls cannot carry a reason, including one from a previous edit.
    ...(field === "culls" && parseDailyLossCount(value) === 0 ? { cullReason: "" } : {}),
  };
}

export function hydrateDailyLossForm(record: {
  mortality: unknown; culls?: unknown; cullReason?: unknown;
}): DailyLossForm {
  const description = describeDailyLosses(record);
  const form = emptyDailyLossForm();
  if (description.mode === "invalid" || description.totalLosses === null) {
    return {
      ...form, mode: "invalid", issue: description.issue || "Stored daily losses are invalid. Review is required before editing losses.",
      combinedTotal: description.totalLosses === null ? "" : String(description.totalLosses),
    };
  }
  // Keep the original reason verbatim in the concurrency snapshot; never use
  // refreshed query data to replace the snapshot of the row opened for editing.
  const snapshot: DailyLossSnapshot = {
    mortality: description.totalLosses,
    culls: description.culls,
    cullReason: typeof record.cullReason === "string" ? record.cullReason : null,
  };
  if (description.mode === "legacy") {
    return { ...form, mode: "legacy", combinedTotal: String(description.totalLosses), snapshot };
  }
  return {
    ...form, mode: "split", foundDead: String(description.foundDead),
    culls: String(description.culls), cullReason: description.cullReason || "", snapshot,
  };
}

export function validateDailyLossForm(form: DailyLossForm): LossValidation {
  if (form.mode === "invalid") {
    return { ok: false, issue: form.issue || "Stored daily losses need review.", errors: {} };
  }
  if (form.mode === "legacy") {
    const totalLosses = parseDailyLossCount(form.combinedTotal);
    return totalLosses === null
      ? { ok: false, issue: "Combined losses must be an explicit valid whole number.", errors: { combinedTotal: "Enter an explicit non-negative whole number (0 is allowed), up to 2147483647." } }
      : { ok: true, totalLosses, losses: null };
  }
  const message = "Enter an explicit non-negative whole number (0 is allowed)";
  const foundDead = parseDailyLossCount(form.foundDead);
  const culls = parseDailyLossCount(form.culls);
  const errors: Partial<Record<DailyLossField, string>> = {};
  if (foundDead === null) errors.foundDead = message;
  if (culls === null) errors.culls = message;
  if (foundDead === null || culls === null) {
    return { ok: false, issue: "Both Found dead and Culls require explicit valid whole numbers.", errors };
  }
  const totalLosses = foundDead + culls;
  if (totalLosses > MAX_DAILY_LOSSES) {
    return { ok: false, issue: "Total losses must not exceed 2147483647.", errors: { foundDead: "The combined count exceeds the storage limit.", culls: "The combined count exceeds the storage limit." } };
  }
  // Display text is normalized, but an untouched edit must preserve the raw
  // stored reason. Only create, explicit reason edits, or zero culls own it.
  const includeReason = form.mode === "create" || form.reasonDirty || culls === 0;
  const reason = culls > 0 && includeReason ? form.cullReason.trim() : "";
  if (reason.length > MAX_CULL_REASON_LENGTH) {
    return { ok: false, issue: `Culling reason must be ${MAX_CULL_REASON_LENGTH} characters or fewer.`, errors: { cullReason: `Maximum ${MAX_CULL_REASON_LENGTH} characters.` } };
  }
  return { ok: true, totalLosses, losses: { foundDead, culls, ...(includeReason ? { cullReason: reason || null } : {}) } };
}

export type DailyLossUpdateFields = {
  losses?: SplitDailyLosses;
  expectedLosses?: DailyLossSnapshot;
  mortality?: number;
};
export type DailyLossUpdate =
  | { ok: true; fields: DailyLossUpdateFields }
  | { ok: false; issue: string };

export function buildDailyLossUpdate(form: DailyLossForm): DailyLossUpdate {
  // Invalid stored data is read-only, but must not block feed/notes/weight edits.
  if (form.mode === "invalid") return { ok: true, fields: {} };
  if (!form.snapshot || form.mode === "create") return { ok: false, issue: "Reopen the record before editing its losses." };
  const validated = validateDailyLossForm(form);
  if (!validated.ok) return { ok: false, issue: validated.issue };
  if (form.mode === "legacy") {
    return {
      ok: true,
      // Legacy remains total-only. expectedLosses is paired with split losses
      // in the additive API contract, not sent with top-level mortality.
      fields: validated.totalLosses === form.snapshot.mortality ? {} : {
        mortality: validated.totalLosses,
      },
    };
  }
  const losses = validated.losses!;
  // Compare an intentional normalized replacement with the ORIGINAL raw
  // snapshot, not its display normalization (which can conceal a real edit).
  const reasonChanged = (form.reasonDirty || losses.culls === 0)
    && losses.cullReason !== form.snapshot.cullReason;
  const changed = validated.totalLosses !== form.snapshot.mortality
    || losses.culls !== form.snapshot.culls || reasonChanged;
  return {
    ok: true,
    fields: changed ? { losses, expectedLosses: { ...form.snapshot } } : {},
  };
}

// Ordinary helpers do NOT deduct harvest removals: this is not verified stock.
// Edit replacement restores the old combined contribution, then deducts once.
export function recordedLossBasedPreview(
  currentCount: number, replacementTotal: number | null, previousTotal: number | null = 0,
): number | null {
  if (!Number.isFinite(currentCount) || replacementTotal === null || previousTotal === null) return null;
  if (!Number.isInteger(replacementTotal) || replacementTotal < 0 || replacementTotal > MAX_DAILY_LOSSES
    || !Number.isInteger(previousTotal) || previousTotal < 0 || previousTotal > MAX_DAILY_LOSSES) return null;
  return currentCount + previousTotal - replacementTotal;
}
