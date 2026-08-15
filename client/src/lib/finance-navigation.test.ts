import { describe, expect, it } from "vitest";
import { buildJournalListInput, resolveFinanceNavigation } from "./finance-navigation";

describe("Finance deep-link navigation", () => {
  it("opens the General Ledger tab and preserves the linked journal from an invoice URL", () => {
    expect(resolveFinanceNavigation("?tab=journals&journal=GL-1020001")).toEqual({
      tab: "journals",
      journalNumber: "GL-1020001",
    });
  });

  it("defaults to the Profit & Loss tab without a valid General Ledger deep link", () => {
    expect(resolveFinanceNavigation("?tab=profit-loss&journal=GL-1020001")).toEqual({
      tab: "profit-loss",
      journalNumber: "GL-1020001",
    });
  });

  it("keeps a linked journal in the ledger query when it falls outside the selected report dates", () => {
    expect(buildJournalListInput("2026-08-01", "2026-08-15", "GL-900001")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-15",
      limit: 100,
      includeJournalNumber: "GL-900001",
    });
  });
});
