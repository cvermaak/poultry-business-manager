import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FORMS,
  PRIMARY_CLASSES,
  SUB_TYPES,
  formatSKU,
  isValidSKUComponents,
} from "@shared/sku-constants";

const inventorySource = readFileSync(resolve(process.cwd(), "client/src/pages/Inventory.tsx"), "utf8");
const inventoryRouterSource = readFileSync(resolve(process.cwd(), "server/inventory-router.ts"), "utf8");
const inventoryDbSource = readFileSync(resolve(process.cwd(), "server/db-inventory.ts"), "utf8");
const inventorySchemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

const legacyForms = {
  P: "Pellet",
  C: "Crumble",
  M: "Mash",
  L: "Liquid",
  S: "Soluble Powder",
  G: "Granule",
  D: "Dust/Powder",
  INJ: "Injectable",
} as const;

const legacyPrimaryClassCodes = ["FD", "RM", "MD", "VX", "DS", "BD", "LT", "PK", "EQ", "SP", "CL", "AD", "VT", "UT"] as const;

const sourceOption = (value: string, label: string) =>
  `<SelectItem value="${value}">${value} - ${label}</SelectItem>`;

describe("coal inventory SKU contract", () => {
  it("preserves all legacy codes and forms while adding the three-character LMP form", () => {
    expect(Object.keys(PRIMARY_CLASSES)).toEqual(legacyPrimaryClassCodes);
    expect(Object.fromEntries(Object.entries(FORMS).filter(([code]) => code !== "LMP"))).toEqual(legacyForms);
    expect(FORMS.LMP).toBe("Lump (pea coal)");
    expect("LMP").toHaveLength(3);
    expect(SUB_TYPES.UT).toEqual({ GN: "General" });
  });

  it.each(Object.entries({ ...legacyForms, LMP: "Lump (pea coal)" }))(
    "accepts UT/GN/%s and formats a synthetic sequence without touching unit master data",
    (form) => {
      expect(isValidSKUComponents("UT", "GN", form)).toBe(true);
      expect(formatSKU("UT", "GN", form, 7)).toBe(`UT-GN-${form}-007`);
    },
  );

  it.each([
    ["XX", "GN", "LMP"],
    ["UT", "XX", "LMP"],
    ["UT", "GN", "NOPE"],
    ["UT", "GN", ""],
  ])("rejects invalid SKU component %j", (primaryClass, subType, form) => {
    expect(isValidSKUComponents(primaryClass, subType, form)).toBe(false);
  });
});

describe("coal inventory form source contract", () => {
  it("adds exactly one LMP option with the shared label and preserves the eight old options", () => {
    expect(inventorySource.match(/<SelectItem value="LMP">LMP - Lump \(pea coal\)<\/SelectItem>/g)).toHaveLength(1);
    for (const [code, label] of Object.entries(legacyForms)) {
      expect(inventorySource).toContain(sourceOption(code, label));
    }
  });

  it("keeps UT/GN in the existing generic subtype branch", () => {
    expect(inventorySource).toContain('itemForm.primaryClass && !["FD", "MD", "VX", "BD"].includes(itemForm.primaryClass)');
    expect(inventorySource).toContain('<SelectItem value="GN">GN - General</SelectItem>');
  });
});

describe("inventory regression guards", () => {
  it("keeps the existing positive-opening-stock transaction branch unchanged", () => {
    expect(inventoryDbSource).toContain("if (data.currentStock && data.currentStock > 0) {");
  });

  it("does not introduce LMP into router enum columns or add a new inventory enum field", () => {
    expect(inventoryRouterSource).not.toMatch(/z\.enum\(\[[^\]]*LMP/);
    expect(inventoryRouterSource).not.toMatch(/\bform\s*:\s*z\.enum\(/);
  });

  it("keeps the existing varchar component columns and enum fields unchanged", () => {
    expect(inventorySchemaSource).toContain('primaryClass: varchar("primary_class", { length: 2 })');
    expect(inventorySchemaSource).toContain('subType: varchar("sub_type", { length: 2 })');
    expect(inventorySchemaSource).toContain('form: varchar({ length: 3 })');
    expect(inventorySchemaSource).not.toMatch(/form:\s*mysqlEnum\(/);
  });
});
