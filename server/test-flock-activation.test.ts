import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Flock Activation System", () => {
  let testHouseId: number;
  let testUserId: number;

  beforeAll(async () => {
    // Get or create a test house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing");
    }
    testHouseId = houses[0].id;

    // Get a test user
    const users = await db.listUsers();
    if (users.length === 0) {
      throw new Error("No users available for testing");
    }
    testUserId = users[0].id;
  });

  it("should automatically activate flock when placement date arrives", async () => {
    const timestamp = Date.now();
    
    // Create a flock with placement date in the past (should be activated)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // Yesterday
    
    await db.createFlock({
      flockNumber: `AUTO-ACTIVATE-${timestamp}`,
      houseId: testHouseId,
      placementDate: pastDate,
      initialCount: 1000,
      currentCount: 1000,
      targetSlaughterWeight: "1.70",
      growingPeriod: 42,
      weightUnit: "kg",
      status: "planned",
      createdBy: testUserId,
    });

    // Run auto-activation
    const activatedCount = await db.autoActivateFlocks();

    // Should have activated at least 1 flock
    expect(activatedCount).toBeGreaterThan(0);

    // Verify the flock is now active
    const flocks = await db.listFlocks({ status: "active" });
    const activatedFlock = flocks.find(f => f.flockNumber === `AUTO-ACTIVATE-${timestamp}`);
    
    expect(activatedFlock).toBeDefined();
    expect(activatedFlock?.status).toBe("active");
    expect(activatedFlock?.isManualStatusChange).toBe(0); // Automatic
    expect(activatedFlock?.statusChangeReason).toContain("Automatic activation");
  });

  it("should NOT activate flock with future placement date", async () => {
    const timestamp = Date.now();
    
    // Create a flock with placement date in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // Next week
    
    await db.createFlock({
      flockNumber: `FUTURE-${timestamp}`,
      houseId: testHouseId,
      placementDate: futureDate,
      initialCount: 1000,
      currentCount: 1000,
      targetSlaughterWeight: "1.70",
      growingPeriod: 42,
      weightUnit: "kg",
      status: "planned",
      createdBy: testUserId,
    });

    // Run auto-activation
    await db.autoActivateFlocks();

    // Verify the flock is still planned
    const flocks = await db.listFlocks({ status: "planned" });
    const plannedFlock = flocks.find(f => f.flockNumber === `FUTURE-${timestamp}`);
    
    expect(plannedFlock).toBeDefined();
    expect(plannedFlock?.status).toBe("planned");
  });

  it("should allow manual status change with audit trail", async () => {
    const timestamp = Date.now();
    
    // Create a flock
    await db.createFlock({
      flockNumber: `MANUAL-${timestamp}`,
      houseId: testHouseId,
      placementDate: new Date(),
      initialCount: 1000,
      currentCount: 1000,
      targetSlaughterWeight: "1.70",
      growingPeriod: 42,
      weightUnit: "kg",
      status: "planned",
      createdBy: testUserId,
    });

    // Get the flock
    const flocks = await db.listFlocks();
    const flock = flocks.find(f => f.flockNumber === `MANUAL-${timestamp}`);
    expect(flock).toBeDefined();

    // Manually activate it
    const reason = "Early activation for house preparation";
    await db.manuallyChangeFlockStatus(flock!.id, "active", testUserId, reason);

    // Verify the status change
    const updatedFlock = await db.getFlockById(flock!.id);
    expect(updatedFlock?.status).toBe("active");
    expect(updatedFlock?.isManualStatusChange).toBe(1); // Manual
    expect(updatedFlock?.statusChangedBy).toBe(testUserId);
    expect(updatedFlock?.statusChangeReason).toBe(reason);
    expect(updatedFlock?.statusChangedAt).toBeDefined();
  });

  it("should track status history", async () => {
    const timestamp = Date.now();
    
    // Create a flock
    await db.createFlock({
      flockNumber: `HISTORY-${timestamp}`,
      houseId: testHouseId,
      placementDate: new Date(),
      initialCount: 1000,
      currentCount: 1000,
      targetSlaughterWeight: "1.70",
      growingPeriod: 42,
      weightUnit: "kg",
      status: "planned",
      createdBy: testUserId,
    });

    // Get the flock
    const flocks = await db.listFlocks();
    const flock = flocks.find(f => f.flockNumber === `HISTORY-${timestamp}`);
    expect(flock).toBeDefined();

    // Change status
    await db.manuallyChangeFlockStatus(flock!.id, "active", testUserId, "Test activation");

    // Get status history
    const history = await db.getFlockStatusHistory(flock!.id);
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].status).toBe("active");
    expect(history[0].isManual).toBe(true);
    expect(history[0].reason).toBe("Test activation");
  });
});
