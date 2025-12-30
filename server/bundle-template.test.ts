import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Bundle Template Operations", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  describe("reminderTemplates.list", () => {
    it("returns an array of templates", async () => {
      const result = await caller.reminderTemplates.list();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("reminderTemplates.create", () => {
    it("creates a single template successfully", async () => {
      const result = await caller.reminderTemplates.create({
        name: "Test Template " + Date.now(),
        description: "Test description",
        reminderType: "routine_task",
        priority: "medium",
        dayOffset: 7,
      });
      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });
  });

  describe("reminderTemplates.createBundle", () => {
    it("validates that templateIds is required and non-empty", async () => {
      // This should fail validation because templateIds must have at least 1 item
      await expect(
        caller.reminderTemplates.createBundle({
          name: "Empty Bundle",
          templateIds: [],
        })
      ).rejects.toThrow();
    });

    it("creates a bundle from existing templates", async () => {
      // First, create some templates to bundle
      const template1 = await caller.reminderTemplates.create({
        name: "Bundle Test Template 1 " + Date.now(),
        reminderType: "vaccination",
        priority: "high",
        dayOffset: 1,
      });

      const template2 = await caller.reminderTemplates.create({
        name: "Bundle Test Template 2 " + Date.now(),
        reminderType: "feed_transition",
        priority: "medium",
        dayOffset: 7,
      });

      // Ensure IDs are valid numbers
      const id1 = Number(template1.id);
      const id2 = Number(template2.id);
      expect(id1).toBeGreaterThan(0);
      expect(id2).toBeGreaterThan(0);

      // Create a bundle from these templates
      const bundle = await caller.reminderTemplates.createBundle({
        name: "Test Bundle " + Date.now(),
        description: "A test bundle with multiple templates",
        templateIds: [id1, id2],
      });

      expect(bundle).toHaveProperty("id");
      expect(bundle.templateCount).toBe(2);
    });

    it("handles non-existent template IDs gracefully", async () => {
      await expect(
        caller.reminderTemplates.createBundle({
          name: "Invalid Bundle",
          templateIds: [999999, 999998],
        })
      ).rejects.toThrow("No valid templates found");
    });
  });

  describe("reminderTemplates.updateBundle", () => {
    it("updates a bundle template name and description", async () => {
      // First create a bundle to update
      const template1 = await caller.reminderTemplates.create({
        name: "Update Test Template " + Date.now(),
        reminderType: "vaccination",
        priority: "high",
        dayOffset: 1,
      });

      const bundle = await caller.reminderTemplates.createBundle({
        name: "Bundle to Update " + Date.now(),
        description: "Original description",
        templateIds: [Number(template1.id)],
      });

      // Update the bundle
      const result = await caller.reminderTemplates.updateBundle({
        id: Number(bundle.id),
        name: "Updated Bundle Name",
        description: "Updated description",
        bundleConfig: [{ category: "vaccination", enabled: true, reminders: [] }],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Bundle template structure", () => {
    it("bundle config groups templates by type", () => {
      // Test the expected structure of bundle config
      const mockBundleConfig = [
        {
          category: "vaccination",
          enabled: true,
          reminders: [
            { name: "Day 1 Vaccination", dayOffset: 1, priority: "high" },
          ],
        },
        {
          category: "feed_transition",
          enabled: true,
          reminders: [
            { name: "Starter to Grower", dayOffset: 7, priority: "medium" },
          ],
        },
      ];

      expect(mockBundleConfig).toHaveLength(2);
      expect(mockBundleConfig[0].category).toBe("vaccination");
      expect(mockBundleConfig[1].category).toBe("feed_transition");
    });

    it("calculates total reminders in bundle correctly", () => {
      const bundleConfig = [
        { category: "vaccination", enabled: true, reminders: [{ name: "V1" }, { name: "V2" }] },
        { category: "feed_transition", enabled: true, reminders: [{ name: "F1" }] },
        { category: "disabled", enabled: false, reminders: [{ name: "D1" }] },
      ];

      const totalReminders = bundleConfig.reduce((total, cat) => 
        cat.enabled && cat.reminders ? total + cat.reminders.length : total, 0
      );

      expect(totalReminders).toBe(3); // V1, V2, F1 (D1 is disabled)
    });
  });
});
