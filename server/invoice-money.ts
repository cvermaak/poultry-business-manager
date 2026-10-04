export type InvoiceLineMoneyInput = {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  vatPercent?: number;
};

export type InvoiceLineMoney = {
  subtotalCents: number;
  discountCents: number;
  exclusiveCents: number;
  vatCents: number;
  inclusiveCents: number;
};

export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100);
}

export function formatCents(cents: number): string {
  const normalized = Math.max(0, Math.round(cents));
  return `${Math.floor(normalized / 100)}.${(normalized % 100).toString().padStart(2, "0")}`;
}

/**
 * Calculates a line in integer cents. The invoice header must sum these rounded
 * persisted line amounts so the invoice detail, PDF, and journal all reconcile.
 */
export function calculateInvoiceLineMoney(input: InvoiceLineMoneyInput): InvoiceLineMoney {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0;
  const unitPrice = Number.isFinite(input.unitPrice) ? input.unitPrice : 0;
  const discountPercent = Number.isFinite(input.discountPercent) ? input.discountPercent! : 0;
  const vatPercent = Number.isFinite(input.vatPercent) ? input.vatPercent! : 0;

  const subtotalCents = toCents(quantity * unitPrice);
  const discountCents = toCents((subtotalCents / 100) * (discountPercent / 100));
  const exclusiveCents = subtotalCents - discountCents;
  const vatCents = toCents((exclusiveCents / 100) * (vatPercent / 100));

  return {
    subtotalCents,
    discountCents,
    exclusiveCents,
    vatCents,
    inclusiveCents: exclusiveCents + vatCents,
  };
}

export function calculateInvoiceTotals(lines: InvoiceLineMoneyInput[]) {
  return lines.reduce(
    (totals, line) => {
      const amounts = calculateInvoiceLineMoney(line);
      totals.exclusiveCents += amounts.exclusiveCents;
      totals.vatCents += amounts.vatCents;
      totals.inclusiveCents += amounts.inclusiveCents;
      totals.discountCents += amounts.discountCents;
      return totals;
    },
    { exclusiveCents: 0, vatCents: 0, inclusiveCents: 0, discountCents: 0 },
  );
}
