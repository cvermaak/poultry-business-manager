import {
  isClosedFinancialPeriodError,
  removeFinancialPeriodErrorPrefix,
} from "@shared/financial-period-errors";

type ErrorWithMessage = {
  message?: unknown;
};

export type FinancialMutationErrorPresentation = {
  title: string;
  description: string;
};

export function presentFinancialMutationError(
  error: ErrorWithMessage | null | undefined,
  fallbackTitle: string,
): FinancialMutationErrorPresentation {
  const message = typeof error?.message === "string" && error.message.trim()
    ? error.message.trim()
    : "Please try again or contact an administrator if the problem continues.";

  if (isClosedFinancialPeriodError(message)) {
    return {
      title: "Posting blocked — financial period is closed",
      description: removeFinancialPeriodErrorPrefix(message),
    };
  }

  return {
    title: fallbackTitle,
    description: message,
  };
}

export function formatFinancialMutationError(
  error: ErrorWithMessage | null | undefined,
  fallbackTitle: string,
) {
  const presentation = presentFinancialMutationError(error, fallbackTitle);
  return presentation.title === fallbackTitle
    ? presentation.description
    : `${presentation.title}. ${presentation.description}`;
}
