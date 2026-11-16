import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { z } from "zod";
import { flocks, reminders, reminderTemplates, vaccines, flockVaccinationSchedules, flockStressPackSchedules, userActivityLogs } from "../drizzle/schema";
import { getFlockPlacementDate } from "../shared/flock-placement";
import { productionDayDifference } from "../shared/production-report-dates";
import { VACCINATION_PROTOCOLS } from "./flock-health-protocol";

// Blank optional controls mean default (create) or preserve (patch). NaN is
// intentionally NOT blank: malformed numeric input still fails validation.
const blank = (value: unknown) => value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;
const optionalNumber = (schema = z.number()) => z.preprocess(blank, schema.optional()).optional();
const vaccinationSelection = z.object({ id: z.number().int().positive().optional(), vaccineId: z.number().int().positive(), scheduledDay: z.number().int().nonnegative() });
const stressSelection = z.object({ id: z.number().int().positive().optional(), stressPackId: z.number().int().positive(), startDay: z.number().int().nonnegative(), endDay: z.number().int().nonnegative(), dosageStrength: z.enum(["single", "double", "triple"]) }).refine(v => v.endDay >= v.startDay, "Stress-pack end day must follow its start day.");
const healthFields = {
  vaccinationProtocol: z.enum(["standard", "premium", "none"]).optional(),
  vaccinationSchedules: z.array(vaccinationSelection).optional(),
  stressPackSchedules: z.array(stressSelection).optional(),
  selectedTemplateIds: z.array(z.number().int().positive()).optional(),
};
export const flockCreateSchema = z.object({
  flockNumber: z.string().min(1), houseId: z.number(), placementDate: z.date(), initialCount: z.number().int().positive(),
  targetSlaughterWeight: z.preprocess(blank, z.number().positive().default(1.7)).optional().default(1.7),
  targetDeliveredWeight: optionalNumber(z.number().positive()), targetCatchingWeight: optionalNumber(z.number().positive()),
  growingPeriod: z.preprocess(blank, z.number().int().positive().default(42)).optional().default(42), weightUnit: z.enum(["grams", "kg"]).default("kg"),
  starterFeedType: z.enum(["premium", "value", "econo"]).optional(), starterFromDay: z.preprocess(blank, z.number().int().nonnegative().default(0)).optional().default(0),
  starterToDay: optionalNumber(z.number().int().nonnegative()), growerFeedType: z.enum(["premium", "value", "econo"]).optional(),
  growerFromDay: optionalNumber(z.number().int().nonnegative()), growerToDay: optionalNumber(z.number().int().nonnegative()),
  finisherFeedType: z.enum(["premium", "value", "econo"]).optional(), finisherFromDay: optionalNumber(z.number().int().nonnegative()), finisherToDay: optionalNumber(z.number().int().nonnegative()),
  notes: z.string().optional(), ...healthFields,
  vaccinationProtocol: z.enum(["standard", "premium", "none"]).default("standard"),
});
export const flockUpdateSchema = z.object({
  id: z.number(), flockNumber: z.string().min(1).optional(), houseId: z.number().optional(), placementDate: z.date().optional(), initialCount: z.number().int().positive().optional(),
  targetSlaughterWeight: optionalNumber(z.number().positive()), targetDeliveredWeight: optionalNumber(z.number().positive()), targetCatchingWeight: optionalNumber(z.number().positive()),
  growingPeriod: optionalNumber(z.number().int().positive()), weightUnit: z.enum(["grams", "kg"]).optional(),
  starterFeedType: z.string().optional(), starterFromDay: optionalNumber(z.number().int().nonnegative()), starterToDay: optionalNumber(z.number().int().nonnegative()),
  growerFeedType: z.string().optional(), growerFromDay: optionalNumber(z.number().int().nonnegative()), growerToDay: optionalNumber(z.number().int().nonnegative()),
  finisherFeedType: z.string().optional(), finisherFromDay: optionalNumber(z.number().int().nonnegative()), finisherToDay: optionalNumber(z.number().int().nonnegative()),
  notes: z.string().optional(), ...healthFields, scheduleRemovalConfirmed: z.boolean().optional(),
});
export type FlockCreateInput = z.output<typeof flockCreateSchema>;
export type FlockUpdateInput = z.output<typeof flockUpdateSchema>;
type FlockDatabase = Pick<MySql2Database<any>, "transaction">;
type Executor = Pick<MySql2Database<any>, "select" | "insert" | "update" | "delete">;
type Flock = typeof flocks.$inferSelect;
type Reminder = typeof reminders.$inferSelect;

