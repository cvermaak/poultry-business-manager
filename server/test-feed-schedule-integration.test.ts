import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Feed Transition Reminders Use Flock Feed Schedule", () => {
  let testHouseId: number;

  beforeAll(async () => {
    // Create a test house
    const houses = await db.listHouses();
    if (houses.length > 0) {
      testHouseId = houses[0].id;
    } else {
      const result = await db.createHouse({
        name: "Test House for Feed Schedule",
        capacity: 1000,
      });
      testHouseId = result.id;
    }
  });

  it("should create feed transition reminders using flock's actual feed schedule, not template defaults", async () => {
    // Get the Default Broiler Protocol template
    const templates = await db.listReminderTemplates();
    const defaultProtocol = templates.find((t) => t.name === "Default Broiler Protocol");
    expect(defaultProtocol).toBeDefined();

    // Create a flock with CUSTOM feed schedule (different from template defaults of 10 and 24)
    const customStarterToDay = 15;
    const customGrowerToDay = 28;
    const testFlockNumber = `TEST-FEED-SCHEDULE-${Date.now()}`;

    const flockResult = await db.createFlock({
      flockNumber: testFlockNumber,
      houseId: testHouseId,
      placementDate: new Date("2025-12-20"),
      initialCount: 500,
      currentCount: 500,
      targetSlaughterWeight: 2.5,
      growingPeriod: 35,
      status: "active",
      weightUnit: "kg",
      starterFeedType: "premium",
      starterFromDay: 0,
      starterToDay: customStarterToDay, // Custom: 15 (template default is 10)
      growerFeedType: "value",
      growerFromDay: customStarterToDay + 1,
      growerToDay: customGrowerToDay, // Custom: 28 (template default is 24)
      finisherFeedType: "econo",
      finisherFromDay: customGrowerToDay + 1,
      finisherToDay: 35,
    });

    // Query the created flock to get its ID
    const flocks = await db.listFlocks({});
    const createdFlock = flocks.find((f) => f.flockNumber === testFlockNumber);
    if (!createdFlock) throw new Error("Failed to find created flock");
    const flockId = createdFlock.id;

    // Apply the Default Broiler Protocol template
    const reminderCount = await db.generateRemindersFromTemplates(flockId, [defaultProtocol!.id]);
    expect(reminderCount).toBeGreaterThan(0);

    // Get the feed transition reminders
    const allReminders = await db.listReminders({ flockId });
    const feedTransitionReminders = allReminders.filter((r) => r.reminderType === "feed_transition");

    expect(feedTransitionReminders.length).toBe(2);

    // Check Starter → Grower reminder
    const starterToGrower = feedTransitionReminders.find((r) => r.title.includes("Starter") && r.title.includes("Grower"));
    expect(starterToGrower).toBeDefined();

    const placementDate = new Date("2025-12-20");
    const expectedStarterDate = new Date(placementDate);
    expectedStarterDate.setDate(expectedStarterDate.getDate() + customStarterToDay);

    const actualStarterDay = Math.round(
      (new Date(starterToGrower!.dueDate).getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(actualStarterDay).toBe(customStarterToDay); // Should be 15, not 10

    // Check Grower → Finisher reminder
    const growerToFinisher = feedTransitionReminders.find((r) => r.title.includes("Grower") && r.title.includes("Finisher"));
    expect(growerToFinisher).toBeDefined();

    const expectedGrowerDate = new Date(placementDate);
    expectedGrowerDate.setDate(expectedGrowerDate.getDate() + customGrowerToDay);

    const actualGrowerDay = Math.round(
      (new Date(growerToFinisher!.dueDate).getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(actualGrowerDay).toBe(customGrowerToDay); // Should be 28, not 24

    console.log("✓ Feed transition reminders correctly use flock's feed schedule:");
    console.log(`  Starter → Grower: Day ${actualStarterDay} (expected ${customStarterToDay})`);
    console.log(`  Grower → Finisher: Day ${actualGrowerDay} (expected ${customGrowerToDay})`);
  });

  it("should update feed transition reminders when feed schedule is changed", async () => {
    // Get the Default Broiler Protocol template
    const templates = await db.listReminderTemplates();
    const defaultProtocol = templates.find((t) => t.name === "Default Broiler Protocol");

    // Create a flock with initial feed schedule
    const testFlockNumber = `TEST-FEED-UPDATE-${Date.now()}`;

    const flockResult = await db.createFlock({
      flockNumber: testFlockNumber,
      houseId: testHouseId,
      placementDate: new Date("2025-12-20"),
      initialCount: 500,
      currentCount: 500,
      targetSlaughterWeight: 2.5,
      growingPeriod: 35,
      status: "active",
      weightUnit: "kg",
      starterFeedType: "premium",
      starterFromDay: 0,
      starterToDay: 10,
      growerFeedType: "value",
      growerFromDay: 11,
      growerToDay: 24,
      finisherFeedType: "econo",
      finisherFromDay: 25,
      finisherToDay: 35,
    });

    // Query the created flock to get its ID
    const flocks = await db.listFlocks({});
    const createdFlock = flocks.find((f) => f.flockNumber === testFlockNumber);
    if (!createdFlock) throw new Error("Failed to find created flock");
    const flockId = createdFlock.id;

    // Apply template
    await db.generateRemindersFromTemplates(flockId, [defaultProtocol!.id]);

    // Update the feed schedule
    const newStarterToDay = 18;
    const newGrowerToDay = 30;

    await db.updateFlock(flockId, {
      starterToDay: newStarterToDay,
      growerToDay: newGrowerToDay,
    });

    // Get updated reminders
    const allReminders = await db.listReminders({ flockId });
    const feedTransitionReminders = allReminders.filter((r) => r.reminderType === "feed_transition");

    const starterToGrower = feedTransitionReminders.find((r) => r.title.includes("Starter") && r.title.includes("Grower"));
    const growerToFinisher = feedTransitionReminders.find((r) => r.title.includes("Grower") && r.title.includes("Finisher"));

    const placementDate = new Date("2025-12-20");

    const actualStarterDay = Math.round(
      (new Date(starterToGrower!.dueDate).getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const actualGrowerDay = Math.round(
      (new Date(growerToFinisher!.dueDate).getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(actualStarterDay).toBe(newStarterToDay); // Should update to 18
    expect(actualGrowerDay).toBe(newGrowerToDay); // Should update to 30

    console.log("✓ Feed transition reminders correctly updated after feed schedule change:");
    console.log(`  Starter → Grower: Day ${actualStarterDay} (expected ${newStarterToDay})`);
    console.log(`  Grower → Finisher: Day ${actualGrowerDay} (expected ${newGrowerToDay})`);
  });
});
