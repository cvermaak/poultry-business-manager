export type BankStatementDirection = "inflow" | "outflow";

export type StatementLineForReconciliation = {
  id: number;
  direction: BankStatementDirection;
  amount: string;
  status: "unmatched" | "matched";
};

export type LedgerLineForReconciliation = {
  id: number;
  debit: string;
  credit: string;
  isReconciled: boolean | number | null;
};

export type ReconciliationControlSummary = {
  statementMovement: string;
  expectedClosingBalance: string;
  statementBalanceDifference: string;
  unmatchedStatementLineIds: number[];
  unmatchedLedgerEntryIds: number[];
  canComplete: boolean;
};

function parseDecimalToCents(value: string): number {
  const normalized = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Amounts must use an exact decimal value with no more than two decimal places.");
  }

  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace("-", "");
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Amount exceeds the supported Bank Reconciliation range.");
  return sign * cents;
}

function formatCents(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = value < 0 ? -value : value;
  return `${sign}${Math.trunc(absolute / 100)}.${(absolute % 100).toString().padStart(2, "0")}`;
}

export function statementSignedAmount(direction: BankStatementDirection, amount: string): number {
  const cents = parseDecimalToCents(amount);
  if (cents <= 0) throw new Error("A bank statement line amount must be greater than zero.");
  return direction === "inflow" ? cents : -cents;
}

export function ledgerSignedAmount(entry: Pick<LedgerLineForReconciliation, "debit" | "credit">): number {
  const debit = parseDecimalToCents(entry.debit);
  const credit = parseDecimalToCents(entry.credit);
  if (debit < 0 || credit < 0) throw new Error("Ledger debit and credit amounts cannot be negative.");
  if (debit > 0 && credit > 0) throw new Error("A Bank GL line cannot contain both a debit and a credit amount.");
  if (debit === 0 && credit === 0) throw new Error("A Bank GL line must contain a debit or credit amount.");
  return debit - credit;
}

export function validateBankStatementMatch(
  statementLine: Pick<StatementLineForReconciliation, "direction" | "amount">,
  ledgerEntries: Array<Pick<LedgerLineForReconciliation, "debit" | "credit">>,
): { ok: true; matchedAmount: string } | { ok: false; error: string } {
  if (ledgerEntries.length === 0) return { ok: false, error: "Select at least one Bank GL entry to match." };

  const statementAmount = statementSignedAmount(statementLine.direction, statementLine.amount);
  const ledgerAmount = ledgerEntries.reduce((total, entry) => total + ledgerSignedAmount(entry), 0);

  if (statementAmount !== ledgerAmount) {
    return {
      ok: false,
      error: "The selected Bank GL entries must have the same direction and exact total as the statement line.",
    };
  }

  return { ok: true, matchedAmount: formatCents(statementAmount < 0 ? -statementAmount : statementAmount) };
}

export function calculateReconciliationControls(input: {
  openingStatementBalance: string;
  closingStatementBalance: string;
  statementLines: StatementLineForReconciliation[];
  ledgerEntries: LedgerLineForReconciliation[];
}): ReconciliationControlSummary {
  const opening = parseDecimalToCents(input.openingStatementBalance);
  const closing = parseDecimalToCents(input.closingStatementBalance);
  const movement = input.statementLines.reduce(
    (total, line) => total + statementSignedAmount(line.direction, line.amount),
    0,
  );
  const expectedClosing = opening + movement;
  const difference = closing - expectedClosing;
  const unmatchedStatementLineIds = input.statementLines
    .filter((line) => line.status !== "matched")
    .map((line) => line.id);
  const unmatchedLedgerEntryIds = input.ledgerEntries
    .filter((entry) => !Boolean(entry.isReconciled))
    .map((entry) => entry.id);

  return {
    statementMovement: formatCents(movement),
    expectedClosingBalance: formatCents(expectedClosing),
    statementBalanceDifference: formatCents(difference),
    unmatchedStatementLineIds,
    unmatchedLedgerEntryIds,
    canComplete: difference === 0 && unmatchedStatementLineIds.length === 0 && unmatchedLedgerEntryIds.length === 0,
  };
}

export function createStatementLineKey(input: {
  transactionDate: string;
  direction: BankStatementDirection;
  amount: string;
  reference?: string | null;
  description: string;
}): string {
  const normalized = [
    input.transactionDate.trim(),
    input.direction,
    formatCents(statementSignedAmount(input.direction, input.amount) < 0
      ? -statementSignedAmount(input.direction, input.amount)
      : statementSignedAmount(input.direction, input.amount)),
    input.reference?.trim().toUpperCase() ?? "",
    input.description.trim().toUpperCase(),
  ].join("|");

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `BSL-${(hash >>> 0).toString(36).toUpperCase()}`;
}
