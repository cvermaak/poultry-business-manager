export type MoneyValue = string | number | null | undefined;

export type InvoiceAmountIntegrityInput = {
  subtotal?: MoneyValue;
  exclusiveTotal?: MoneyValue;
  taxAmount?: MoneyValue;
  vatAmount?: MoneyValue;
  totalAmount?: MoneyValue;
  inclusiveTotal?: MoneyValue;
  paidAmount?: MoneyValue;
  balanceDue?: MoneyValue;
  status?: string | null;
};

type ParsedAmount = {
  cents: number;
  normalized: string;
};

function parseDecimalRand(value: MoneyValue): ParsedAmount {
  const normalized = String(value ?? "0").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return { cents: 0, normalized: "0.00" };
  }

  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0) return { cents: 0, normalized: "0.00" };
  return {
    cents,
    normalized: `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`,
  };
}

function formatCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`;
}

function isExactlyOneHundredTimes(value: ParsedAmount, canonical: ParsedAmount): boolean {
  return canonical.cents > 0 && value.cents === canonical.cents * 100;
}

/**
 * Repairs legacy header interpretation in memory only. Older invoice rows can
 * retain cents in subtotal/taxAmount/totalAmount/balanceDue after those fields
 * were converted to decimal-rand columns, while the newer canonical totals and
 * General Ledger already hold correct rand amounts.
 */
export function normalizeLegacyInvoiceAmounts(input: InvoiceAmountIntegrityInput) {
  const exclusive = parseDecimalRand(input.exclusiveTotal ?? input.subtotal);
  const vat = parseDecimalRand(input.vatAmount ?? input.taxAmount);
  const inclusive = parseDecimalRand(input.inclusiveTotal ?? input.totalAmount);
  const subtotal = parseDecimalRand(input.subtotal);
  const taxAmount = parseDecimalRand(input.taxAmount);
  const totalAmount = parseDecimalRand(input.totalAmount);
  const paidAmount = parseDecimalRand(input.paidAmount);
  const balanceDue = parseDecimalRand(input.balanceDue);

  const scaledHeader = isExactlyOneHundredTimes(subtotal, exclusive)
    || isExactlyOneHundredTimes(taxAmount, vat)
    || isExactlyOneHundredTimes(totalAmount, inclusive)
    || isExactlyOneHundredTimes(balanceDue, inclusive);
  const normalizedPaidCents = isExactlyOneHundredTimes(paidAmount, inclusive)
    ? inclusive.cents
    : paidAmount.cents;
  const normalizedBalanceCents = scaledHeader
    ? Math.max(inclusive.cents - normalizedPaidCents, 0)
    : balanceDue.cents;

  const originalStatus = input.status ?? "draft";
  const normalizedStatus = scaledHeader && originalStatus !== "draft" && originalStatus !== "cancelled"
    ? normalizedBalanceCents === 0
      ? "paid"
      : normalizedPaidCents > 0
        ? "partial"
        : originalStatus
    : originalStatus;

  return {
    hasLegacyHundredfoldHeader: scaledHeader,
    subtotal: scaledHeader ? exclusive.normalized : subtotal.normalized,
    taxAmount: scaledHeader ? vat.normalized : taxAmount.normalized,
    totalAmount: scaledHeader ? inclusive.normalized : totalAmount.normalized,
    paidAmount: formatCents(normalizedPaidCents),
    balanceDue: formatCents(normalizedBalanceCents),
    status: normalizedStatus,
  };
}

export function normalizeLegacyInvoiceRecord<T extends InvoiceAmountIntegrityInput>(input: T): T & ReturnType<typeof normalizeLegacyInvoiceAmounts> {
  return { ...input, ...normalizeLegacyInvoiceAmounts(input) };
}
