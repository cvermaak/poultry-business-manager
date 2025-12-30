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

    const result = await caller.houses.create({
      name: "Test House 1",
      houseNumber: "H1",
      length: 100,
      width: 12,
      capacity: 15000,
      houseType: "closed",
      beddingType: "pine_shavings",
      beddingDepth: 30,
    });

    expect(result.success).toBe(true);
  });

  it("calculates floor area automatically", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await caller.houses.create({
      name: "Test House 2",
      length: 50,
      width: 10,
      capacity: 7500,
      houseType: "closed",
      beddingType: "pine_shavings",
      beddingDepth: 30,
    });

    const houses = await caller.houses.list();
    const createdHouse = houses.find((h) => h.name === "Test House 2");

    expect(createdHouse).toBeDefined();
    if (createdHouse) {
      expect(parseFloat(createdHouse.floorArea)).toBe(500); // 50 * 10
    }
  });
});
