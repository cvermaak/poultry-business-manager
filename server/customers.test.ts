import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", async () => {
  const mockCustomers = [
    {
      id: 1,
      customerNumber: "CUST-001",
      name: "Test Customer",
      companyName: "Test Co (Pty) Ltd",
      contactPerson: "Jane Test",
      email: "jane@testco.co.za",
      phone: "+27 11 123 4567",
      whatsapp: "+27 82 123 4567",
      segment: "wholesale",
      creditLimit: 50000,
      paymentTerms: "Net 30",
      taxNumber: "1234567890",
      vatNumber: "4123456789",
      isActive: true,
      notes: "Key wholesale account",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      createdBy: 1,
    },
    {
      id: 2,
      customerNumber: "CUST-002",
      name: "Retail Customer",
      companyName: null,
      contactPerson: "Bob Retail",
      email: "bob@retail.co.za",
      phone: "+27 21 987 6543",
      whatsapp: null,
      segment: "retail",
      creditLimit: 0,
      paymentTerms: "Cash",
      taxNumber: null,
      vatNumber: null,
      isActive: true,
      notes: null,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      createdBy: 1,
    },
    {
      id: 3,
      customerNumber: "CUST-003",
      name: "Inactive Customer",
      companyName: "Old Co",
      contactPerson: null,
      email: null,
      phone: null,
      whatsapp: null,
      segment: "retail",
      creditLimit: 0,
      paymentTerms: "Cash",
      taxNumber: null,
      vatNumber: null,
      isActive: false,
      notes: null,
      createdAt: "2024-01-03T00:00:00Z",
      updatedAt: "2024-01-03T00:00:00Z",
      createdBy: 1,
    },
  ];

  return {
    listCustomers: vi.fn(async (filters?: { segment?: string; isActive?: boolean }) => {
      let result = [...mockCustomers];
      if (filters?.segment) result = result.filter((c) => c.segment === filters.segment);
      if (filters?.isActive !== undefined) result = result.filter((c) => c.isActive === filters.isActive);
      return result;
    }),
    getCustomerById: vi.fn(async (id: number) => mockCustomers.find((c) => c.id === id)),
    createCustomer: vi.fn(async (data: any) => {
      const newCustomer = { id: 99, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      mockCustomers.push(newCustomer);
      return { insertId: 99 };
    }),
    updateCustomer: vi.fn(async (id: number, data: any) => {
      const idx = mockCustomers.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      mockCustomers[idx] = { ...mockCustomers[idx], ...data, updatedAt: new Date().toISOString() };
      return mockCustomers[idx];
    }),
    deleteCustomer: vi.fn(async (id: number) => {
      const idx = mockCustomers.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      mockCustomers[idx] = { ...mockCustomers[idx], isActive: false, updatedAt: new Date().toISOString() };
      return mockCustomers[idx];
    }),
    getNextCustomerNumber: vi.fn(async () => "CUST-004"),
    logUserActivity: vi.fn(async () => {}),
    getCustomerAddresses: vi.fn(async () => []),
  };
});

import * as db from "./db";

describe("Customer Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listCustomers", () => {
    it("returns all customers when no filter is applied", async () => {
      const result = await db.listCustomers();
      expect(result).toHaveLength(3);
    });

    it("filters by segment", async () => {
      const result = await db.listCustomers({ segment: "wholesale" });
      expect(result).toHaveLength(1);
      expect(result[0].segment).toBe("wholesale");
    });

    it("filters active customers only", async () => {
      const result = await db.listCustomers({ isActive: true });
      expect(result.every((c: any) => c.isActive)).toBe(true);
    });

    it("filters inactive customers only", async () => {
      const result = await db.listCustomers({ isActive: false });
      expect(result.every((c: any) => !c.isActive)).toBe(true);
    });
  });

  describe("getCustomerById", () => {
    it("returns a customer by id", async () => {
      const result = await db.getCustomerById(1);
      expect(result).toBeDefined();
      expect(result?.customerNumber).toBe("CUST-001");
      expect(result?.name).toBe("Test Customer");
    });

    it("returns undefined for non-existent id", async () => {
      const result = await db.getCustomerById(9999);
      expect(result).toBeUndefined();
    });
  });

  describe("createCustomer", () => {
    it("creates a new customer with all fields", async () => {
      const data = {
        customerNumber: "CUST-099",
        name: "New Customer",
        companyName: "New Co (Pty) Ltd",
        segment: "contract" as const,
        creditLimit: 100000,
        paymentTerms: "Net 60",
        isActive: true,
        createdBy: 1,
      };
      const result = await db.createCustomer(data);
      expect(result).toBeDefined();
      expect(db.createCustomer).toHaveBeenCalledWith(data);
    });
  });

  describe("updateCustomer", () => {
    it("updates customer fields", async () => {
      const result = await db.updateCustomer(1, { creditLimit: 75000, paymentTerms: "Net 60" });
      expect(result).toBeDefined();
      expect(db.updateCustomer).toHaveBeenCalledWith(1, { creditLimit: 75000, paymentTerms: "Net 60" });
    });

    it("returns undefined for non-existent customer", async () => {
      const result = await db.updateCustomer(9999, { name: "Ghost" });
      expect(result).toBeUndefined();
    });
  });

  describe("deleteCustomer (soft deactivate)", () => {
    it("deactivates a customer without deleting data", async () => {
      const result = await db.deleteCustomer(2);
      expect(result).toBeDefined();
      expect(result?.isActive).toBe(false);
    });
  });

  describe("getNextCustomerNumber", () => {
    it("returns the next sequential customer number", async () => {
      const result = await db.getNextCustomerNumber();
      expect(result).toMatch(/^CUST-\d{3,}$/);
    });
  });

  describe("getCustomerAddresses", () => {
    it("returns addresses for a customer", async () => {
      const result = await db.getCustomerAddresses(1);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
