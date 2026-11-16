import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PREPARED_PERMISSION_CATALOGUE as full } from "../shared/role-permission-catalogue.generated";
import { simulateSupplierLifecycleGate as gate } from "../shared/supplier-lifecycle-permission-gate";
import { SUPPLIER_METHOD_KEYS as methods, simulateSupplierPilotGate as original } from "../shared/supplier-permission-pilot-gate";
import type { PermissionPrincipal, PermissionRole } from "../shared/role-permission-types";

const catalogue = { revision: full.revision, capabilities: full.capabilities.filter(c => c.module === "Suppliers") };
const roles: PermissionRole[] = ["admin", "farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator"];
const actor = (role = "farm_manager"): PermissionPrincipal => ({ authenticated: true, active: true, role });
const absent = (role = "farm_manager") => ({ state: "verified_absent", catalogueRevision: full.revision, scope: "supplier_management", role });
const present = (role = "farm_manager", grants: Record<string, boolean> = {}, version: unknown = 9) => ({
  state: "verified_present",
  snapshot: { scope: "supplier_management", catalogueRevision: full.revision, role, version, grants },
});
const variants = [
  { label: "ordinary edit", method: "update", input: { id: 3, name: "Supplier" }, needs: "edit" },
  { label: "optional undefined ordinary edit", method: "update", input: { id: 3, isActive: undefined }, needs: "edit" },
  { label: "reactivation", method: "update", input: { id: 3, isActive: true }, needs: "edit" },
  { label: "deactivation", method: "update", input: { id: 3, isActive: false }, needs: "both" },
  { label: "delete endpoint", method: "delete", input: { id: 3 }, needs: "delete" },
] as const;
const asPrincipal = (value: unknown) => value as PermissionPrincipal;

function expectDenied(result: ReturnType<typeof gate>): void {
  expect(result.decision.status).toBe("deny");
  expect(result.decision.roleGatePassed).toBe(false);
}

describe("PREPARATION ONLY supplier lifecycle role/action matrix", () => {
  for (const role of roles) for (const edit of [false, true]) for (const deletion of [false, true]) for (const variant of variants) {
    it(`${role}: Edit=${edit}, Delete=${deletion}, ${variant.label}`, () => {
      const grants = { [methods.update]: edit, [methods.delete]: deletion, [methods.list]: false, [methods.getById]: false };
      const result = gate(catalogue, actor(role), variant.method, variant.input, present(role, grants, 13));
      const allowed = role === "admin" || (variant.needs === "both" ? edit && deletion : variant.needs === "edit" ? edit : deletion);
      expect(result.decision.roleGatePassed).toBe(allowed);
      expect(result.decision.status).toBe(allowed ? "allow" : "deny");
      expect(result.observedVersion).toBe(role === "admin" ? null : 13);
      const helper = vi.fn();
      if (result.decision.roleGatePassed) helper();
      expect(helper).toHaveBeenCalledTimes(allowed ? 1 : 0);
    });
  }
  for (const role of roles) for (const variant of variants) {
    it(`${role}/${variant.label}: verified initial defaults remain all-Allow`, () => {
      const result = gate(catalogue, actor(role), variant.method, variant.input, absent(role));
      expect(result.decision.status).toBe("allow");
      expect(result.decision.reason).toBe("BASELINE_ALLOW");
      expect(result.observedVersion).toBe(role === "admin" ? null : 0);
    });
  }
  for (const role of roles) for (const method of Object.keys(methods)) {
    it(`${role}/${method}: original exact five method decisions preserved`, () => {
      const input = method === "update" ? { id: -1.5, notes: null } : undefined;
      expect(gate(catalogue, actor(role), method, input, absent(role)))
        .toEqual(original(catalogue, actor(role), method, absent(role)));
    });
  }
  it("preserves the original exact five keys without expanding exports or actions", () => {
    expect(methods).toEqual({
      list: "suppliers.records.view.list", getById: "suppliers.records.view.getbyid",
      create: "suppliers.records.create.create", update: "suppliers.records.edit.update", delete: "suppliers.records.delete.delete",
    });
    expect(Object.isFrozen(methods)).toBe(true);
  });
  for (const method of ["export", "deactivate", "reactivate", "constructor", "__proto__", "List", "suppliers.update", "purchaseOrders.delete", "", null, 1, ["update"]]) {
    it(`rejects unmapped method ${JSON.stringify(method)}`, () => {
      expect(gate(catalogue, actor("admin"), method, { id: 3, isActive: false }, absent("admin")).decision.reason)
        .toBe("UNMAPPED_SUPPLIER_METHOD");
    });
  }
});

