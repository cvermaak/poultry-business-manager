import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Template Checkbox Add/Remove Functionality", () => {
  it("should add bundle template via checkbox and create multiple reminders", async () => {
    // Get an existing house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing");
    }
    const house = houses[0];

    // Create a test flock
    const timestamp = Date.now();
    const flockNumber = `CHECKBOX-TEST-${timestamp}`;
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
      notes: "Test flock for checkbox functionality",
    });

    // Get the created flock
    const flocks = await db.listFlocks();
    const flock = flocks.find((f) => f.flockNumber === flockNumber);
    if (!flock) throw new Error("Failed to create test flock");

    console.log(`\nCreated flock ${flock.id}: ${flock.flockNumber}`);

    // Initially should have 0 reminders
    let reminders = await db.listReminders({ flockId: flock.id });
    console.log(`Initial reminders: ${reminders.length}`);
    expect(reminders.length).toBe(0);

    // Add custom template (ID 120002) - should create 3 reminders
    const customTemplateId = 120002;
    const reminderCount = await db.generateRemindersFromTemplates(flock.id, [customTemplateId]);
    console.log(`\nAdded template ${customTemplateId}, created ${reminderCount} reminders`);
    
    reminders = await db.listReminders({ flockId: flock.id });
    console.log(`Reminders after add:`);
    reminders.forEach(r => {
      console.log(`  - ${r.title} (templateId: ${r.templateId})`);
    });
    
    expect(reminderCount).toBe(3);
    expect(reminders.length).toBe(3);
    expect(reminders.every(r => r.templateId === customTemplateId)).toBe(true);

    // Remove template - should delete all 3 reminders
    await db.deleteRemindersByTemplate(flock.id, customTemplateId);
    console.log(`\nRemoved template ${customTemplateId}`);
    
    reminders = await db.listReminders({ flockId: flock.id });
    console.log(`Reminders after remove: ${reminders.length}`);
    expect(reminders.length).toBe(0);

    // Add Default Broiler Protocol (ID 60001) - should create 24 reminders
    const defaultTemplateId = 60001;
    const reminderCount2 = await db.generateRemindersFromTemplates(flock.id, [defaultTemplateId]);
    console.log(`\nAdded template ${defaultTemplateId}, created ${reminderCount2} reminders`);
    
    reminders = await db.listReminders({ flockId: flock.id });
    expect(reminderCount2).toBe(24);
    expect(reminders.length).toBe(24);
    expect(reminders.every(r => r.templateId === defaultTemplateId)).toBe(true);

    // Remove default template
    await db.deleteRemindersByTemplate(flock.id, defaultTemplateId);
    console.log(`\nRemoved template ${defaultTemplateId}`);
    
    reminders = await db.listReminders({ flockId: flock.id });
    console.log(`Final reminders: ${reminders.length}`);
    expect(reminders.length).toBe(0);
  });
});
