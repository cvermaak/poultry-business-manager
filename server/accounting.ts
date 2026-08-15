export const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type NormalBalance = "debit" | "credit";

export type JournalLineInput = {
  accountId: number;
  debit?: string;
  credit?: string;
  description?: string;
};

export type NormalizedJournalLine = {
  accountId: number;
  debit: string;
  credit: string;
  description?: string;
};

export const AFGRO_DEFAULT_CHART_OF_ACCOUNTS: Array<{
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  accountSubtype: string;
  normalBalance: NormalBalance;
  description: string;
}> = [
  { accountNumber: "1000", accountName: "Bank", accountType: "asset", accountSubtype: "current_asset", normalBalance: "debit", description: "Bank and cash-on-hand balances." },
  { accountNumber: "1100", accountName: "Trade Receivables", accountType: "asset", accountSubtype: "current_asset", normalBalance: "debit", description: "Amounts due from customers." },
  { accountNumber: "1200", accountName: "Feed and Production Inventory", accountType: "asset", accountSubtype: "inventory", normalBalance: "debit", description: "Feed, additives, bedding, and production stock." },
  { accountNumber: "1300", accountName: "VAT Input", accountType: "asset", accountSubtype: "tax", normalBalance: "debit", description: "Recoverable input VAT." },
  { accountNumber: "2000", accountName: "Trade Payables", accountType: "liability", accountSubtype: "current_liability", normalBalance: "credit", description: "Amounts due to suppliers." },
  { accountNumber: "2100", accountName: "VAT Output", accountType: "liability", accountSubtype: "tax", normalBalance: "credit", description: "Output VAT due to SARS." },
  { accountNumber: "2200", accountName: "Loans and Funding", accountType: "liability", accountSubtype: "non_current_liability", normalBalance: "credit", description: "Loan and owner funding liabilities." },
  { accountNumber: "3000", accountName: "Owner's Equity", accountType: "equity", accountSubtype: "capital", normalBalance: "credit", description: "Owner capital introduced to the business." },
  { accountNumber: "3100", accountName: "Retained Earnings", accountType: "equity", accountSubtype: "retained_earnings", normalBalance: "credit", description: "Accumulated profit or loss." },
  { accountNumber: "4000", accountName: "Live Bird Sales", accountType: "revenue", accountSubtype: "operating_revenue", normalBalance: "credit", description: "Revenue from live-bird and catch sales." },
  { accountNumber: "4100", accountName: "Feed Sales", accountType: "revenue", accountSubtype: "operating_revenue", normalBalance: "credit", description: "Revenue from feed deliveries." },
  { accountNumber: "5000", accountName: "Chick Cost", accountType: "expense", accountSubtype: "cost_of_sales", normalBalance: "debit", description: "Day-old chick cost of sales." },
  { accountNumber: "5100", accountName: "Feed Cost", accountType: "expense", accountSubtype: "cost_of_sales", normalBalance: "debit", description: "Feed and mill cost of sales." },
  { accountNumber: "5200", accountName: "Vaccines and Veterinary", accountType: "expense", accountSubtype: "cost_of_sales", normalBalance: "debit", description: "Vaccines, treatment, and veterinary costs." },
  { accountNumber: "5300", accountName: "Bedding and Cleaning", accountType: "expense", accountSubtype: "cost_of_sales", normalBalance: "debit", description: "Bedding, cleaning, and sanitation costs." },
  { accountNumber: "5400", accountName: "Transport and Collection", accountType: "expense", accountSubtype: "cost_of_sales", normalBalance: "debit", description: "Feed delivery, transport, and collection costs." },
  { accountNumber: "6000", accountName: "Labour", accountType: "expense", accountSubtype: "operating_expense", normalBalance: "debit", description: "Operational labour costs." },
  { accountNumber: "6100", accountName: "Utilities", accountType: "expense", accountSubtype: "operating_expense", normalBalance: "debit", description: "Power, coal, and utilities." },
  { accountNumber: "6200", accountName: "Rent", accountType: "expense", accountSubtype: "operating_expense", normalBalance: "debit", description: "House and operational rental costs." },
  { accountNumber: "6900", accountName: "Other Operating Expenses", accountType: "expense", accountSubtype: "operating_expense", normalBalance: "debit", description: "Other approved operating expenses." },
];

function formatCents(cents: number) {
  return `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`;
}

function parsePositiveRandAmount(value: string | undefined): { cents: number; normalized: string } | null {
  const amount = value?.trim() ?? "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) return null;

  const [whole, decimal = ""] = amount.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return { cents, normalized: formatCents(cents) };
}

export function validateBalancedJournal(lines: JournalLineInput[]):
  | { ok: true; lines: NormalizedJournalLine[]; totalDebit: string; totalCredit: string }
  | { ok: false; error: string } {
  if (lines.length < 2) return { ok: false, error: "A journal requires at least two lines." };

  let debitTotal = 0;
  let creditTotal = 0;
  const normalized: NormalizedJournalLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!Number.isInteger(line.accountId) || line.accountId <= 0) {
      return { ok: false, error: `Line ${index + 1} requires a valid account.` };
    }
    const debit = parsePositiveRandAmount(line.debit);
    const credit = parsePositiveRandAmount(line.credit);
    if ((debit && credit) || (!debit && !credit)) {
      return { ok: false, error: `Line ${index + 1} must contain either a debit or a credit amount.` };
    }

    debitTotal += debit?.cents ?? 0;
    creditTotal += credit?.cents ?? 0;
    normalized.push({
      accountId: line.accountId,
      debit: debit?.normalized ?? "0.00",
      credit: credit?.normalized ?? "0.00",
      description: line.description?.trim() || undefined,
    });
  }

  if (debitTotal !== creditTotal) {
    return { ok: false, error: "Total debits must equal total credits before a journal can be posted." };
  }

  const total = formatCents(debitTotal);
  return { ok: true, lines: normalized, totalDebit: total, totalCredit: total };
}
