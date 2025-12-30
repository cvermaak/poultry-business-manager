import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Flock Creation with Template Integration", () => {
  it("should create flock with templates and handle checkbox toggling without duplicates", async () => {
    // Get an existing house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing");
    }
    const house = houses[0];

    // Step 1: Create flock with Default Broiler Protocol selected
    const timestamp = Date.now();
    const flockNumber = `INTEGRATION-TEST-${timestamp}`;
    const placementDate = new Date("2025-12-20");
    const selectedTemplateIds = [60001]; // Default Broiler Protocol
    
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
      starterToDay: 10,
      growerFeedType: "premium",
      growerFromDay: 11,
      growerToDay: 24,
      finisherFeedType: "premium",
      finisherFromDay: 25,
      notes: "Integration test flock",
      status: "planned",
      createdBy: 1,
    });

    const flockId = (result as any)[0]?.insertId || (result as any).insertId;
    console.log(`\nStep 1: Created flock ${flockId}: ${flockNumber}`);

    // Generate reminders from templates (simulating what happens in flock creation)
    await db.generateRemindersFromTemplates(flockId, selectedTemplateIds);

    // Step 2: Verify reminders were created with correct templateId
    let reminders = await db.listReminders({ flockId });
    console.log(`Step 2: Initial reminders count: ${reminders.length}`);
    
    expect(reminders.length).toBe(24); // Default Broiler Protocol has 24 reminders
    expect(reminders.every(r => r.templateId === 60001)).toBe(true);
    
    // Check for specific reminder titles
    const titles = reminders.map(r => r.title);
    expect(titles).toContain("House Cleaning");
    expect(titles).toContain("Bedding Material Delivery");
    expect(titles).toContain("Feed Transition: Starter → Grower");

    // Step 3: Simulate checkbox toggle - uncheck the template
    console.log("\nStep 3: Unchecking template (should remove all 24 reminders)");
    await db.deleteRemindersByTemplate(flockId, 60001);
    
    reminders = await db.listReminders({ flockId });
    console.log(`After uncheck: ${reminders.length} reminders`);
    expect(reminders.length).toBe(0);

    // Step 4: Simulate checkbox toggle - check the template again
    console.log("\nStep 4: Checking template again (should add 24 reminders)");
    await db.generateRemindersFromTemplates(flockId, [60001]);
    
    reminders = await db.listReminders({ flockId });
    console.log(`After recheck: ${reminders.length} reminders`);
    expect(reminders.length).toBe(24);
    expect(reminders.every(r => r.templateId === 60001)).toBe(true);

    // Step 5: Verify no duplicate reminders exist
    console.log("\nStep 5: Verifying no duplicates");
    const uniqueTitles = new Set(reminders.map(r => r.title));
    console.log(`  - Total reminders: ${reminders.length}`);
    console.log(`  - Unique titles: ${uniqueTitles.size}`);
    expect(reminders.length).toBe(uniqueTitles.size); // No duplicates

    console.log("\n✅ All integration tests passed!");
  });
});
