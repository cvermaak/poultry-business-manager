import { describe, expect, it } from "vitest";
import { resolveSupplierOptions } from "./supplier-options";

describe("resolveSupplierOptions", () => {
  it("returns valid options from the direct supplier-list response", () => {
    expect(resolveSupplierOptions([
      { id: 12, supplierNumber: "SUP-012", name: "The Mill" },
    ])).toEqual([
      { id: 12, label: "SUP-012 — The Mill" },
    ]);
  });

  it("supports a wrapped supplier-list response without rendering blank items", () => {
    expect(resolveSupplierOptions({
      suppliers: [
        { id: "8", name: "  Protein Supply  " },
        { id: null, name: "Invalid supplier" },
        { id: 9, name: "" },
      ],
    })).toEqual([
      { id: 8, label: "Protein Supply" },
    ]);
  });

  it("returns no options for an unavailable or malformed response", () => {
    expect(resolveSupplierOptions(undefined)).toEqual([]);
    expect(resolveSupplierOptions({ suppliers: "not-an-array" })).toEqual([]);
  });
});
