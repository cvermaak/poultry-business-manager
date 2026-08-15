import { normalizeLegacyInvoiceAmounts } from "./invoice-amount-integrity";

export type MoneyValue = string | number | null | undefined;

export const COST_OF_SALES_CATEGORIES = new Set([
  "Bedding",
  "Chick Vaccine",
  "Chicks",
  "Coal",
  "Feed - Finisher",
  "Feed - Grower",
  "Feed - Starter",
  "Feed Delivery",
  "House Cleaning",
  "Transport",
  "Veterinary",
]);

const REVENUE_STATUSES = new Set(["sent", "paid", "partial", "overdue"]);
const OPEN_RECEIVABLE_STATUSES = new Set(["sent", "partial", "overdue"]);
const MILL_COST_STATUSES = new Set(["outstanding", "paid", "overdue"]);

type AmountByCategory = {
  category: string;
  amount: number;
};

export type ProfitAndLossInvoice = {
  id: number;
  invoiceDate: string | Date;
  status: string;
  subtotal: MoneyValue;
  exclusiveTotal: MoneyValue;
};

export type ProfitAndLossExpense = {
  id: number;
  expenseDate: string | Date;
  status: string;
  categoryName: string | null;
  amount: MoneyValue;
};

export type ProfitAndLossMillInvoice = {
  id: number;
  invoiceDate: string | Date;
  status: string;
  amountExcl: MoneyValue;
};

export type ReceivableInvoice = {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  invoiceDate: string | Date;
  dueDate: string | Date;
  status: string;
  balanceDue: MoneyValue;
  inclusiveTotal?: MoneyValue;
  paidAmount?: MoneyValue;
};

export type CashReceipt = {
  id: string;
  date: string | Date;
  amount: number;
  description: string;
  source: "Invoice payment" | "Standalone payment";
};

export type CashPayment = {
  id: string;
  date: string | Date;
  amount: number;
  description: string;
  source: "Expense payment" | "Mill invoice payment";
};

export type LedgerAccountBalance = {
  id: number;
  accountNumber: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  accountSubtype: string | null;
  normalBalance: "debit" | "credit";
};

export type LedgerBalanceLine = {
  accountId: number;
  debit: MoneyValue;
  credit: MoneyValue;
};

type TrialBalanceRow = LedgerAccountBalance & {
  debit: number;
  credit: number;
  balanceDebit: number;
  balanceCredit: number;
  netBalance: number;
};

type BalanceSheetRow = {
  accountNumber: string;
  accountName: string;
  accountSubtype: string | null;
  amount: number;
};

function asRands(value: MoneyValue): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function centsToRands(value: MoneyValue): number {
  return asRands(value) / 100;
}

