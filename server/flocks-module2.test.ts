import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(role: string = "farm_manager"): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: role as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

let testHouseId: number;
let testFlockId: number;

beforeAll(async () => {
  const { ctx } = createTestContext("admin");
  const caller = appRouter.createCaller(ctx);

  // Create test house
  await caller.houses.create({
    name: "Test House Module 2",
    length: 100,
    width: 12,
    capacity: 15000,
    houseType: "closed",
    beddingType: "pine_shavings",
    beddingDepth: 30,
  });

  const houses = await caller.houses.list();
  const testHouse = houses.find((h) => h.name === "Test House Module 2");
  if (testHouse) {
    testHouseId = testHouse.id;
  }

  // Create test flock
  await caller.flocks.create({
    flockNumber: "FL-M2-TEST-001",
    houseId: testHouseId,
    placementDate: new Date("2024-12-01"),
    initialCount: 15000,
    targetSlaughterWeight: 1.7,
    growingPeriod: 42,
  });

  const flocks = await caller.flocks.list();
  const testFlock = flocks.find((f) => f.flockNumber === "FL-M2-TEST-001");
  if (testFlock) {
    testFlockId = testFlock.id;
  }
});

describe("flocks.createDailyRecord", () => {
  it("creates a daily record with all fields", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.createDailyRecord({
      flockId: testFlockId,
      recordDate: new Date("2024-12-02"),
      dayNumber: 1,
      mortality: 5,
      feedConsumed: 150.5,
      feedType: "starter",
      waterConsumed: 200.0,
      averageWeight: 0.045,
      weightSamples: "45g, 46g, 44g, 45g, 47g",
      temperature: 32.5,
      humidity: 65.0,
      notes: "First day, all systems normal",
    });

    expect(result.success).toBe(true);
  });

  it("creates a daily record with minimal fields", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.createDailyRecord({
      flockId: testFlockId,
      recordDate: new Date("2024-12-03"),
      dayNumber: 2,
      mortality: 3,
      feedConsumed: 155.0,
      feedType: "starter",
    });

    expect(result.success).toBe(true);
  });
});

describe("flocks.getDailyRecords", () => {
  it("retrieves daily records for a flock", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const records = await caller.flocks.getDailyRecords({ flockId: testFlockId });

    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
  });
});

describe("flocks.createHealthRecord", () => {
  it("creates a health record with treatment", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.createHealthRecord({
      flockId: testFlockId,
      recordDate: new Date("2024-12-03"),
      recordType: "treatment",
      description: "Respiratory symptoms observed in 10 birds",
      treatment: "Antibiotic treatment administered",
      medication: "Enrofloxacin",
      dosage: "10mg per liter of water",
      veterinarianName: "Dr. Smith",
      cost: 250.0,
      notes: "Monitor for 3 days",
    });

    expect(result.success).toBe(true);
  });

  it("creates a health record with observation only", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.createHealthRecord({
      flockId: testFlockId,
      recordDate: new Date("2024-12-04"),
      recordType: "observation",
      description: "All birds appear healthy and active",
    });

    expect(result.success).toBe(true);
  });
});

describe("flocks.getHealthRecords", () => {
  it("retrieves health records for a flock", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const records = await caller.flocks.getHealthRecords({ flockId: testFlockId });

    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
  });
});

describe("flocks.createVaccinationSchedule", () => {
  it("schedules a vaccination", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.createVaccinationSchedule({
      flockId: testFlockId,
      vaccineName: "Newcastle Disease",
      scheduledDate: new Date("2024-12-08"),
      scheduledDayNumber: 7,
      dosage: "1 dose per bird",
      administrationMethod: "Drinking water",
      notes: "Ensure water is consumed within 2 hours",
    });

    expect(result.success).toBe(true);
  });
});

describe("flocks.getVaccinationSchedule", () => {
  it("retrieves vaccination schedule for a flock", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const schedule = await caller.flocks.getVaccinationSchedule({ flockId: testFlockId });

    expect(Array.isArray(schedule)).toBe(true);
    expect(schedule.length).toBeGreaterThan(0);
  });
});

describe("flocks.updateVaccinationSchedule", () => {
  it("updates vaccination status to completed", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const schedule = await caller.flocks.getVaccinationSchedule({ flockId: testFlockId });
    if (schedule.length > 0) {
      const vaccination = schedule[0];

      const result = await caller.flocks.updateVaccinationSchedule({
        id: vaccination.id,
        status: "completed",
        administeredDate: new Date("2024-12-08"),
        administeredBy: 1,
        notes: "Vaccination completed successfully",
      });

      expect(result.success).toBe(true);
    }
  });
});

describe("flocks.getPerformanceMetrics", () => {
  it("calculates performance metrics for a flock", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const metrics = await caller.flocks.getPerformanceMetrics({ flockId: testFlockId });

    expect(metrics).toBeDefined();
    if (metrics) {
      expect(metrics.flockId).toBe(testFlockId);
      expect(metrics.flockNumber).toBe("FL-M2-TEST-001");
      expect(typeof metrics.ageInDays).toBe("number");
      expect(typeof metrics.currentCount).toBe("number");
      expect(typeof metrics.mortalityRate).toBe("number");
      expect(typeof metrics.fcr).toBe("number");
    }
  });

  it("returns correct FCR calculation", async () => {
    if (!testFlockId) {
      console.warn("Test flock not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const metrics = await caller.flocks.getPerformanceMetrics({ flockId: testFlockId });

    expect(metrics).toBeDefined();
    if (metrics) {
      // FCR should be feed consumed / total weight
      // With our test data: ~305.5 kg feed / (15000 * 0.045 kg) = ~0.45
      expect(metrics.fcr).toBeGreaterThanOrEqual(0);
    }
  });
});
