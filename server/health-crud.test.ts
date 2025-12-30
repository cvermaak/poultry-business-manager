import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

const createCaller = () => {
  return appRouter.createCaller({
    user: { id: 1, name: "Test User", email: "test@example.com", role: "admin" },
    req: {} as any,
    res: {} as any,
  });
};

describe("Vaccine CRUD Operations", () => {
  let testVaccineId: number;
  const caller = createCaller();

  it("should create a new vaccine", async () => {
    const result = await caller.health.createVaccine({
      name: "Test Vaccine",
      brand: "Test Brand",
      diseaseType: "newcastle_disease",
      vaccineType: "live",
      applicationMethod: "drinking_water",
      dosage: "1ml per bird",
      storageTemperature: "2-8°C",
      shelfLifeDays: 365,
      instructions: "Administer in drinking water",
    });

    expect(result).toHaveProperty("id");
    testVaccineId = result.id;
  });

  it("should update a vaccine", async () => {
    const result = await caller.health.updateVaccine({
      id: testVaccineId,
      name: "Updated Test Vaccine",
      brand: "Test Brand",
      diseaseType: "newcastle_disease",
      vaccineType: "live",
      applicationMethod: "drinking_water",
      dosage: "2ml per bird",
    });

    expect(result.success).toBe(true);
  });

  it("should delete a vaccine", async () => {
    const result = await caller.health.deleteVaccine({ id: testVaccineId });
    expect(result.success).toBe(true);
  });
});

describe("Stress Pack CRUD Operations", () => {
  let testStressPackId: number;
  const caller = createCaller();

  it("should create a new stress pack", async () => {
    const result = await caller.health.createStressPack({
      name: "Test Stress Pack",
      brand: "Test Brand",
      activeIngredients: "Vitamin C, Electrolytes",
      dosageStrength: "single",
      costPerKg: "150.00",
      instructions: "Mix with water",
    });

    expect(result).toHaveProperty("id");
    testStressPackId = result.id;
  });

  it("should update a stress pack", async () => {
    const result = await caller.health.updateStressPack({
      id: testStressPackId,
      name: "Updated Test Stress Pack",
      costPerKg: "175.00",
    });

    expect(result.success).toBe(true);
  });

  it("should delete a stress pack", async () => {
    const result = await caller.health.deleteStressPack({ id: testStressPackId });
    expect(result.success).toBe(true);
  });
});

describe("Reminder Template CRUD Operations", () => {
  let testTemplateId: number = 0;
  const caller = createCaller();

  it("should create a reminder template", async () => {
    const result = await caller.reminderTemplates.create({
      name: "Test Reminder",
      description: "Test reminder description",
      reminderType: "routine_task",
      priority: "medium",
      dayOffset: 7,
    });

    expect(result).toHaveProperty("id");
    testTemplateId = result.id;
  });

  it("should list reminder templates", async () => {
    const templates = await caller.reminderTemplates.list();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some(t => t.id === testTemplateId)).toBe(true);
  });

  it("should update a reminder template", async () => {
    const result = await caller.reminderTemplates.update({
      id: testTemplateId,
      name: "Updated Test Reminder",
      dayOffset: 14,
      reminderType: "routine_task",
      priority: "high",
    });

    expect(result.success).toBe(true);
  });

  it("should delete a reminder template", async () => {
    if (testTemplateId > 0) {
      const result = await caller.reminderTemplates.delete({ id: testTemplateId });
      expect(result.success).toBe(true);
    }
  });
});

describe("Reminder Template Integration with Flock", () => {
  let testHouseId: number;
  let testFlockId: number;
  let testTemplateId: number;
  const caller = createCaller();

  beforeAll(async () => {
    // Create test house
    const house = await caller.houses.create({
      name: "Test House for Templates",
      capacity: 1000,
      location: "Test Location",
    });
    testHouseId = house.id;

    // Create test template
    const template = await caller.reminderTemplates.create({
      name: "Day 7 Weight Check",
      description: "Weigh sample birds",
      reminderType: "routine_task",
      priority: "medium",
      dayOffset: 7,
    });
    testTemplateId = template.id;
  });

  it("should create flock with selected templates and generate reminders", async () => {
    const placementDate = new Date();
    placementDate.setDate(placementDate.getDate() + 1); // Tomorrow

    const result = await caller.flocks.create({
      flockNumber: "TEMPLATE-TEST-001",
      houseId: testHouseId,
      placementDate,
      initialCount: 500,
      targetSlaughterWeight: 1.7,
      growingPeriod: 42,
      weightUnit: "kg",
      vaccinationProtocol: "none",
      stressPackSchedules: [],
      selectedTemplateIds: [testTemplateId],
    });

    expect(result.success).toBe(true);
    testFlockId = result.flockId;

    // Verify reminders were generated
    const reminders = await caller.reminders.list({ flockId: testFlockId });
    const templateReminder = reminders.find(r => r.title === "Day 7 Weight Check");
    expect(templateReminder).toBeDefined();
    expect(templateReminder?.priority).toBe("medium");
  });

  it("should generate correct due date for template reminders", async () => {
    const flock = await db.getFlockById(testFlockId);
    const reminders = await caller.reminders.list({ flockId: testFlockId });
    const templateReminder = reminders.find(r => r.title === "Day 7 Weight Check");

    if (flock && templateReminder) {
      const placementDate = new Date(flock.placementDate);
      const expectedDate = new Date(placementDate);
      expectedDate.setDate(expectedDate.getDate() + 7);

      const reminderDate = new Date(templateReminder.dueDate);
      expect(reminderDate.toDateString()).toBe(expectedDate.toDateString());
    }
  });
});
