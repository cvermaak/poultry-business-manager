import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@afgro.com",
    name: "Test Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {} as any,
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as any,
  };
}

describe("Inventory Management", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testItemId: number;
  let testLocationId: number;

  beforeAll(async () => {
    const ctx = createTestContext();
    caller = appRouter.createCaller(ctx);
  });

  describe("Inventory Items", () => {
    it("should create a new inventory item", async () => {
      const result = await caller.inventory.createItem({
        itemNumber: "TEST-FEED-001",
        name: "Test Starter Feed",
        category: "feed",
        unit: "kg",
        reorderPoint: 100,
        unitCost: 2500, // R25.00 in cents
      });

      expect(result).toBeDefined();
      expect(result.itemNumber).toBe("TEST-FEED-001");
      expect(result.name).toBe("Test Starter Feed");
      testItemId = result.id;
    });

    it("should list inventory items", async () => {
      const items = await caller.inventory.listItems();
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it("should filter items by category", async () => {
      const feedItems = await caller.inventory.listItems({ category: "feed" });
      expect(Array.isArray(feedItems)).toBe(true);
      feedItems.forEach((item) => {
        expect(item.category).toBe("feed");
      });
    });

    it("should get a specific item", async () => {
      const item = await caller.inventory.getItem({ id: testItemId });
      expect(item).toBeDefined();
      expect(item?.id).toBe(testItemId);
      expect(item?.itemNumber).toBe("TEST-FEED-001");
    });

    it("should update an inventory item", async () => {
      const result = await caller.inventory.updateItem({
        id: testItemId,
        name: "Test Starter Feed Premium",
        unitCost: 2800, // R28.00
      });

      expect(result).toBeDefined();
      
      const updated = await caller.inventory.getItem({ id: testItemId });
      expect(updated?.name).toBe("Test Starter Feed Premium");
      expect(updated?.unitCost).toBe(2800);
    });
  });

  describe("Inventory Locations", () => {
    it("should create a new location", async () => {
      const result = await caller.inventory.createLocation({
        name: "Test Warehouse A",
        locationType: "warehouse",
        description: "Primary test storage facility",
      });

      expect(result).toBeDefined();
      expect(result.name).toBe("Test Warehouse A");
      expect(result.locationType).toBe("warehouse");
      testLocationId = result.id;
    });

    it("should list all locations", async () => {
      const locations = await caller.inventory.listLocations();
      expect(Array.isArray(locations)).toBe(true);
      expect(locations.length).toBeGreaterThan(0);
    });

    it("should filter active locations", async () => {
      const activeLocations = await caller.inventory.listLocations({ isActive: true });
      expect(Array.isArray(activeLocations)).toBe(true);
      activeLocations.forEach((loc) => {
        expect(loc.isActive).toBe(true);
      });
    });
  });

  describe("Stock Management", () => {
    it("should update stock levels", async () => {
      const result = await caller.inventory.updateStock({
        itemId: testItemId,
        locationId: testLocationId,
        quantity: 500,
      });

      expect(result).toBeDefined();
    });

    it("should get stock by item", async () => {
      const stock = await caller.inventory.getStockByItem({ itemId: testItemId });
      expect(Array.isArray(stock)).toBe(true);
      
      const testLocationStock = stock.find((s) => s.locationId === testLocationId);
      expect(testLocationStock).toBeDefined();
      expect(parseFloat(testLocationStock?.quantity || "0")).toBe(500);
    });

    it("should get all stock levels", async () => {
      const allStock = await caller.inventory.getAllStockLevels();
      expect(Array.isArray(allStock)).toBe(true);
      expect(allStock.length).toBeGreaterThan(0);
    });
  });

  describe("Transactions", () => {
    it("should record a receipt transaction", async () => {
      const result = await caller.inventory.recordTransaction({
        itemId: testItemId,
        locationId: testLocationId,
        transactionType: "receipt",
        quantity: 200,
        unitCost: 2500,
        totalCost: 500000, // 200 * 2500
        notes: "Test receipt",
        transactionDate: new Date(),
      });

      expect(result).toBeDefined();
      expect(result.transactionType).toBe("receipt");
      expect(parseFloat(result.quantity)).toBe(200);
    });

    it("should record an issue transaction", async () => {
      const result = await caller.inventory.recordTransaction({
        itemId: testItemId,
        locationId: testLocationId,
        transactionType: "issue",
        quantity: -50,
        notes: "Test issue to House 1",
        transactionDate: new Date(),
      });

      expect(result).toBeDefined();
      expect(result.transactionType).toBe("issue");
      expect(parseFloat(result.quantity)).toBe(-50);
    });

    it("should get transaction history", async () => {
      const history = await caller.inventory.getTransactionHistory({
        itemId: testItemId,
      });

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThanOrEqual(2); // At least receipt and issue
    });

    it("should filter transaction history by date", async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const history = await caller.inventory.getTransactionHistory({
        itemId: testItemId,
        startDate: yesterday,
        endDate: today,
      });

      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe("Reorder Alerts", () => {
    it("should detect items below reorder point", async () => {
      // Set stock below reorder point (reorder point is 100, current should be 650 after transactions)
      await caller.inventory.updateStock({
        itemId: testItemId,
        locationId: testLocationId,
        quantity: 50, // Below reorder point of 100
      });

      const alerts = await caller.inventory.getReorderAlerts();
      expect(Array.isArray(alerts)).toBe(true);
      
      const testItemAlert = alerts.find((a) => a.itemId === testItemId);
      expect(testItemAlert).toBeDefined();
      expect(parseFloat(testItemAlert?.totalStock || "0")).toBeLessThan(100);
    });
  });

  describe("Cleanup", () => {
    it("should delete test item", async () => {
      const result = await caller.inventory.deleteItem({ id: testItemId });
      expect(result).toBeDefined();

      const deleted = await caller.inventory.getItem({ id: testItemId });
      expect(deleted).toBeNull();
    });
  });
});
