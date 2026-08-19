export type CloseReviewType = "bank_reconciliation" | "vat_summary" | "trial_balance" | "financial_statements";
export type CloseReviewStatus = "pending" | "approved" | "exception";

export const REQUIRED_CLOSE_REVIEWS: CloseReviewType[] = [
  "bank_reconciliation",
  "vat_summary",
  "trial_balance",
  "financial_statements",
];

export function assertIsoPeriod(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("Period dates must use YYYY-MM-DD.");
  }
  if (startDate > endDate) throw new Error("Period start date must be on or before period end date.");
}

export function isDateInsidePeriod(date: string, period: { startDate: string; endDate: string }) {
  const normalized = date.slice(0, 10);
  return normalized >= period.startDate && normalized <= period.endDate;
}

export function calculateVatSummary(input: { outputVat: Array<string | number | null>; inputVat: Array<string | number | null> }) {
  const cents = (value: string | number | null) => {
    const normalized = String(value ?? "0").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("VAT values must be non-negative exact decimal rands.");
    const [whole, fraction = ""] = normalized.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount)) throw new Error("VAT amount exceeds the supported range.");
    return amount;
  };
  const format = (value: number) => `${value < 0 ? "-" : ""}${Math.trunc(Math.abs(value) / 100)}.${(Math.abs(value) % 100).toString().padStart(2, "0")}`;
	const outputVatCents = input.outputVat.reduce<number>((total, value) => total + cents(value), 0);
	const inputVatCents = input.inputVat.reduce<number>((total, value) => total + cents(value), 0);
  const netVatCents = outputVatCents - inputVatCents;
  return {
    outputVat: format(outputVatCents),
    inputVat: format(inputVatCents),
    netVat: format(netVatCents),
    position: netVatCents > 0 ? "payable" as const : netVatCents < 0 ? "receivable" as const : "settled" as const,
  };
}

export function evaluatePeriodCloseReadiness(input: {
  requiredReviews: Array<{ reviewType: CloseReviewType; reviewStatus: CloseReviewStatus }>;
  bankReconciliations: Array<{ status: string; statementStartDate: string; statementEndDate: string }>;
  period: { startDate: string; endDate: string };
  trialBalanceDifference: string;
}) {
  assertIsoPeriod(input.period.startDate, input.period.endDate);
  const missingReviewTypes = REQUIRED_CLOSE_REVIEWS.filter((type) => !input.requiredReviews.some((review) => review.reviewType === type && review.reviewStatus === "approved"));
  const exceptionReviewTypes = input.requiredReviews.filter((review) => review.reviewStatus === "exception").map((review) => review.reviewType);
  const incompleteBankReconciliationIds = input.bankReconciliations
    .filter((reconciliation) => reconciliation.statementStartDate <= input.period.endDate && reconciliation.statementEndDate >= input.period.startDate && reconciliation.status !== "completed")
    .map((_, index) => index);
  const trialBalanceBalanced = input.trialBalanceDifference === "0.00";
  return {
    missingReviewTypes,
    exceptionReviewTypes,
    incompleteBankReconciliationIds,
    trialBalanceBalanced,
    canClose: missingReviewTypes.length === 0 && exceptionReviewTypes.length === 0 && incompleteBankReconciliationIds.length === 0 && trialBalanceBalanced,
  };
}

export function buildReversalLines(lines: Array<{ accountId: number; debit: string; credit: string; description: string }>) {
  if (!lines.length) throw new Error("A journal requires at least one line to reverse.");
  return lines.map((line) => ({
    accountId: line.accountId,
    debit: line.credit,
    credit: line.debit,
    description: `Reversal — ${line.description}`,
  }));
}

export function buildReversalJournalNumber(sourceJournalNumber: string, timestamp = Date.now()) {
  return `REV-JNL-${sourceJournalNumber}-${timestamp}`.slice(0, 50);
}
