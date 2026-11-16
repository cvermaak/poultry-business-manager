import { describe, expect, it, vi } from "vitest";
import { PREPARED_PERMISSION_CATALOGUE as full } from "../shared/role-permission-catalogue.generated";
import { SUPPLIER_METHOD_KEYS as methods, simulateSupplierPilotGate as gate } from "../shared/supplier-permission-pilot-gate";
import type { PermissionRole } from "../shared/role-permission-types";
const catalogue = { revision: full.revision, capabilities: full.capabilities.filter(c => c.module === "Suppliers") };
const roles: PermissionRole[] = ["admin", "farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator"];
const actor = (role: string) => ({ authenticated: true, active: true, role });
const absent = (role: string) => ({ state: "verified_absent", catalogueRevision: full.revision, scope: "supplier_management", role });
const present = (role = "farm_manager", grants = {}, version = 1) => ({ state: "verified_present", snapshot: { scope: "supplier_management", catalogueRevision: full.revision, role, version, grants } });
describe("PREPARATION ONLY Supplier gate simulation", () => {
  for (const role of roles) for (const method of Object.keys(methods)) {
    it(`preserves recorded ${role}/${method} without an override`, () => {
      const r = gate(catalogue, actor(role), method, absent(role));
      expect(r.decision.status).toBe("allow");
      expect(r.decision.reason).toBe("BASELINE_ALLOW");
      expect(r.observedVersion).toBe(role === "admin" ? null : 0);
    });
  }
  for (const method of Object.keys(methods)) {
    it(`uses a fresh deny and reset for ${method}`, () => {
      const key = methods[method as keyof typeof methods];
      expect(gate(catalogue, actor("farm_manager"), method, present("farm_manager", { [key]: false })).decision.reason).toBe("POLICY_DENY");
      expect(gate(catalogue, actor("farm_manager"), method, present("farm_manager", {}, 2)).decision.reason).toBe("BASELINE_ALLOW");
    });
    it(`keeps protected Admin ${method} independent of policy table failure`, () => {
      const hostile = Object.defineProperty({}, "state", { get() { throw Error("must not read Admin policy"); } });
      expect(gate(catalogue, actor("admin"), method, hostile).decision.reason).toBe("BASELINE_ALLOW");
    });
  }
  for (const state of [undefined, null, {}, { state: "unavailable" }, { state: "verified_absent" }, { state: "fallback" }, Object.create({ state: "verified_absent" })]) {
    it(`rejects failed or unverified read ${JSON.stringify(state)}`, () => { expect(gate(catalogue, actor("farm_manager"), "list", state).decision.roleGatePassed).toBe(false); });
  }
  for (const method of ["export", "constructor", "__proto__", "List", "suppliers.list", "purchaseOrders.create", "", null, 1, ["list"]]) {
    it(`does not dispatch outside exact pilot method ${JSON.stringify(method)}`, () => { expect(gate(catalogue, actor("admin"), method, absent("admin")).decision.reason).toBe("UNMAPPED_SUPPLIER_METHOD"); });
  }
  for (const role of roles.filter(r => r !== "admin")) {
    it(`never shares ${role} grants with another role`, () => { expect(gate(catalogue, actor(role), "list", present("admin", {})).decision.reason).toBe("INVALID_POLICY_READ"); });
  }
  for (const bad of [0, -1, NaN, Infinity, 1.1, 2147483648, "1", null]) {
    it(`rejects corrupted persisted version ${String(bad)}`, () => { const r = present(); r.snapshot.version = bad as number; expect(gate(catalogue, actor("farm_manager"), "list", r).decision.roleGatePassed).toBe(false); });
  }
  it("blocks stale catalogue binding instead of trusting token or cache defaults", () => {
    const r = present(); r.snapshot.catalogueRevision = "old";
    expect(gate(catalogue, actor("farm_manager"), "list", r).decision.reason).toBe("INVALID_POLICY_READ");
    expect(gate(catalogue, actor("farm_manager"), "list", { ...absent("farm_manager"), catalogueRevision: "old" }).decision.roleGatePassed).toBe(false);
  });
  it("blocks other modules even though a larger catalogue can accept those keys", () => {
    const key = full.capabilities.find(c => c.module !== "Suppliers" && c.support === "implemented" && c.control === "editable_ordinary" && c.action !== "Delete")!.key;
    expect(gate(full, actor("farm_manager"), "list", present("farm_manager", { [key]: false })).decision.reason).toBe("OUT_OF_PILOT_POLICY");
  });
  it("does not infer Export", () => { expect(gate(catalogue, actor("farm_manager"), "list", present("farm_manager", { "suppliers.records.export.unmapped": true })).decision.reason).toBe("INVALID_POLICY_READ"); });
  it("does not add a View prerequisite to Create", () => {
    const r = present("farm_manager", { [methods.list]: false, [methods.getById]: false });
    expect(gate(catalogue, actor("farm_manager"), "create", r).decision.status).toBe("allow");
  });
  it("preserves residual guard metadata and cannot turn Allow into business success", () => {
    const r = gate(catalogue, actor("farm_manager"), "create", absent("farm_manager"));
    expect(r.decision.roleGatePassed).toBe(true); expect(r.decision.residualGuards.length).toBeGreaterThan(0);
    const originalHandler = vi.fn(() => { throw Error("Synthetic original business guard"); });
    expect(() => { if (r.decision.roleGatePassed) originalHandler(); }).toThrow("Synthetic original business guard");
    expect(originalHandler).toHaveBeenCalledOnce();
    const denied = gate(catalogue, actor("farm_manager"), "create", present("farm_manager", { [methods.create]: false }));
    if (denied.decision.roleGatePassed) originalHandler(); expect(originalHandler).toHaveBeenCalledOnce();
  });
  it("read accessor is rejected without execution", () => {
    const getter = vi.fn(() => "verified_absent"); const r = Object.defineProperty({}, "state", { enumerable: true, get: getter });
    expect(gate(catalogue, actor("farm_manager"), "list", r).decision.roleGatePassed).toBe(false); expect(getter).not.toHaveBeenCalled();
  });
  it("snapshot accessor is rejected without execution", () => {
    const getter = vi.fn(); const r = Object.defineProperty({ state: "verified_present" }, "snapshot", { enumerable: true, get: getter });
    expect(gate(catalogue, actor("farm_manager"), "list", r).decision.roleGatePassed).toBe(false); expect(getter).not.toHaveBeenCalled();
  });
  it("rejects symbol/extra snapshot fields", () => {
    const r = present(); Object.assign(r.snapshot, { actorId: 7 }); expect(gate(catalogue, actor("farm_manager"), "list", r).decision.roleGatePassed).toBe(false);
    const s = present(); Object.defineProperty(s.snapshot, Symbol("bad"), { value: true }); expect(gate(catalogue, actor("farm_manager"), "list", s).decision.roleGatePassed).toBe(false);
  });
  it("fails closed on throwing proxy reflection", () => { const r = new Proxy({}, { getPrototypeOf() { throw Error("bad"); } }); expect(gate(catalogue, actor("farm_manager"), "list", r).decision.roleGatePassed).toBe(false); });
  for (const principal of [{ ...actor("farm_manager"), active: false }, { ...actor("farm_manager"), authenticated: false }, actor("unknown"), { ...actor("farm_manager"), role: "Admin" }]) {
    it(`rejects invalid principal ${JSON.stringify(principal)}`, () => { expect(gate(catalogue, principal, "list", absent(principal.role)).decision.roleGatePassed).toBe(false); });
  }
  it("new requests observe the supplied latest version instead of reused grants", () => {
    const p = actor("farm_manager"); expect(gate(catalogue, p, "list", present(p.role, {}, 1)).decision.roleGatePassed).toBe(true);
    expect(gate(catalogue, p, "list", present(p.role, { [methods.list]: false }, 2)).decision.roleGatePassed).toBe(false);
    expect(gate(catalogue, p, "list", present(p.role, {}, 3)).decision.roleGatePassed).toBe(true);
  });
});

