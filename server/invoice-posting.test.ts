import { describe, expect, it } from "vitest";
import { buildCustomerInvoicePosting, resolveCustomerInvoiceRevenueAccountNumber } from "./invoice-posting";
import { validateBalancedJournal } from "./accounting";

describe("automatic customer invoice posting", () => {
  const accountIds = { tradeReceivables: 11, vatOutput: 21, revenue: 40 };

  it("posts a live-bird invoice as receivable, revenue, and VAT output", () => {
    const lines = buildCustomerInvoicePosting({
      invoiceNumber: "INV-100", exclusiveTotal: "1000.00", vatAmount: "150.00", inclusiveTotal: "1150.00", accountIds,
    });

    expect(lines).toEqual([
      expect.objectContaining({ accountId: 11, debit: "1150.00" }),
      expect.objectContaining({ accountId: 40, credit: "1000.00" }),
      expect.objectContaining({ accountId: 21, credit: "150.00" }),
    ]);
    expect(validateBalancedJournal(lines).ok).toBe(true);
  });

  it("omits VAT output for a zero-rated invoice while retaining a balanced journal", () => {
    const lines = buildCustomerInvoicePosting({
      invoiceNumber: "INV-101", exclusiveTotal: "500.00", vatAmount: "0.00", inclusiveTotal: "500.00", accountIds,
    });

    expect(lines).toHaveLength(2);
    expect(validateBalancedJournal(lines).ok).toBe(true);
  });

  it("uses the feed-sales account only for an invoice linked to a feed order", () => {
    expect(resolveCustomerInvoiceRevenueAccountNumber()).toBe("4000");
    expect(resolveCustomerInvoiceRevenueAccountNumber(12)).toBe("4100");
  });

  it("rejects inconsistent invoice totals before any journal is constructed", () => {
    expect(() => buildCustomerInvoicePosting({
      invoiceNumber: "INV-102", exclusiveTotal: "100.00", vatAmount: "15.00", inclusiveTotal: "114.00", accountIds,
    })).toThrow("inclusive total must equal exclusive total plus VAT");
  });
});
