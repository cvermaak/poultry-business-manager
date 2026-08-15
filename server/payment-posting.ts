import type { JournalLineInput } from "./accounting";

export const CUSTOMER_PAYMENT_POSTING_ACCOUNTS = {
  bank: "1000",
  tradeReceivables: "1100",
} as const;

type PaymentAccountIds = {
  bank: number;
  tradeReceivables: number;
};

export type ParsedRandAmount = {
  cents: number;
  normalized: string;
};

export function parseRandAmount(
  value: string | number | null | undefined,
  fieldName: string,
  allowZero = false,
): ParsedRandAmount {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid rand amount with no more than two decimal places.`);
  }

  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || (!allowZero && cents <= 0)) {
    throw new Error(`${fieldName} must be ${allowZero ? "a non-negative" : "a positive"} rand amount.`);
  }

  return {
    cents,
    normalized: `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`,
  };
}

export function getCustomerPaymentJournalNumber(paymentId: number) {
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new Error("A valid customer payment ID is required to create a General Ledger journal number.");
  }
  return `GL-PAY-${paymentId}`;
}

export function validateCustomerPaymentAgainstBalance(input: {
  amount: string | number | null | undefined;
  balanceDue: string | number | null | undefined;
}) {
  const payment = parseRandAmount(input.amount, "Customer payment amount");
  const balance = parseRandAmount(input.balanceDue, "Invoice balance due", true);
  if (balance.cents <= 0) {
    throw new Error("This invoice has no remaining balance to pay.");
  }
  if (payment.cents > balance.cents) {
    throw new Error("Payment amount cannot exceed the outstanding invoice balance.");
  }
  return { payment, balance };
}

export function buildCustomerPaymentPosting(input: {
  invoiceNumber: string;
  amount: string | number | null | undefined;
  accountIds: PaymentAccountIds;
}): JournalLineInput[] {
  const payment = parseRandAmount(input.amount, "Customer payment amount");

  return [
    {
      accountId: input.accountIds.bank,
      debit: payment.normalized,
      description: `Bank receipt — ${input.invoiceNumber}`,
    },
    {
      accountId: input.accountIds.tradeReceivables,
      credit: payment.normalized,
      description: `Trade receivable settled — ${input.invoiceNumber}`,
    },
  ];
}