describe("Exact lifecycle combination and retained residual guards", () => {
  const combinations: Record<string, boolean>[] = [
    { [methods.update]: false, [methods.delete]: true },
    { [methods.update]: true, [methods.delete]: false },
    { [methods.update]: false, [methods.delete]: false },
    { [methods.update]: true, [methods.delete]: true },
    {},
  ];
  for (const grants of combinations) {
    it(`selects the exact original blocking/allow decision for ${JSON.stringify(grants)}`, () => {
      const read = present("farm_manager", grants, 37);
      const edit = original(catalogue, actor(), "update", read);
      const deletion = original(catalogue, actor(), "delete", read);
      const selected = !edit.decision.roleGatePassed ? edit : !deletion.decision.roleGatePassed ? deletion : edit;
      const expected = {
        ...selected,
        decision: { ...selected.decision, residualGuards: Array.from(new Set([...edit.decision.residualGuards, ...deletion.decision.residualGuards])) },
      };
      expect(gate(catalogue, actor(), "update", { id: 3, isActive: false }, read)).toEqual(expected);
    });
  }
  it("unions different Edit and Delete guards without losing either exact decision", () => {
    const withGuards = {
      revision: catalogue.revision,
      capabilities: catalogue.capabilities.map(c => ({ ...c, residualGuards: c.key === methods.update ? ["original edit guard", "shared guard"]
        : c.key === methods.delete ? ["original delete guard", "shared guard"] : c.residualGuards })),
    };
    const result = gate(withGuards, actor(), "update", { id: 3, isActive: false }, present("farm_manager", { [methods.delete]: false }, 42));
    expect(result.decision).toMatchObject({ capabilityKey: methods.delete, reason: "POLICY_DENY", roleGatePassed: false });
    expect(result.decision.residualGuards).toEqual(["original edit guard", "shared guard", "original delete guard"]);
    expect(result.observedVersion).toBe(42);
  });
  it("does not equate an allowed role gate with business success or execute any helper", () => {
    const businessHelper = vi.fn(() => { throw new Error("Synthetic retained original business guard"); });
    const allowed = gate(catalogue, actor(), "update", { id: 3, isActive: false }, absent());
    expect(businessHelper).not.toHaveBeenCalled();
    expect(allowed.decision.residualGuards.length).toBeGreaterThan(0);
    expect(() => { if (allowed.decision.roleGatePassed) businessHelper(); }).toThrow("Synthetic retained original business guard");
    const blocked = gate(catalogue, actor(), "update", { id: 3, isActive: false }, present("farm_manager", { [methods.delete]: false }));
    if (blocked.decision.roleGatePassed) businessHelper();
    expect(businessHelper).toHaveBeenCalledOnce();
  });
  it("does not add a View prerequisite to update/reactivation/delete/create", () => {
    const read = present("farm_manager", { [methods.list]: false, [methods.getById]: false });
    for (const variant of variants) expect(gate(catalogue, actor(), variant.method, variant.input, read).decision.roleGatePassed).toBe(true);
    expect(gate(catalogue, actor(), "create", {}, read).decision.roleGatePassed).toBe(true);
  });
  it("different requests observe supplied latest versions and never mutate injected records", () => {
    const principal = Object.freeze(actor());
    const grants = Object.freeze({ [methods.delete]: false });
    const read = Object.freeze({ state: "verified_present", snapshot: Object.freeze({ ...present().snapshot, grants }) });
    const input = Object.freeze({ id: 3, isActive: false });
    expectDenied(gate(catalogue, principal, "update", input, read));
    expect(read.snapshot.grants).toEqual({ [methods.delete]: false });
    expect(gate(catalogue, principal, "update", input, present("farm_manager", {}, 10)).observedVersion).toBe(10);
    expect(gate(catalogue, principal, "update", input, present("farm_manager", {}, 11)).decision.roleGatePassed).toBe(true);
  });
});

