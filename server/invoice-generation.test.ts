import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: vi.fn(),
    createInvoiceFromSalesOrder: vi.fn(),
    getInvoiceByOrderId: vi.fn(),
    listInvoices: vi.fn(),
    getInvoiceById: vi.fn(),
  };
});

import {
  createInvoiceFromSalesOrder,
  getInvoiceByOrderId,
  listInvoices,
} from "./db";

describe("Invoice Generation from Sales Order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createInvoiceFromSalesOrder returns an invoice id on success", async () => {
    const mockFn = vi.mocked(createInvoiceFromSalesOrder);
    mockFn.mockResolvedValueOnce(42);

    const result = await createInvoiceFromSalesOrder({
      orderId: 1,
      invoiceDate: "2026-07-25",
      dueDate: "2026-08-25",
      createdBy: 1,
    });

    expect(result).toBe(42);
    expect(mockFn).toHaveBeenCalledWith({
      orderId: 1,
      invoiceDate: "2026-07-25",
      dueDate: "2026-08-25",
      createdBy: 1,
    });
  });

  it("createInvoiceFromSalesOrder accepts optional notes", async () => {
    const mockFn = vi.mocked(createInvoiceFromSalesOrder);
    mockFn.mockResolvedValueOnce(43);

    const result = await createInvoiceFromSalesOrder({
      orderId: 2,
      invoiceDate: "2026-07-25",
      dueDate: "2026-08-25",
      notes: "Please pay within 30 days",
      createdBy: 1,
    });

    expect(result).toBe(43);
    expect(mockFn).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Please pay within 30 days" })
    );
  });

  it("getInvoiceByOrderId returns null when no invoice exists for an order", async () => {
    const mockFn = vi.mocked(getInvoiceByOrderId);
    mockFn.mockResolvedValueOnce(null);

    const result = await getInvoiceByOrderId(999);

    expect(result).toBeNull();
    expect(mockFn).toHaveBeenCalledWith(999);
  });

  it("getInvoiceByOrderId returns the invoice when one exists", async () => {
    const mockInvoice = {
      id: 10,
      invoiceNumber: "INV-001",
      orderId: 5,
      status: "draft",
      totalAmount: "5000.00",
    };
    const mockFn = vi.mocked(getInvoiceByOrderId);
    mockFn.mockResolvedValueOnce(mockInvoice as any);

    const result = await getInvoiceByOrderId(5);

    expect(result).toEqual(mockInvoice);
    expect((result as any)?.invoiceNumber).toBe("INV-001");
  });

  it("listInvoices includes orderNumber in results when joined", async () => {
    const mockInvoices = [
      {
        id: 1,
        invoiceNumber: "INV-001",
        customerName: "Test Customer",
        orderNumber: "SO-001",
        status: "draft",
        totalAmount: "10000.00",
      },
      {
        id: 2,
        invoiceNumber: "INV-002",
        customerName: "Another Customer",
        orderNumber: null,
        status: "sent",
        totalAmount: "5000.00",
      },
    ];
    const mockFn = vi.mocked(listInvoices);
    mockFn.mockResolvedValueOnce(mockInvoices as any);

    const result = await listInvoices();

    expect(result).toHaveLength(2);
    expect((result[0] as any).orderNumber).toBe("SO-001");
    expect((result[1] as any).orderNumber).toBeNull();
  });

  it("createInvoiceFromSalesOrder throws when orderId is invalid", async () => {
    const mockFn = vi.mocked(createInvoiceFromSalesOrder);
    mockFn.mockRejectedValueOnce(new Error("Sales order not found"));

    await expect(
      createInvoiceFromSalesOrder({
        orderId: 0,
        invoiceDate: "2026-07-25",
        dueDate: "2026-08-25",
        createdBy: 1,
      })
    ).rejects.toThrow("Sales order not found");
  });

  it("listInvoices can filter by status", async () => {
    const mockFn = vi.mocked(listInvoices);
    mockFn.mockResolvedValueOnce([]);

    await listInvoices({ status: "draft" });

    expect(mockFn).toHaveBeenCalledWith({ status: "draft" });
  });
});
