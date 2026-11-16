import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlockTestSource } from "./flock-mutation-test-source";
import { getFlockAgeDays } from "../shared/flock-placement";
const state = vi.hoisted(() => ({ source: undefined as any, db: {} as Record<string, any>, allowed: true }));
vi.mock("mysql2/promise", () => ({ createPool: () => { throw new Error("Native DB forbidden"); }, createConnection: () => { throw new Error("Native DB forbidden"); } }));
vi.mock("./business-permission-service", () => ({
  canReadFinancialData: async () => state.allowed,
  authorizeBusinessAction: async () => undefined,
  getBusinessStoredActor: async () => ({ id: 9001, role: "admin", isActive: 1 }),
  getBusinessPermissionService: () => ({ authorize: async () => undefined }), businessPermissionServiceErrorCode: () => undefined,
}));
vi.mock("./supplier-permission-service", () => ({ authorizeSupplierAction: async () => undefined, getSupplierPermissionService: () => ({ authorize: async () => undefined }) }));
vi.mock("./db", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  Array.from(source.matchAll(/export (?:async )?function (\w+)/g)).forEach(match => { state.db[match[1]] = vi.fn(() => { throw new Error(`Global helper forbidden: ${match[1]}`); }); });
  const mutations = await import("./flock-mutations");
  state.db.createFlockAtomic = vi.fn((input, actor) => mutations.createFlockMutation(state.source, input, actor));
  state.db.updateFlockAtomic = vi.fn((input, actor) => mutations.updateFlockMutation(state.source, input, actor));
  state.db.getDb = vi.fn(async () => { throw new Error("Global getDb forbidden in transaction regressions"); });
  return state.db;
});
import { appRouter } from "./routers";
const caller = (user: any = { id: 9001, role: "admin", isActive: 1, openId: "synthetic" }) => appRouter.createCaller({ user, req: { headers: {} }, res: {} } as any);
const createInput = (extra: any = {}) => ({ flockNumber: "Synthetic-flock", houseId: 2, placementDate: new Date("2026-11-01T00:00:00Z"), initialCount: 100, vaccinationProtocol: "none" as const, ...extra });
const vaccination = (extra: any = {}) => ({ id: 201, flockId: 1, vaccineId: 9, scheduledDay: 7, status: "scheduled", actualDate: null, administeredBy: null, dosageUsed: null, ...extra });
const stress = (extra: any = {}) => ({ id: 301, flockId: 1, stressPackId: 11, startDay: 1, endDay: 3, dosageStrength: "single", status: "scheduled", administeredAt: null, administeredBy: null, quantityUsed: null, ...extra });
function initial() {
  return {
    flocks: [{ id: 1, flockNumber: "Synthetic", houseId: 2, placementDate: "2026-11-01 00:00:00", initialCount: 100, currentCount: 100, starterToDay: 10, growerToDay: 20, notes: "old" }],
    reminders: [
      { id: 101, flockId: 1, templateId: null, status: "pending", title: "Custom fixed", dueDate: "2026-11-05 09:00:00", reminderType: "routine_task" },
      { id: 102, flockId: 1, templateId: 21, status: "completed", title: "Completed", dueDate: "2026-11-05 10:00:00", completedAt: "2026-11-05 11:00:00", completedBy: 9001 },
      { id: 103, flockId: 1, templateId: 21, status: "pending", title: "Relative", dueDate: "2026-11-05 08:30:00", reminderType: "routine_task" },
      { id: 104, flockId: 1, templateId: 21, status: "pending", title: "Feed Transition: Starter → Grower", dueDate: "2026-11-11 00:00:00", reminderType: "feed_transition" },
      { id: 105, flockId: 1, templateId: 21, preTransportProtocolId: 5, status: "pending", title: "Protocol owned", dueDate: "2026-11-05 10:00:00" },
      { id: 106, flockId: 1, templateId: 21, status: "dismissed", title: "Dismissed", dueDate: "2026-11-05 10:00:00" },
    ],
    flock_vaccination_schedules: [vaccination(), vaccination({ id: 202, scheduledDay: 14, status: "completed", actualDate: "2026-11-15 10:00:00", administeredBy: 9001 })],
    flock_stress_pack_schedules: [stress(), stress({ id: 302, startDay: 4, endDay: 5, status: "completed", administeredAt: "2026-11-05 10:00:00", administeredBy: 9001, notes: "History" })],
    reminder_templates: [{ id: 21, name: "Routine", reminderType: "routine_task", dayOffset: 7, priority: "medium" }, { id: 22, name: "New", reminderType: "milestone", dayOffset: 8, priority: "high" }],
    vaccines: [{ id: 9, diseaseType: "newcastle_disease" }], user_activity_logs: [],
  };
}
beforeEach(() => { vi.clearAllMocks(); state.source = createFlockTestSource(initial()); state.allowed = true; });
describe("Atomic flock repair — actual router and injected transaction executor", () => {
  it("accepts blank notes and optional controls, using declared defaults without NaN", async () => {
    await caller().flocks.create(createInput({ notes: "", growingPeriod: "", targetDeliveredWeight: "", targetCatchingWeight: null, starterToDay: "", growerFromDay: "", starterFromDay: "" }));
    expect(state.source.data.flocks[1]).toMatchObject({ notes: "", growingPeriod: 42, starterFromDay: 0, targetSlaughterWeight: "1.7", placementDate: "2026-11-01 00:00:00" });
    expect(state.source.data.flocks[1]).not.toHaveProperty("targetDeliveredWeight");
    expect(state.source.data.user_activity_logs).toHaveLength(1);
  });
  it.each(["growingPeriod", "starterToDay", "growerFromDay", "targetDeliveredWeight"])("rejects malformed NaN %s before a transaction", async key => {
    await expect(caller().flocks.create(createInput({ [key]: NaN }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.source.attempts).toEqual([]);
  });
  it.each([{ flockNumber: "" }, { initialCount: 0 }, { initialCount: 1.5 }, { placementDate: new Date(NaN) }])("retains required create validation: %j", async patch => {
    await expect(caller().flocks.create(createInput(patch))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.source.attempts).toEqual([]);
  });
  it.each(["flock_vaccination_schedules", "flock_stress_pack_schedules", "reminders", "user_activity_logs"])("rolls back all create writes on %s insertion failure", async table => {
    const before = structuredClone(state.source.data); state.source.fail("insert", table);
    await expect(caller().flocks.create(createInput({ vaccinationSchedules: [{ vaccineId: 9, scheduledDay: 1 }], stressPackSchedules: [{ stressPackId: 11, startDay: 1, endDay: 3, dosageStrength: "single" }], selectedTemplateIds: [22] }))).rejects.toThrow("Synthetic insert failure");
    expect(state.source.data).toEqual(before); expect(state.source.rollbacks).toBe(1); expect(state.source.commits).toBe(0);
  });
  it("creates selected health and bundle/template reminders plus audit in one commit", async () => {
    await caller().flocks.create(createInput({ vaccinationSchedules: [{ vaccineId: 9, scheduledDay: 1 }], stressPackSchedules: [{ stressPackId: 11, startDay: 0, endDay: 2, dosageStrength: "single" }], selectedTemplateIds: [22] }));
    expect(state.source.commits).toBe(1); expect(state.source.data.reminders.at(-1)).toMatchObject({ dueDate: "2026-11-09 00:00:00", templateId: 22 });
    expect(state.db.getDb).not.toHaveBeenCalled(); expect(state.db.logUserActivity).not.toHaveBeenCalled();
  });
  it("explicit empty vaccinations suppresses legacy protocol fallback at creation", async () => {
    await caller().flocks.create(createInput({ vaccinationProtocol: "standard", vaccinationSchedules: [] }));
    expect(state.source.data.flock_vaccination_schedules).toHaveLength(2);
  });
  it("omitted selections/protocol preserve all IDs/custom/completed/administered history", async () => {
    const before = structuredClone(state.source.data);
    await caller().flocks.update({ id: 1, notes: "basic only" });
    for (const table of ["reminders", "flock_vaccination_schedules", "flock_stress_pack_schedules"]) expect(state.source.data[table]).toEqual(before[table]);
    expect(state.source.data.flocks[0].notes).toBe("basic only"); expect(state.source.data.user_activity_logs).toHaveLength(1);
  });
  it("unchanged supplied arrays preserve IDs, pending and administration/history fields", async () => {
    const before = structuredClone(state.source.data);
    await caller().flocks.update({ id: 1, vaccinationSchedules: before.flock_vaccination_schedules.map(({ vaccineId, scheduledDay }: any) => ({ vaccineId, scheduledDay })), stressPackSchedules: before.flock_stress_pack_schedules.map(({ stressPackId, startDay, endDay, dosageStrength }: any) => ({ stressPackId, startDay, endDay, dosageStrength })), selectedTemplateIds: [21] });
    for (const table of ["reminders", "flock_vaccination_schedules", "flock_stress_pack_schedules"]) expect(state.source.data[table]).toEqual(before[table]);
    expect(state.source.attempts.filter((v: any) => v.operation === "delete")).toEqual([]);
  });
  it.each([{ selectedTemplateIds: [] }, { vaccinationSchedules: [] }, { stressPackSchedules: [] }, { vaccinationProtocol: "none" }])("rejects unconfirmed selection removal atomically: %j", async patch => {
    const before = structuredClone(state.source.data);
    await expect(caller().flocks.update({ id: 1, notes: "must roll back", ...patch } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.source.data).toEqual(before);
  });
  it("confirmed removal deletes only pending generated/unadministered selections", async () => {
    await caller().flocks.update({ id: 1, selectedTemplateIds: [], vaccinationSchedules: [], stressPackSchedules: [], scheduleRemovalConfirmed: true });
    expect(state.source.data.reminders.map((v: any) => v.id)).toEqual([101, 102, 105, 106]);
    expect(state.source.data.flock_vaccination_schedules.map((v: any) => v.id)).toEqual([202]);
    expect(state.source.data.flock_stress_pack_schedules.map((v: any) => v.id)).toEqual([302]);
    expect(state.source.data.flock_stress_pack_schedules[0]).toMatchObject({ administeredBy: 9001, notes: "History" });
  });
  it("placement shift touches each eligible generated reminder once, preserving custom/protocol/completed dates", async () => {
    const before = structuredClone(state.source.data.reminders);
    await caller().flocks.update({ id: 1, placementDate: new Date("2026-11-03T00:00:00Z"), starterToDay: 12 });
    expect(state.source.data.flocks[0].placementDate).toBe("2026-11-03 00:00:00");
    expect(state.source.data.reminders.find((v: any) => v.id === 103).dueDate).toBe("2026-11-07 08:30:00");
    expect(state.source.data.reminders.find((v: any) => v.id === 104).dueDate).toBe("2026-11-15 00:00:00");
    for (const id of [101, 102, 105, 106]) expect(state.source.data.reminders.find((v: any) => v.id === id)).toEqual(before.find((v: any) => v.id === id));
    expect(state.source.attempts.filter((v: any) => v.operation === "update" && v.table === "reminders")).toHaveLength(2);
    expect(state.db.updateFeedTransitionReminderDates).not.toHaveBeenCalled();
  });
  it.each([{ operation: "select", table: "reminders" }, { operation: "update", table: "reminders" }, { operation: "insert", table: "user_activity_logs" }, { operation: "insert", table: "flock_stress_pack_schedules" }])("rolls back flock and dependent update on %j failure", async ({ operation, table }) => {
    const before = structuredClone(state.source.data); state.source.fail(operation, table);
    await expect(caller().flocks.update({ id: 1, notes: "roll back", placementDate: new Date("2026-11-02T00:00:00Z"), stressPackSchedules: [{ stressPackId: 12, startDay: 1, endDay: 2, dosageStrength: "single" }], scheduleRemovalConfirmed: true })).rejects.toThrow("Synthetic");
    expect(state.source.data).toEqual(before); expect(state.source.rollbacks).toBe(1);
  });
  it("changed pending schedule updates in place without recreating the unchanged administered row", async () => {
    await caller().flocks.update({ id: 1, stressPackSchedules: [{ id: 301, stressPackId: 11, startDay: 2, endDay: 3, dosageStrength: "double" }, { id: 302, stressPackId: 11, startDay: 4, endDay: 5, dosageStrength: "single" }] });
    expect(state.source.data.flock_stress_pack_schedules[0]).toMatchObject({ id: 301, startDay: 2, dosageStrength: "double" });
    expect(state.source.data.flock_stress_pack_schedules[1]).toMatchObject({ id: 302, administeredBy: 9001, notes: "History" });
  });
  it("reordered changed selections cannot consume a later unchanged pending identity", async () => {
    state.source.data.flock_stress_pack_schedules = [stress(), stress({ id: 303, startDay: 4, endDay: 5 })];
    await caller().flocks.update({ id: 1, stressPackSchedules: [{ stressPackId: 11, startDay: 6, endDay: 7, dosageStrength: "double" }, { stressPackId: 11, startDay: 1, endDay: 3, dosageStrength: "single" }] });
    expect(state.source.data.flock_stress_pack_schedules[0]).toMatchObject({ id: 301, startDay: 1, endDay: 3, dosageStrength: "single" });
    expect(state.source.data.flock_stress_pack_schedules[1]).toMatchObject({ id: 303, startDay: 6, endDay: 7, dosageStrength: "double" });
  });
  it("negative placement shift is applied once and a repeated identical save does not shift again", async () => {
    const patch = { id: 1, placementDate: new Date("2026-10-31T00:00:00Z") };
    await caller().flocks.update(patch);
    const shifted = structuredClone(state.source.data.reminders);
    expect(shifted.find((v: any) => v.id === 103).dueDate).toBe("2026-11-04 08:30:00");
    state.source.attempts = [];
    await caller().flocks.update(patch);
    expect(state.source.data.reminders).toEqual(shifted);
    expect(state.source.attempts.filter((v: any) => v.operation === "update" && v.table === "reminders")).toEqual([]);
  });
  it("refuses ordinary edit of administered health history even with removal confirmation", async () => {
    const before = structuredClone(state.source.data);
    await expect(caller().flocks.update({ id: 1, stressPackSchedules: [{ id: 302, stressPackId: 11, startDay: 9, endDay: 10, dosageStrength: "single" }], scheduleRemovalConfirmed: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.source.data).toEqual(before);
  });
  it("adds only newly selected templates and keeps unchanged pending IDs", async () => {
    await caller().flocks.update({ id: 1, selectedTemplateIds: [21, 22] });
    expect(state.source.data.reminders.map((v: any) => v.id)).toEqual([101, 102, 103, 104, 105, 106, 107]);
    expect(state.source.data.reminders.at(-1)).toMatchObject({ templateId: 22 });
  });
  it("blank update optional weights/days preserve stored fields while blank notes can clear", async () => {
    await caller().flocks.update({ id: 1, notes: "", growingPeriod: "", starterToDay: "", targetDeliveredWeight: null } as any);
    expect(state.source.data.flocks[0]).toMatchObject({ starterToDay: 10, notes: "" });
  });
  it("uses Day 0 and company calendar across the early SAST day boundary", () => {
    expect(getFlockAgeDays("2026-11-01 00:00:00", new Date("2026-10-31T22:30:00Z"), "Africa/Johannesburg")).toBe(0);
    expect(getFlockAgeDays("2026-11-01 00:00:00", new Date("2026-11-01T22:30:00Z"), "Africa/Johannesburg")).toBe(1);
  });
  it("does not bypass protected auth middleware", async () => {
    await expect(caller(null).flocks.update({ id: 1, notes: "forbidden" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(state.source.attempts).toEqual([]);
  });
  it("propagates health schedule load failure rather than returning an empty selection", async () => {
    await expect(caller().flocks.getStressPackSchedules({ flockId: 1 })).rejects.toThrow("Global getDb forbidden");
  });
  it("unavailable database is an explicit stress/vaccination schedule load error", async () => {
    state.db.getDb.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(caller().flocks.getStressPackSchedules({ flockId: 1 })).rejects.toThrow("health schedules could not be loaded");
    await expect(caller().flocks.getVaccinationSchedules({ flockId: 1 })).rejects.toThrow("health schedules could not be loaded");
  });
});
