import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module so tests don't require a live DB connection
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";

const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };

beforeEach(() => {
  vi.clearAllMocks();
  (getDb as any).mockResolvedValue(mockDb);
});

describe("listUnitsOfMeasure", () => {
  it("returns mapped UoM rows from the database", async () => {
    mockExecute.mockResolvedValue([
      [
        { code: "kg", name: "Kilogram", symbol: "kg", uom_type: "weight", base_uom_code: null, conversion_factor: "1.00000000", is_base: 1 },
        { code: "bag50", name: "Bag (50 kg)", symbol: "bag", uom_type: "packaging", base_uom_code: "kg", conversion_factor: "50.00000000", is_base: 0 },
      ],
    ]);

    const { listUnitsOfMeasure } = await import("./db-inventory");
    const result = await listUnitsOfMeasure();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ code: "kg", name: "Kilogram", symbol: "kg", uomType: "weight", isBase: true });
    expect(result[1]).toMatchObject({ code: "bag50", baseUomCode: "kg", conversionFactor: 50, isBase: false });
  });

  it("returns empty array when DB is unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    const { listUnitsOfMeasure } = await import("./db-inventory");
    const result = await listUnitsOfMeasure();
    expect(result).toEqual([]);
  });
});

describe("listItemUnitConversions", () => {
  it("returns conversions for a given item", async () => {
    mockExecute.mockResolvedValue([
      [
        { id: 1, item_id: 42, from_uom_code: "bag50", to_uom_code: "kg", conversion_factor: "50.00000000", notes: "50 kg per bag" },
      ],
    ]);

    const { listItemUnitConversions } = await import("./db-inventory");
    const result = await listItemUnitConversions(42);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      itemId: 42,
      fromUomCode: "bag50",
      toUomCode: "kg",
      conversionFactor: 50,
      notes: "50 kg per bag",
    });
  });
});

describe("saveItemUnitConversion", () => {
  it("executes an INSERT ... ON DUPLICATE KEY UPDATE", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    const { saveItemUnitConversion } = await import("./db-inventory");

    const result = await saveItemUnitConversion({
      itemId: 42,
      fromUomCode: "bag50",
      toUomCode: "kg",
      conversionFactor: 50,
      notes: "50 kg per bag",
    });

    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it("throws when DB is unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    const { saveItemUnitConversion } = await import("./db-inventory");

    await expect(
      saveItemUnitConversion({ itemId: 1, fromUomCode: "bag50", toUomCode: "kg", conversionFactor: 50 })
    ).rejects.toThrow("Database not available");
  });
});

describe("deleteItemUnitConversion", () => {
  it("executes a DELETE statement", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    const { deleteItemUnitConversion } = await import("./db-inventory");

    const result = await deleteItemUnitConversion(7);

    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledOnce();
  });
});
