import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateInvoiceLineMoney, calculateInvoiceTotals } from "./invoice-money";
import {
  generatePremiumInvoicePDF,
  getInvoicePdfLineAmounts,
  getInvoicePdfRoundingAdjustment,
} from "./pdf-generator-premium";

const projectRoot = process.cwd();
const routerSource = readFileSync(resolve(projectRoot, "server/routers.ts"), "utf8");
const createInvoiceSource = readFileSync(resolve(projectRoot, "client/src/pages/CreateInvoice.tsx"), "utf8");
const invoiceDetailSource = readFileSync(resolve(projectRoot, "client/src/pages/Invoices.tsx"), "utf8");

describe("invoice money and output integrity", () => {
  it("sums rounded persisted line values into the invoice header", () => {
    const lines = Array.from({ length: 3 }, () => ({
      quantity: 1,
      unitPrice: 0.05,
      discountPercent: 0,
      vatPercent: 15,
    }));

    const line = calculateInvoiceLineMoney(lines[0]);
    const totals = calculateInvoiceTotals(lines);

    expect(line).toEqual({
      subtotalCents: 5,
      discountCents: 0,
      exclusiveCents: 5,
      vatCents: 1,
      inclusiveCents: 6,
    });
    expect(totals).toEqual({
      exclusiveCents: 15,
      vatCents: 3,
      inclusiveCents: 18,
      discountCents: 0,
    });
  });

  it("prefers persisted PDF line totals and exposes a legacy rounding adjustment explicitly", () => {
    const line = {
      description: "Grower feed",
      quantity: 1,
      pricePerUnit: 0.05,
      vatPercentage: 15,
      exclusiveAmount: 0.05,
      vatAmount: 0.01,
      totalAmount: 0.06,
    };

    expect(getInvoicePdfLineAmounts(line).total).toBe(0.06);
    expect(getInvoicePdfRoundingAdjustment({ lineItems: [line], totalInclusive: 0.05 })).toBe(-0.01);
    expect(getInvoicePdfRoundingAdjustment({ lineItems: [line], totalInclusive: 0.06 })).toBe(0);
  });

  it("paginates long invoice tables instead of dropping line items", async () => {
    const lineItems = Array.from({ length: 60 }, (_, index) => ({
      description: `Commercial broiler feed allocation ${index + 1}`,
      quantity: 1,
      pricePerUnit: 10,
      vatPercentage: 0,
      totalAmount: 10,
    }));
    const pdf = await generatePremiumInvoicePDF({
      invoiceNumber: "INV-PAGINATION-001",
      invoiceDate: new Date("2026-09-20T00:00:00Z"),
      dueDate: new Date("2026-10-20T00:00:00Z"),
      customerName: "Test Customer",
      lineItems,
      totalExclusive: 600,
      totalVAT: 0,
      totalInclusive: 600,
      companyInfo: { name: "AFGRO", address: "1 Poultry Lane, Western Cape" },
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });

  it("passes notes, a canonical billing address, and persisted line amounts to PDF output", () => {
    expect(createInvoiceSource).toContain("notes: formData.notes.trim() || undefined");
    expect(routerSource).toContain("db.getCustomerAddresses(customerId)");
    expect(routerSource).toContain("exclusiveAmount: Number(item.subtotal ?? 0) / 100");
    expect(routerSource).toContain("notes: invoiceForPdf.notes || undefined");
    expect(routerSource).toContain("Company Settings is incomplete");
  });

  it("labels invoice totals as mixed VAT when line rates differ", () => {
    expect(invoiceDetailSource).toContain("return lineRates.size > 1");
    expect(invoiceDetailSource).toContain("hasMixedVatRates(viewInvoiceItems) ? \"Mixed rates\"");
  });
});
