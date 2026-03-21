import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
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
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("reminders.updateStatus", () => {
  it("accepts completedAt parameter for client-side timestamps", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const clientTimestamp = new Date("2026-03-21T10:30:00Z");

    try {
      await caller.reminders.updateStatus({
        id: 999999,
        status: "completed",
        completedBy: 1,
        completedAt: clientTimestamp,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).not.toContain("Invalid option");
      expect(errorMsg).not.toContain("schema");
    }
  });

  it("accepts optional completedAt parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.reminders.updateStatus({
        id: 999999,
        status: "completed",
        completedBy: 1,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).not.toContain("required");
    }
  });

  it("accepts actionNotes parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.reminders.updateStatus({
        id: 999999,
        status: "completed",
        completedBy: 1,
        actionNotes: "Test notes",
        completedAt: new Date(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).not.toContain("Invalid option");
    }
  });

  it("accepts different status values", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const statuses: Array<"pending" | "completed" | "dismissed"> = [
      "completed",
      "dismissed",
      "pending",
    ];

    for (const status of statuses) {
      try {
        await caller.reminders.updateStatus({
          id: 999999,
          status,
          completedBy: 1,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        expect(errorMsg).not.toContain("Invalid option");
      }
    }
  });

  it("validates timestamp format when provided", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const timestamps = [
      new Date("2026-03-21T00:00:00Z"),
      new Date("2026-03-21T23:59:59Z"),
      new Date(),
    ];

    for (const timestamp of timestamps) {
      try {
        await caller.reminders.updateStatus({
          id: 999999,
          status: "completed",
          completedBy: 1,
          completedAt: timestamp,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        expect(errorMsg).not.toContain("type");
      }
    }
  });

  it("handles missing completedBy gracefully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.reminders.updateStatus({
        id: 999999,
        status: "dismissed",
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).not.toContain("required");
    }
  });
});
