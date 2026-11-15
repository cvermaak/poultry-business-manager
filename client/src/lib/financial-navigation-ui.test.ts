import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";

const state = vi.hoisted(() => ({
  modules: {customers:true,suppliers:true,feed_management:true},
  allowed: false,
  loading: false,
  analyticsLoading: false,
  dashboard: vi.fn(),
  aging: vi.fn(),
  alerts: vi.fn(),
}));
vi.mock("@/hooks/useModuleViewAccess",()=>({useModuleViewAccess:()=>({...state.modules,loading:false})}));
vi.mock("@/hooks/useFinancialVisibility", () => ({
  useFinancialVisibility: () => ({ allowed: state.allowed, loading: state.loading }),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  analytics: { dashboard: { useQuery: state.dashboard } },
  invoices: { getInvoiceAgingSummary: { useQuery: state.aging } },
  feedOrders: { getAlerts: { useQuery: state.alerts } },
} }));
vi.mock("@/components/RemindersWidget", () => ({ default: () => "Operational reminders" }));
import Home from "../pages/Home";
import FinancialAttentionWidget from "../components/FinancialAttentionWidget";
import FeedAlertsWidget from "../components/FeedAlertsWidget";
import FinancialModuleNavigationLanding, { ModuleNavigationLanding } from "../components/ModuleNavigationLanding";
import { getVisibleModuleLinks } from "./module-navigation";

// Existing Vitest configuration uses classic JSX for source components.
Object.assign(globalThis, { React });
function render(Component: React.ComponentType) {
  return renderToStaticMarkup(React.createElement(Router, { ssrPath: "/" }, React.createElement(Component)));
}
beforeEach(() => {
  vi.clearAllMocks();
  state.modules={customers:true,suppliers:true,feed_management:true};
  state.allowed = false;
  state.loading = false;
  state.analyticsLoading = false;
  state.dashboard.mockImplementation(() => ({ data: { activeFlocks: 7, totalCustomers: 9, monthlyRevenue: 12345 }, isLoading: state.analyticsLoading }));
  state.aging.mockReturnValue({ data: { customer: { overdue: 1, totalOverdue: 400 } }, isLoading: false, isError: false });
  state.alerts.mockReturnValue({ data: [
    { type: "mill_invoice_due", severity: "warning", message: "PRIVATE invoice payment due" },
    { type: "feed_stage_transition", severity: "critical", message: "Order grower feed" },
    { type: "additive_po_due_soon", severity: "warning", message: "Place additive order" },
    { type: "unknown", severity: "info", message: "PRIVATE unknown financial text" },
  ], isLoading: false });
});

describe("financial dashboard mount boundaries", () => {
  it("actual dashboard hides blocked customer/supplier links, customer counts and feed query hooks",()=>{state.modules={customers:false,suppliers:false,feed_management:false};const markup=render(Home);expect(markup).not.toMatch(/Customer Management|Supplier Management|Total Customers|Order grower feed/);expect(markup).toContain("Active Flocks");expect(markup).toContain("Manage Flocks");expect(state.alerts).not.toHaveBeenCalled();});
  it("actual dashboard retains allowed customer/supplier links under the existing defaults",()=>{const markup=render(Home);expect(markup).toContain("Customer Management");expect(markup).toContain("Supplier Management");});
  it.each([{ allowed: false, loading: false }, { allowed: false, loading: true }, { allowed: true, loading: true }])("omits finance completely for %j", visibility => {
    Object.assign(state, visibility);
    const markup = render(Home);
    expect(markup).not.toMatch(/Monthly Revenue|Financial attention|R0\.00|12345|PRIVATE/);
    expect(markup).toContain("Active Flocks");
    expect(markup).toContain("Total Customers");
    expect(markup).toContain("Operational reminders");
    expect(state.dashboard).toHaveBeenCalledOnce();
    expect(state.aging).not.toHaveBeenCalled();
  });
  it("retains permitted finance and its query", () => {
    state.allowed = true;
    const markup = render(Home);
    expect(markup).toContain("Monthly Revenue");
    expect(markup).toContain("Financial attention");
    expect(state.aging).toHaveBeenCalledOnce();
  });
  it("does not mount the standalone attention child when blocked", () => {
    expect(render(FinancialAttentionWidget)).toBe("");
    expect(state.aging).not.toHaveBeenCalled();
  });
  it("omits the revenue loading slot when access is unresolved", () => {
    state.analyticsLoading = true;
    const blocked = render(Home);
    state.allowed = true;
    const allowed = render(Home);
    expect((blocked.match(/data-slot="card"/g) ?? []).length).toBe(3);
    expect((allowed.match(/data-slot="card"/g) ?? []).length).toBe(4);
  });
});

