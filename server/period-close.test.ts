import { describe, expect, it } from "vitest";
import { buildReversalLines, calculateVatSummary, evaluatePeriodCloseReadiness } from "./period-close";

describe("Period Close financial controls", () => {
  it("summarizes VAT output, input, and the exact payable position", () => {
    expect(calculateVatSummary({ outputVat: ["150.00", "22.50"], inputVat: ["60.00"] })).toEqual({ outputVat: "172.50", inputVat: "60.00", netVat: "112.50", position: "payable" });
  });

  it("permits close only with all approved reviews, a balanced trial balance, and completed overlapping Bank reconciliations", () => {
    const readiness = evaluatePeriodCloseReadiness({
      period: { startDate: "2026-08-01", endDate: "2026-08-31" },
      requiredReviews: [
        { reviewType: "bank_reconciliation", reviewStatus: "approved" },
        { reviewType: "vat_summary", reviewStatus: "approved" },
        { reviewType: "trial_balance", reviewStatus: "approved" },
        { reviewType: "financial_statements", reviewStatus: "approved" },
      ],
      bankReconciliations: [{ status: "completed", statementStartDate: "2026-08-01", statementEndDate: "2026-08-31" }],
      trialBalanceDifference: "0.00",
    });
    expect(readiness.canClose).toBe(true);
  });

  it("blocks close for incomplete reviews, unmatched Bank reconciliation, or an unbalanced trial balance", () => {
    const readiness = evaluatePeriodCloseReadiness({
      period: { startDate: "2026-08-01", endDate: "2026-08-31" },
      requiredReviews: [{ reviewType: "vat_summary", reviewStatus: "exception" }],
      bankReconciliations: [{ status: "in_progress", statementStartDate: "2026-08-01", statementEndDate: "2026-08-31" }],
      trialBalanceDifference: "0.01",
    });
    expect(readiness.canClose).toBe(false);
    expect(readiness.missingReviewTypes).toContain("trial_balance");
    expect(readiness.exceptionReviewTypes).toContain("vat_summary");
    expect(readiness.incompleteBankReconciliationIds).toHaveLength(1);
  });

  it("builds a balanced reversing journal without mutating the original journal lines", () => {
    expect(buildReversalLines([
      { accountId: 1, debit: "100.00", credit: "0.00", description: "Bank receipt" },
      { accountId: 2, debit: "0.00", credit: "100.00", description: "Revenue" },
    ])).toEqual([
      { accountId: 1, debit: "0.00", credit: "100.00", description: "Reversal — Bank receipt" },
      { accountId: 2, debit: "100.00", credit: "0.00", description: "Reversal — Revenue" },
    ]);
  });
});
