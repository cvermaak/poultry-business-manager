import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX,
  buildClosedFinancialPeriodError,
  isClosedFinancialPeriodError,
  removeFinancialPeriodErrorPrefix,
} from "../shared/financial-period-errors";
import {
  formatFinancialMutationError,
  presentFinancialMutationError,
} from "../client/src/lib/financial-period-errors";

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const invoiceSource = readFileSync(resolve(process.cwd(), "client/src/pages/Invoices.tsx"), "utf8");
const financeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Finance.tsx"), "utf8");
const millInvoiceSource = readFileSync(resolve(process.cwd(), "client/src/pages/MillInvoices.tsx"), "utf8");
const bankReconciliationSource = readFileSync(resolve(process.cwd(), "client/src/components/BankReconciliationPanel.tsx"), "utf8");
const periodCloseSource = readFileSync(resolve(process.cwd(), "client/src/components/PeriodClosePanel.tsx"), "utf8");

describe("closed financial period guidance", () => {
  const closedPeriodMessage = buildClosedFinancialPeriodError({
    action: "Sending and posting invoice INV-202609-005",
    periodName: "September 2026",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });

  it("gives an actionable, non-destructive financial-period explanation", () => {
    expect(closedPeriodMessage).toContain(CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX);
    expect(closedPeriodMessage).toContain("Sending and posting invoice INV-202609-005");
    expect(closedPeriodMessage).toContain("No financial records were changed.");
    expect(closedPeriodMessage).toContain("Choose a date outside this period");
    expect(isClosedFinancialPeriodError(closedPeriodMessage)).toBe(true);
    expect(removeFinancialPeriodErrorPrefix(closedPeriodMessage)).not.toContain(CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX);
  });

  it("distinguishes a closed-period block from ordinary mutation errors", () => {
    expect(presentFinancialMutationError({ message: closedPeriodMessage }, "Invoice could not be posted")).toEqual({
      title: "Posting blocked — financial period is closed",
      description: removeFinancialPeriodErrorPrefix(closedPeriodMessage),
    });
    expect(formatFinancialMutationError({ message: "An ordinary validation error" }, "Journal could not be posted"))
      .toBe("An ordinary validation error");
  });

  it("uses the shared contract for every protected accounting action and its main UI surfaces", () => {
    expect(dbSource).toContain('from "../shared/financial-period-errors"');
    expect(dbSource).toContain("buildClosedFinancialPeriodError");
    expect(dbSource).toContain("Sending and posting invoice");
    expect(dbSource).toContain("Recording payment for invoice");
    expect(dbSource).toContain("Posting this manual journal");
    expect(dbSource).toContain("Changing Bank Reconciliation evidence");
    expect(dbSource).toContain("Posting supplier invoice");
    expect(dbSource).toContain("Recording payment for supplier invoice");

    for (const source of [invoiceSource, financeSource, millInvoiceSource, bankReconciliationSource, periodCloseSource]) {
      expect(source).toContain("financial-period-errors");
      expect(source).toContain("FinancialMutationError");
    }
  });
});