describe("Mounted update input boundary: own descriptor data, never coercion", () => {
  for (const value of [0, 1, "false", "true", "", null, NaN, {}, [], new Boolean(false)]) {
    for (const role of ["farm_manager", "admin"]) it(`${role}: rejects own nonboolean isActive ${String(value)}`, () => {
      const result = gate(catalogue, actor(role), "update", { id: 3, isActive: value }, absent(role));
      expectDenied(result);
      expect(result.decision.reason).toBe("INVALID_SUPPLIER_UPDATE_INPUT");
    });
  }
  for (const input of [undefined, null, [], false, "false", {}, { isActive: false }, { id: "3", isActive: false },
    { id: NaN, isActive: false }, { id: Infinity, isActive: false }, { id: -Infinity, isActive: false },
    { id: 3, isActive: false, outsideScope: true }, { id: 3, isActive: false, name: "" },
    { id: 3, isActive: false, contactPerson: 7 }, { id: 3, isActive: false, preferredContactMethod: "fax" },
    { id: 3, isActive: false, name: null }]) {
    it(`rejects malformed update ${JSON.stringify(input)}`, () => {
      expectDenied(gate(catalogue, actor("admin"), "update", input, absent("admin")));
    });
  }
  for (const id of [-3, -1.25, 0, 2.5]) it(`retains original Zod number ID semantics: ${id}`, () => {
    expect(z.object({ id: z.number() }).safeParse({ id }).success).toBe(true);
    expect(gate(catalogue, actor(), "update", { id, isActive: false }, absent()).decision.status).toBe("allow");
  });
  it("permits every mounted optional field without arbitrary wildcard keys", () => {
    const input = {
      id: -1.5, name: "Supplier", contactPerson: null, email: "", phone: null, whatsapp: "123",
      preferredContactMethod: "both", category: null, paymentTerms: "30 days", taxNumber: null,
      bankName: "Bank", bankAccountNumber: null, notes: undefined, isActive: false,
    };
    expect(gate(catalogue, actor(), "update", input, absent()).decision.status).toBe("allow");
  });
  it("missing isActive means Edit only even with Delete denied", () => {
    expect(gate(catalogue, actor(), "update", { id: 3 }, present("farm_manager", { [methods.delete]: false })).decision.status).toBe("allow");
  });
  it("preserves Zod optional undefined and never coerces a conflicting Proxy get to false", () => {
    const schema = z.object({ id: z.number(), isActive: z.boolean().optional() });
    const input = schema.parse({ id: 3, isActive: undefined });
    const get = vi.fn(() => false);
    expect(gate(catalogue, actor(), "update", new Proxy(input, { get }), present("farm_manager", { [methods.delete]: false })).decision.status).toBe("allow");
    expect(gate(catalogue, actor(), "update", input, present("farm_manager", { [methods.update]: false })).decision.status).toBe("deny");
    expect(get).not.toHaveBeenCalled();
  });
  for (const field of ["id", "isActive", "name", "notes"]) it(`rejects update accessor ${field} without getter execution, including Admin`, () => {
    const getter = vi.fn(() => field === "isActive" ? false : field === "id" ? 3 : "value");
    const input = Object.defineProperty({ id: 3, isActive: false }, field, { enumerable: true, get: getter });
    expectDenied(gate(catalogue, actor("admin"), "update", input, absent("admin")));
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects inherited lifecycle state, symbols and nonenumerable own lifecycle state", () => {
    for (const input of [
      Object.assign(Object.create({ isActive: false }), { id: 3 }),
      Object.assign({ id: 3, isActive: false }, { [Symbol("outside")]: true }),
      Object.defineProperty({ id: 3 }, "isActive", { value: false }),
    ]) expectDenied(gate(catalogue, actor(), "update", input, absent()));
  });
  it("accepts null-prototype bounded data records", () => {
    const input = Object.assign(Object.create(null), { id: 3, isActive: false });
    expectDenied(gate(catalogue, actor(), "update", input, present("farm_manager", { [methods.delete]: false })));
  });
  it("uses a false descriptor despite a conflicting true Proxy direct get", () => {
    const get = vi.fn(() => true);
    const input = new Proxy({ id: 3, isActive: false }, { get });
    expectDenied(gate(catalogue, actor(), "update", input, present("farm_manager", { [methods.delete]: false })));
    expect(get).not.toHaveBeenCalled();
  });
  it("does not infer false from a Proxy get when the descriptor is absent or true", () => {
    const get = vi.fn(() => false);
    for (const input of [new Proxy({ id: 3 }, { get }), new Proxy({ id: 3, isActive: true }, { get })]) {
      expect(gate(catalogue, actor(), "update", input, present("farm_manager", { [methods.delete]: false })).decision.status).toBe("allow");
    }
    expect(get).not.toHaveBeenCalled();
  });
  it("snapshots each update descriptor once even when later descriptor values would disagree", () => {
    const counts = new Map<string | symbol, number>();
    const get = vi.fn(() => { throw new Error("raw input payload must not escape"); });
    const input = new Proxy({ id: 3, isActive: false }, {
      get,
      getOwnPropertyDescriptor(target, key) {
        const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
        const d = Reflect.getOwnPropertyDescriptor(target, key)!;
        return key === "isActive" ? { ...d, value: count === 1 ? false : true } : d;
      },
    });
    expectDenied(gate(catalogue, actor(), "update", input, present("farm_manager", { [methods.delete]: false })));
    expect(Array.from(counts.values())).toEqual([1, 1]);
    expect(get).not.toHaveBeenCalled();
  });
  it("rejects a missing listed descriptor rather than treating it as missing isActive", () => {
    const input = new Proxy({ id: 3 }, {
      ownKeys: () => ["id", "isActive"],
      getOwnPropertyDescriptor(target, key) { return key === "isActive" ? undefined : Reflect.getOwnPropertyDescriptor(target, key); },
    });
    expectDenied(gate(catalogue, actor(), "update", input, absent()));
  });
  for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"] as const) {
    it(`throwing update Proxy ${trap} returns fixed denial without raw payload`, () => {
      const hostile = new Proxy({ id: 3, isActive: false }, { [trap]: () => { throw new Error("secret raw payload"); } });
      const result = gate(catalogue, actor("admin"), "update", hostile, absent("admin"));
      expectDenied(result);
      expect(result.decision.reason).toBe("INVALID_RUNTIME_INPUT");
      expect(JSON.stringify(result)).not.toContain("secret");
    });
  }
  it("does not broaden into validating or reading other methods' transport inputs", () => {
    const get = vi.fn(() => { throw new Error("out-of-scope transport input"); });
    const input = new Proxy({}, { get, ownKeys: get });
    for (const method of ["list", "getById", "create", "delete"]) {
      expect(gate(catalogue, actor(), method, input, absent())).toEqual(original(catalogue, actor(), method, absent()));
    }
    expect(get).not.toHaveBeenCalled();
  });
});