function moneyToCents(value: MoneyValue): number {
  const normalized = String(value ?? "0").trim();
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0;
  const whole = Number(match[2]);
  const fraction = Number((match[3] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return match[1] === "-" ? -cents : cents;
}

function centsToNumber(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isInPeriod(value: string | Date, startDate: string, endDate: string): boolean {
  const date = dateOnly(value);
  return date >= startDate && date <= endDate;
}

function toCategoryRows(amounts: Map<string, number>): AmountByCategory[] {
  return Array.from(amounts.entries())
    .map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

function addToCategory(amounts: Map<string, number>, category: string, amount: number) {
  amounts.set(category, (amounts.get(category) ?? 0) + amount);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function receivableBucket(daysOutstanding: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (daysOutstanding <= 30) return "0-30";
  if (daysOutstanding <= 60) return "31-60";
  if (daysOutstanding <= 90) return "61-90";
  return "90+";
}

export function calculateProfitAndLossReport(input: {
  startDate: string;
  endDate: string;
  invoices: ProfitAndLossInvoice[];
  expenses: ProfitAndLossExpense[];
  millInvoices: ProfitAndLossMillInvoice[];
}) {
  const directCosts = new Map<string, number>();
  const operatingExpenses = new Map<string, number>();

  const revenue = input.invoices
    .filter((invoice) => REVENUE_STATUSES.has(invoice.status) && isInPeriod(invoice.invoiceDate, input.startDate, input.endDate))
    .reduce((total, invoice) => {
      const exclusiveTotal = asRands(invoice.exclusiveTotal);
      return total + (exclusiveTotal || asRands(invoice.subtotal));
    }, 0);

  for (const expense of input.expenses) {
    if (expense.status === "cancelled" || !isInPeriod(expense.expenseDate, input.startDate, input.endDate)) continue;
    const category = expense.categoryName || "Uncategorised expense";
    const amount = centsToRands(expense.amount);

    if (COST_OF_SALES_CATEGORIES.has(category)) {
      addToCategory(directCosts, category, amount);
    } else {
      addToCategory(operatingExpenses, category, amount);
    }
  }

  for (const millInvoice of input.millInvoices) {
    if (!MILL_COST_STATUSES.has(millInvoice.status) || !isInPeriod(millInvoice.invoiceDate, input.startDate, input.endDate)) continue;
    addToCategory(directCosts, "Mill feed invoices", asRands(millInvoice.amountExcl));
  }

  const costOfSalesByCategory = toCategoryRows(directCosts);
  const operatingExpensesByCategory = toCategoryRows(operatingExpenses);
  const costOfSales = costOfSalesByCategory.reduce((sum, row) => sum + row.amount, 0);
  const totalOperatingExpenses = operatingExpensesByCategory.reduce((sum, row) => sum + row.amount, 0);
  const grossProfit = revenue - costOfSales;
  const netProfit = grossProfit - totalOperatingExpenses;

  return {
    period: { startDate: input.startDate, endDate: input.endDate },
    revenue: Number(revenue.toFixed(2)),
    costOfSales: Number(costOfSales.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    operatingExpenses: Number(totalOperatingExpenses.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    costOfSalesByCategory,
    operatingExpensesByCategory,
  };
}

export function calculateAgedReceivablesReport(input: {
  asOfDate: string;
  invoices: ReceivableInvoice[];
}) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

  const receivables = input.invoices
    .filter((invoice) => {
      const invoiceDate = dateOnly(invoice.invoiceDate);
      const normalized = normalizeLegacyInvoiceAmounts(invoice);
      return OPEN_RECEIVABLE_STATUSES.has(normalized.status) && invoiceDate <= input.asOfDate && asRands(normalized.balanceDue) > 0;
    })
    .map((invoice) => {
      const invoiceDate = dateOnly(invoice.invoiceDate);
      const normalized = normalizeLegacyInvoiceAmounts(invoice);
      const amount = asRands(normalized.balanceDue);
      const daysOutstanding = daysBetween(invoiceDate, input.asOfDate);
      const bucket = receivableBucket(daysOutstanding);
      buckets[bucket] += amount;

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName || "Unassigned customer",
        invoiceDate,
        dueDate: dateOnly(invoice.dueDate),
        status: normalized.status,
        daysOutstanding,
        bucket,
        balanceDue: Number(amount.toFixed(2)),
      };
    })
    .sort((a, b) => b.daysOutstanding - a.daysOutstanding || b.balanceDue - a.balanceDue);

  const totalOutstanding = receivables.reduce((sum, row) => sum + row.balanceDue, 0);

  return {
    asOfDate: input.asOfDate,
    totalOutstanding: Number(totalOutstanding.toFixed(2)),
    buckets: {
      "0-30": Number(buckets["0-30"].toFixed(2)),
      "31-60": Number(buckets["31-60"].toFixed(2)),
      "61-90": Number(buckets["61-90"].toFixed(2)),
      "90+": Number(buckets["90+"].toFixed(2)),
    },
    receivables,
  };
}

export function calculateCashFlowStatement(input: {
  startDate: string;
  endDate: string;
  receipts: CashReceipt[];
  payments: CashPayment[];
}) {
  const transactions = [
    ...input.receipts
      .filter((receipt) => isInPeriod(receipt.date, input.startDate, input.endDate))
      .map((receipt) => ({
        ...receipt,
        date: dateOnly(receipt.date),
        direction: "inflow" as const,
        amount: Number(receipt.amount.toFixed(2)),
      })),
    ...input.payments
      .filter((payment) => isInPeriod(payment.date, input.startDate, input.endDate))
      .map((payment) => ({
        ...payment,
        date: dateOnly(payment.date),
        direction: "outflow" as const,
        amount: Number(payment.amount.toFixed(2)),
      })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

  const cashInflows = transactions
    .filter((transaction) => transaction.direction === "inflow")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const cashOutflows = transactions
    .filter((transaction) => transaction.direction === "outflow")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const monthly = new Map<string, { cashInflows: number; cashOutflows: number }>();
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    const current = monthly.get(month) ?? { cashInflows: 0, cashOutflows: 0 };
    if (transaction.direction === "inflow") current.cashInflows += transaction.amount;
    else current.cashOutflows += transaction.amount;
    monthly.set(month, current);
  }

  const monthlySummary = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      cashInflows: Number(values.cashInflows.toFixed(2)),
      cashOutflows: Number(values.cashOutflows.toFixed(2)),
      netCashMovement: Number((values.cashInflows - values.cashOutflows).toFixed(2)),
    }));

  return {
    period: { startDate: input.startDate, endDate: input.endDate },
    cashInflows: Number(cashInflows.toFixed(2)),
    cashOutflows: Number(cashOutflows.toFixed(2)),
    netCashMovement: Number((cashInflows - cashOutflows).toFixed(2)),
    monthlySummary,
    transactions,
  };
}

export function calculateTrialBalanceReport(input: {
  asOfDate: string;
  accounts: LedgerAccountBalance[];
  ledgerLines: LedgerBalanceLine[];
}) {
  const totalsByAccount = new Map<number, { debitCents: number; creditCents: number }>();
  for (const line of input.ledgerLines) {
    const totals = totalsByAccount.get(line.accountId) ?? { debitCents: 0, creditCents: 0 };
    totals.debitCents += moneyToCents(line.debit);
    totals.creditCents += moneyToCents(line.credit);
    totalsByAccount.set(line.accountId, totals);
  }

  const rows: TrialBalanceRow[] = input.accounts
    .map((account) => {
      const totals = totalsByAccount.get(account.id) ?? { debitCents: 0, creditCents: 0 };
      const netCents = totals.debitCents - totals.creditCents;
      return {
        ...account,
        debit: centsToNumber(totals.debitCents),
        credit: centsToNumber(totals.creditCents),
        balanceDebit: centsToNumber(Math.max(netCents, 0)),
        balanceCredit: centsToNumber(Math.max(-netCents, 0)),
        netBalance: centsToNumber(account.normalBalance === "debit" ? netCents : -netCents),
      };
    })
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }));

  const totalDebit = rows.reduce((sum, row) => sum + moneyToCents(row.balanceDebit), 0);
  const totalCredit = rows.reduce((sum, row) => sum + moneyToCents(row.balanceCredit), 0);

  return {
    asOfDate: input.asOfDate,
    totalDebit: centsToNumber(totalDebit),
    totalCredit: centsToNumber(totalCredit),
    difference: centsToNumber(totalDebit - totalCredit),
    isBalanced: totalDebit === totalCredit,
    rows,
  };
}

