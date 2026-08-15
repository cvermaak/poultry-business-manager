import type { JournalLineInput } from "./accounting";
import { parseRandAmount } from "./payment-posting";

export const SUPPLIER_PAYABLE_POSTING_ACCOUNTS = {
  bank: "1000",
  feedAndProductionInventory: "1200",
  vatInput: "1300",
  tradePayables: "2000",
} as const;

type SupplierInvoiceAccountIds = {
  inventory: number;
  vatInput: number;
  tradePayables: number;
};

type SupplierPaymentAccountIds = {
  bank: number;
  tradePayables: number;
};

export function getSupplierInvoiceJournalNumber(millInvoiceId: number) {
  if (!Number.isInteger(millInvoiceId) || millInvoiceId <= 0) {
    throw new Error("A valid mill invoice ID is required to create a payable journal number.");
  }
  return `GL-AP-${millInvoiceId}`;
}

export function getSupplierPaymentJournalNumber(paymentId: number) {
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new Error("A valid supplier payment ID is required to create a payable payment journal number.");
  }
  return `GL-AP-PAY-${paymentId}`;
}

export function buildSupplierInvoicePosting(input: {
  invoiceNumber: string;
  amountExcl: string | number | null | undefined;
  vatAmount: string | number | null | undefined;
  amountIncl: string | number | null | undefined;
  accountIds: SupplierInvoiceAccountIds;
}): JournalLineInput[] {
  const exclusive = parseRandAmount(input.amountExcl, "Supplier invoice exclusive total");
  const vat = parseRandAmount(input.vatAmount, "Supplier invoice VAT amount", true);
  const inclusive = parseRandAmount(input.amountIncl, "Supplier invoice inclusive total");

  if (inclusive.cents !== exclusive.cents + vat.cents) {
    throw new Error("Supplier invoice inclusive total must equal exclusive total plus VAT before posting.");
  }

  const lines: JournalLineInput[] = [
    {
      accountId: input.accountIds.inventory,
      debit: exclusive.normalized,
      description: `Feed and production inventory — ${input.invoiceNumber}`,
    },
    {
      accountId: input.accountIds.tradePayables,
      credit: inclusive.normalized,
      description: `Trade payable — ${input.invoiceNumber}`,
    },
  ];

  if (vat.cents > 0) {
    lines.splice(1, 0, {
      accountId: input.accountIds.vatInput,
      debit: vat.normalized,
      description: `VAT input — ${input.invoiceNumber}`,
    });
  }

  return lines;
}

export function validateSupplierPaymentAgainstBalance(input: {
  amount: string | number | null | undefined;
  balanceDue: string | number | null | undefined;
}) {
  const payment = parseRandAmount(input.amount, "Supplier payment amount");
  const balance = parseRandAmount(input.balanceDue, "Supplier invoice balance due", true);
  if (balance.cents <= 0) throw new Error("This supplier invoice has no remaining balance to pay.");
  if (payment.cents > balance.cents) throw new Error("Payment amount cannot exceed the outstanding supplier invoice balance.");
  return { payment, balance };
}

export function buildSupplierPaymentPosting(input: {
  invoiceNumber: string;
  amount: string | number | null | undefined;
  accountIds: SupplierPaymentAccountIds;
}): JournalLineInput[] {
  const payment = parseRandAmount(input.amount, "Supplier payment amount");
  return [
    {
      accountId: input.accountIds.tradePayables,
      debit: payment.normalized,
      description: `Trade payable settled — ${input.invoiceNumber}`,
    },
    {
      accountId: input.accountIds.bank,
      credit: payment.normalized,
      description: `Bank payment — ${input.invoiceNumber}`,
    },
  ];
}