describe("One actor/read snapshot; protected Admin and fixed failure", () => {
  for (const principal of [undefined, null, {}, [], actor("unknown"), actor("Admin"),
    { ...actor(), authenticated: false }, { ...actor(), active: false },
    { ...actor(), active: "true" }, { ...actor(), role: 1 }, { ...actor(), extra: true },
    { ...actor("admin"), authenticated: false }, { ...actor("admin"), active: false }]) {
    it(`denies invalid/inactive/unauthenticated principal ${JSON.stringify(principal)}`, () => {
      expectDenied(gate(catalogue, asPrincipal(principal), "update", { id: 3, isActive: false }, absent()));
    });
  }
  for (const field of ["role", "authenticated", "active"]) it(`principal ${field} getter never executes`, () => {
    const getter = vi.fn(() => field === "role" ? "admin" : true);
    const principal = Object.defineProperty(actor(), field, { enumerable: true, get: getter });
    expectDenied(gate(catalogue, principal, "update", { id: 3, isActive: false }, absent()));
    expect(getter).not.toHaveBeenCalled();
  });
  it("farm-manager descriptors cannot become Admin through principal direct reads", () => {
    const get = vi.fn(() => "admin");
    const principal = new Proxy(actor(), { get });
    expectDenied(gate(catalogue, principal, "update", { id: 3, isActive: false }, present("farm_manager", { [methods.delete]: false })));
    expect(get).not.toHaveBeenCalled();
  });
  it("Admin descriptors remain protected despite conflicting direct reads and entirely hostile policy state", () => {
    const get = vi.fn(() => "farm_manager");
    const reflect = vi.fn(() => { throw new Error("Admin must never reflect policy state"); });
    const principal = new Proxy(actor("admin"), { get });
    const read = new Proxy({}, { get: reflect, ownKeys: reflect, getPrototypeOf: reflect, getOwnPropertyDescriptor: reflect });
    for (const variant of variants) {
      const result = gate(catalogue, principal, variant.method, variant.input, read);
      expect(result.decision.status).toBe("allow");
      expect(result.observedVersion).toBeNull();
    }
    expect(get).not.toHaveBeenCalled(); expect(reflect).not.toHaveBeenCalled();
    expectDenied(gate(catalogue, principal, "update", { id: 3, isActive: "false" }, read));
    expect(reflect).not.toHaveBeenCalled();
  });
  for (const read of [undefined, null, {}, [], { state: "unavailable" }, { state: "fallback" }, { state: "verified_absent" },
    { ...absent(), scope: "other" }, { ...absent(), role: "accountant" }, { ...absent(), catalogueRevision: "old" },
    { state: "verified_present" }, present("accountant"), present("farm_manager", {}, 0),
    present("farm_manager", {}, -1), present("farm_manager", {}, 1.5), present("farm_manager", {}, 2147483648),
    present("farm_manager", {}, "9"), present("farm_manager", {}, Infinity),
    { state: "verified_present", snapshot: { ...present().snapshot, scope: "other" } },
    { state: "verified_present", snapshot: { ...present().snapshot, catalogueRevision: "stale" } },
    { state: "verified_present", snapshot: { ...present().snapshot, extra: true } },
    { ...present(), extra: true }, present("farm_manager", { [methods.update]: "true" } as unknown as Record<string, boolean>)]) {
    it(`denies unavailable or invalid read ${JSON.stringify(read)}`, () => {
      expectDenied(gate(catalogue, actor(), "update", { id: 3, isActive: false }, read));
    });
  }
  for (const level of ["state", "snapshot", "version", "grants", "delete grant"] as const) {
    it(`${level} read accessor is rejected with zero getter calls`, () => {
      const read = present();
      const getter = vi.fn(() => level === "delete grant" ? false : "payload");
      const target = level === "state" || level === "snapshot" ? read : level === "delete grant" ? read.snapshot.grants : read.snapshot;
      Object.defineProperty(target, level === "delete grant" ? methods.delete : level, { enumerable: true, configurable: true, get: getter });
      expectDenied(gate(catalogue, actor(), "update", { id: 3, isActive: false }, read));
      expect(getter).not.toHaveBeenCalled();
    });
  }
  it("shares a single descriptor-derived actor, read, nested snapshot and grants across both exact evaluations", () => {
    const counts = new Map<string, number>();
    const get = vi.fn(() => { throw new Error("do not directly read injected records"); });
    function wrapped<T extends object>(target: T, label: string): T {
      return new Proxy(target, {
        get,
        getOwnPropertyDescriptor(object, key) {
          const countKey = `${label}/${String(key)}`;
          const count = (counts.get(countKey) ?? 0) + 1; counts.set(countKey, count);
          const descriptor = Reflect.getOwnPropertyDescriptor(object, key)!;
          if (label === "grants" && key === methods.delete) return { ...descriptor, value: count === 1 ? false : true };
          if (label === "snapshot" && key === "version") return { ...descriptor, value: count === 1 ? 77 : 78 };
          if (label === "principal" && key === "role") return { ...descriptor, value: count === 1 ? "farm_manager" : "admin" };
          return descriptor;
        },
      });
    }
    const grants = wrapped({ [methods.update]: true, [methods.delete]: false }, "grants");
    const snapshot = wrapped({ ...present().snapshot, grants, version: 77 }, "snapshot");
    const read = wrapped({ state: "verified_present", snapshot }, "read");
    const principal = wrapped(actor(), "principal");
    const result = gate(catalogue, principal, "update", { id: 3, isActive: false }, read);
    expect(result.decision).toMatchObject({ capabilityKey: methods.delete, status: "deny", reason: "POLICY_DENY" });
    expect(result.observedVersion).toBe(77);
    expect(Array.from(counts.values()).every(count => count === 1)).toBe(true);
    expect(counts.size).toBe(12);
    expect(get).not.toHaveBeenCalled();
  });
  for (const target of ["principal", "read", "snapshot", "grants"] as const) it(`throwing ${target} Proxy fails closed without exception/payload`, () => {
    const throwing = new Proxy({}, { getPrototypeOf() { throw new Error("sensitive raw payload"); } });
    const read = target === "read" ? throwing : target === "snapshot" ? { state: "verified_present", snapshot: throwing }
      : target === "grants" ? { state: "verified_present", snapshot: { ...present().snapshot, grants: throwing } } : present();
    const result = gate(catalogue, target === "principal" ? asPrincipal(throwing) : actor(), "update", { id: 3, isActive: false }, read);
    expectDenied(result); expect(result.decision.reason).toBe("INVALID_RUNTIME_INPUT");
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
  it("rejects foreign module grants and Export/sensitive keys without expanding the five-key pilot", () => {
    const foreign = full.capabilities.find(c => c.module !== "Suppliers" && c.support === "implemented" && c.control === "editable_ordinary" && c.action !== "Delete")!.key;
    for (const key of [foreign, "suppliers.records.export.unmapped", "suppliers.records.sensitive.unmapped"]) {
      expectDenied(gate(full, actor(), "update", { id: 3, isActive: false }, present("farm_manager", { [key]: true })));
    }
  });
  it("invalid source catalogue cannot be bypassed by protected Admin", () => {
    for (const invalid of [undefined, null, {}, { ...catalogue, revision: "" }]) {
      expectDenied(gate(invalid, actor("admin"), "update", { id: 3, isActive: false }, absent("admin")));
    }
  });
  it("single-descriptor snapshot is bounded, not atomic or a database locking proof", () => {
    const reflect = vi.fn((target: object) => Reflect.ownKeys(target));
    const input = new Proxy({ id: 3, isActive: false }, { ownKeys: reflect });
    expect(gate(catalogue, actor(), "update", input, absent()).observedVersion).toBe(0);
    expect(reflect).toHaveBeenCalledOnce(); // Proxy reflection traps can inherently have effects.
  });
});
