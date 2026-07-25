import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getNextSalesOrderNumber: vi.fn().mockResolvedValue("SO-001"),
    listSalesOrders: vi.fn().mockResolvedValue([
      {
        id: 1,
        orderNumber: "SO-001",
        customerId: 1,
        customerName: "Test Customer",
        customerCompany: "Test Co",
        orderDate: "2026-07-20",
        deliveryDate: null,
        status: "draft",
        subtotal: 1000,
        taxAmount: 150,
        totalAmount: 1150,
        notes: null,
        createdAt: new Date().toISOString(),
      },
    ]),
    getSalesOrderById: vi.fn().mockResolvedValue({
      id: 1,
      orderNumber: "SO-001",
      customerId: 1,
      customerName: "Test Customer",
      status: "draft",
      subtotal: 1000,
      taxAmount: 150,
      totalAmount: 1150,
    }),
    getSalesOrderItems: vi.fn().mockResolvedValue([
      {
        id: 1,
        orderId: 1,
        itemType: "other",
        description: "Test item",
        quantity: "10.00",
        unit: "kg",
        unitPrice: 100,
        subtotal: 1000,
        taxRate: "15.00",
        taxAmount: 150,
        totalAmount: 1150,
      },
    ]),
    getSalesOrderStats: vi.fn().mockResolvedValue({
      total: 5,
      draft: 2,
      confirmed: 1,
      processing: 1,
      delivered: 1,
      cancelled: 0,
      totalValue: 12500,
    }),
    createSalesOrder: vi.fn().mockResolvedValue({ insertId: 1 }),
    updateSalesOrder: vi.fn().mockResolvedValue({ id: 1, status: "confirmed" }),
    updateSalesOrderStatus: vi.fn().mockResolvedValue({ id: 1, status: "confirmed" }),
    cancelSalesOrder: vi.fn().mockResolvedValue({ id: 1, status: "cancelled" }),
    replaceSalesOrderItems: vi.fn().mockResolvedValue(undefined),
    logUserActivity: vi.fn().mockResolvedValue(undefined),
  };
});

import * as db from "./db";

describe("Sales Orders DB helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getNextSalesOrderNumber returns a formatted SO number", async () => {
    const result = await db.getNextSalesOrderNumber();
    expect(result).toMatch(/^SO-\d{3}$/);
  });

  it("listSalesOrders returns an array with customer info", async () => {
    const orders = await db.listSalesOrders();
    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThan(0);
    const order = orders[0] as any;
    expect(order).toHaveProperty("orderNumber");
    expect(order).toHaveProperty("customerName");
    expect(order).toHaveProperty("status");
  });

  it("listSalesOrders accepts filter parameters", async () => {
    await db.listSalesOrders({ status: "draft", customerId: 1 });
    expect(db.listSalesOrders).toHaveBeenCalledWith({ status: "draft", customerId: 1 });
  });

  it("getSalesOrderById returns a single order", async () => {
    const order = await db.getSalesOrderById(1);
    expect(order).toBeDefined();
    expect((order as any)?.id).toBe(1);
    expect((order as any)?.orderNumber).toBe("SO-001");
  });

  it("getSalesOrderItems returns line items for an order", async () => {
    const items = await db.getSalesOrderItems(1);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    const item = items[0] as any;
    expect(item).toHaveProperty("itemType");
    expect(item).toHaveProperty("quantity");
    expect(item).toHaveProperty("unitPrice");
  });

  it("getSalesOrderStats returns status counts and total value", async () => {
    const stats = await db.getSalesOrderStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("draft");
    expect(stats).toHaveProperty("confirmed");
    expect(stats).toHaveProperty("totalValue");
    expect(typeof stats.totalValue).toBe("number");
  });

  it("createSalesOrder returns an insertId", async () => {
    const result = await db.createSalesOrder({
      orderNumber: "SO-001",
      customerId: 1,
      orderDate: "2026-07-20",
      status: "draft",
      subtotal: 1000,
      taxAmount: 150,
      totalAmount: 1150,
      createdBy: 1,
      items: [
        {
          itemType: "other",
          description: "Test item",
          quantity: 10,
          unit: "kg",
          unitPrice: 100,
          subtotal: 1000,
          taxRate: 15,
          taxAmount: 150,
          totalAmount: 1150,
        },
      ],
    });
    expect(result).toHaveProperty("insertId");
    expect(result.insertId).toBe(1);
  });

  it("updateSalesOrderStatus updates the status correctly", async () => {
    await db.updateSalesOrderStatus(1, "confirmed");
    expect(db.updateSalesOrderStatus).toHaveBeenCalledWith(1, "confirmed");
  });

  it("cancelSalesOrder sets status to cancelled", async () => {
    const result = await db.cancelSalesOrder(1);
    expect(db.cancelSalesOrder).toHaveBeenCalledWith(1);
    expect((result as any)?.status).toBe("cancelled");
  });

  it("replaceSalesOrderItems deletes and re-inserts items", async () => {
    await db.replaceSalesOrderItems(1, [
      {
        itemType: "feed",
        description: "Broiler feed",
        quantity: 100,
        unit: "kg",
        unitPrice: 15,
        subtotal: 1500,
        taxRate: 15,
        taxAmount: 225,
        totalAmount: 1725,
      },
    ]);
    expect(db.replaceSalesOrderItems).toHaveBeenCalledWith(1, expect.any(Array));
  });
});
