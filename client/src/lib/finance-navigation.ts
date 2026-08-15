export type FinanceTab = "profit-loss" | "journals";

export type FinanceNavigationState = {
  tab: FinanceTab;
  journalNumber: string;
};

export function resolveFinanceNavigation(search: string): FinanceNavigationState {
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalizedSearch);

  return {
    tab: params.get("tab") === "journals" ? "journals" : "profit-loss",
    journalNumber: params.get("journal")?.trim() || "",
  };
}
