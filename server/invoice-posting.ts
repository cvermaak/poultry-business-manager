import type { JournalLineInput } from "./accounting";

export const CUSTOMER_INVOICE_POSTING_ACCOUNTS = {
  tradeReceivables: "1100",
  vatOutput: "2100",
  liveBirdSales: "4000",
  feedSales: "4100",
} as const;

type InvoicePostingAmounts = {
  exclusiveTotal: string | number | null | undefined;
  vatAmount: string | number | null | undefined;
  inclusiveTotal: string | number | null | undefined;
};

type AccountIds = {
  tradeReceivables: number;
  vatOutput: number;
  revenue: number;
};

function toCents(value: string | number | null | undefined, fieldName: string) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative rand amount.`);
  }

  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error(`${fieldName} is outside the supported amount range.`);
  return cents;
}

function formatCents(cents: number) {
  return `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`;
}

export function resolveCustomerInvoiceRevenueAccountNumber(feedOrderId?: number | null) {
  return feedOrderId ? CUSTOMER_INVOICE_POSTING_ACCOUNTS.feedSales : CUSTOMER_INVOICE_POSTING_ACCOUNTS.liveBirdSales;
}

export function buildCustomerInvoicePosting(input: InvoicePostingAmounts & {
  invoiceNumber: string;
  feedOrderId?: number | null;
  accountIds: AccountIds;
}): JournalLineInput[] {
  const exclusiveCents = toCents(input.exclusiveTotal, "Invoice exclusive total");
  const vatCents = toCents(input.vatAmount, "Invoice VAT amount");
  const inclusiveCents = toCents(input.inclusiveTotal, "Invoice inclusive total");

  if (exclusiveCents <= 0) throw new Error("Only invoices with a positive exclusive total can be posted.");
  if (inclusiveCents !== exclusiveCents + vatCents) {
    throw new Error("Invoice inclusive total must equal exclusive total plus VAT before posting.");
  }

  const lines: JournalLineInput[] = [
    {
      accountId: input.accountIds.tradeReceivables,
      debit: formatCents(inclusiveCents),
      description: `Trade receivable — ${input.invoiceNumber}`,
    },
    {
      accountId: input.accountIds.revenue,
      credit: formatCents(exclusiveCents),
      description: `Revenue — ${input.invoiceNumber}`,
    },
  ];

  if (vatCents > 0) {
    lines.push({
      accountId: input.accountIds.vatOutput,
      credit: formatCents(vatCents),
      description: `VAT output — ${input.invoiceNumber}`,
    });
  }

  return lines;
}
