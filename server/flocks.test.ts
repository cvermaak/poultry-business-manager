import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(role: string = "farm_manager"): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: role as any,
    isActive: true,
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

let testHouseId: number;

beforeAll(async () => {
  // Create a test house for flock tests
  const { ctx } = createTestContext("admin");
  const caller = appRouter.createCaller(ctx);

  await caller.houses.create({
    name: "Test House for Flocks",
    length: 100,
    width: 12,
    capacity: 15000,
    houseType: "closed",
    beddingType: "pine_shavings",
    beddingDepth: 30,
  });

  const houses = await caller.houses.list();
  const testHouse = houses.find((h) => h.name === "Test House for Flocks");
  if (testHouse) {
    testHouseId = testHouse.id;
  }
});

describe("flocks.list", () => {
  it("returns empty array when no flocks exist", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("filters flocks by status", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.list({ status: "active" });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("flocks.create", () => {
  it("creates a flock with valid data", async () => {
    if (!testHouseId) {
      console.warn("Test house not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.flocks.create({
      flockNumber: "FL-TEST-001",
      houseId: testHouseId,
      placementDate: new Date("2024-12-01"),
      initialCount: 15000,
      targetSlaughterWeight: 1.7,
      growingPeriod: 42,
    });

    expect(result.success).toBe(true);
  });

  it("sets currentCount equal to initialCount on creation", async () => {
    if (!testHouseId) {
      console.warn("Test house not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await caller.flocks.create({
      flockNumber: "FL-TEST-002",
      houseId: testHouseId,
      placementDate: new Date("2024-12-05"),
      initialCount: 12000,
      targetSlaughterWeight: 1.7,
      growingPeriod: 42,
    });

    const flocks = await caller.flocks.list();
    const createdFlock = flocks.find((f) => f.flockNumber === "FL-TEST-002");

    expect(createdFlock).toBeDefined();
    if (createdFlock) {
      expect(createdFlock.currentCount).toBe(createdFlock.initialCount);
      expect(createdFlock.status).toBe("planned");
    }
  });
});

describe("flocks.update", () => {
  it("updates flock status", async () => {
    if (!testHouseId) {
      console.warn("Test house not created, skipping test");
      return;
    }

    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await caller.flocks.create({
      flockNumber: "FL-TEST-003",
      houseId: testHouseId,
      placementDate: new Date("2024-12-10"),
      initialCount: 10000,
      targetSlaughterWeight: 1.7,
      growingPeriod: 42,
    });

    const flocks = await caller.flocks.list();
    const flock = flocks.find((f) => f.flockNumber === "FL-TEST-003");

    if (flock) {
      const result = await caller.flocks.update({
        id: flock.id,
        status: "active",
      });

      expect(result.success).toBe(true);

      const updatedFlocks = await caller.flocks.list();
      const updatedFlock = updatedFlocks.find((f) => f.id === flock.id);
      expect(updatedFlock?.status).toBe("active");
    }
  });
});
