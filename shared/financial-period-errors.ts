export const CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX = "[CLOSED_FINANCIAL_PERIOD]";

export type ClosedFinancialPeriodErrorInput = {
  action: string;
  periodName: string;
  startDate: string;
  endDate: string;
};

export function buildClosedFinancialPeriodError(input: ClosedFinancialPeriodErrorInput) {
  return `${CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX} ${input.action} cannot be completed because financial period “${input.periodName}” (${input.startDate} to ${input.endDate}) is closed. No financial records were changed. Choose a date outside this period or ask a financial administrator to reopen it with an audit reason.`;
}

export function isClosedFinancialPeriodError(message: unknown) {
  return typeof message === "string" && message.includes(CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX);
}

export function removeFinancialPeriodErrorPrefix(message: string) {
  return message.replace(`${CLOSED_FINANCIAL_PERIOD_ERROR_PREFIX} `, "").trim();
}
