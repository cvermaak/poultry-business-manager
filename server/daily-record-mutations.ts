import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { z } from "zod";
import { flockDailyRecords } from "../drizzle/schema";
import {
  dailyLossCountSchema,
  describeDailyLosses,
  optionalDailyLossesSchema,
  optionalExpectedDailyLossesSchema,
  refineDailyLossContract,
} from "../shared/daily-losses";

// A database instance is supplied by db.ts. No runtime import of db.ts and no
// implicit connection creation: these mutations are independently mockable.
type DailyDatabase = Pick<MySql2Database<any>, "insert" | "transaction">;

const lossFields = {
  mortality: dailyLossCountSchema.optional(),
  losses: optionalDailyLossesSchema,
  expectedLosses: optionalExpectedDailyLossesSchema,
};
const storedDataFields = {
  feedConsumed: z.string().nullable().optional(),
  feedType: z.enum(["starter", "grower", "finisher"]).nullable().optional(),
  waterConsumed: z.string().nullable().optional(),
  averageWeight: z.string().nullable().optional(),
  weightSamples: z.string().nullable().optional(),
  temperature: z.string().nullable().optional(),
  humidity: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
};

const createSchema = z.object({
  flockId: z.number(),
  recordDate: z.string(),
  dayNumber: z.number().int(),
  recordedBy: z.number().nullable().optional(),
  ...storedDataFields,
  ...lossFields,
}).strict().superRefine((value, ctx) => refineDailyLossContract(value, ctx, "create"));

const updateSchema = z.object({
  id: z.number(),
  flockId: z.number(),
  ...storedDataFields,
  ...lossFields,
}).strict().superRefine((value, ctx) => refineDailyLossContract(value, ctx, "update"));
const deleteSchema = z.object({ id: z.number(), flockId: z.number() }).strict();

export type DailyRecordCreateInput = z.input<typeof createSchema>;
export type DailyRecordUpdatePatch = Omit<z.input<typeof updateSchema>, "id" | "flockId">;

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join(" "), cause: parsed.error });
  }
  return parsed.data;
}

export async function createDailyRecordMutation(database: DailyDatabase, input: DailyRecordCreateInput) {
  const { losses, expectedLosses: _expected, mortality, ...data } = parseInput(createSchema, input);
  // Apply the legacy default only AFTER branching, never alongside a new pair.
  const lossData = losses === undefined
    ? { mortality: mortality ?? 0, culls: null, cullReason: null }
    : {
      mortality: losses.foundDead + losses.culls,
      culls: losses.culls,
      cullReason: losses.culls === 0 ? null : losses.cullReason ?? null,
    };
  return await database.insert(flockDailyRecords).values({ ...data, ...lossData });
}

export async function updateDailyRecordMutation(
  database: DailyDatabase,
  input: DailyRecordUpdatePatch & { id: number; flockId: number },
  updatedAt: string,
) {
  const { id, flockId, losses, expectedLosses, mortality, ...data } = parseInput(updateSchema, input);
  return await database.transaction(async tx => {
    // ID first, then verify its ACTUAL stored flock before any write or audit.
    const [stored] = await tx.select().from(flockDailyRecords)
      .where(eq(flockDailyRecords.id, id)).limit(1).for("update");
    if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Daily record not found." });
    if (stored.flockId !== flockId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Daily record does not belong to the requested flock." });
    }

    const patch: Partial<typeof flockDailyRecords.$inferInsert> = {};
    // Undefined fields are not writes; unrelated edits must preserve old data,
    // including malformed historical totals and NULL split fields.
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) Object.assign(patch, { [key]: value });
    }
    let condition = and(eq(flockDailyRecords.id, stored.id), eq(flockDailyRecords.flockId, stored.flockId));

    if (losses !== undefined) {
      if (stored.culls == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Historical combined losses cannot be classified by ordinary Edit." });
      }
      if (describeDailyLosses(stored).mode !== "split") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Stored losses are invalid; ordinary Edit cannot infer a split." });
      }
      // Validation guarantees a coherent pair and complete expected snapshot.
      if (!expectedLosses || expectedLosses.mortality !== stored.mortality ||
          expectedLosses.culls !== stored.culls || expectedLosses.cullReason !== (stored.cullReason ?? null)) {
        throw new TRPCError({ code: "CONFLICT", message: "Daily losses changed since this record was loaded. Reload before saving." });
      }
      patch.mortality = losses.foundDead + losses.culls;
      patch.culls = losses.culls;
      patch.cullReason = losses.culls === 0
        ? null
        : losses.cullReason === undefined ? stored.cullReason : losses.cullReason;
      // Defense-in-depth scoped conditional write under the same row lock.
      condition = and(condition,
        eq(flockDailyRecords.mortality, expectedLosses.mortality),
        eq(flockDailyRecords.culls, expectedLosses.culls!),
        expectedLosses.cullReason === null ? isNull(flockDailyRecords.cullReason) : eq(flockDailyRecords.cullReason, expectedLosses.cullReason),
      );
    } else if (mortality !== undefined) {
      if (stored.culls != null) {
        if (mortality !== stored.mortality) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Classified losses require a found-dead/cull pair and expected snapshot; combined mortality cannot change the total." });
        }
        // Older clients may echo an equal total on unrelated edits. Ignore it;
        // do not declassify or silently rewrite split/reason values.
      } else {
        patch.mortality = mortality;
      }
    }
    if (Object.keys(patch).length > 0) {
      await tx.update(flockDailyRecords).set({ ...patch, updatedAt }).where(condition);
      const lossChanged = (['mortality', 'culls', 'cullReason'] as const)
        .some(key => Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== stored[key]);
      if (lossChanged) {
        // A real no-op may return zero affected rows. For changed losses, prove
        // the complete intended tuple under the SAME lock instead of trusting
        // driver-specific matched/changed row semantics or a zero-match write.
        const [persisted] = await tx.select().from(flockDailyRecords)
          .where(eq(flockDailyRecords.id, stored.id)).limit(1).for('update');
        const expectedTotal = patch.mortality ?? stored.mortality;
        const expectedCulls = Object.prototype.hasOwnProperty.call(patch, 'culls') ? patch.culls : stored.culls;
        const expectedReason = Object.prototype.hasOwnProperty.call(patch, 'cullReason') ? patch.cullReason : stored.cullReason;
        if (!persisted || persisted.flockId !== stored.flockId || persisted.mortality !== expectedTotal ||
            persisted.culls !== expectedCulls || (persisted.cullReason ?? null) !== (expectedReason ?? null)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Daily loss changes were not persisted. Reload before saving.' });
        }
      }
    }
    return { success: true as const, flockId: stored.flockId };
  });
}

export async function deleteDailyRecordMutation(database: DailyDatabase, input: { id: number; flockId: number }) {
  const { id, flockId } = parseInput(deleteSchema, input);
  return await database.transaction(async tx => {
    const [stored] = await tx.select().from(flockDailyRecords)
      .where(eq(flockDailyRecords.id, id)).limit(1).for("update");
    if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Daily record not found." });
    if (stored.flockId !== flockId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Daily record does not belong to the requested flock." });
    }
    const result = await tx.delete(flockDailyRecords).where(and(
      eq(flockDailyRecords.id, stored.id), eq(flockDailyRecords.flockId, stored.flockId),
    ));
    const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number };
    if (header?.affectedRows !== 1) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Daily record deletion was not confirmed. Reload before trying again.' });
    }
    return { success: true as const, flockId: stored.flockId };
  });
}