export function placementTimestamp(value: Date | string) { return `${getFlockPlacementDate(value)} 00:00:00`; }
function relativeDate(value: Date | string, days: number) {
  const date = new Date(`${getFlockPlacementDate(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.toISOString().slice(0, 10)} 00:00:00`;
}
function basicFields(input: FlockCreateInput | FlockUpdateInput) {
  const { vaccinationProtocol: _protocol, vaccinationSchedules: _vaccinations, stressPackSchedules: _stress, selectedTemplateIds: _templates, ...raw } = input;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || key === "id" || key === "scheduleRemovalConfirmed") continue;
    patch[key] = key === "placementDate" ? placementTimestamp(value as Date)
      : ["targetSlaughterWeight", "targetDeliveredWeight", "targetCatchingWeight"].includes(key) ? String(value) : value;
  }
  return patch;
}
async function protocolSelection(tx: Executor, protocol: "standard" | "premium" | "none") {
  if (protocol === "none") return [];
  const available = await tx.select().from(vaccines);
  return VACCINATION_PROTOCOLS[protocol].flatMap(item => {
    const vaccine = available.find(v => v.diseaseType === item.diseaseType);
    return vaccine ? [{ vaccineId: vaccine.id, scheduledDay: item.day }] : [];
  });
}
function pendingHealth(row: Record<string, any>) {
  return ["scheduled", "rescheduled"].includes(row.status) && row.actualDate == null && row.administeredAt == null && row.administeredBy == null && row.quantityUsed == null && row.dosageUsed == null;
}
function pendingGenerated(row: Reminder) {
  // No provenance exists for old NULL-template automatic reminders. Preserve
  // ambiguous/manual entries rather than guessing their placement relativity.
  return row.status === "pending" && row.templateId != null && row.preTransportProtocolId == null && row.completedAt == null && row.completedBy == null;
}
function assertRemoval(confirmed?: boolean) {
  if (confirmed !== true) throw new TRPCError({ code: "BAD_REQUEST", message: "Removing reminder templates or health selections requires explicit confirmation. Reload the schedules and confirm removal." });
}
async function diffHealth(tx: Executor, table: typeof flockVaccinationSchedules | typeof flockStressPackSchedules, flockId: number, desired: Array<Record<string, any>>, confirmed?: boolean) {
  const existing = await tx.select().from(table).where(eq(table.flockId, flockId)).for("update");
  const fields = table === flockVaccinationSchedules ? ["vaccineId", "scheduledDay"] : ["stressPackId", "startDay", "endDay", "dosageStrength"];
  const product = fields[0];
  const remaining = new Map(existing.map(row => [row.id, row]));
  const eligible = (id: number) => table === flockVaccinationSchedules
    ? and(eq(table.id, id), eq(table.flockId, flockId), inArray(flockVaccinationSchedules.status, ["scheduled", "rescheduled"]), isNull(flockVaccinationSchedules.actualDate), isNull(flockVaccinationSchedules.administeredBy), isNull(flockVaccinationSchedules.dosageUsed))
    : and(eq(table.id, id), eq(table.flockId, flockId), eq(flockStressPackSchedules.status, "scheduled"), isNull(flockStressPackSchedules.administeredAt), isNull(flockStressPackSchedules.administeredBy), isNull(flockStressPackSchedules.quantityUsed));
  // Reserve all exact/explicit identities first. A changed row appearing earlier
  // in an array must not consume the ID of a later unchanged selection.
  const reserved = new Set<number>();
  const matches = desired.map(choice => {
    const row = choice.id === undefined
      ? existing.find(old => !reserved.has(old.id) && fields.every(key => (old as any)[key] === choice[key]))
      : existing.find(old => old.id === choice.id && !reserved.has(old.id));
    if (choice.id !== undefined && !row) throw new TRPCError({ code: "CONFLICT", message: "Health selection identity changed or was duplicated. Reload before saving." });
    if (row) reserved.add(row.id);
    return row;
  });
  for (let index = 0; index < desired.length; index++) {
    const choice = desired[index];
    let row = matches[index];
    if (choice.id !== undefined && (!row || (row as any)[product] !== choice[product])) throw new TRPCError({ code: "CONFLICT", message: "Health selection identity changed. Reload before saving." });
    if (!row) row = Array.from(remaining.values()).find(old => !reserved.has(old.id) && (old as any)[product] === choice[product] && pendingHealth(old));
    const data = Object.fromEntries(fields.map(key => [key, choice[key]]));
    if (row) {
      remaining.delete(row.id);
      if (fields.some(key => (row as any)[key] !== choice[key])) {
        if (!pendingHealth(row)) throw new TRPCError({ code: "BAD_REQUEST", message: "Administered/completed health history cannot be changed by ordinary flock Edit." });
        await tx.update(table).set(data).where(eligible(row.id));
      }
    } else {
      await tx.insert(table).values({ ...data, flockId, status: "scheduled" } as any);
    }
  }
  if (remaining.size) assertRemoval(confirmed);
  for (const row of Array.from(remaining.values())) {
    if (pendingHealth(row)) await tx.delete(table).where(eligible(row.id));
  }
}
function feedOffset(flock: Flock, type: string, title: string, fallback: number) {
  if (type !== "feed_transition") return fallback;
  if (title.includes("Starter") && title.includes("Grower")) return flock.starterToDay ?? flock.growerFromDay ?? fallback;
  if (title.includes("Grower") && title.includes("Finisher")) return flock.growerToDay ?? flock.finisherFromDay ?? fallback;
  return fallback;
}
async function addTemplates(tx: Executor, flock: Flock, templateIds: number[]) {
  if (!templateIds.length) return;
  const templates = await tx.select().from(reminderTemplates).where(inArray(reminderTemplates.id, templateIds));
  if (templates.length !== templateIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A selected reminder template no longer exists. Reload before saving." });
  const rows: Array<typeof reminders.$inferInsert> = [];
  for (const template of templates) {
    const add = (type: string, title: string, offset: number, description: string | null, priority: any) => {
      if (!title || !Number.isInteger(offset)) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected reminder template has an invalid schedule." });
      rows.push({ flockId: flock.id, houseId: flock.houseId, templateId: template.id, reminderType: type as Reminder["reminderType"], title, description: description || `${title} for flock ${flock.flockNumber}`, dueDate: relativeDate(flock.placementDate, feedOffset(flock, type, title, offset)), priority, status: "pending" });
    };
    if (template.isBundle && template.bundleConfig) {
      if (!Array.isArray(template.bundleConfig)) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected reminder bundle is invalid." });
      for (const category of template.bundleConfig as any[]) if (category.enabled && category.reminders) {
        for (const item of category.reminders) add(item.reminderType || category.category, item.name || item.title, item.dayOffset, item.description, item.priority);
      }
    } else add(template.reminderType, template.name, template.dayOffset, template.description, template.priority);
  }
  if (rows.length) await tx.insert(reminders).values(rows);
}
async function audit(tx: Executor, actorId: number, action: string, flockId: number, details: string) {
  await tx.insert(userActivityLogs).values({ userId: actorId, action, entityType: "flock", entityId: flockId, details });
}
export async function createFlockMutation(database: FlockDatabase, input: FlockCreateInput, actorId: number) {
  return database.transaction(async tx => {
    const data = { ...basicFields(input), currentCount: input.initialCount, status: "planned", createdBy: actorId } as typeof flocks.$inferInsert;
    const result = await tx.insert(flocks).values(data);
    const flockId = result[0].insertId;
    if (!flockId) throw new Error("Flock insertion was not confirmed.");
    const flock = { ...data, id: flockId } as Flock;
    const vaccinationChoices = input.vaccinationSchedules ?? await protocolSelection(tx, input.vaccinationProtocol);
    if (vaccinationChoices.length) await tx.insert(flockVaccinationSchedules).values(vaccinationChoices.map(({ vaccineId, scheduledDay }) => ({ flockId, vaccineId, scheduledDay, status: "scheduled" as const })));
    if (input.stressPackSchedules?.length) await tx.insert(flockStressPackSchedules).values(input.stressPackSchedules.map(({ stressPackId, startDay, endDay, dosageStrength }) => ({ flockId, stressPackId, startDay, endDay, dosageStrength, status: "scheduled" as const })));
    await addTemplates(tx, flock, Array.from(new Set(input.selectedTemplateIds ?? [])));
    await audit(tx, actorId, "create_flock", flockId, `Created flock: ${input.flockNumber}`);
    return { success: true as const, flockId };
  });
}
export async function updateFlockMutation(database: FlockDatabase, input: FlockUpdateInput, actorId: number) {
  return database.transaction(async tx => {
    const [old] = await tx.select().from(flocks).where(eq(flocks.id, input.id)).limit(1).for("update");
    if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "Flock not found." });
    const patch = basicFields(input) as Partial<typeof flocks.$inferInsert>;
    const flock = { ...old, ...patch } as Flock;
    const daysDiff = productionDayDifference(getFlockPlacementDate(old.placementDate), getFlockPlacementDate(flock.placementDate));
    const feedChanged = ["starterToDay", "growerFromDay", "growerToDay", "finisherFromDay"].some(key => (patch as any)[key] !== undefined && (patch as any)[key] !== (old as any)[key]);
    // Load failures abort this transaction; never interpret them as empty state.
    const existingReminders = await tx.select().from(reminders).where(eq(reminders.flockId, input.id)).for("update");
    if (Object.keys(patch).length) await tx.update(flocks).set(patch).where(eq(flocks.id, input.id));
    const vaccinationChoices = input.vaccinationSchedules ?? (input.vaccinationProtocol === undefined ? undefined : await protocolSelection(tx, input.vaccinationProtocol));
    if (vaccinationChoices !== undefined) await diffHealth(tx, flockVaccinationSchedules, input.id, vaccinationChoices, input.scheduleRemovalConfirmed);
    if (input.stressPackSchedules !== undefined) await diffHealth(tx, flockStressPackSchedules, input.id, input.stressPackSchedules, input.scheduleRemovalConfirmed);
    const existingTemplates = new Set(existingReminders.flatMap(row => row.templateId == null ? [] : [row.templateId]));
    const desiredTemplates = input.selectedTemplateIds === undefined ? existingTemplates : new Set(input.selectedTemplateIds);
    const removed = Array.from(existingTemplates).filter(id => !desiredTemplates.has(id));
    if (removed.length) assertRemoval(input.scheduleRemovalConfirmed);
    for (const row of existingReminders) {
      if (!pendingGenerated(row)) continue;
      const scoped = and(eq(reminders.id, row.id), eq(reminders.flockId, input.id), eq(reminders.status, "pending"), eq(reminders.templateId, row.templateId!), isNull(reminders.preTransportProtocolId), isNull(reminders.completedAt), isNull(reminders.completedBy));
      if (removed.includes(row.templateId!)) { await tx.delete(reminders).where(scoped); continue; }
      let dueDate = row.dueDate;
      if (daysDiff) {
        // Shift the logical day while preserving the recorded due-time.
        dueDate = relativeDate(row.dueDate, daysDiff).slice(0, 10) + (row.dueDate.match(/(?:T| )(\d{2}:\d{2}:\d{2})/) ? ` ${row.dueDate.match(/(?:T| )(\d{2}:\d{2}:\d{2})/)![1]}` : " 00:00:00");
      }
      if (feedChanged && row.reminderType === "feed_transition") {
        const offset = feedOffset(flock, row.reminderType, row.title, NaN);
        if (Number.isFinite(offset)) dueDate = relativeDate(flock.placementDate, offset);
      }
      // One write per eligible reminder, including simultaneous feed/date edits.
      if (dueDate !== row.dueDate) await tx.update(reminders).set({ dueDate }).where(scoped);
    }
    await addTemplates(tx, flock, Array.from(desiredTemplates).filter(id => !existingTemplates.has(id)));
    await audit(tx, actorId, "update_flock", input.id, `Updated flock: ${input.id}`);
    return { success: true as const };
  });
}
