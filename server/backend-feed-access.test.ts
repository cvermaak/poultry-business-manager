import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUSINESS_PERMISSION_DEFINITIONS as definitions, BUSINESS_PERMISSION_ROUTES as routes, type BusinessScope } from "../shared/business-permission-definitions";
import { createScopedPermissionPolicyModel, SCOPED_POLICY_ROLES } from "../shared/scoped-permission-policy-model";
import { SupplierPermissionPolicyModel } from "../shared/supplier-permission-policy-model";
import { PREPARED_PERMISSION_CATALOGUE } from "../shared/role-permission-catalogue.generated";

const state = vi.hoisted(() => {
  const names = ["listCustomers", "getCustomerById", "getCustomerAddresses", "listSuppliers", "getSupplierById", "createSupplier", "updateSupplier", "deleteSupplier", "listFeedFormulations", "getFeedFormulationById", "createFeedFormulation", "deactivateFeedFormulation", "listMillCosts", "createMillCost", "updateMillCost", "deleteMillCost", "listCustomerFeedPrices", "createCustomerFeedPrice", "updateCustomerFeedPrice", "deleteCustomerFeedPrice", "getEffectiveCustomerFeedPrice", "getEffectiveMillCost", "listFeedOrders", "getFeedOrderById", "createFeedOrder", "reserveAdditiveStock", "updateFeedOrderStatus", "updateFeedOrderMillInvoice", "markMillInvoicePaid", "listFeedOrderDeliveries", "createFeedOrderDelivery", "updateDeliveryStatus", "listAdditivePOs", "updateAdditivePO", "getFeedOrderAlerts", "getAdditiveMappings", "setAdditiveMapping", "checkAdditiveStockForOrder", "createFeedDeliveryInvoice", "listFeedDeliveryInvoices", "listMillInvoices", "createMillInvoice", "recordMillInvoicePayment", "getMillInvoicePosting", "getMillInvoicePaymentPostings", "postMillInvoiceToPayables", "getActiveFlockCount", "getTotalCustomerCount", "getMonthlyRevenue", "getFlockDailyRecords", "createFlockDailyRecord", "updateFlockDailyRecord", "getFeedEfficiencyMetrics", "logUserActivity", "mysqlTimestamp", "listInvoices", "getInvoiceById", "getInvoiceItems", "getCustomerInvoicePosting", "getCustomerInvoicePaymentPostings", "markInvoiceAsSent", "recordInvoicePayment", "cancelInvoice", "getCustomerInvoiceAgingSummary", "getMillInvoiceAgingSummary"];
  return {
    actors: new Map<number, { id: number; role: string; isActive: 0 | 1 }>(),
    models: new Map<string, any>(), supplier: undefined as any,
    read: vi.fn(), resolve: vi.fn(), unavailable: false, drift: false,
    db: Object.fromEntries(names.map(name => [name, vi.fn()])),
    readFeedReportSource: vi.fn(), buildFeedPerformanceReport: vi.fn(),
  };
});
// Never create a real pool, read credentials, or initialize a business database.
vi.mock("mysql2/promise", () => ({ createPool: vi.fn(() => ({})) }));
vi.mock("./scoped-permission-db", async importOriginal => {
  const actual = await importOriginal<typeof import("./scoped-permission-db")>();
  return { ...actual, createScopedPermissionDb: (definition: { scope: string }) => ({
    resolveActor: async (id: number) => {
      state.resolve(id);
      const actor = state.actors.get(id);
      if (state.drift && state.resolve.mock.calls.length % 2 === 0) return { ...actor, role: "accountant" };
      return actor;
    },
    readPolicy: async (role: string) => {
      state.read(definition.scope, role);
      if (state.unavailable) throw new Error("Synthetic unavailable policy repository");
      return { ok: true, policy: state.models.get(definition.scope).getPolicy(role) };
    },
    save: async (id: number, request: unknown) => {
      const actor = state.actors.get(id);
      return state.models.get(definition.scope).save({ authenticated: !!actor, active: actor?.isActive === 1, role: actor?.role, actorId: id }, request);
    },
  }) };
});
vi.mock("./supplier-permission-db", () => ({ createSupplierPermissionDb: () => ({
  resolveActor: async (id: number) => state.actors.get(id),
  readPolicy: async (role: string) => {
    if (state.unavailable) throw new Error("Synthetic unavailable policy repository");
    return { ok: true, policy: state.supplier.getPolicy(role) };
  },
  save: async (id: number, request: unknown) => {
    const actor = state.actors.get(id);
    return state.supplier.save({ authenticated: !!actor, active: actor?.isActive === 1, role: actor?.role, actorId: id }, request);
  },
}) }));
vi.mock("./db", () => state.db);
vi.mock("./feed-report-db", () => ({ readFeedReportSource: state.readFeedReportSource }));
vi.mock("./feed-report-engine", () => ({ buildFeedPerformanceReport: state.buildFeedPerformanceReport }));
import { appRouter } from "./routers";
import { authorizeBusinessAction, getBusinessPermissionService } from "./business-permission-service";

