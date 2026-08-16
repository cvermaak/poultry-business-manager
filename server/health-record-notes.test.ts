import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  updateHealthRecord: vi.fn().mockResolvedValue(undefined),
  logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "local:health-record-notes-test",
      name: "Health Record Test Admin",
      email: "health-record-test@example.com",
      loginMethod: "email",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  } as TrpcContext;
}

describe("flocks.updateHealthRecord additional notes", () => {
  it("passes an edited additional-notes value through to persistence", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    await caller.flocks.updateHealthRecord({
      id: 60002,
      notes: "Continue monitoring water intake for 48 hours.",
    });

    expect(db.updateHealthRecord).toHaveBeenCalledWith(
      60002,
      expect.objectContaining({ notes: "Continue monitoring water intake for 48 hours." })
    );
  });

  it("accepts null so clearing additional notes is persisted rather than silently omitted", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    await caller.flocks.updateHealthRecord({ id: 60002, notes: null });

    expect(db.updateHealthRecord).toHaveBeenLastCalledWith(
      60002,
      expect.objectContaining({ notes: null })
    );
  });
});
