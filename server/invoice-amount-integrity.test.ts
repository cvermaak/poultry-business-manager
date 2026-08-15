import { describe, expect, it } from "vitest";
import { normalizeLegacyInvoiceAmounts } from "./invoice-amount-integrity";

describe("legacy invoice amount integrity", () => {
  it("recovers an old 100× header without changing its canonical totals or posted-rand payment", () => {
    expect(normalizeLegacyInvoiceAmounts({
      subtotal: "1325250.00",
      exclusiveTotal: "13252.50",
      taxAmount: "198788.00",
      vatAmount: "1987.88",
      totalAmount: "1524038.00",
      inclusiveTotal: "15240.38",
      paidAmount: "15240.38",
      balanceDue: "1508797.62",
      status: "partial",
    })).toMatchObject({
      hasLegacyHundredfoldHeader: true,
      subtotal: "13252.50",
      taxAmount: "1987.88",
      totalAmount: "15240.38",
      paidAmount: "15240.38",
      balanceDue: "0.00",
      status: "paid",
    });
  });

  it("leaves a valid decimal-rand invoice untouched", () => {
    expect(normalizeLegacyInvoiceAmounts({
      subtotal: "4300.00",
      exclusiveTotal: "4300.00",
      taxAmount: "645.00",
      vatAmount: "645.00",
      totalAmount: "4945.00",
      inclusiveTotal: "4945.00",
      paidAmount: "0.00",
      balanceDue: "4945.00",
      status: "sent",
    })).toMatchObject({
      hasLegacyHundredfoldHeader: false,
      totalAmount: "4945.00",
      balanceDue: "4945.00",
      status: "sent",
    });
  });
});