function caller(id = 2, claimedRole = "farm_manager") {
  return appRouter.createCaller({ user: { id, role: claimedRole, isActive: 1, openId: "synthetic", email: "synthetic@example.invalid" }, req: { headers: {} }, res: {} } as any);
}
const admin = { authenticated: true, active: true, role: "admin", actorId: 1 };
async function saveScope(scope: BusinessScope, grants: Record<string, boolean>, expectedVersion = 0) {
  const result = await caller(1, "admin").businessPermissions.save({ scope, request: { role: "farm_manager", catalogueRevision: definitions[scope].catalogue.revision, expectedVersion, grants, reason: "Synthetic approved module decision" } });
  expect(result).toMatchObject({ ok: true });
  return result;
}
async function saveSupplier(grants: Record<string, boolean>, expectedVersion = 0) {
  const result = await caller(1, "admin").supplierPermissions.save({ role: "farm_manager", catalogueRevision: PREPARED_PERMISSION_CATALOGUE.revision, expectedVersion, grants, reason: "Synthetic approved Supplier decision" });
  expect(result).toMatchObject({ ok: true });
  return result;
}
const feedPaths = Object.keys(routes.feed_management.methods);
function invoke(path: string, input?: unknown) {
  const [namespace, method] = path.split(".");
  return (caller() as any)[namespace][method](input);
}
function expectNoFeedHelpers() {
  for (const [name, fn] of Object.entries(state.db)) {
    if (/Feed|Mill|Additive|CustomerPrice|Delivery/.test(name)) expect(fn, name).not.toHaveBeenCalled();
  }
}
beforeEach(() => {
  // Test-local synthetic URI only; createPool and both repositories are mocked.
  vi.stubEnv("DATABASE_URL", "mysql://synthetic:synthetic@blocked.invalid/offline_fixture");
  state.actors.clear(); state.actors.set(1, { id: 1, role: "admin", isActive: 1 });
  SCOPED_POLICY_ROLES.forEach((role, i) => state.actors.set(i + 2, { id: i + 2, role, isActive: 1 }));
  state.models.clear();
  for (const scope of Object.keys(definitions) as BusinessScope[]) {
    const definition = definitions[scope]; const Model = createScopedPermissionPolicyModel(definition);
    state.models.set(scope, new Model({ catalogue: definition.catalogue, clock: () => 1794680000000 }));
  }
  state.supplier = new SupplierPermissionPolicyModel({ catalogue: PREPARED_PERMISSION_CATALOGUE, clock: () => 1794680000000 });
  state.read.mockClear(); state.resolve.mockClear(); state.unavailable = false; state.drift = false;
  Object.values(state.db).forEach(fn => fn.mockReset().mockResolvedValue([]));
  state.db.listCustomers.mockResolvedValue([{ id: 7, name: "Synthetic customer" }]);
  state.db.listSuppliers.mockResolvedValue([{ id: 8, name: "Synthetic supplier" }]);
  state.db.getCustomerById.mockResolvedValue({ id: 7, name: "Synthetic customer" });
  state.db.getSupplierById.mockResolvedValue({ id: 8, name: "Synthetic supplier" });
  state.db.mysqlTimestamp.mockImplementation(() => "2026-11-14 12:00:00");
  state.readFeedReportSource.mockReset().mockResolvedValue({ timezone: "Africa/Johannesburg", source: { houses: [], flocks: [] } });
  state.buildFeedPerformanceReport.mockReset().mockReturnValue({ totalFeedKg: 125, fcr: 1.7 });
});

