import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const state = vi.hoisted(() => ({
  feed: true, loading: false, financial: true, financialLoading: false,
  selection: null as any, nullState: 0, detailCalls: [] as any[],
  list: [] as any[], error: false, agingFeedAllowed: false as boolean | undefined,
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: (initial: any) => {
    const result = actual.useState(initial);
    // The four invoice-target states start null. Seed retained state on SSR
    // so tests inspect the immediate render gate, without relying on effects.
    if (initial === null && state.selection && state.nullState++ < 4) return [state.selection, result[1]];
    return result;
  } };
});
vi.mock("@/hooks/useModuleViewAccess", () => ({ useModuleViewAccess: () => ({
  customers: true, suppliers: true, feed_management: state.feed, loading: state.loading,
}) }));
vi.mock("@/hooks/useFinancialVisibility", () => ({ useFinancialVisibility: () => ({ allowed: state.financial, loading: state.financialLoading }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/sales/invoices", vi.fn()],
  Link: ({ href, children, ...props }: any) => React.createElement("a", { href, ...props }, children),
}));
vi.mock("@/components/ui/dialog", () => {
  const box = ({ children }: any) => React.createElement("div", null, children);
  return { useDialogComposition: () => ({ justEndedComposing: () => false, setComposing: vi.fn(), markCompositionEnd: vi.fn() }), Dialog: box, DialogContent: box, DialogHeader: box, DialogTitle: box, DialogFooter: box };
});
vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }) };
  const detail = { useQuery: (id: number, options: any) => {
    state.detailCalls.push({ id, enabled: options.enabled });
    return { data: undefined, isLoading: false, refetch: vi.fn() };
  } };
  return { trpc: { useUtils: () => ({ invoices: {} }), invoices: {
    list: { useQuery: () => ({ data: state.list, isLoading: false }) },
    getItems: detail, getAccountingPosting: detail, getPaymentPostings: detail,
    generatePDF: mutation, markAsSent: mutation, recordPayment: mutation, cancel: mutation,
    getInvoiceAgingSummary: { useQuery: () => ({ isLoading: false, isError: state.error, data: {
      feedViewAllowed: state.agingFeedAllowed,
      customer: { overdue: 1, totalOverdue: 100, dueSoonCount: 1, dueSoonAmount: 80 },
      mill: { overdue: 3, totalOverdueAmount: 99999, dueSoonCount: 2, dueSoonAmount: 88888 },
    } }) },
  } } };
});
import { Invoices, invoiceVisibleUnderFeedAccess } from "../pages/Invoices";
import FinancialAttentionWidget from "../components/FinancialAttentionWidget";
const invoice = (id: number, feedOrderId: number | null) => ({
  id, feedOrderId, invoiceNumber: feedOrderId === null ? "SALES-PUBLIC" : "FEED-PRIVATE",
  customerName: feedOrderId === null ? "Sales customer" : "Secret feed customer",
  invoiceDate: "2026-11-01", dueDate: "2026-11-30", status: "sent", inclusiveTotal: "100",
});
const renderInvoices = () => { state.nullState = 0; state.detailCalls = []; return renderToStaticMarkup(React.createElement(Invoices)); };
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal("React", React);
  state.feed = true; state.loading = false; state.financial = true; state.financialLoading = false;
  state.agingFeedAllowed = false; state.selection = null; state.list = [invoice(1, null), invoice(2, 42)]; state.error = false;
});
describe("AF-02 shared cached consumers (SSR; no API/database/browser)", () => {
  it("retained mixed list: fresh Allow then Block preserves Sales actions and removes Feed row", () => {
    expect(renderInvoices()).toContain("FEED-PRIVATE");
    state.feed = false;
    const html = renderInvoices();
    expect(html).not.toContain("FEED-PRIVATE"); expect(html).not.toContain("Secret feed customer");
    expect(html).toContain("SALES-PUBLIC"); expect(html).toContain("Create Invoice");
    expect(html).toContain("Record Payment"); expect(html).toContain("Download PDF");
  });
  for (const mode of ["blocked", "loading"] as const) {
    it(`${mode}: retained selected Feed detail and all action dialogs unmount; detail hooks stay unconditional but disabled`, () => {
      state.selection = invoice(2, 42);
      expect(renderInvoices()).toContain("Customer Payment Journals");
      if (mode === "blocked") state.feed = false; else state.loading = true;
      const html = renderInvoices();
      expect(html).not.toContain("FEED-PRIVATE"); expect(html).not.toContain("Customer Payment Journals");
      expect(html).not.toContain("Confirm Sent &amp; Post"); expect(html).not.toContain("Payment Amount (R)");
      expect(state.detailCalls).toEqual(Array(3).fill({ id: 0, enabled: false }));
    });
  }
  it("Sales selection remains available with Feed blocked", () => {
    state.feed = false; state.selection = invoice(1, null);
    expect(renderInvoices()).toContain("Customer Payment Journals");
    expect(state.detailCalls).toEqual(Array(3).fill({ id: 1, enabled: true }));
  });
  it("id-only selection fails closed, without inventing a Sales discriminator", () => {
    state.feed = false; state.selection = { id: 2, invoiceNumber: "UNKNOWN-PRIVATE" };
    expect(renderInvoices()).not.toContain("UNKNOWN-PRIVATE");
    expect(state.detailCalls.every(call => !call.enabled)).toBe(true);
    expect(invoiceVisibleUnderFeedAccess({ id: 1 }, false)).toBe(false);
    expect(invoiceVisibleUnderFeedAccess({ feedOrderId: null }, false)).toBe(true);
    expect(invoiceVisibleUnderFeedAccess({ feedOrderId: undefined }, false)).toBe(true);
    expect(invoiceVisibleUnderFeedAccess({ feedOrderId: 0 }, false)).toBe(false);
  });
  it("retained aging: fresh Block/loading hides Mill cards and links, preserving customer cards", () => {
    const render = () => renderToStaticMarkup(React.createElement(FinancialAttentionWidget));
    expect(render()).toContain("/invoicing/mill-invoices");
    state.feed = false;
    expect(render()).not.toContain("Supplier invoices"); expect(render()).not.toContain("/invoicing/mill-invoices");
    expect(render()).toContain("Customer invoices overdue");
    state.feed = true; state.loading = true;
    expect(render()).not.toContain("/invoicing/mill-invoices");
  });
  it("old Allow customer aggregate is hidden after Feed denial until a server-filtered response arrives", () => {
    state.feed = false; state.agingFeedAllowed = true;
    const render = () => renderToStaticMarkup(React.createElement(FinancialAttentionWidget));
    expect(render()).not.toContain("Customer invoices overdue");
    expect(render()).not.toContain("/invoicing/mill-invoices");
    state.agingFeedAllowed = undefined;
    expect(render()).not.toContain("Customer invoices overdue");
    state.agingFeedAllowed = false;
    expect(render()).toContain("Customer invoices overdue");
    expect(render()).not.toContain("/invoicing/mill-invoices");
  });
  it("aging error does not render retained financial amounts; existing financial guard remains", () => {
    state.error = true;
    const render = () => renderToStaticMarkup(React.createElement(FinancialAttentionWidget));
    expect(render()).toContain("temporarily unavailable"); expect(render()).not.toContain("Supplier invoices overdue");
    state.financial = false; expect(render()).toBe("");
    state.financial = true; state.financialLoading = true; expect(render()).toBe("");
  });
  it("source disposal and pending-response guards are present (SSR does not execute effects)", () => {
    const text = readFileSync(resolve(import.meta.dirname, "../pages/Invoices.tsx"), "utf8");
    expect(text).toContain("useEffect(() => {");
    for (const setter of ["setViewInvoice", "setSendTarget", "setPaymentTarget", "setCancelTarget"]) expect(text).toContain(`${setter}(null)`);
    expect(text).toContain("pendingPdfInvoice.current = null");
    expect(text).toContain("generatePdfMutation.reset()");
    expect(text).toContain("invoiceVisibleUnderFeedAccess(pendingPdfInvoice.current, feedAllowedRef.current)");
    expect(text).toContain("formatFinancialMutationError");
  });
});
