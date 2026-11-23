import { describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { flocks } from "../drizzle/schema";
import { createFlockTestSource } from "./flock-mutation-test-source";
import { createFlockMutation, updateFlockMutation, flockCreateSchema, flockUpdateSchema } from "./flock-mutations";
import { feedAllocationFields, parseFeedAllocation, allocationPayload, blankFeedAllocationForm } from "../shared/flock-feed-allocation";

// Fail closed: these tests only inject staged, in-memory data into real mutations.
vi.mock("mysql2/promise", () => ({ createPool: () => { throw new Error("Native DB forbidden"); }, createConnection: () => { throw new Error("Native DB forbidden"); } }));
const createInput = (extra: Record<string, unknown> = {}) => ({ flockNumber: "Allocation-synthetic", houseId: 2, placementDate: new Date("2026-11-01T00:00:00Z"), initialCount: 100, vaccinationProtocol: "none", ...extra });
const plan = { starterAllocationKgPerBird: "0.123", growerAllocationKgPerBird: "2.345", finisherAllocationKgPerBird: "0.000" };
function initial() {
  return {
    flocks: [{ id: 1, flockNumber: "Allocation-synthetic", houseId: 2, placementDate: "2026-11-01 00:00:00", initialCount: 100, currentCount: 100, notes: "old", starterToDay: 10, growerFromDay: 12, growerToDay: 24, finisherFromDay: 27, ...plan }],
    reminders: [{ id: 101, flockId: 1, templateId: 21, reminderType: "routine_task", title: "Relative", status: "pending", dueDate: "2026-11-05 08:30:00" }],
    reminder_templates: [{ id: 21, name: "Routine", reminderType: "routine_task", dayOffset: 4, priority: "medium" }, { id: 22, name: "New", reminderType: "milestone", dayOffset: 8, priority: "high" }],
    vaccines: [], flock_vaccination_schedules: [], flock_stress_pack_schedules: [], user_activity_logs: [],
  };
}
const storedAllocations = (row: any) => Object.fromEntries(feedAllocationFields.map(field => [field, row[field]]));

describe("Strict optional per-flock allocation schema (existing decimal(6,3))", () => {
  it("uses actual nullable columns and leaves historical SQL defaults unchanged", () => {
    const columns = getTableColumns(flocks);
    expect(feedAllocationFields.map(field => columns[field].getSQLType())).toEqual(["decimal(6,3)", "decimal(6,3)", "decimal(6,3)"]);
    expect(feedAllocationFields.map(field => columns[field].notNull)).toEqual([false, false, false]);
    expect(feedAllocationFields.map(field => columns[field].default)).toEqual(["0.900", "1.750", "0.350"]);
  });
  it("old callers may omit all allocation controls without required-blank failure", () => {
    expect(flockCreateSchema.safeParse(createInput()).success).toBe(true);
    expect(flockUpdateSchema.parse({ id: 1 })).toEqual({ id: 1 });
  });
  for (const field of feedAllocationFields) {
    it.each([[0, "0.000"], [0.001, "0.001"], [999.999, "999.999"], ["0", "0.000"], ["1.2", "1.200"], ["12.34", "12.340"], ["003.210", "3.210"], [".5", "0.500"], [" 0.123 ", "0.123"], ["999.999", "999.999"]] as const)(`${field} accepts %j without rounding`, (value, expected) => {
      expect(flockCreateSchema.parse(createInput({ [field]: value }))[field]).toBe(expected);
      expect(flockUpdateSchema.parse({ id: 1, [field]: value })[field]).toBe(expected);
    });
    it.each([NaN, Infinity, -Infinity, -0.001, 1000, 0.0001, 0.1 + 0.2, "-1", "1000.000", "0.1234", "1.0000", "invalid", "1e2", "0x10", "1,2", "Infinity", true, {}])(`${field} rejects invalid %j in both schemas`, value => {
      expect(flockCreateSchema.safeParse(createInput({ [field]: value })).success).toBe(false);
      expect(flockUpdateSchema.safeParse({ id: 1, [field]: value }).success).toBe(false);
      expect(() => parseFeedAllocation(value)).toThrow();
    });
    it.each([undefined, null, "", "  "])(`${field} blank %j is unspecified create / preserve update`, value => {
      expect(flockCreateSchema.parse(createInput({ [field]: value }))[field]).toBe(value === undefined ? undefined : null);
      expect(flockUpdateSchema.parse({ id: 1, [field]: value })[field]).toBeUndefined();
    });
  }
});

describe("Actual create/update mutations with staged in-memory transactions", () => {
  it.each([{}, allocationPayload(blankFeedAllocationForm(), "create"), { starterAllocationKgPerBird: "", growerAllocationKgPerBird: "  ", finisherAllocationKgPerBird: undefined }])("create writes explicit NULLs, never the static SQL plan, for %j", async patch => {
    const source = createFlockTestSource();
    await createFlockMutation(source as any, flockCreateSchema.parse(createInput(patch)), 9001);
    expect(storedAllocations(source.data.flocks[0])).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: null, finisherAllocationKgPerBird: null });
    expect(source.commits).toBe(1); expect(source.rollbacks).toBe(0);
    expect(source.data.user_activity_logs).toHaveLength(1);
  });
  it("create persists the operator plan as exact decimal strings, zero included, independent of grams mode", async () => {
    const source = createFlockTestSource();
    await createFlockMutation(source as any, flockCreateSchema.parse(createInput({ starterAllocationKgPerBird: 0.123, growerAllocationKgPerBird: "2.345", finisherAllocationKgPerBird: 0, weightUnit: "grams", targetDeliveredWeight: 2.5 })), 9001);
    expect(storedAllocations(source.data.flocks[0])).toEqual(plan);
    expect(source.data.flocks[0]).toMatchObject({ weightUnit: "grams", targetDeliveredWeight: "2.5", status: "planned", currentCount: 100, createdBy: 9001, placementDate: "2026-11-01 00:00:00" });
  });
  it("create partial plan leaves other phases explicitly unspecified", async () => {
    const source = createFlockTestSource();
    await createFlockMutation(source as any, flockCreateSchema.parse(createInput({ growerAllocationKgPerBird: "8.765" })), 9001);
    expect(storedAllocations(source.data.flocks[0])).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: "8.765", finisherAllocationKgPerBird: null });
  });
  it.each([undefined, null, "", "   "])("blank/omitted update %j preserves all columns and omits them from SQL patch", async value => {
    const source = createFlockTestSource(initial());
    const allocations = Object.fromEntries(feedAllocationFields.map(field => [field, value]));
    await updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 1, notes: "new", ...allocations }), 9001);
    expect(storedAllocations(source.data.flocks[0])).toEqual(plan);
    const patch = source.attempts.find(attempt => attempt.operation === "update" && attempt.table === "flocks")!.patch;
    for (const field of feedAllocationFields) expect(patch).not.toHaveProperty(field);
    expect(patch).toEqual({ notes: "new" });
    expect(source.data.flocks[0]).toMatchObject({ growerFromDay: 12, finisherFromDay: 27 });
  });
  it("allocation-only all-blank update does not write any flock patch", async () => {
    const source = createFlockTestSource(initial());
    await updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 1, ...Object.fromEntries(feedAllocationFields.map(field => [field, null])) }), 9001);
    expect(source.attempts.filter(attempt => attempt.operation === "update" && attempt.table === "flocks")).toEqual([]);
    expect(storedAllocations(source.data.flocks[0])).toEqual(plan);
  });
  it("explicit operator update writes only provided phases; zero is not absence", async () => {
    const source = createFlockTestSource(initial());
    const before = structuredClone(source.data.reminders);
    await updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 1, starterAllocationKgPerBird: 0, growerAllocationKgPerBird: "999.999", finisherAllocationKgPerBird: "", weightUnit: "grams" }), 9001);
    expect(storedAllocations(source.data.flocks[0])).toEqual({ starterAllocationKgPerBird: "0.000", growerAllocationKgPerBird: "999.999", finisherAllocationKgPerBird: "0.000" });
    const patch = source.attempts.find(attempt => attempt.operation === "update" && attempt.table === "flocks")!.patch;
    expect(patch).not.toHaveProperty("finisherAllocationKgPerBird");
    expect(source.data.reminders).toEqual(before);
  });
  it("preserves legacy stored values instead of applying a new inferred plan", async () => {
    const data = initial(); Object.assign(data.flocks[0], { starterAllocationKgPerBird: "0.900", growerAllocationKgPerBird: "1.750", finisherAllocationKgPerBird: "0.350" });
    const source = createFlockTestSource(data);
    await updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 1, notes: "only" }), 9001);
    expect(storedAllocations(source.data.flocks[0])).toEqual({ starterAllocationKgPerBird: "0.900", growerAllocationKgPerBird: "1.750", finisherAllocationKgPerBird: "0.350" });
  });
  it("malformed schema inputs fail before the transaction starts", () => {
    const source = createFlockTestSource(initial());
    expect(() => flockCreateSchema.parse(createInput({ starterAllocationKgPerBird: "0.1234" }))).toThrow();
    expect(() => flockUpdateSchema.parse({ id: 1, growerAllocationKgPerBird: NaN })).toThrow();
    expect(source.attempts).toEqual([]); expect(source.commits).toBe(0);
  });
  it.each(["flock_vaccination_schedules", "flock_stress_pack_schedules", "reminders", "user_activity_logs"])("create allocations roll back with existing %s insertion failure", async table => {
    const source = createFlockTestSource(initial()); const before = structuredClone(source.data); source.fail("insert", table);
    await expect(createFlockMutation(source as any, flockCreateSchema.parse(createInput({ ...plan, vaccinationSchedules: [{ vaccineId: 9, scheduledDay: 1 }], stressPackSchedules: [{ stressPackId: 11, startDay: 1, endDay: 3, dosageStrength: "single" }], selectedTemplateIds: [22] })), 9001)).rejects.toThrow("Synthetic insert failure");
    expect(source.data).toEqual(before); expect(source.rollbacks).toBe(1); expect(source.commits).toBe(0);
  });
  it.each([{ operation: "select", table: "reminders" }, { operation: "update", table: "reminders" }, { operation: "insert", table: "flock_stress_pack_schedules" }, { operation: "insert", table: "user_activity_logs" }])("update plan rolls back on existing %j failure", async ({ operation, table }) => {
    const source = createFlockTestSource(initial()); const before = structuredClone(source.data); source.fail(operation, table);
    await expect(updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 1, starterAllocationKgPerBird: "9.876", placementDate: new Date("2026-11-03T00:00:00Z"), stressPackSchedules: [{ stressPackId: 11, startDay: 1, endDay: 3, dosageStrength: "single" }] }), 9001)).rejects.toThrow("Synthetic");
    expect(source.data).toEqual(before); expect(source.rollbacks).toBe(1); expect(source.commits).toBe(0);
  });
  it("existing unconfirmed reminder removal rolls back allocation changes atomically", async () => {
    const source = createFlockTestSource(initial()); const before = structuredClone(source.data);
    await expect(updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 1, finisherAllocationKgPerBird: "8.765", selectedTemplateIds: [] }), 9001)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(source.data).toEqual(before); expect(source.rollbacks).toBe(1);
  });
  it("missing flock still fails without creating a record", async () => {
    const source = createFlockTestSource(initial());
    await expect(updateFlockMutation(source as any, flockUpdateSchema.parse({ id: 404, starterAllocationKgPerBird: 0 }), 9001)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(source.data.flocks).toHaveLength(1); expect(source.commits).toBe(0);
  });
});
