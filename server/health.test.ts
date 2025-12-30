import { describe, it, expect, beforeAll } from "vitest";
import { createVaccinationSchedulesForFlock, createStressPackSchedulesForFlock, getFlockVaccinationSchedules, getFlockStressPackSchedules } from "./db-health-helpers";
import * as db from "./db";

describe("Health Management", () => {
  let testFlockId: number;
  let testHouseId: number;

  beforeAll(async () => {
    // Create a test house
    const houseResult = await db.createHouse({
      name: `Test House Health ${Date.now()}`,
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

    // Create a test flock
    const flockResult = await db.createFlock({
      flockNumber: `FL-HEALTH-TEST-${Date.now()}`,
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
    testFlockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;
  });

  describe("Vaccination Schedules", () => {
    it("should create standard vaccination protocol schedules", async () => {
      const schedules = await createVaccinationSchedulesForFlock(testFlockId, "standard");
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBeGreaterThan(0);
      
      // Standard protocol should include ND, IB, and Gumboro
      const diseaseTypes = schedules.map((s: any) => s.vaccineId);
      expect(diseaseTypes.length).toBeGreaterThanOrEqual(6); // At least 6 vaccinations
    });

    it("should create premium vaccination protocol schedules", async () => {
      // Create another test flock for premium protocol
      const flockResult = await db.createFlock({
        flockNumber: `FL-PREMIUM-TEST-${Date.now()}`,
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
      const premiumFlockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;

      const schedules = await createVaccinationSchedulesForFlock(premiumFlockId, "premium");
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBeGreaterThan(0);
      
      // Premium protocol should have more vaccinations than standard
      expect(schedules.length).toBeGreaterThanOrEqual(8);
    });

    it("should not create schedules for 'none' protocol", async () => {
      // Create another test flock for no protocol
      const flockResult = await db.createFlock({
        flockNumber: `FL-NONE-TEST-${Date.now()}`,
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
      const noneFlockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;

      const schedules = await createVaccinationSchedulesForFlock(noneFlockId, "none");
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBe(0);
    });

    it("should retrieve vaccination schedules with vaccine details", async () => {
      const schedules = await getFlockVaccinationSchedules(testFlockId);
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBeGreaterThan(0);
      
      // Check that vaccine details are included
      const firstSchedule = schedules[0];
      expect(firstSchedule).toHaveProperty("vaccine");
      expect(firstSchedule.vaccine).toBeDefined();
      expect(firstSchedule.vaccine).toHaveProperty("name");
      expect(firstSchedule.vaccine).toHaveProperty("diseaseType");
    });
  });

  describe("Stress Pack Schedules", () => {
    it("should create stress pack schedules", async () => {
      const stressPackSchedules = [
        { stressPackId: 1, startDay: 0, endDay: 3, dosageStrength: "single" as const },
        { stressPackId: 2, startDay: 14, endDay: 17, dosageStrength: "double" as const },
      ];

      const schedules = await createStressPackSchedulesForFlock(testFlockId, stressPackSchedules);
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBe(2);
      
      // Verify first schedule
      expect(schedules[0]).toMatchObject({
        flockId: testFlockId,
        stressPackId: 1,
        startDay: 0,
        endDay: 3,
        dosageStrength: "single",
        status: "scheduled",
      });
    });

    it("should handle empty stress pack schedules", async () => {
      // Create another test flock
      const flockResult = await db.createFlock({
        flockNumber: `FL-NO-STRESS-TEST-${Date.now()}`,
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
      const noStressFlockId = (flockResult as any)[0]?.insertId || (flockResult as any).insertId;

      const schedules = await createStressPackSchedulesForFlock(noStressFlockId, []);
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBe(0);
    });

    it("should retrieve stress pack schedules", async () => {
      const schedules = await getFlockStressPackSchedules(testFlockId);
      
      expect(schedules).toBeDefined();
      expect(schedules.length).toBeGreaterThan(0);
      
      // Verify schedule structure
      const firstSchedule = schedules[0];
      expect(firstSchedule).toHaveProperty("flockId");
      expect(firstSchedule).toHaveProperty("stressPackId");
      expect(firstSchedule).toHaveProperty("startDay");
      expect(firstSchedule).toHaveProperty("endDay");
      expect(firstSchedule).toHaveProperty("dosageStrength");
      expect(firstSchedule).toHaveProperty("status");
    });
  });

  describe("Vaccine and Stress Pack Libraries", () => {
    it("should list all vaccines", async () => {
      const vaccines = await db.listVaccines();
      
      expect(vaccines).toBeDefined();
      expect(vaccines.length).toBeGreaterThan(0);
      
      // Verify vaccine structure
      const firstVaccine = vaccines[0];
      expect(firstVaccine).toHaveProperty("id");
      expect(firstVaccine).toHaveProperty("name");
      expect(firstVaccine).toHaveProperty("diseaseType");
      expect(firstVaccine).toHaveProperty("applicationMethod");
    });

    it("should list all stress packs", async () => {
      const stressPacks = await db.listStressPacks();
      
      expect(stressPacks).toBeDefined();
      expect(stressPacks.length).toBeGreaterThan(0);
      
      // Verify stress pack structure
      const firstPack = stressPacks[0];
      expect(firstPack).toHaveProperty("id");
      expect(firstPack).toHaveProperty("name");
      expect(firstPack).toHaveProperty("brand");
      expect(firstPack).toHaveProperty("recommendedDurationDays");
    });
  });
});
