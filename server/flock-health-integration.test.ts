import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { createVaccinationSchedulesForFlock, createStressPackSchedulesForFlock, getFlockVaccinationSchedules, getFlockStressPackSchedules } from "./db-health-helpers";

describe("Flock Creation with Health Management Integration", () => {
  let testHouseId: number;

  beforeAll(async () => {
    // Create a test house
    const houseResult = await db.createHouse({
      name: `Test House Integration ${Date.now()}`,
      houseType: "open_sided",
      capacity: 10000,
      floorArea: 500,
      length: 50,
      width: 10,
      height: 3,
      breed: "ross_308",
      status: "active",
      createdBy: 1,
    });
    testHouseId = (houseResult as any)[0]?.insertId || (houseResult as any).insertId;
  });

  it("should create flock with standard vaccination protocol and stress pack schedules", async () => {
    // Step 1: Create flock
    const flockResult = await db.createFlock({
      flockNumber: `FL-INTEGRATION-${Date.now()}`,
      houseId: testHouseId,
      placementDate: new Date(),
      initialCount: 10000,
      currentCount: 10000,
      targetSlaughterWeight: "1.7",
      growingPeriod: 42,
      weightUnit: "kg",
      status: "planned",
      createdBy: 1,
    });
    const flockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;

    expect(flockId).toBeGreaterThan(0);

    // Step 2: Create vaccination schedules (simulating what happens in flock creation)
    const vaccinationSchedules = await createVaccinationSchedulesForFlock(flockId, "standard");
    expect(vaccinationSchedules.length).toBeGreaterThan(0);

    // Step 3: Create stress pack schedules
    const stressPackSchedules = await createStressPackSchedulesForFlock(flockId, [
      { stressPackId: 1, startDay: 0, endDay: 3, dosageStrength: "single" },
      { stressPackId: 2, startDay: 14, endDay: 17, dosageStrength: "double" },
    ]);
    expect(stressPackSchedules.length).toBe(2);

    // Step 4: Retrieve and verify vaccination schedules
    const retrievedVaccinations = await getFlockVaccinationSchedules(flockId);
    expect(retrievedVaccinations.length).toBeGreaterThan(0);
    expect(retrievedVaccinations[0]).toHaveProperty("vaccine");
    expect(retrievedVaccinations[0].vaccine).toHaveProperty("name");

    // Step 5: Retrieve and verify stress pack schedules
    const retrievedStressPacks = await getFlockStressPackSchedules(flockId);
    expect(retrievedStressPacks.length).toBe(2);
    expect(retrievedStressPacks[0].startDay).toBe(0);
    expect(retrievedStressPacks[0].endDay).toBe(3);
    expect(retrievedStressPacks[0].dosageStrength).toBe("single");
  });

  it("should create flock with premium protocol", async () => {
    // Create flock
    const flockResult = await db.createFlock({
      flockNumber: `FL-PREMIUM-${Date.now()}`,
      houseId: testHouseId,
      placementDate: new Date(),
      initialCount: 15000,
      currentCount: 15000,
      targetSlaughterWeight: "1.8",
      growingPeriod: 42,
      weightUnit: "kg",
      status: "planned",
      createdBy: 1,
    });
    const flockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;

    // Create premium vaccination schedules
    const vaccinationSchedules = await createVaccinationSchedulesForFlock(flockId, "premium");
    
    // Premium should have more vaccinations than standard
    expect(vaccinationSchedules.length).toBeGreaterThanOrEqual(8);

    // Verify schedules are retrievable
    const retrieved = await getFlockVaccinationSchedules(flockId);
    expect(retrieved.length).toBe(vaccinationSchedules.length);
  });

  it("should create flock without health schedules when protocol is none", async () => {
    // Create flock
    const flockResult = await db.createFlock({
      flockNumber: `FL-NO-HEALTH-${Date.now()}`,
      houseId: testHouseId,
      placementDate: new Date(),
      initialCount: 8000,
      currentCount: 8000,
      targetSlaughterWeight: "1.6",
      growingPeriod: 35,
      weightUnit: "kg",
      status: "planned",
      createdBy: 1,
    });
    const flockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;

    // Create no vaccination schedules
    const vaccinationSchedules = await createVaccinationSchedulesForFlock(flockId, "none");
    expect(vaccinationSchedules.length).toBe(0);

    // Create no stress pack schedules
    const stressPackSchedules = await createStressPackSchedulesForFlock(flockId, []);
    expect(stressPackSchedules.length).toBe(0);

    // Verify empty retrieval
    const retrievedVaccinations = await getFlockVaccinationSchedules(flockId);
    const retrievedStressPacks = await getFlockStressPackSchedules(flockId);
    
    expect(retrievedVaccinations.length).toBe(0);
    expect(retrievedStressPacks.length).toBe(0);
  });
});
