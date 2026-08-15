import { describe, expect, it } from "vitest";
import { validateBalancedJournal } from "./accounting";
import {
  buildCustomerPaymentPosting,
  getCustomerPaymentJournalNumber,
  parseRandAmount,
  resolveCustomerPaymentOutcome,
  validateCustomerPaymentAgainstBalance,
} from "./payment-posting";

describe("automatic customer payment posting", () => {
  const accountIds = { bank: 10, tradeReceivables: 11 };

  it("uses a distinct General Ledger identifier for a customer payment receipt", () => {
    expect(getCustomerPaymentJournalNumber(1020002)).toBe("GL-PAY-1020002");
    expect(() => getCustomerPaymentJournalNumber(0)).toThrow("valid customer payment ID");
  });

  it("posts a customer receipt as debit Bank and credit Trade Receivables", () => {
    const lines = buildCustomerPaymentPosting({
      invoiceNumber: "INV-100",
      amount: "1,000.00".replace(",", ""),
      accountIds,
    });

    expect(lines).toEqual([
      expect.objectContaining({ accountId: 10, debit: "1000.00" }),
      expect.objectContaining({ accountId: 11, credit: "1000.00" }),
    ]);
    expect(validateBalancedJournal(lines).ok).toBe(true);
  });

  it("normalizes payment amounts without altering decimal-rand values", () => {
    expect(parseRandAmount("125.5", "Customer payment amount")).toEqual({ cents: 12550, normalized: "125.50" });
    expect(parseRandAmount(0, "Invoice balance due", true)).toEqual({ cents: 0, normalized: "0.00" });
  });

  it("rejects zero, negative, or more-than-two-decimal payment amounts", () => {
    expect(() => parseRandAmount("0", "Customer payment amount")).toThrow("positive rand amount");
    expect(() => parseRandAmount("-1.00", "Customer payment amount")).toThrow("valid rand amount");
    expect(() => parseRandAmount("12.345", "Customer payment amount")).toThrow("valid rand amount");
  });

  it("rejects customer payments that exceed the remaining invoice balance", () => {
    expect(validateCustomerPaymentAgainstBalance({ amount: "75.50", balanceDue: "75.50" })).toEqual({
      payment: { cents: 7550, normalized: "75.50" },
      balance: { cents: 7550, normalized: "75.50" },
    });
    expect(() => validateCustomerPaymentAgainstBalance({ amount: "75.51", balanceDue: "75.50" })).toThrow("cannot exceed");
    expect(() => validateCustomerPaymentAgainstBalance({ amount: "1.00", balanceDue: "0.00" })).toThrow("no remaining balance");
  });

  it("marks an exact full-balance payment as paid and retains partial status only when cents remain", () => {
    expect(resolveCustomerPaymentOutcome({ amount: "1092.50", balanceDue: "1092.50" })).toMatchObject({
      remainingBalance: "0.00",
      status: "paid",
    });
    expect(resolveCustomerPaymentOutcome({ amount: "1092.49", balanceDue: "1092.50" })).toMatchObject({
      remainingBalance: "0.01",
      status: "partial",
    });
  });
});
