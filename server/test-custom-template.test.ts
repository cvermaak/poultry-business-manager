import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Custom Template Reminder Generation", () => {
  it("should generate 3 reminders from custom house preparation template", async () => {
    // Get an existing house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing");
    }
    const house = houses[0];

    // Create a test flock
    const timestamp = Date.now();
    const flockNumber = `CUSTOM-TEMPLATE-TEST-${timestamp}`;
    const placementDate = new Date("2025-12-20");
    
    await db.createFlock({
      flockNumber,
      houseId: house.id,
      placementDate,
      initialCount: 1000,
      currentCount: 1000,
      targetSlaughterWeight: "1.70",
      growingPeriod: 42,
      weightUnit: "kg",
      starterFeedType: "premium",
      starterToDay: 10,
      growerFeedType: "premium",
      growerFromDay: 11,
      growerToDay: 24,
      finisherFeedType: "premium",
      finisherFromDay: 25,
      notes: "Test flock for custom template",
    });

    // Get the created flock
    const flocks = await db.listFlocks();
    const flock = flocks.find((f) => f.flockNumber === flockNumber);
    if (!flock) throw new Error("Failed to create test flock");

    // Find the custom template (ID 120002)
    const customTemplateId = 120002;
    
    // Generate reminders
    const reminderCount = await db.generateRemindersFromTemplates(flock.id, [customTemplateId]);
    
    console.log(`Generated ${reminderCount} reminders`);
    
    // Get the reminders
    const reminders = await db.listReminders({ flockId: flock.id });
    console.log(`Found ${reminders.length} reminders in database`);
    reminders.forEach(r => {
      console.log(`  - ${r.title} (type: ${r.reminderType}, templateId: ${r.templateId})`);
    });
    
    // Should generate 3 reminders (house cleaning, disinfection, bedding)
    expect(reminderCount).toBe(3);
    expect(reminders.length).toBe(3);
    
    // Check reminder titles
    const titles = reminders.map(r => r.title).sort();
    expect(titles).toContain("House Cleaning");
    expect(titles).toContain("House Disinfection");
    expect(titles).toContain("Bedding Material Delivery");
  });
});
