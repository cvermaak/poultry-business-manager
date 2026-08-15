import { describe, expect, it } from "vitest";
import {
	calculateAgedPayablesReport,
	calculateAgedReceivablesReport,
  calculateBalanceSheetReport,
  calculateCashFlowStatement,
  calculateProfitAndLossReport,
  calculateTrialBalanceReport,
} from "./financial-reporting";

describe("Financial Accounting report calculations", () => {
  it("calculates an accrual-basis Profit & Loss with revenue, cost of sales, and operating expenses", () => {
    const report = calculateProfitAndLossReport({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      invoices: [
        { id: 1, invoiceDate: "2026-08-03 08:00:00", status: "sent", subtotal: "1000.00", exclusiveTotal: "1000.00" },
        { id: 2, invoiceDate: "2026-08-04 08:00:00", status: "draft", subtotal: "500.00", exclusiveTotal: "500.00" },
        { id: 3, invoiceDate: "2026-07-31 08:00:00", status: "paid", subtotal: "600.00", exclusiveTotal: "600.00" },
      ],
      expenses: [
        { id: 1, expenseDate: "2026-08-05 08:00:00", status: "paid", categoryName: "Feed - Starter", amount: 250000 },
        { id: 2, expenseDate: "2026-08-06 08:00:00", status: "pending", categoryName: "Labour", amount: 50000 },
        { id: 3, expenseDate: "2026-08-07 08:00:00", status: "cancelled", categoryName: "Power", amount: 10000 },
      ],
      millInvoices: [
        { id: 1, invoiceDate: "2026-08-10", status: "outstanding", amountExcl: "300.00" },
        { id: 2, invoiceDate: "2026-08-12", status: "disputed", amountExcl: "800.00" },
      ],
    });

    expect(report.revenue).toBe(1000);
    expect(report.costOfSales).toBe(2800);
    expect(report.grossProfit).toBe(-1800);
    expect(report.operatingExpenses).toBe(500);
    expect(report.netProfit).toBe(-2300);
    expect(report.costOfSalesByCategory).toEqual([
      { category: "Feed - Starter", amount: 2500 },
      { category: "Mill feed invoices", amount: 300 },
    ]);
    expect(report.operatingExpensesByCategory).toEqual([{ category: "Labour", amount: 500 }]);
  });

  it("groups open receivables by days outstanding as at the selected date", () => {
    const report = calculateAgedReceivablesReport({
      asOfDate: "2026-08-14",
      invoices: [
        {
          id: 1,
          invoiceNumber: "INV-001",
          customerName: "Alpha Farm",
          invoiceDate: "2026-07-15",
          dueDate: "2026-07-30",
          status: "sent",
          balanceDue: "1000.00",
        },
        {
          id: 2,
          invoiceNumber: "INV-002",
          customerName: "Beta Farm",
          invoiceDate: "2026-06-14",
          dueDate: "2026-06-29",
          status: "partial",
          balanceDue: "2000.00",
        },
        {
          id: 3,
          invoiceNumber: "INV-003",
          customerName: "Gamma Farm",
          invoiceDate: "2026-04-01",
          dueDate: "2026-04-15",
          status: "paid",
          balanceDue: "0.00",
        },
      ],
    });

    expect(report.totalOutstanding).toBe(3000);
    expect(report.buckets).toEqual({ "0-30": 1000, "31-60": 0, "61-90": 2000, "90+": 0 });
    expect(report.receivables[0]).toMatchObject({ invoiceNumber: "INV-002", daysOutstanding: 61, bucket: "61-90" });
  });

	it("uses canonical decimal-rand totals when a legacy header balance is exactly 100× too high", () => {
    const report = calculateAgedReceivablesReport({
      asOfDate: "2026-08-15",
      invoices: [{
        id: 4,
        invoiceNumber: "INV-LEGACY-100X",
        customerName: "Ebrahim",
        invoiceDate: "2026-05-06",
        dueDate: "2026-06-05",
        status: "sent",
        balanceDue: "494500.00",
        inclusiveTotal: "4945.00",
        paidAmount: "0.00",
      }],
    });

    expect(report.totalOutstanding).toBe(4945);
    expect(report.buckets["90+"]).toBe(4945);
    expect(report.receivables[0]).toMatchObject({ invoiceNumber: "INV-LEGACY-100X", balanceDue: 4945 });
	});

	it("groups only open, posted supplier balances into Accounts Payable ageing buckets", () => {
		const report = calculateAgedPayablesReport({
			asOfDate: "2026-08-14",
			invoices: [
				{ id: 1, invoiceNumber: "MILL-001", supplierName: "The Mill", invoiceDate: "2026-07-15", dueDate: "2026-07-30", status: "outstanding", balanceDue: "1000.00" },
				{ id: 2, invoiceNumber: "MILL-002", supplierName: "Feed Co", invoiceDate: "2026-06-14", dueDate: "2026-06-29", status: "partial", balanceDue: "2000.00" },
				{ id: 3, invoiceNumber: "MILL-003", supplierName: "Feed Co", invoiceDate: "2026-04-01", dueDate: "2026-04-15", status: "paid", balanceDue: "0.00" },
				{ id: 4, invoiceNumber: "MILL-004", supplierName: "Feed Co", invoiceDate: "2026-05-01", dueDate: "2026-05-15", status: "disputed", balanceDue: "3000.00" },
			],
		});

		expect(report.totalOutstanding).toBe(3000);
		expect(report.buckets).toEqual({ "0-30": 1000, "31-60": 0, "61-90": 2000, "90+": 0 });
		expect(report.payables[0]).toMatchObject({ invoiceNumber: "MILL-002", supplierName: "Feed Co", bucket: "61-90" });
	});

	it("produces a VAT-inclusive actual cash-flow statement from cash receipts and payments", () => {
    const report = calculateCashFlowStatement({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      receipts: [
        { id: "invoice-1", date: "2026-08-05", amount: 100, description: "Invoice payment", source: "Invoice payment" },
        { id: "payment-1", date: "2026-08-06", amount: 50, description: "Standalone payment", source: "Standalone payment" },
        { id: "invoice-2", date: "2026-07-31", amount: 500, description: "Outside range", source: "Invoice payment" },
      ],
      payments: [
        { id: "expense-1", date: "2026-08-07", amount: 57.5, description: "Expense payment", source: "Expense payment" },
        { id: "mill-1", date: "2026-08-10", amount: 115, description: "Mill payment", source: "Mill invoice payment" },
      ],
    });

    expect(report.cashInflows).toBe(150);
    expect(report.cashOutflows).toBe(172.5);
    expect(report.netCashMovement).toBe(-22.5);
    expect(report.monthlySummary).toEqual([
      { month: "2026-08", cashInflows: 150, cashOutflows: 172.5, netCashMovement: -22.5 },
    ]);
    expect(report.transactions).toHaveLength(4);
  });

  it("calculates a balanced trial balance from posted debit and credit ledger lines", () => {
    const report = calculateTrialBalanceReport({
      asOfDate: "2026-08-15",
      accounts: [
        { id: 1, accountNumber: "1000", accountName: "Bank", accountType: "asset", accountSubtype: "current_asset", normalBalance: "debit" },
        { id: 2, accountNumber: "1100", accountName: "Trade Receivables", accountType: "asset", accountSubtype: "current_asset", normalBalance: "debit" },
        { id: 3, accountNumber: "2100", accountName: "VAT Output", accountType: "liability", accountSubtype: "tax", normalBalance: "credit" },
        { id: 4, accountNumber: "4000", accountName: "Live Bird Sales", accountType: "revenue", accountSubtype: "operating_revenue", normalBalance: "credit" },
      ],
      ledgerLines: [
        { accountId: 2, debit: "115.00", credit: "0.00" },
        { accountId: 4, debit: "0.00", credit: "100.00" },
        { accountId: 3, debit: "0.00", credit: "15.00" },
        { accountId: 1, debit: "115.00", credit: "0.00" },
        { accountId: 2, debit: "0.00", credit: "115.00" },
      ],
    });

    expect(report).toMatchObject({ totalDebit: 115, totalCredit: 115, difference: 0, isBalanced: true });
    expect(report.rows.find((row) => row.accountNumber === "1000")).toMatchObject({ balanceDebit: 115, balanceCredit: 0, netBalance: 115 });
    expect(report.rows.find((row) => row.accountNumber === "4000")).toMatchObject({ balanceDebit: 0, balanceCredit: 100, netBalance: 100 });
  });

  it("reconciles assets with liabilities, equity, and current-period earnings", () => {
    const input = {
      asOfDate: "2026-08-15",
      accounts: [
        { id: 1, accountNumber: "1000", accountName: "Bank", accountType: "asset" as const, accountSubtype: "current_asset", normalBalance: "debit" as const },
        { id: 2, accountNumber: "1100", accountName: "Trade Receivables", accountType: "asset" as const, accountSubtype: "current_asset", normalBalance: "debit" as const },
        { id: 3, accountNumber: "2100", accountName: "VAT Output", accountType: "liability" as const, accountSubtype: "tax", normalBalance: "credit" as const },
        { id: 4, accountNumber: "3000", accountName: "Owner's Equity", accountType: "equity" as const, accountSubtype: "capital", normalBalance: "credit" as const },
        { id: 5, accountNumber: "4000", accountName: "Live Bird Sales", accountType: "revenue" as const, accountSubtype: "operating_revenue", normalBalance: "credit" as const },
        { id: 6, accountNumber: "6000", accountName: "Labour", accountType: "expense" as const, accountSubtype: "operating_expense", normalBalance: "debit" as const },
      ],
      ledgerLines: [
        { accountId: 1, debit: "1100.00", credit: "0.00" },
        { accountId: 2, debit: "100.00", credit: "0.00" },
        { accountId: 3, debit: "0.00", credit: "150.00" },
        { accountId: 4, debit: "0.00", credit: "500.00" },
        { accountId: 5, debit: "0.00", credit: "1000.00" },
        { accountId: 6, debit: "450.00", credit: "0.00" },
      ],
    };

    const report = calculateBalanceSheetReport(input);

    expect(report.currentPeriodProfit).toBe(550);
    expect(report.totalAssets).toBe(1200);
    expect(report.totalLiabilities).toBe(150);
    expect(report.totalEquity).toBe(1050);
    expect(report.totalLiabilitiesAndEquity).toBe(1200);
    expect(report).toMatchObject({ difference: 0, isBalanced: true });
  });
});
