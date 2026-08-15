export type FinanceTab = "profit-loss" | "journals";

export type FinanceNavigationState = {
  tab: FinanceTab;
  journalNumber: string;
};

export type JournalListInput = {
  startDate: string;
  endDate: string;
  limit: number;
  includeJournalNumber?: string;
};

export function resolveFinanceNavigation(search: string): FinanceNavigationState {
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalizedSearch);

  return {
    tab: params.get("tab") === "journals" ? "journals" : "profit-loss",
    journalNumber: params.get("journal")?.trim() || "",
  };
}

export function buildJournalListInput(startDate: string, endDate: string, journalNumber: string): JournalListInput {
  const includeJournalNumber = journalNumber.trim();
  return {
    startDate,
    endDate,
    limit: 100,
    ...(includeJournalNumber ? { includeJournalNumber } : {}),
  };
}