describe("feed alerts derive all presentation from visible rows", () => {
  it("keeps operational rows but excludes financial and unknown rows from the badge", () => {
    const markup = render(FeedAlertsWidget);
    expect(markup).not.toContain("PRIVATE");
    expect(markup).toContain("Order grower feed");
    expect(markup).toContain("Place additive order");
    expect(markup).toMatch(/text-red-700">2<\/span>/);
  });
  it("retains the original complete alert set when allowed", () => {
    state.allowed = true;
    const markup = render(FeedAlertsWidget);
    expect(markup).toContain("PRIVATE invoice payment due");
    expect(markup).toMatch(/text-red-700">4<\/span>/);
  });
  it("does not expose hidden rows through the more-info count", () => {
    state.alerts.mockReturnValue({ data: Array.from({ length: 8 }, () => ({ type: "mill_invoice_due", severity: "info", message: "PRIVATE" })), isLoading: false });
    const markup = render(FeedAlertsWidget);
    expect(markup).not.toMatch(/PRIVATE|more info alerts/);
    expect(markup).toContain("No feed order alerts");
  });
});

describe("financial module navigation", () => {
  it("filters costs and prices by permission, not by role name", () => {
    expect(getVisibleModuleLinks("feed-management", "farm_manager", false).map(link => link.id)).toEqual(["formulations", "feed-orders", "additive-inventory"]);
    expect(getVisibleModuleLinks("feed-management", "farm_manager", true)).toHaveLength(5);
    expect(getVisibleModuleLinks("feed-management", "accountant", true)).toEqual([]);
  });
  it("production default never flashes financial links while permission loads", () => {
    state.allowed = true;
    state.loading = true;
    const markup = render(() => React.createElement(FinancialModuleNavigationLanding, { moduleKey: "feed-management", role: "farm_manager" }));
    expect(markup).not.toMatch(/mill-costs|customer-pricing|Mill Costs|Customer Prices/);
    expect(markup).toContain('href="/feed-orders"');
  });
  it("pure presenter's explicit true mode retains the existing five-link behavior", () => {
    const markup = render(() => React.createElement(ModuleNavigationLanding, { moduleKey: "feed-management", role: "farm_manager", financialAllowed: true }));
    expect(markup).toContain('href="/feed-management/mill-costs"');
    expect(markup).toContain('href="/feed-management/customer-pricing"');
  });
});

describe("direct financial route wrappers", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  it("defines a stable guard HOC outside the router, before page mount", () => {
    expect(source).toContain("<FinancialAccessGuard><Page /></FinancialAccessGuard>");
    expect(source.indexOf("function withFinancialAccess")).toBeLessThan(source.indexOf("function Router"));
    expect(source).not.toContain('role === "farm_manager"');
  });
  it.each([
    ["/sales", "Sales"], ["/sales/invoices", "Invoices"], ["/sales/invoices/create", "CreateInvoice"],
    ["/audit-logs", "AuditLogs"], ["/settings/company", "CompanySettings"], ["/finance", "Finance"],
    ["/finance/expenses", "Expenses"], ["/finance/cash-flow", "CashFlow"],
    ["/feed-management/mill-costs", "MillCosts"], ["/feed-management/customer-pricing", "CustomerFeedPrices"],
    ["/invoicing/feed-invoices", "FeedInvoices"], ["/invoicing/mill-invoices", "MillInvoices"],
  ])("guards %s without changing its layout or original import", (path, page) => {
    const route = source.split(`<Route path="${path}">`)[1].split("</Route>")[0];
    expect(route).toContain("<DashboardLayout>");
    expect(route).toContain(`<Financial${page} />`);
    expect(source).toContain(`const Financial${page} = withFinancialAccess(${page});`);
  });
  it("does not add financial guards to operational orders or permission administration", () => {
    for (const page of ["SalesOrders", "Users", "UserManagement", "FeedManagement", "AllReminders"]) {
      expect(source).toContain(`<${page} />`);
      expect(source).not.toContain(`withFinancialAccess(${page})`);
    }
  });
});