describe("Independent review P2 — one descriptor-derived principal snapshot", () => {
  it("cannot turn farm-manager descriptors into Admin through a direct get trap", () => {
    const get = vi.fn((_target: ReturnType<typeof actor>, key: string | symbol) => key === "role" ? "admin" : true);
    const principal = new Proxy(actor("farm_manager"), { get });
    expect(gate(catalogue, principal, "list", { state: "unavailable" }).decision.reason).toBe("POLICY_READ_UNAVAILABLE");
    expect(gate(catalogue, principal, "list", present("farm_manager", { [methods.list]: false })).decision.reason).toBe("POLICY_DENY");
    expect(get).not.toHaveBeenCalled();
  });
  it("never invokes throwing principal direct reads after descriptor validation", () => {
    const get = vi.fn(() => { throw Error("must never get principal fields"); });
    const principal = new Proxy(actor("farm_manager"), { get });
    expect(gate(catalogue, principal, "list", present("farm_manager", { [methods.list]: false })).decision.reason).toBe("POLICY_DENY");
    expect(get).not.toHaveBeenCalled();
  });
  it("rejects a principal accessor without executing it", () => {
    const getter = vi.fn(() => "admin");
    const principal = Object.defineProperty(actor("farm_manager"), "role", { enumerable: true, get: getter });
    expect(gate(catalogue, principal, "list", { state: "unavailable" }).decision.reason).toBe("INVALID_PRINCIPAL");
    expect(getter).not.toHaveBeenCalled();
  });
  it("uses Admin descriptors rather than a conflicting direct-read non-admin role", () => {
    const get = vi.fn(() => "farm_manager");
    const principal = new Proxy(actor("admin"), { get });
    expect(gate(catalogue, principal, "list", present("farm_manager", { [methods.list]: false })).decision.reason).toBe("BASELINE_ALLOW");
    expect(get).not.toHaveBeenCalled();
  });
});
