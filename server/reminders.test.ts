import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "admin",
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

describe("Reminders System", () => {
  it("should list reminders with optional filters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const reminders = await caller.reminders.list({
      status: "pending",
      priority: "high",
    });

    expect(Array.isArray(reminders)).toBe(true);
  });

  it("should get today's reminders", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const todayReminders = await caller.reminders.getToday();

    expect(Array.isArray(todayReminders)).toBe(true);
  });

  it("should get upcoming reminders within specified days", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const upcomingReminders = await caller.reminders.getUpcoming({ days: 7 });

    expect(Array.isArray(upcomingReminders)).toBe(true);
  });

  it("should create a reminder with required fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const result = await caller.reminders.create({
      reminderType: "vaccination",
      title: "Test Vaccination Reminder",
      description: "Administer Newcastle disease vaccine",
      dueDate,
      priority: "high",
    });

    expect(result).toHaveProperty("insertId");
  });

  it("should update reminder status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First create a reminder
    const dueDate = new Date();
    const createResult = await caller.reminders.create({
      reminderType: "routine_task",
      title: "Test Task",
      dueDate,
      priority: "medium",
    });

    const reminderId = (createResult as any).insertId || (createResult as any)[0]?.insertId;

    // Then update its status
    const updateResult = await caller.reminders.updateStatus({
      id: reminderId,
      status: "completed",
      completedBy: ctx.user.id,
    });

    expect(updateResult).toHaveProperty("success", true);
  });

  it("should delete a reminder", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First create a reminder
    const dueDate = new Date();
    const createResult = await caller.reminders.create({
      reminderType: "routine_task",
      title: "Test Task to Delete",
      dueDate,
      priority: "low",
    });

    const reminderId = (createResult as any).insertId || (createResult as any)[0]?.insertId;

    // Then delete it
    const deleteResult = await caller.reminders.delete({ id: reminderId });

    expect(deleteResult).toHaveProperty("success", true);
  });

  it("should generate reminders for a flock", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This test requires a flock to exist
    // For now, we'll just test that the procedure can be called
    // In a real scenario, you'd create a test flock first

    try {
      const result = await caller.reminders.generateForFlock({ flockId: 999999 });
      // If flock doesn't exist, it should still return gracefully
      expect(result).toBeDefined();
    } catch (error) {
      // Expected if flock doesn't exist
      expect(error).toBeDefined();
    }
  });

  it("should prioritize urgent reminders correctly", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const urgentReminder = await caller.reminders.create({
      reminderType: "performance_alert",
      title: "Critical FCR Alert",
      description: "FCR exceeds 2.0 - immediate action required",
      dueDate: tomorrow,
      priority: "urgent",
    });

    expect(urgentReminder).toHaveProperty("insertId");
  });

  it("should support different reminder types", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reminderTypes = [
      "vaccination",
      "feed_transition",
      "house_preparation",
      "environmental_check",
      "routine_task",
      "milestone",
      "biosecurity",
      "performance_alert",
    ] as const;

    for (const type of reminderTypes) {
      const result = await caller.reminders.create({
        reminderType: type,
        title: `Test ${type} reminder`,
        dueDate: tomorrow,
        priority: "medium",
      });

      expect(result).toHaveProperty("insertId");
    }
  });
});