describe("real saved policy models and mounted Customer/Supplier APIs", () => {
  it("honours persisted grouped Customer View Block after a previously allowed request", async () => {
    expect(await caller().customers.list()).toHaveLength(1);
    const grants = Object.fromEntries(definitions.customers.actions.view.map(key => [key, false]));
    const saved = await saveScope("customers", grants);
    expect(saved).toMatchObject({ snapshot: { version: 1, grants } });
    state.db.listCustomers.mockClear();
    await expect(caller().customers.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().customers.getById({ id: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().customers.getAddresses({ customerId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.listCustomers).not.toHaveBeenCalled(); expect(state.db.getCustomerById).not.toHaveBeenCalled(); expect(state.db.getCustomerAddresses).not.toHaveBeenCalled();
    expect(state.read).toHaveBeenCalledWith("customers", "farm_manager");
    const model = state.models.get("customers");
    for (const key of definitions.customers.actions.view) expect(model.evaluate({ ...admin, actorId: 2, role: "farm_manager" }, key)).toMatchObject({ reason: "POLICY_DENY", roleGatePassed: false });
  });
  it("honours real persisted Supplier View Block without any alternate API bypass", async () => {
    expect(await caller().suppliers.list()).toHaveLength(1);
    const grants = { "suppliers.records.view.list": false, "suppliers.records.view.getbyid": false };
    await saveSupplier(grants); state.db.listSuppliers.mockClear();
    await expect(caller().suppliers.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().suppliers.getById({ id: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.listSuppliers).not.toHaveBeenCalled(); expect(state.db.getSupplierById).not.toHaveBeenCalled();
    for (const key of Object.keys(grants)) expect(state.supplier.evaluate({ ...admin, actorId: 2, role: "farm_manager" }, key)).toMatchObject({ reason: "POLICY_DENY", roleGatePassed: false });
    expect(Object.keys(appRouter._def.procedures).filter(path => /supplierManagement/i.test(path))).toEqual([]);
  });
  it("does not return or query blocked Customer counts on the dashboard", async () => {
    await saveScope("customers", { "customers.records.view.getaddresses": false });
    const result = await caller().analytics.dashboard();
    expect(result).not.toHaveProperty("totalCustomers"); expect(state.db.getTotalCustomerCount).not.toHaveBeenCalled();
    expect(state.db.getActiveFlockCount).toHaveBeenCalledOnce();
  });
  it("fresh stored role takes priority over a stale browser Admin claim", async () => {
    await saveScope("customers", { "customers.records.view.list": false });
    await saveSupplier({ "suppliers.records.view.list": false });
    await expect(caller(2, "admin").customers.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(2, "admin").suppliers.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await caller(1, "admin").customers.list()).toHaveLength(1);
    expect(await caller(1, "admin").suppliers.list()).toHaveLength(1);
  });
  it("preserves all original catalogue revision identifiers", () => {
    for (const scope of ["customers", "sales_orders", "invoices", "financial_data"] as const) expect(definitions[scope].catalogue.revision).toBe(`business-permissions-2026-11-14-v1-${scope}`);
  });
});

describe("Feed Management module gate covers the actual mounted source", () => {
  it("maps every mounted feed child and only feed-specific invoice aliases", () => {
    const mounted = Object.keys(appRouter._def.procedures);
    const actual = mounted.filter(path => path.startsWith("feedManagement.") || path.startsWith("feedOrders."));
    expect(feedPaths.filter(path => !path.startsWith("invoices.")).sort()).toEqual(actual.sort());
    expect(feedPaths).toHaveLength(37);
    expect(feedPaths.every(path => mounted.includes(path))).toBe(true);
    expect(feedPaths).not.toContain("invoices.list"); expect(feedPaths).not.toContain("salesOrders.list");
  });
  it.each(feedPaths)("Farm default Block denies %s before parsers/handlers", async path => {
    // Financial visibility Allow isolates the new module Block where original financial rules permit it.
    await saveScope("financial_data", { [definitions.financial_data.actions.view[0]]: true });
    await expect(invoke(path, undefined)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoFeedHelpers();
  });
  it.each(["admin", ...SCOPED_POLICY_ROLES])("retains source-defined %s module default", async role => {
    const id = role === "admin" ? 1 : SCOPED_POLICY_ROLES.indexOf(role as any) + 2;
    if (role === "farm_manager") await expect(getBusinessPermissionService("feed_management").authorize(id, definitions.feed_management.actions.view)).rejects.toMatchObject({ code: "FORBIDDEN" });
    else await expect(getBusinessPermissionService("feed_management").authorize(id, definitions.feed_management.actions.view)).resolves.toBeUndefined();
  });
  it("saved Allow and re-Block take effect on the next request", async () => {
    const key = definitions.feed_management.actions.view[0];
    await saveScope("feed_management", { [key]: true });
    expect(await caller().feedManagement.listFormulations()).toEqual([]);
    await saveScope("feed_management", { [key]: false }, 1); state.db.listFeedFormulations.mockClear();
    await expect(caller().feedManagement.listFormulations()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.listFeedFormulations).not.toHaveBeenCalled();
  });
  it("Allow never bypasses original financial and farm payment restrictions", async () => {
    await saveScope("feed_management", { [definitions.feed_management.actions.view[0]]: true });
    await expect(caller().feedManagement.listMillCosts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await saveScope("financial_data", { [definitions.financial_data.actions.view[0]]: true });
    await expect(caller().feedOrders.markMillInvoicePaid({ id: 1, paidDate: "2026-11-14" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.listMillCosts).not.toHaveBeenCalled(); expect(state.db.markMillInvoicePaid).not.toHaveBeenCalled();
  });
  it("rejects inactive, missing, role-racing and unavailable stored identity/policy", async () => {
    state.actors.set(2, { id: 2, role: "farm_manager", isActive: 0 });
    await expect(caller().feedOrders.checkAdditiveStock({ quantityTons: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.actors.delete(2); await expect(caller().feedOrders.checkAdditiveStock({ quantityTons: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    state.actors.set(2, { id: 2, role: "farm_manager", isActive: 1 }); state.drift = true; state.resolve.mockClear();
    await expect(caller().feedOrders.checkAdditiveStock({ quantityTons: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.drift = false; state.unavailable = true;
    await expect(caller().feedOrders.checkAdditiveStock({ quantityTons: 1 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(state.db.checkAdditiveStockForOrder).not.toHaveBeenCalled();
  });
  it("keeps daily flock feed quantities, feed efficiency/FCR and Production Reports available", async () => {
    state.db.getFlockDailyRecords.mockResolvedValue([{ feedConsumed: "125" }]);
    state.db.getFeedEfficiencyMetrics.mockResolvedValue({ fcr: 1.7, totalFeedConsumed: 125 });
    expect(await caller().flocks.getDailyRecords({ flockId: 1 })).toEqual([{ feedConsumed: "125" }]);
    expect(await caller().flocks.getFeedEfficiencyMetrics({ flockId: 1 })).toMatchObject({ fcr: 1.7 });
    expect(await caller().flocks.createDailyRecord({ flockId: 1, recordDate: new Date("2026-11-14T12:00:00Z"), dayNumber: 1, feedConsumed: 125 })).toEqual({ success: true });
    expect(state.db.createFlockDailyRecord).toHaveBeenCalledWith(expect.objectContaining({ feedConsumed: "125" }));
    expect(await caller().productionReports.feedPerformance({})).toMatchObject({ totalFeedKg: 125, fcr: 1.7 });
    expect(state.buildFeedPerformanceReport).toHaveBeenCalledOnce();
    expect(state.read.mock.calls.some(([scope]) => scope === "feed_management")).toBe(false);
  });
  it("mixed aging summary omits mill data and never queries the blocked mill aggregate", async () => {
    await saveScope("financial_data", { [definitions.financial_data.actions.view[0]]: true });
    state.db.getCustomerInvoiceAgingSummary.mockResolvedValue({ current: 0 });
    expect(await caller().invoices.getInvoiceAgingSummary()).toEqual({ customer: { current: 0 }, feedViewAllowed: false });
    expect(state.db.getCustomerInvoiceAgingSummary).toHaveBeenCalledWith(true);
    expect(state.db.getMillInvoiceAgingSummary).not.toHaveBeenCalled();
  });
  it("mixed invoice list omits only stored feed invoices when Feed View is Block", async () => {
    await saveScope("financial_data", { [definitions.financial_data.actions.view[0]]: true });
    state.db.listInvoices.mockResolvedValue([{ id: 1, feedOrderId: 9 }, { id: 2, feedOrderId: null, orderId: 4 }]);
    expect(await caller().invoices.list()).toEqual([{ id: 2, feedOrderId: null, orderId: 4 }]);
  });
  it.each(["getById", "getItems", "getAccountingPosting", "getPaymentPostings", "generatePDF"])("shared invoices.%s cannot expose a blocked feed invoice", async method => {
    await saveScope("financial_data", { [definitions.financial_data.actions.view[0]]: true });
    state.db.getInvoiceById.mockResolvedValue({ id: 1, feedOrderId: 9 });
    await expect((caller().invoices as any)[method](1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.getInvoiceItems).not.toHaveBeenCalled(); expect(state.db.getCustomerInvoicePosting).not.toHaveBeenCalled(); expect(state.db.getCustomerInvoicePaymentPostings).not.toHaveBeenCalled();
  });
  it("shared invoice mutation cannot bypass a saved Feed Block for non-Farm roles", async () => {
    const definition = definitions.feed_management;
    await state.models.get("feed_management").save(admin, { role: "accountant", catalogueRevision: definition.catalogue.revision, expectedVersion: 0, grants: { [definition.actions.view[0]]: false }, reason: "Synthetic approved accountant module Block" });
    state.db.getInvoiceById.mockResolvedValue({ id: 1, feedOrderId: 9 });
    const account = caller(3, "accountant");
    await expect(account.invoices.markAsSent({ invoiceId: 1, sentAt: "2026-11-14" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(account.invoices.recordPayment({ invoiceId: 1, amount: 1, paymentMethod: "cash", paymentDate: "2026-11-14", idempotencyKey: "synthetic-test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(account.invoices.cancel(1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.markInvoiceAsSent).not.toHaveBeenCalled(); expect(state.db.recordInvoicePayment).not.toHaveBeenCalled(); expect(state.db.cancelInvoice).not.toHaveBeenCalled();
  });
  it("does not introduce a Block on unrelated sales invoice details", async () => {
    await saveScope("financial_data", { [definitions.financial_data.actions.view[0]]: true });
    state.db.getInvoiceById.mockResolvedValue({ id: 2, feedOrderId: null, orderId: 4 });
    expect(await caller().invoices.getById(2)).toMatchObject({ id: 2, orderId: 4 });
    expect(await caller().invoices.getItems(2)).toEqual([]);
  });
  it("unknown feed aliases fail closed instead of falling through to a handler", async () => {
    await expect(authorizeBusinessAction(1, "feed_management", "feeds.list")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
