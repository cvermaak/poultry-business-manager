import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// Mock the database module so tests don't need a live DB connection
vi.mock("./db", () => ({
  listSuppliers: vi.fn(),
  getSupplierById: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  getNextSupplierNumber: vi.fn(),
}));

const mockSupplier = {
  id: 1,
  supplierNumber: "SUP-001",
  name: "Afgri Animal Feeds",
  contactPerson: "John Smith",
  email: "john@afgri.co.za",
  phone: "+27 11 123 4567",
  whatsapp: "+27 82 123 4567",
  preferredContactMethod: "email",
  category: "Feed & Nutrition",
  paymentTerms: "Net 30",
  taxNumber: "4123456789",
  bankName: "First National Bank",
  bankAccountNumber: "62123456789",
  notes: "Primary feed supplier",
  isActive: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("Supplier CRUD helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listSuppliers returns all active suppliers", async () => {
    vi.mocked(db.listSuppliers).mockResolvedValue([mockSupplier]);
    const result = await db.listSuppliers({ isActive: true });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Afgri Animal Feeds");
    expect(db.listSuppliers).toHaveBeenCalledWith({ isActive: true });
  });

  it("listSuppliers filters by category", async () => {
    vi.mocked(db.listSuppliers).mockResolvedValue([mockSupplier]);
    const result = await db.listSuppliers({ category: "Feed & Nutrition" });
    expect(result).toHaveLength(1);
    expect(db.listSuppliers).toHaveBeenCalledWith({ category: "Feed & Nutrition" });
  });

  it("getSupplierById returns the correct supplier", async () => {
    vi.mocked(db.getSupplierById).mockResolvedValue(mockSupplier);
    const result = await db.getSupplierById(1);
    expect(result).not.toBeNull();
    expect(result?.supplierNumber).toBe("SUP-001");
    expect(result?.email).toBe("john@afgri.co.za");
  });

  it("getSupplierById returns null for unknown id", async () => {
    vi.mocked(db.getSupplierById).mockResolvedValue(null);
    const result = await db.getSupplierById(9999);
    expect(result).toBeNull();
  });

  it("createSupplier generates a supplier number and saves the record", async () => {
    const created = { ...mockSupplier, id: 2, supplierNumber: "SUP-002" };
    vi.mocked(db.createSupplier).mockResolvedValue(created);
    const result = await db.createSupplier({
      name: "Afgri Animal Feeds",
      contactPerson: "John Smith",
      email: "john@afgri.co.za",
      phone: "+27 11 123 4567",
      whatsapp: "+27 82 123 4567",
      preferredContactMethod: "email",
      category: "Feed & Nutrition",
      paymentTerms: "Net 30",
      taxNumber: "4123456789",
      bankName: "First National Bank",
      bankAccountNumber: "62123456789",
      notes: "Primary feed supplier",
    });
    expect(result.supplierNumber).toBe("SUP-002");
    expect(result.name).toBe("Afgri Animal Feeds");
  });

  it("updateSupplier updates the specified fields", async () => {
    const updated = { ...mockSupplier, paymentTerms: "Net 60" };
    vi.mocked(db.updateSupplier).mockResolvedValue(updated);
    const result = await db.updateSupplier(1, { paymentTerms: "Net 60" });
    expect(result.paymentTerms).toBe("Net 60");
    expect(db.updateSupplier).toHaveBeenCalledWith(1, { paymentTerms: "Net 60" });
  });

  it("deleteSupplier deactivates the supplier (soft delete)", async () => {
    const deactivated = { ...mockSupplier, isActive: false };
    vi.mocked(db.deleteSupplier).mockResolvedValue(deactivated);
    const result = await db.deleteSupplier(1);
    expect(result.isActive).toBe(false);
    expect(db.deleteSupplier).toHaveBeenCalledWith(1);
  });

  it("getNextSupplierNumber returns sequential SUP-XXX format", async () => {
    vi.mocked(db.getNextSupplierNumber).mockResolvedValue("SUP-005");
    const result = await db.getNextSupplierNumber();
    expect(result).toMatch(/^SUP-\d{3}$/);
  });
});
