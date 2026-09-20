import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getUniformInvoiceVatPercentage, resolveInvoiceVatRate } from "./db";

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const invoicePageSource = readFileSync(resolve(process.cwd(), "client/src/pages/Invoices.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("Sales Order invoice zero-VAT handling", () => {
  it("treats explicit zero as a valid VAT rate rather than the standard-rate fallback", () => {
    expect(resolveInvoiceVatRate(0)).toBe(0);
    expect(resolveInvoiceVatRate("0.00")).toBe(0);
    expect(resolveInvoiceVatRate(undefined)).toBe(15);
    expect(resolveInvoiceVatRate(null)).toBe(15);
  });

  it("sets the invoice header VAT rate for uniform orders and marks mixed-rate orders", () => {
    expect(getUniformInvoiceVatPercentage([{ taxRate: "0.00" }])).toBe("0.00");
    expect(getUniformInvoiceVatPercentage([{ taxRate: 15 }])).toBe("15.00");
    expect(getUniformInvoiceVatPercentage([{ taxRate: 0 }, { taxRate: 15 }])).toBeNull();
  });

  it("preserves zero VAT through invoice creation, detail rendering, and PDF fallback", () => {
    const invoiceCreationSource = dbSource.slice(
      dbSource.indexOf("export async function createInvoiceFromSalesOrder("),
      dbSource.indexOf("// ============================================================================\n// SUPPLIER PURCHASE ORDERS")
    );

    expect(invoiceCreationSource).toContain("vatPercentage: getUniformInvoiceVatPercentage(items)");
    expect(invoiceCreationSource).toContain("const taxRate = resolveInvoiceVatRate(item.taxRate);");
    expect(invoiceCreationSource).not.toContain("Number(item.taxRate) || 15");
    expect(invoicePageSource).toContain("formatVatRate(item.taxRate)");
    expect(invoicePageSource).toContain("getInvoiceVatLabel(viewInvoice)");
    expect(invoicePageSource).not.toContain("item.taxRate || '15'");
    expect(routerSource).toContain("invoice.vatPercentage !== null && invoice.vatPercentage !== undefined");
  });
});
