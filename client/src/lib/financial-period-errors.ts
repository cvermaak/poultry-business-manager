import {
  isClosedFinancialPeriodError,
  removeFinancialPeriodErrorPrefix,
} from "@shared/financial-period-errors";

export type FinancialMutationErrorPresentation = {
  title: string;
  description: string;
};

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "message" in error
    && typeof error.message === "string"
    && error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Please try again or contact an administrator if the problem continues.";
}

export function presentFinancialMutationError(
  error: unknown,
  fallbackTitle: string,
): FinancialMutationErrorPresentation {
  const message = getErrorMessage(error);

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
  error: unknown,
  fallbackTitle: string,
) {
  const presentation = presentFinancialMutationError(error, fallbackTitle);
  return presentation.title === fallbackTitle
    ? presentation.description
    : `${presentation.title}. ${presentation.description}`;
}
