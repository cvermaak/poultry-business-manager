import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homePagePath = resolve(process.cwd(), "client/src/pages/Home.tsx");
const widgetPath = resolve(process.cwd(), "client/src/components/FinancialAttentionWidget.tsx");
const databasePath = resolve(process.cwd(), "server/db.ts");

describe("dashboard financial attention", () => {
  it("replaces detailed dashboard ageing with action-focused alerts and finance navigation", () => {
    const homePage = readFileSync(homePagePath, "utf8");
    const widget = readFileSync(widgetPath, "utf8");
    const database = readFileSync(databasePath, "utf8");

    expect(homePage).toContain('import FinancialAttentionWidget from "@/components/FinancialAttentionWidget";');
    expect(homePage).toContain("<FinancialAttentionWidget />");
    expect(homePage).not.toContain("<InvoiceAgingWidget />");

    expect(widget).toContain("Financial attention");
    expect(widget).toContain("No customer or supplier invoice actions need attention.");
    expect(widget).toContain('href="/finance?tab=receivables"');
    expect(widget).toContain("Customer invoices overdue");
    expect(widget).toContain("Supplier invoices due ≤7 days");
    expect(widget).not.toContain("Outstanding");

    expect(database).toContain("dueSoonCount");
    expect(database).toContain("dueSoonAmount");
  });
});
