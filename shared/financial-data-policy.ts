/**
 * Visibility is an editable permission, NOT a grant of financial action rights.
 * The client helper controls presentation only and consumes an authoritative
 * boolean. Server decisions require a fresh stored actor AND trusted visibility
 * policy. JWT/context roles or client-supplied overrideAllow are not decisions.
 */
export const FINANCIAL_DATA_ROLES = Object.freeze([
  "admin",
  "farm_manager",
  "accountant",
  "sales_staff",
  "production_worker",
  "chicken_house_operator",
] as const);

export type FinancialDataRole = (typeof FINANCIAL_DATA_ROLES)[number];

export function isFinancialDataRole(role: unknown): role is FinancialDataRole {
  return (
    typeof role === "string" &&
    (FINANCIAL_DATA_ROLES as readonly string[]).includes(role)
  );
}

export function hasFinancialVisibility(permission: unknown): boolean {
  return permission === true;
}

/** Canonical key spelling, never a test of a field's value or arbitrary text. */
export function normalizeFinancialDataKey(key: string): string {
  return key
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Extend this central configuration when endpoint-specific DTO audits find aliases.
 * Generic `balance` is deliberately denied: ambiguous physical balances must be
 * projected with explicit physical field names (e.g. remainingBirds).
 * `limit`, `rate`, `total`, `count`, `value`, `account`, and `number` alone are NOT
 * money classifiers. Opaque exports/audit messages/payment links, financial counts,
 * unknown financial status, and aliases not covered here require endpoint denial
 * or an audited explicit field projection BEFORE choosing the operational level.
 */
export const FINANCIAL_DATA_KEY_POLICY = Object.freeze({
  fields: Object.freeze([
    "amount",
    "amountDue",
    "amountPaid",
    "paidAmount",
    "openingBalance",
    "closingBalance",
    "currentBalance",
    "balance",
    "balanceDue",
    "outstanding",
    "outstandingBalance",
    "outstandingAmount",
    "creditLimit",
    "customerBalance",
    "customerBalances",
    "invoiceTotal",
    "invoiceAmount",
    "invoiceNumber",
    "subtotal",
    "subTotal",
    "grandTotal",
    "netTotal",
    "grossTotal",
    "totalDue",
    "unitPrice",
    "unitCost",
    "salePrice",
    "sellingPrice",
    "purchasePrice",
    "costPrice",
    "feedCost",
    "medicineCost",
    "transportCost",
    "totalCost",
    "totalAmount",
    "totalPrice",
    "revenue",
    "profit",
    "grossProfit",
    "netProfit",
    "margin",
    "profitMargin",
    "grossMargin",
    "tax",
    "taxAmount",
    "taxRate",
    "vat",
    "vatAmount",
    "vatRate",
    "discount",
    "discountAmount",
    "discountRate",
    "currency",
    "currencyCode",
    "exchangeRate",
    "valuation",
    "inventoryValue",
    "stockValue",
    "monetaryValue",
    "totalValue", "netTotalValue", "exclusiveTotal", "inclusiveTotal", "normalBalance",
    "salesValue",
    "orderValue",
    "transactionValue",
    "bankAccount",
    "bankAccountNumber",
    "bankName",
    "branchCode",
    "accountName",
    "accountNumber",
    "accountReference",
    "iban",
    "swift",
    "bic",
    "routingNumber",
    "cashFlow",
    "cashBalance",
    "receivables",
    "payables",
    "credit",
    "debit",
    "budget",
    "expense",
    "expenses",
    "expenditure",
    "income",
    "earnings",
    "salary",
    "commission",
    "refund",
    "refunds",
    "money",
    "monetary",
  ]),
  structures: Object.freeze([
    "financialSummary",
    "financialStats",
    "financialStatistics",
    "financials",
    "financialKpis",
    "financialMetrics",
    "invoice",
    "invoices",
    "invoiceItems",
    "payment",
    "payments",
    "pricing",
    "bankDetails",
    "bankAccounts",
    "accounting",
    "accountingPosting",
    "accountingPostings",
    "journal",
    "journals",
    "journalEntries",
    "ledger",
    "generalLedger",
    "chartOfAccounts",
    "receivable",
    "payable",
    "paymentLink",
    "paymentLinks",
    "payLink",
    "payLinks",
  ]),
  // Physical quantities are not monetary merely because they use the word amount.
  physicalAmountFields: Object.freeze([
    "waterAmount",
    "waterIntakeAmount",
    "waterConsumedAmount",
    "feedAmount",
    "feedingAmount",
    "feedIntakeAmount",
    "feedConsumedAmount",
    "medicationAmount",
    "medicineAmount",
    "vaccineAmount",
    "dosageAmount",
    "birdAmount",
  ]),
  monetaryTokens: Object.freeze([
    "cost",
    "costs",
    "amount",
    "amounts",
    "price",
    "prices",
    "pricing",
    "revenue",
    "revenues",
    "profit",
    "profits",
    "margin",
    "margins",
    "tax",
    "taxes",
    "vat",
    "discount",
    "discounts",
    "credit",
    "credits",
    "debit",
    "debits",
    "balance",
    "balances",
    "paid",
    "unpaid",
    "financial",
    "financials",
    "monetary",
    "money",
    "invoice",
    "invoices",
    "payment",
    "payments",
    "bank",
    "accounting",
    "journal",
    "journals",
    "ledger",
    "currency",
    "currencies",
    "expense",
    "expenses",
    "expenditure",
    "income",
    "earning",
    "earnings",
    "salary",
    "salaries",
    "commission",
    "commissions",
    "refund",
    "refunds",
    "receivable",
    "receivables",
    "payable",
    "payables",
    "budget",
    "budgets",
    "valuation",
    "cash",
  ]),
});

const financialKeys = new Set(
  [
    ...FINANCIAL_DATA_KEY_POLICY.fields,
    ...FINANCIAL_DATA_KEY_POLICY.structures,
  ].map(normalizeFinancialDataKey),
);
const physicalAmountKeys = new Set(
  FINANCIAL_DATA_KEY_POLICY.physicalAmountFields.map(normalizeFinancialDataKey),
);
const monetaryTokens = new Set<string>(
  FINANCIAL_DATA_KEY_POLICY.monetaryTokens,
);

export function isFinancialDataKey(key: string): boolean {
  const normalized = normalizeFinancialDataKey(key);
  if (financialKeys.has(normalized)) return true;
  if (physicalAmountKeys.has(normalized)) return false;
  const tokens = key
    .normalize("NFKC")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.some((token) => monetaryTokens.has(token))) return true;
  // Canonical all-lowercase/all-uppercase aliases still match monetary stems.
  // Do not substring-match `tax` (taxonomy) or `paid` (e.g. a person's name).
  return (
    /(?:cost|price|revenue|profit|margin|discount|creditlimit|balancedue|paidamount|openingbalance|invoicetotal)/.test(
      normalized,
    ) ||
    /^(?:financial|invoice|payment|pricing|bankaccount|bankdetails|accounting|journal)/.test(
      normalized,
    ) ||
    /(?:amount|balance|balances)$/.test(normalized)
  );
}