function balanceSheetRows(rows: TrialBalanceRow[], accountType: LedgerAccountBalance["accountType"]): BalanceSheetRow[] {
  return rows
    .filter((row) => row.accountType === accountType && row.netBalance !== 0)
    .map((row) => ({
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      accountSubtype: row.accountSubtype,
      amount: row.netBalance,
    }));
}

export function calculateBalanceSheetReport(input: {
  asOfDate: string;
  accounts: LedgerAccountBalance[];
  ledgerLines: LedgerBalanceLine[];
}) {
  const trialBalance = calculateTrialBalanceReport(input);
  const assets = balanceSheetRows(trialBalance.rows, "asset");
  const liabilities = balanceSheetRows(trialBalance.rows, "liability");
  const equity = balanceSheetRows(trialBalance.rows, "equity");
  const revenue = balanceSheetRows(trialBalance.rows, "revenue");
  const expenses = balanceSheetRows(trialBalance.rows, "expense");

  const sum = (rows: Array<{ amount: number }>) => centsToNumber(rows.reduce((total, row) => total + moneyToCents(row.amount), 0));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const equityBeforeCurrentEarnings = sum(equity);
  const currentPeriodProfit = Number((sum(revenue) - sum(expenses)).toFixed(2));
  const totalEquity = Number((equityBeforeCurrentEarnings + currentPeriodProfit).toFixed(2));
  const totalLiabilitiesAndEquity = Number((totalLiabilities + totalEquity).toFixed(2));
  const difference = Number((totalAssets - totalLiabilitiesAndEquity).toFixed(2));

  return {
    asOfDate: input.asOfDate,
    assets,
    liabilities,
    equity,
    currentPeriodProfit,
    totalAssets,
    totalLiabilities,
    equityBeforeCurrentEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference,
    isBalanced: difference === 0,
  };
}
