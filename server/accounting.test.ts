import { describe, expect, it } from "vitest";
import { AFGRO_DEFAULT_CHART_OF_ACCOUNTS, validateBalancedJournal } from "./accounting";

describe("Financial Accounting Phase 2 controls", () => {
  it("provides a unique AFGRO chart of accounts with each standard account type represented", () => {
    const numbers = AFGRO_DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.accountNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set(AFGRO_DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.accountType))).toEqual(
      new Set(["asset", "liability", "equity", "revenue", "expense"]),
    );
  });

  it("normalizes a balanced decimal-rand journal without cent multiplication", () => {
    expect(validateBalancedJournal([
      { accountId: 1, debit: "115.5" },
      { accountId: 2, credit: "115.50" },
    ])).toEqual({
      ok: true,
      lines: [
        { accountId: 1, debit: "115.50", credit: "0.00", description: undefined },
        { accountId: 2, debit: "0.00", credit: "115.50", description: undefined },
      ],
      totalDebit: "115.50",
      totalCredit: "115.50",
    });
  });

  it("rejects unbalanced, missing-sided, or zero-value journal lines", () => {
    expect(validateBalancedJournal([
      { accountId: 1, debit: "100.00" },
      { accountId: 2, credit: "99.99" },
    ])).toEqual({ ok: false, error: "Total debits must equal total credits before a journal can be posted." });
    expect(validateBalancedJournal([
      { accountId: 1, debit: "0" },
      { accountId: 2, credit: "0" },
    ])).toEqual({ ok: false, error: "Line 1 must contain either a debit or a credit amount." });
  });
});
