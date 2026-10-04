import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(role: string = "admin"): { ctx: TrpcContext } {
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

let houseTestSequence = 0;

function nextTestHouseName(label: string) {
  houseTestSequence += 1;
  return `Test House ${label} ${Date.now()}-${houseTestSequence}`;
}

describe("houses.list", () => {
  it("returns empty array when no houses exist", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.houses.list();

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("houses.create", () => {
  it("creates a house with valid data", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const houseName = nextTestHouseName("Create");

    try {
      const result = await caller.houses.create({
        name: houseName,
        houseNumber: "H1",
        length: 100,
        width: 12,
        capacity: 15000,
        houseType: "closed",
        beddingType: "pine_shavings",
        beddingDepth: 30,
      });

      expect(result.success).toBe(true);
    } finally {
      const createdHouse = (await caller.houses.list()).find((house) => house.name === houseName);
      if (createdHouse) await caller.houses.delete({ id: createdHouse.id });
    }
  });

  it("calculates and persists automatic capacity when capacity is omitted", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const houseName = nextTestHouseName("Automatic Capacity");

    try {
      const result = await caller.houses.create({
        name: houseName,
        length: 14,
        width: 100,
        houseType: "closed",
        mortalityRate: 4,
        targetSlaughterWeight: 1.9,
        densityKgPerSqm: 38,
        beddingType: "pine_shavings",
        beddingDepth: 30,
      });

      expect(result.capacityCalculation?.usedCapacity).toBe(29166);
      const createdHouse = (await caller.houses.list()).find((house) => house.name === houseName);
      expect(createdHouse).toBeDefined();
      expect(Number(createdHouse?.floorArea)).toBe(1400);
      expect(createdHouse?.capacity).toBe(29166);
    } finally {
      const createdHouse = (await caller.houses.list()).find((house) => house.name === houseName);
      if (createdHouse) await caller.houses.delete({ id: createdHouse.id });
    }
  });

  it("recalculates automatic capacity after a capacity-driver update", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const houseName = nextTestHouseName("Capacity Update");

    try {
      await caller.houses.create({
        name: houseName,
        length: 10,
        width: 10,
        capacity: 1000,
        houseType: "closed",
        beddingType: "pine_shavings",
        beddingDepth: 30,
      });
      const createdHouse = (await caller.houses.list()).find((house) => house.name === houseName);
      expect(createdHouse).toBeDefined();

      const result = await caller.houses.update({
        id: createdHouse!.id,
        densityKgPerSqm: 36,
      });

      expect(result.capacityCalculation?.usedCapacity).toBe(1972);
      const updatedHouse = await caller.houses.getById({ id: createdHouse!.id });
      expect(updatedHouse?.capacity).toBe(1972);
      expect(updatedHouse?.densityKgPerSqm).toBe("36.00");
    } finally {
      const createdHouse = (await caller.houses.list()).find((house) => house.name === houseName);
      if (createdHouse) await caller.houses.delete({ id: createdHouse.id });
    }
  });
});
