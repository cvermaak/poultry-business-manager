import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Feed Transition Reminder Date Updates", () => {
  it("should update feed transition reminder dates when feed schedule changes", async () => {
    // Get an existing house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing");
    }
    const house = houses[0];

    // Step 1: Create flock with Default Broiler Protocol
    const timestamp = Date.now();
    const flockNumber = `FEED-TEST-${timestamp}`;
    const placementDate = new Date("2025-12-20");
    
    const result = await db.createFlock({
      flockNumber,
      houseId: house.id,
      placementDate,
      initialCount: 1000,
      currentCount: 1000,
      targetSlaughterWeight: "1.70",
      growingPeriod: 42,
      weightUnit: "kg",
      starterFeedType: "premium",
      starterToDay: 10,  // Initial: day 10
      growerFeedType: "premium",
      growerFromDay: 11,
      growerToDay: 24,  // Initial: day 24
      finisherFeedType: "premium",
      finisherFromDay: 25,
      notes: "Feed transition test flock",
      status: "planned",
      createdBy: 1,
    });

    const flockId = (result as any)[0]?.insertId || (result as any).insertId;
    console.log(`\nStep 1: Created flock ${flockId}: ${flockNumber}`);

    // Generate reminders from Default Broiler Protocol
    await db.generateRemindersFromTemplates(flockId, [60001]);

    // Step 2: Check initial feed transition reminder dates
    let reminders = await db.listReminders({ flockId });
    const starterToGrowerReminder = reminders.find(r => r.title.includes("Starter") && r.title.includes("Grower"));
    const growerToFinisherReminder = reminders.find(r => r.title.includes("Grower") && r.title.includes("Finisher"));

    console.log("\nStep 2: Initial feed transition reminders:");
    console.log(`  - Starter → Grower: ${starterToGrowerReminder?.dueDate}`);
    console.log(`  - Grower → Finisher: ${growerToFinisherReminder?.dueDate}`);

    // Calculate expected dates
    const expectedStarterToGrowerDate = new Date(placementDate);
    expectedStarterToGrowerDate.setDate(expectedStarterToGrowerDate.getDate() + 10);
    
    const expectedGrowerToFinisherDate = new Date(placementDate);
    expectedGrowerToFinisherDate.setDate(expectedGrowerToFinisherDate.getDate() + 24);

    expect(starterToGrowerReminder).toBeDefined();
    expect(growerToFinisherReminder).toBeDefined();
    expect(new Date(starterToGrowerReminder!.dueDate).toDateString()).toBe(expectedStarterToGrowerDate.toDateString());
    expect(new Date(growerToFinisherReminder!.dueDate).toDateString()).toBe(expectedGrowerToFinisherDate.toDateString());

    // Step 3: Update feed schedule (change starterToDay from 10 to 17, growerToDay from 24 to 30)
    console.log("\nStep 3: Updating feed schedule (starterToDay: 10 → 17, growerToDay: 24 → 30)");
    await db.updateFeedTransitionReminderDates(flockId, 17, undefined, 30, undefined);

    // Step 4: Verify reminder dates were updated
    reminders = await db.listReminders({ flockId });
    const updatedStarterToGrowerReminder = reminders.find(r => r.title.includes("Starter") && r.title.includes("Grower"));
    const updatedGrowerToFinisherReminder = reminders.find(r => r.title.includes("Grower") && r.title.includes("Finisher"));

    console.log("\nStep 4: Updated feed transition reminders:");
    console.log(`  - Starter → Grower: ${updatedStarterToGrowerReminder?.dueDate}`);
    console.log(`  - Grower → Finisher: ${updatedGrowerToFinisherReminder?.dueDate}`);

    // Calculate new expected dates
    const newExpectedStarterToGrowerDate = new Date(placementDate);
    newExpectedStarterToGrowerDate.setDate(newExpectedStarterToGrowerDate.getDate() + 17);
    
    const newExpectedGrowerToFinisherDate = new Date(placementDate);
    newExpectedGrowerToFinisherDate.setDate(newExpectedGrowerToFinisherDate.getDate() + 30);

    expect(new Date(updatedStarterToGrowerReminder!.dueDate).toDateString()).toBe(newExpectedStarterToGrowerDate.toDateString());
    expect(new Date(updatedGrowerToFinisherReminder!.dueDate).toDateString()).toBe(newExpectedGrowerToFinisherDate.toDateString());

    console.log("\n✅ Feed transition reminder dates updated correctly!");
  });
});
