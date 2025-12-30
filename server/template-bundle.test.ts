import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Template Bundle & Copy Functionality", () => {
  let defaultProtocolId: number;
  let customTemplateId: number;

  beforeAll(async () => {
    // Get the Default Broiler Protocol template
    const templates = await db.listReminderTemplates();
    const defaultProtocol = templates.find((t) => t.name === "Default Broiler Protocol");
    if (!defaultProtocol) {
      throw new Error("Default Broiler Protocol template not found. Run seed script first.");
    }
    defaultProtocolId = defaultProtocol.id;
  });

  it("should have Default Broiler Protocol template with bundle configuration", async () => {
    const templates = await db.listReminderTemplates();
    const defaultProtocol = templates.find((t) => t.id === defaultProtocolId);
    
    expect(defaultProtocol).toBeDefined();
    expect(defaultProtocol?.name).toBe("Default Broiler Protocol");
    expect(defaultProtocol?.isBundle).toBe(true);
    expect(defaultProtocol?.bundleConfig).toBeDefined();
    expect(Array.isArray(defaultProtocol?.bundleConfig)).toBe(true);
  });

  it("should have 6 categories in the bundle configuration", async () => {
    const templates = await db.listReminderTemplates();
    const defaultProtocol = templates.find((t) => t.id === defaultProtocolId);
    const bundleConfig = defaultProtocol?.bundleConfig as any[];
    
    expect(bundleConfig).toHaveLength(6);
    
    const categories = bundleConfig.map((c) => c.category);
    expect(categories).toContain("house_preparation");
    expect(categories).toContain("feed_transition");
    expect(categories).toContain("weight_sampling");
    expect(categories).toContain("biosecurity");
    expect(categories).toContain("environmental_check");
    expect(categories).toContain("milestone");
  });

  it("should copy and customize template with selected categories", async () => {
    const templates = await db.listReminderTemplates();
    const defaultProtocol = templates.find((t) => t.id === defaultProtocolId);
    const bundleConfig = defaultProtocol?.bundleConfig as any[];
    
    // Customize: only enable house_preparation and feed_transition
    const customConfig = bundleConfig.map((cat) => ({
      ...cat,
      enabled: cat.category === "house_preparation" || cat.category === "feed_transition",
    }));
    
    const newTemplate = await db.copyAndCustomizeTemplate(
      defaultProtocolId,
      "Test Custom Protocol",
      customConfig
    );
    
    expect(newTemplate).toBeDefined();
    expect(newTemplate.name).toBe("Test Custom Protocol");
    expect(newTemplate.isBundle).toBe(true);
    expect(Array.isArray(newTemplate.bundleConfig)).toBe(true);
    
    customTemplateId = newTemplate.id;
  });

  it("should generate reminders from bundle template for a flock", async () => {
    // Get an existing house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing. Create a house first.");
    }
    const house = houses[0];

    const timestamp = Date.now();
    const flockNumber = `BUNDLE-TEST-${timestamp}`;
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
      notes: "Test flock for bundle template",
    });

    // Get the created flock
    const flocks = await db.listFlocks();
    const flock = flocks.find((f) => f.flockNumber === flockNumber);
    if (!flock) throw new Error("Failed to create test flock");

    // Apply the Default Broiler Protocol template
    const reminderCount = await db.generateRemindersFromTemplates(flock.id, [defaultProtocolId]);
    
    // Should generate 24 reminders (all categories enabled)
    expect(reminderCount).toBe(24);
    
    // Verify reminders were created
    const reminders = await db.listReminders({ flockId: flock.id });
    expect(reminders).toHaveLength(24);
    
    // Verify all reminders have the templateId
    reminders.forEach((reminder) => {
      expect(reminder.templateId).toBe(defaultProtocolId);
    });
  });

  it("should generate fewer reminders from customized template", async () => {
    // Get an existing house
    const houses = await db.listHouses();
    if (houses.length === 0) {
      throw new Error("No houses available for testing. Create a house first.");
    }
    const house = houses[0];

    const timestamp = Date.now();
    const flockNumber = `CUSTOM-BUNDLE-TEST-${timestamp}`;
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
      notes: "Test flock for custom bundle template",
    });

    // Get the created flock
    const flocks = await db.listFlocks();
    const flock = flocks.find((f) => f.flockNumber === flockNumber);
    if (!flock) throw new Error("Failed to create test flock");

    // Apply the custom template (only house_preparation + feed_transition = 5 reminders)
    const reminderCount = await db.generateRemindersFromTemplates(flock.id, [customTemplateId]);
    
    expect(reminderCount).toBe(5); // 3 house prep + 2 feed transitions
    
    const reminders = await db.listReminders({ flockId: flock.id });
    expect(reminders).toHaveLength(5);
  });
});
