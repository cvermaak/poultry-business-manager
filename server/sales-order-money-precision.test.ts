import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { currencyDecimal } from "./db";

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

function sourceBetween(start: string, end: string) {
  return dbSource.slice(dbSource.indexOf(start), dbSource.indexOf(end));
}

describe("Sales Order decimal currency precision", () => {
  it("preserves cents while normalizing currency values", () => {
    expect(currencyDecimal(34.5)).toBe("34.50");
    expect(currencyDecimal(39.675)).toBe("39.68");
    expect(currencyDecimal(0)).toBe("0.00");
    expect(() => currencyDecimal(Number.NaN)).toThrow("must be finite");
  });

  it("stores the seven Sales Order money fields as decimal(15,2)", () => {
    const salesOrderItemsSchema = schemaSource.slice(
      schemaSource.indexOf('export const salesOrderItems'),
      schemaSource.indexOf('export const salesOrders')
    );
    const salesOrdersSchema = schemaSource.slice(
      schemaSource.indexOf('export const salesOrders'),
      schemaSource.indexOf('export const stressPacks')
    );

    for (const field of ["unitPrice", "subtotal", "taxAmount", "totalAmount"]) {
      expect(salesOrderItemsSchema).toContain(`${field}: decimal({ precision: 15, scale: 2 }).notNull()`);
    }
    for (const field of ["subtotal", "taxAmount", "totalAmount"]) {
      expect(salesOrdersSchema).toContain(`${field}: decimal({ precision: 15, scale: 2 }).notNull()`);
    }
  });

  it("uses decimal currency serialization for create, update, and replacement writes", () => {
    const createSource = sourceBetween("export async function createSalesOrder(", "export async function updateSalesOrder(");
    const updateSource = sourceBetween("export async function updateSalesOrder(", "export async function updateSalesOrderStatus(");
    const replaceSource = sourceBetween("export async function replaceSalesOrderItems(", "export async function getSalesOrderStats(");

    for (const field of ["unitPrice", "subtotal", "taxAmount", "totalAmount"]) {
      expect(createSource).toContain(`${field}: currencyDecimal(item.${field})`);
      expect(replaceSource).toContain(`${field}: currencyDecimal(item.${field})`);
    }
    for (const field of ["subtotal", "taxAmount", "totalAmount"]) {
      expect(createSource).toContain(`${field}: currencyDecimal(${field})`);
      expect(updateSource).toContain(`${field}: currencyDecimal(${field})`);
    }
    expect(`${createSource}\n${replaceSource}`).not.toContain("Math.round(item.");
  });
});
