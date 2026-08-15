import { describe, expect, it } from "vitest";
import {
  buildSupplierInvoicePosting,
  buildSupplierPaymentPosting,
  getSupplierInvoiceJournalNumber,
  getSupplierPaymentJournalNumber,
  validateSupplierPaymentAgainstBalance,
} from "./supplier-payable-posting";
import { validateBalancedJournal } from "./accounting";

describe("Supplier Accounts Payable posting", () => {
  it("builds a balanced inventory, VAT input, and Trade Payables journal", () => {
    const lines = buildSupplierInvoicePosting({
      invoiceNumber: "MILL-INV-001",
      amountExcl: "1000.00",
      vatAmount: "150.00",
      amountIncl: "1150.00",
      accountIds: { inventory: 12, vatInput: 13, tradePayables: 20 },
    });

    expect(lines).toEqual([
      expect.objectContaining({ accountId: 12, debit: "1000.00" }),
      expect.objectContaining({ accountId: 13, debit: "150.00" }),
      expect.objectContaining({ accountId: 20, credit: "1150.00" }),
    ]);
    expect(validateBalancedJournal(lines)).toMatchObject({ ok: true, totalDebit: "1150.00", totalCredit: "1150.00" });
  });

  it("rejects a supplier invoice whose VAT-inclusive total does not reconcile", () => {
    expect(() => buildSupplierInvoicePosting({
      invoiceNumber: "MILL-INV-BAD",
      amountExcl: "1000.00",
      vatAmount: "150.00",
      amountIncl: "1149.99",
      accountIds: { inventory: 12, vatInput: 13, tradePayables: 20 },
    })).toThrow("inclusive total must equal exclusive total plus VAT");
  });

  it("builds a balanced Trade Payables settlement and Bank payment journal", () => {
    const lines = buildSupplierPaymentPosting({
      invoiceNumber: "MILL-INV-001",
      amount: "575.00",
      accountIds: { bank: 10, tradePayables: 20 },
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountId: 20, debit: "575.00" }),
      expect.objectContaining({ accountId: 10, credit: "575.00" }),
    ]);
    expect(validateBalancedJournal(lines)).toMatchObject({ ok: true, totalDebit: "575.00", totalCredit: "575.00" });
  });

  it("prevents a supplier payment from exceeding the remaining payable balance", () => {
    expect(() => validateSupplierPaymentAgainstBalance({ amount: "1150.01", balanceDue: "1150.00" })).toThrow("cannot exceed");
    expect(validateSupplierPaymentAgainstBalance({ amount: "575.00", balanceDue: "1150.00" })).toMatchObject({ payment: { normalized: "575.00" }, balance: { normalized: "1150.00" } });
  });

  it("uses distinct, deterministic GL journal identifiers for invoices and payments", () => {
    expect(getSupplierInvoiceJournalNumber(53)).toBe("GL-AP-53");
    expect(getSupplierPaymentJournalNumber(9)).toBe("GL-AP-PAY-9");
  });
});
