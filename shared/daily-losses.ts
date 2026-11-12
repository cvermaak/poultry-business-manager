import { z } from "zod";

/** mortality remains the TOTAL of found-dead birds and on-farm culls. */
export const MAX_DAILY_LOSSES = 2_147_483_647;
export const MAX_CULL_REASON_LENGTH = 1_000;

export type SplitDailyLosses = {
  foundDead: number;
  culls: number;
  cullReason?: string | null;
};

export type DailyLossSnapshot = {
  mortality: number;
  culls: number | null;
  cullReason: string | null;
};

export const dailyLossCountSchema = z.number().int().min(0).max(MAX_DAILY_LOSSES);
export const cullReasonSchema = z.string().trim().max(MAX_CULL_REASON_LENGTH)
  .transform(value => value || null).nullable();

export const splitDailyLossesSchema = z.object({
  foundDead: dailyLossCountSchema,
  culls: dailyLossCountSchema,
  cullReason: cullReasonSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.foundDead + value.culls > MAX_DAILY_LOSSES) {
    ctx.addIssue({ code: "custom", path: ["foundDead"], message: "Total losses exceed the signed INT storage limit." });
  }
  if (value.culls === 0 && value.cullReason != null) {
    ctx.addIssue({ code: "custom", path: ["cullReason"], message: "A culling reason requires positive culls." });
  }
});

export const optionalDailyLossesSchema = splitDailyLossesSchema.optional();

// A snapshot is the stored value, not a newly normalized note. Never trim a
// snapshot: doing so would conceal a concurrent change in the stored reason.
export const expectedDailyLossesSchema = z.object({
  mortality: dailyLossCountSchema,
  culls: dailyLossCountSchema.nullable(),
  cullReason: z.string().max(MAX_CULL_REASON_LENGTH).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.culls !== null && value.culls > value.mortality) {
    ctx.addIssue({ code: "custom", path: ["culls"], message: "Culls cannot exceed total losses." });
  }
  if ((value.culls === null || value.culls === 0) && value.cullReason !== null) {
    ctx.addIssue({ code: "custom", path: ["cullReason"], message: "A culling reason requires positive, separately recorded culls." });
  }
});
export const optionalExpectedDailyLossesSchema = expectedDailyLossesSchema.optional();

export type DailyLossDescription = {
  mode: "legacy" | "split" | "invalid";
  totalLosses: number | null;
  foundDead: number | null;
  culls: number | null;
  cullReason: string | null;
  issue: string | null;
};

/** No coercion, invented historical split, clamping, or double subtraction. */
export function describeDailyLosses(record: {
  mortality: unknown;
  culls?: unknown;
  cullReason?: unknown;
}): DailyLossDescription {
  const total = dailyLossCountSchema.safeParse(record.mortality);
  const reason = record.cullReason == null
    ? { success: true as const, data: null }
    : z.string().max(MAX_CULL_REASON_LENGTH).safeParse(record.cullReason);
  const base = {
    totalLosses: total.success ? total.data : null,
    foundDead: null,
    culls: null,
    cullReason: reason.success ? reason.data?.trim() || null : null,
  };
  const invalid = (issue: string): DailyLossDescription => ({ ...base, mode: "invalid", issue });
  if (!total.success) return invalid("Stored total losses are not a non-negative whole number within the signed INT storage limit.");
  if (!reason.success) return invalid("Stored culling reason is invalid or exceeds 1000 characters.");
  if (record.culls == null) {
    if (reason.data !== null) return invalid("A culling reason exists without a recorded cull split.");
    return { ...base, mode: "legacy", issue: null };
  }
  const culls = dailyLossCountSchema.safeParse(record.culls);
  if (!culls.success) return invalid("Stored culls are not a non-negative whole number within the signed INT storage limit.");
  if (culls.data > total.data) return invalid("Stored culls exceed total losses; the split is unavailable.");
  if (culls.data === 0 && reason.data !== null) return invalid("A culling reason exists with zero culls.");
  return {
    mode: "split",
    totalLosses: total.data,
    foundDead: total.data - culls.data,
    culls: culls.data,
    cullReason: reason.data?.trim() || null,
    issue: null,
  };
}

export type DailyLossContract = {
  mortality?: number;
  losses?: SplitDailyLosses;
  expectedLosses?: DailyLossSnapshot;
};

/** Shared by API parsing AND guarded database entry points. */
export function refineDailyLossContract(
  value: DailyLossContract,
  ctx: z.RefinementCtx,
  operation: "create" | "update",
) {
  const has = (key: keyof DailyLossContract) => Object.prototype.hasOwnProperty.call(value, key);
  if (has("losses") && has("mortality")) {
    ctx.addIssue({ code: "custom", path: ["losses"], message: "Do not mix combined mortality and separately captured losses." });
  }
  if (has("losses") && value.losses === undefined) {
    ctx.addIssue({ code: "custom", path: ["losses"], message: "Losses must contain an explicit found-dead and cull pair." });
  }
  if (operation === "update") {
    if (has("expectedLosses") && value.expectedLosses === undefined) {
      ctx.addIssue({ code: "custom", path: ["expectedLosses"], message: "Expected losses must contain the complete stored loss snapshot." });
    }
    if (has("losses") !== has("expectedLosses") || (value.losses !== undefined) !== (value.expectedLosses !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["expectedLosses"], message: "Classified loss edits require both losses and the expected stored loss snapshot." });
    }
  } else if (has("expectedLosses")) {
    ctx.addIssue({ code: "custom", path: ["expectedLosses"], message: "A create request cannot include an expected loss snapshot." });
  }
}
