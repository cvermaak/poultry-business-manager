import { describe, expect, it, vi } from "vitest";
import { createSupplierPermissionAdapter, supplierPermissionAdapterErrorCode } from "./supplier-permission-adapter";
import type { SupplierPermissionAdapterActor } from "./supplier-permission-adapter";
import { SupplierPermissionPolicyModel, SUPPLIER_PERMISSION_KEYS as keys, SUPPLIER_POLICY_ROLES as roles } from "../shared/supplier-permission-policy-model";
import type { SupplierPolicyRole } from "../shared/supplier-permission-policy-model";
import { PREPARED_PERMISSION_CATALOGUE as catalogue } from "../shared/role-permission-catalogue.generated";
import { evaluatePermission } from "../shared/role-permission-engine";

const admin = { actorId: 91 };
const worker = { actorId: 92 };
const methods = ["list", "getById", "create", "update", "delete"] as const;
const inputs = { list: undefined, getById: { id: 4 }, create: { name: "Synthetic only" }, update: { id: 4, name: "Synthetic edit" }, delete: { id: 4 } };
function setup() {
  const actors = new Map<number, SupplierPermissionAdapterActor>([
    [91, { id: 91, role: "admin", isActive: 1 }],
    [92, { id: 92, role: "production_worker", isActive: 1 }],
  ]);
  const model = new SupplierPermissionPolicyModel({ catalogue, clock: () => 123 });
  const resolveActor = vi.fn(async (id: number): Promise<unknown> => actors.get(id));
  const repository = {
    readPolicy: vi.fn(async (role: SupplierPolicyRole): Promise<unknown> => ({ ok: true, policy: model.getPolicy(role) })),
    save: vi.fn(async (id: number, input: unknown): Promise<unknown> => {
      // Fresh synthetic lookup in this fake. NO claim of a transaction/DB lock.
      const actor = actors.get(id);
      return model.save({ actorId: id, authenticated: !!actor, active: actor?.isActive === 1, role: actor?.role ?? "invalid" }, input);
    }),
  };
  const result = { synthetic: true, untouched: ["ordinary helper outcome"] };
  const business = {
    listSuppliers: vi.fn(async (_input?: unknown) => result),
    getSupplierById: vi.fn(async (_id: number) => result),
    createSupplier: vi.fn(async (_input: unknown) => result),
    updateSupplier: vi.fn(async (_id: number, _data: unknown) => result),
    deleteSupplier: vi.fn(async (_id: number) => result),
  };
  const adapter = createSupplierPermissionAdapter({ catalogue, resolveActor, repository, business });
  const helpers = [business.listSuppliers, business.getSupplierById, business.createSupplier, business.updateSupplier, business.deleteSupplier];
  return { actors, model, resolveActor, repository, business, result, adapter, helpers };
}
function draft(grants: Record<string, boolean> = {}, expectedVersion = 0, role: SupplierPolicyRole = "production_worker") {
  return { role, expectedVersion, catalogueRevision: catalogue.revision, grants, reason: " Synthetic decision " };
}
async function expectDenied(operation: Promise<unknown>, code: string) {
  const caught = await operation.then(() => undefined, error => error);
  expect(supplierPermissionAdapterErrorCode(caught)).toBe(code);
}
function assertNoHelpers(h: ReturnType<typeof setup>) { h.helpers.forEach(helper => expect(helper).not.toHaveBeenCalled()); }

describe("Isolated supplier adapter — direct mocks/reference model, NO database", () => {
  for (const role of ["admin", ...roles] as const) for (const method of methods) {
    it(`preserves original baseline ${role}/${method}`, async () => {
      const h = setup(); h.actors.set(92, { id: 92, role, isActive: 1 });
      const output = await h.adapter.suppliers[method](worker, inputs[method]);
      expect(output).toBe(h.result);
      expect(h.helpers[methods.indexOf(method)]).toHaveBeenCalledOnce();
      expect(h.repository.readPolicy).toHaveBeenCalledTimes(role === "admin" ? 0 : 1);
      expect(h.resolveActor).toHaveBeenCalledTimes(2);
    });
  }
  for (const [name, value] of [
    ["null ID", { actorId: null }], ["zero", { actorId: 0 }], ["negative", { actorId: -1 }],
    ["fraction", { actorId: 1.25 }], ["string", { actorId: "91" }], ["missing", {}],
    ["client role override", { actorId: 91, role: "admin" }], ["nested user override", { user: { id: 91 } }],
  ] as const) {
    it(`rejects context ${name} before resolution/helpers`, async () => {
      const h = setup();
      expect(await h.adapter.supplierPermissions.load(value as never, "admin")).toEqual({ ok: false, code: "UNAUTHENTICATED" });
      await expectDenied(h.adapter.suppliers.list(value as never), "UNAUTHENTICATED");
      expect(h.resolveActor).not.toHaveBeenCalled(); assertNoHelpers(h);
    });
  }
  for (const [name, value, code] of [
    ["missing actor", undefined, "UNAUTHENTICATED"], ["ID mismatch", { id: 999, role: "admin", isActive: 1 }, "UNAUTHENTICATED"],
    ["boolean activity", { id: 91, role: "admin", isActive: true }, "UNAUTHENTICATED"],
    ["string activity", { id: 91, role: "admin", isActive: "1" }, "UNAUTHENTICATED"],
    ["inactive Admin", { id: 91, role: "admin", isActive: 0 }, "INACTIVE_ACTOR"],
    ["unknown role", { id: 91, role: "superadmin", isActive: 1 }, "UNAUTHENTICATED"],
    ["extra field", { id: 91, role: "admin", isActive: 1, authenticated: true }, "UNAUTHENTICATED"],
  ] as const) {
    it(`rejects ${name} in editor and business`, async () => {
      const h = setup(); h.resolveActor.mockResolvedValue(value);
      expect(await h.adapter.supplierPermissions.load(admin, "accountant")).toEqual({ ok: false, code });
      expect(await h.adapter.supplierPermissions.save(admin, draft())).toEqual({ ok: false, code });
      await expectDenied(h.adapter.suppliers.list(admin), code);
      expect(h.repository.save).not.toHaveBeenCalled(); expect(h.repository.readPolicy).not.toHaveBeenCalled(); assertNoHelpers(h);
    });
  }
  it("does not inspect exception code/message/getters during resolver, read, or save failures", async () => {
    const h = setup(); const get = vi.fn(() => { throw Error("LEAK"); });
    const poison = new Proxy({}, { get, getOwnPropertyDescriptor: get });
    h.resolveActor.mockRejectedValueOnce(poison);
    expect(await h.adapter.supplierPermissions.load(admin, "accountant")).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    h.repository.readPolicy.mockRejectedValueOnce(poison);
    expect(await h.adapter.supplierPermissions.load(admin, "accountant")).toEqual({ ok: false, code: "POLICY_UNAVAILABLE" });
    h.repository.save.mockRejectedValueOnce(poison);
    expect(await h.adapter.supplierPermissions.save(admin, draft())).toEqual({ ok: false, code: "SAVE_FAILED" });
    expect(get).not.toHaveBeenCalled(); expect(supplierPermissionAdapterErrorCode(poison)).toBeUndefined();
  });
  it("snapshots context and actor descriptors exactly once without Proxy get access", async () => {
    // Promise assimilation necessarily probes then in the external async resolver;
    // no actor field may be read through get. This is not a Proxy-sandbox claim.
    const h = setup(); const get = vi.fn((_target: object, key: string | symbol) => {
      if (key === "then") return undefined;
      throw Error("actor/context property get prohibited");
    });
    const contextDescriptors = vi.fn((target: object, key: string | symbol) => Reflect.getOwnPropertyDescriptor(target, key));
    const actorDescriptors = vi.fn((target: object, key: string | symbol) => Reflect.getOwnPropertyDescriptor(target, key));
    const context = new Proxy<{ actorId: number }>({ actorId: 91 }, { get, getOwnPropertyDescriptor: contextDescriptors });
    h.resolveActor.mockResolvedValue(new Proxy({ id: 91, role: "admin", isActive: 1 }, { get, getOwnPropertyDescriptor: actorDescriptors }));
    expect((await h.adapter.supplierPermissions.load(context, "admin")).ok).toBe(true);
    expect(get.mock.calls.every(call => call[1] === "then")).toBe(true); expect(contextDescriptors).toHaveBeenCalledTimes(1);
    expect(actorDescriptors).toHaveBeenCalledTimes(6); // three fields for each of two independent fresh lookups
  });
  it("fails closed on accessor context/actor without invoking the accessor", async () => {
    const h = setup(); const getter = vi.fn(() => 91);
    const context = Object.defineProperty({}, "actorId", { enumerable: true, get: getter });
    expect(await h.adapter.supplierPermissions.load(context as never, "admin")).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    h.resolveActor.mockResolvedValue(Object.defineProperty({ id: 91, isActive: 1 }, "role", { enumerable: true, get: getter }));
    await expectDenied(h.adapter.suppliers.list(admin), "UNAUTHENTICATED"); expect(getter).not.toHaveBeenCalled();
  });
  for (const role of roles) {
    it(`only active Admin may edit/load ${role}; client targets do not elevate the actor`, async () => {
      const h = setup();
      expect(await h.adapter.supplierPermissions.load(worker, role)).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
      expect(await h.adapter.supplierPermissions.save(worker, draft({}, 0, role))).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
      expect(h.repository.readPolicy).not.toHaveBeenCalled(); expect(h.repository.save).not.toHaveBeenCalled();
    });
  }
  it("Admin's editor snapshot is protected v0/empty and business never reads editable policy", async () => {
    const h = setup(); h.repository.readPolicy.mockRejectedValue(Error("must not read"));
    const loaded = await h.adapter.supplierPermissions.load(admin, "admin");
    expect(loaded).toMatchObject({ ok: true, snapshot: { role: "admin", protectedAdmin: true, version: 0, grants: {} } });
    if (loaded.ok) expect(Object.values(loaded.snapshot.effective)).toEqual([true, true, true, true, true]);
    expect(await h.adapter.supplierPermissions.save(admin, { ...draft(), role: "admin" })).toEqual({ ok: false, code: "ADMIN_PROTECTED" });
    await h.adapter.suppliers.update(admin, { id: 4, isActive: false });
    expect(h.repository.readPolicy).not.toHaveBeenCalled(); expect(h.repository.save).not.toHaveBeenCalled();
  });
  it("fresh active Admin check after awaited editor read withholds a snapshot after deactivation", async () => {
    const h = setup(); h.repository.readPolicy.mockImplementation(async role => {
      h.actors.set(91, { id: 91, role: "admin", isActive: 0 }); return { ok: true, policy: h.model.getPolicy(role) };
    });
    expect(await h.adapter.supplierPermissions.load(admin, "accountant")).toEqual({ ok: false, code: "INACTIVE_ACTOR" });
  });
  it("fresh role check after read rejects demotion and business role changes", async () => {
    const h = setup(); h.repository.readPolicy.mockImplementation(async role => {
      h.actors.set(91, { id: 91, role: "accountant", isActive: 1 });
      h.actors.set(92, { id: 92, role: "sales_staff", isActive: 1 });
      return { ok: true, policy: h.model.getPolicy(role) };
    });
    expect(await h.adapter.supplierPermissions.load(admin, "accountant")).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    h.actors.set(92, { id: 92, role: "production_worker", isActive: 1 });
    await expectDenied(h.adapter.suppliers.list(worker), "PERMISSION_DENIED"); assertNoHelpers(h);
  });
  it("repository fake re-resolves Admin independently after the adapter passes only actor ID", async () => {
    const h = setup(); h.repository.save.mockImplementation(async (id, input) => {
      h.actors.set(91, { id: 91, role: "admin", isActive: 0 });
      const current = h.actors.get(id)!;
      return h.model.save({ actorId: id, authenticated: true, active: current.isActive === 1, role: current.role }, input);
    });
    expect(await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }))).toEqual({ ok: false, code: "INACTIVE_ACTOR" });
    expect(h.repository.save.mock.calls[0][0]).toBe(91); expect(h.model.getAudit()).toHaveLength(0);
  });
  for (const label of ["missing-row wrapper", "bootstrap-row wrapper"]) {
    it(`v0 ${label} requires successful strict read before inherited baseline`, async () => {
      const h = setup(); h.repository.readPolicy.mockResolvedValue({ ok: true, policy: { scope: "supplier_management", version: 0,
        policy: { role: "production_worker", catalogueRevision: catalogue.revision, grants: {} } } });
      await h.adapter.suppliers.list(worker);
      const loaded = await h.adapter.supplierPermissions.load(admin, "production_worker");
      expect(loaded).toMatchObject({ ok: true, snapshot: { version: 0, grants: {} } });
      expect(h.repository.readPolicy).toHaveBeenCalledTimes(2);
    });
  }
  const validWrapper = { scope: "supplier_management", version: 0, policy: { role: "production_worker", catalogueRevision: catalogue.revision, grants: {} } };
  for (const [label, bad] of [
    ["no verified result", undefined], ["failed read", { ok: false, error: { code: "DB_FAILURE" } }],
    ["missing wrapper", { ok: true, policy: null }], ["extra read field", { ok: true, policy: validWrapper, cached: true }],
    ["wrong scope", { ok: true, policy: { ...validWrapper, scope: "accounting" } }],
    ["extra wrapper field", { ok: true, policy: { ...validWrapper, actorId: 91 } }],
    ["negative version", { ok: true, policy: { ...validWrapper, version: -1 } }],
    ["overflow version", { ok: true, policy: { ...validWrapper, version: 2147483648 } }],
    ["fractional version", { ok: true, policy: { ...validWrapper, version: 0.1 } }],
    ["wrong role", { ok: true, policy: { ...validWrapper, policy: { ...validWrapper.policy, role: "accountant" } } }],
    ["stale catalogue", { ok: true, policy: { ...validWrapper, policy: { ...validWrapper.policy, catalogueRevision: "stale" } } }],
    ["extra policy field", { ok: true, policy: { ...validWrapper, policy: { ...validWrapper.policy, isActive: 1 } } }],
    ["v0 nonempty deny", { ok: true, policy: { ...validWrapper, policy: { ...validWrapper.policy, grants: { [keys[0]]: false } } } }],
    ["v0 nonempty allow", { ok: true, policy: { ...validWrapper, policy: { ...validWrapper.policy, grants: { [keys[0]]: true } } } }],
    ["outside pilot grant", { ok: true, policy: { ...validWrapper, version: 1, policy: { ...validWrapper.policy, grants: { "suppliers.records.export.export": true } } } }],
    ["nonboolean grant", { ok: true, policy: { ...validWrapper, version: 1, policy: { ...validWrapper.policy, grants: { [keys[0]]: 1 } } } }],
  ] as const) {
    it(`corrupt/unverified read ${label} denies, NEVER inherited allow`, async () => {
      const h = setup(); h.repository.readPolicy.mockResolvedValue(bad);
      await expectDenied(h.adapter.suppliers.list(worker), "POLICY_UNAVAILABLE");
      expect(await h.adapter.supplierPermissions.load(admin, "production_worker")).toEqual({ ok: false, code: "POLICY_UNAVAILABLE" }); assertNoHelpers(h);
    });
  }
  it("policy/result getters never run and throwing reflection traps fail closed", async () => {
    const h = setup(); const getter = vi.fn(() => validWrapper);
    h.repository.readPolicy.mockResolvedValue(Object.defineProperty({ ok: true }, "policy", { enumerable: true, get: getter }));
    await expectDenied(h.adapter.suppliers.list(worker), "POLICY_UNAVAILABLE");
    h.repository.readPolicy.mockResolvedValue({ ok: true, policy: new Proxy(validWrapper, { ownKeys() { throw Error("poison"); } }) });
    await expectDenied(h.adapter.suppliers.list(worker), "POLICY_UNAVAILABLE"); expect(getter).not.toHaveBeenCalled(); assertNoHelpers(h);
  });
  it("every request rereads current policy; cached/token-shaped unknown input grants cannot override", async () => {
    const h = setup(); await h.adapter.suppliers.list(worker);
    expect((await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }))).ok).toBe(true);
    await expectDenied(h.adapter.suppliers.list(worker, { role: "admin", policy: {}, token: "synthetic only" }), "PERMISSION_DENIED");
    expect(h.business.listSuppliers).toHaveBeenCalledOnce(); expect(h.repository.readPolicy).toHaveBeenCalledTimes(2);
  });
  it("snapshot defaults/effective are exact five keys from evaluator and reflect sparse overrides", async () => {
    const h = setup(); const saved = await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false, [keys[3]]: true }));
    expect(saved).toMatchObject({ ok: true, changed: true, snapshot: { version: 1, protectedAdmin: false } });
    if (!saved.ok) throw Error("test expected save");
    expect(Object.keys(saved.snapshot.defaults).sort()).toEqual(Array.from(keys).sort());
    expect(Object.keys(saved.snapshot.effective).sort()).toEqual(Array.from(keys).sort());
    for (const key of keys) {
      expect(saved.snapshot.defaults[key]).toBe(evaluatePermission(catalogue, { authenticated: true, active: true, role: "production_worker" }, key).roleGatePassed);
      expect(saved.snapshot.effective[key]).toBe(evaluatePermission(catalogue, { authenticated: true, active: true, role: "production_worker" }, key, h.model.getPolicy("production_worker").policy).roleGatePassed);
    }
    expect(saved.snapshot.grants).toEqual({ [keys[0]]: false, [keys[3]]: true });
    expect(Object.isFrozen(saved.snapshot)).toBe(true); expect(Object.isFrozen(saved.snapshot.grants)).toBe(true);
  });
  for (const [name, bad, code] of [
    ["extra actor spoof", { ...draft(), actorId: 91 }, "INVALID_INPUT"],
    ["extra role spoof", { ...draft(), actorRole: "admin" }, "INVALID_INPUT"],
    ["Admin target", { ...draft(), role: "admin" }, "ADMIN_PROTECTED"],
    ["unknown target", { ...draft(), role: "user" }, "INVALID_INPUT"],
    ["string version", { ...draft(), expectedVersion: "0" }, "INVALID_INPUT"],
    ["stale catalogue", { ...draft(), catalogueRevision: "stale" }, "CATALOGUE_MISMATCH"],
    ["blank reason", { ...draft(), reason: " " }, "INVALID_INPUT"],
    ["control reason", { ...draft(), reason: "bad\nreason" }, "INVALID_INPUT"],
    ["six grants", draft(Object.fromEntries([...keys.map(key => [key, true]), ["sixth", true]])), "INVALID_INPUT"],
    ["sensitive grant", draft({ "accounting.accounts.create.createaccount": true }), "INVALID_INPUT"],
    ["Export grant", draft({ "suppliers.records.export.export": true }), "INVALID_INPUT"],
    ["nonboolean grant", { ...draft(), grants: { [keys[0]]: "true" } }, "INVALID_INPUT"],
  ] as const) {
    it(`save preflight rejects ${name} before repository`, async () => {
      const h = setup(); expect(await h.adapter.supplierPermissions.save(admin, bad)).toEqual({ ok: false, code });
      expect(h.repository.save).not.toHaveBeenCalled(); expect(h.model.getAudit()).toHaveLength(0);
    });
  }
  it("request fields and nested grants are captured before first await without invoking accessors", async () => {
    const h = setup(); const input = draft({ [keys[0]]: false });
    h.resolveActor.mockImplementation(async id => { input.grants[keys[0]] = true; input.role = "accountant"; return h.actors.get(id); });
    const saved = await h.adapter.supplierPermissions.save(admin, input);
    expect(saved).toMatchObject({ ok: true, snapshot: { role: "production_worker", grants: { [keys[0]]: false } } });
    const getter = vi.fn(() => input.grants);
    const accessor = Object.defineProperty({ ...draft() }, "grants", { enumerable: true, get: getter });
    expect(await h.adapter.supplierPermissions.save(admin, accessor)).toEqual({ ok: false, code: "INVALID_INPUT" }); expect(getter).not.toHaveBeenCalled();
  });
  it("no-op save and concurrent stale saves use model version semantics, not mock DB claims", async () => {
    const h = setup(); expect(await h.adapter.supplierPermissions.save(admin, draft())).toMatchObject({ ok: true, changed: false, snapshot: { version: 0 } });
    const results = await Promise.all([
      h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false })),
      h.adapter.supplierPermissions.save(admin, draft({ [keys[3]]: false })),
    ]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toEqual([{ ok: false, code: "STALE_VERSION" }]); expect(h.model.getAudit()).toHaveLength(1);
    expect(h.model.getAudit()[0].actorId).toBe(91);
  });
  it("success returns committed operation wrapper, not later current policy; performs no second read", async () => {
    const h = setup(); h.repository.save.mockImplementation(async (id, input) => {
      const principal = { actorId: id, authenticated: true, active: true, role: "admin" };
      const committed = await h.model.save(principal, input);
      await h.model.save(principal, draft({ [keys[4]]: false }, 1)); return committed;
    });
    const saved = await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }));
    expect(saved).toMatchObject({ ok: true, snapshot: { version: 1, grants: { [keys[0]]: false } } });
    expect(h.model.getPolicy("production_worker").version).toBe(2); expect(h.repository.readPolicy).not.toHaveBeenCalled();
  });
  for (const [label, corrupt] of [
    ["wrong role", { role: "accountant" }], ["wrong revision", { catalogueRevision: "stale" }],
    ["wrong grants", { grants: { [keys[1]]: false } }],
  ] as const) {
    it(`rejects save success with ${label}`, async () => {
      const h = setup(); h.repository.save.mockResolvedValue({ ok: true, changed: true, reason: "Synthetic decision", policy: {
        scope: "supplier_management", version: 1, policy: Object.assign({ role: "production_worker", catalogueRevision: catalogue.revision, grants: { [keys[0]]: false } }, corrupt),
      } });
      expect(await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }))).toEqual({ ok: false, code: "SAVE_FAILED" });
    });
  }
  for (const [changed, version] of [[true, 0], [true, 2], [false, 1]] as const) {
    it(`rejects inconsistent changed=${changed}/version=${version}`, async () => {
      const h = setup(); h.repository.save.mockResolvedValue({ ok: true, changed, reason: "Synthetic decision", policy: {
        scope: "supplier_management", version, policy: { role: "production_worker", catalogueRevision: catalogue.revision, grants: { [keys[0]]: false } },
      } });
      expect(await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }))).toEqual({ ok: false, code: "SAVE_FAILED" });
    });
  }
  for (const [repoCode, code] of [
    ["STALE_VERSION", "STALE_VERSION"], ["CATALOGUE_MISMATCH", "CATALOGUE_MISMATCH"], ["COMMIT_OUTCOME_UNKNOWN", "COMMIT_OUTCOME_UNKNOWN"],
    ["DB_FAILURE", "SAVE_FAILED"], ["CORRUPT_POLICY", "SAVE_FAILED"], ["UNRECOGNIZED_PRIVATE_DRIVER_MESSAGE", "SAVE_FAILED"],
  ] as const) {
    it(`sanitizes repository ${repoCode}; never retries/read-reconciles automatically`, async () => {
      const h = setup(); h.repository.save.mockResolvedValue({ ok: false, error: { code: repoCode, recovery: "private must not escape" } });
      expect(await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }))).toEqual({ ok: false, code });
    expect(h.repository.save).toHaveBeenCalledOnce(); expect(h.repository.readPolicy).not.toHaveBeenCalled();
    });
  }
  it("unknown commit outcome can follow model publication; no retry or automatic replacement snapshot", async () => {
    const h = setup(); h.repository.save.mockImplementation(async (id, input) => {
      await h.model.save({ actorId: id, authenticated: true, active: true, role: "admin" }, input);
      return { ok: false, error: { code: "COMMIT_OUTCOME_UNKNOWN" } };
    });
    expect(await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false }))).toEqual({ ok: false, code: "COMMIT_OUTCOME_UNKNOWN" });
    expect(h.model.getPolicy("production_worker").version).toBe(1); expect(h.model.getAudit()).toHaveLength(1);
    expect(h.repository.save).toHaveBeenCalledOnce(); expect(h.repository.readPolicy).not.toHaveBeenCalled();
  });
  it("invalid trusted save result/getter/exception cannot forge public fixed codes", async () => {
    const h = setup(); const getter = vi.fn(() => "COMMIT_OUTCOME_UNKNOWN");
    h.repository.save.mockResolvedValue({ ok: false, error: Object.defineProperty({}, "code", { enumerable: true, get: getter }) });
    expect(await h.adapter.supplierPermissions.save(admin, draft())).toEqual({ ok: false, code: "SAVE_FAILED" });
    h.repository.save.mockRejectedValue({ code: "STALE_VERSION" });
    expect(await h.adapter.supplierPermissions.save(admin, draft())).toEqual({ ok: false, code: "SAVE_FAILED" }); expect(getter).not.toHaveBeenCalled();
  });
  for (const [edit, deletion, allowed] of [[true, true, true], [true, false, false], [false, true, false], [false, false, false]] as const) {
    it(`soft-deactivate double guard Edit=${edit} Delete=${deletion}`, async () => {
      const h = setup(); await h.adapter.supplierPermissions.save(admin, draft({ [keys[3]]: edit, [keys[4]]: deletion, [keys[0]]: false, [keys[1]]: false }));
      const operation = h.adapter.suppliers.update(worker, { id: 4, isActive: false });
      if (allowed) expect(await operation).toBe(h.result); else await expectDenied(operation, "PERMISSION_DENIED");
      expect(h.business.updateSupplier).toHaveBeenCalledTimes(allowed ? 1 : 0);
    });
  }
  for (const input of [{ id: 4 }, { id: 4, isActive: undefined }, { id: 4, isActive: true }]) {
    it(`ordinary update/reactivation without View/Delete prerequisite (${String(input.isActive)})`, async () => {
      const h = setup(); await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false, [keys[1]]: false, [keys[3]]: true, [keys[4]]: false }));
      expect(await h.adapter.suppliers.update(worker, input)).toBe(h.result);
      expect(h.business.updateSupplier.mock.calls[0][1]).toMatchObject({ email: undefined });
      if (Object.prototype.hasOwnProperty.call(input, "isActive")) expect(Object.prototype.hasOwnProperty.call(h.business.updateSupplier.mock.calls[0][1], "isActive")).toBe(true);
    });
  }
  it("Create/Edit without View allowed; explicit Delete uses only its original key", async () => {
    const h = setup(); await h.adapter.supplierPermissions.save(admin, draft({ [keys[0]]: false, [keys[1]]: false, [keys[2]]: true, [keys[3]]: false, [keys[4]]: true }));
    await h.adapter.suppliers.create(worker, inputs.create); await h.adapter.suppliers.delete(worker, inputs.delete);
    await expectDenied(h.adapter.suppliers.update(worker, inputs.update), "PERMISSION_DENIED");
    await expectDenied(h.adapter.suppliers.getById(worker, inputs.getById), "PERMISSION_DENIED");
  });
  for (const [method, bad] of [
    ["list", { isActive: "false" }], ["list", { category: null }], ["getById", { id: "4" }],
    ["create", { name: "" }], ["create", { name: "x", email: "invalid email" }], ["create", { name: "x", contactPerson: null }],
    ["update", { id: 4, email: "invalid email" }], ["update", { id: 4, isActive: null }], ["update", { id: 4, isActive: 0 }],
    ["update", { id: 4, preferredContactMethod: null }], ["delete", { id: "4" }],
  ] as const) {
    it(`invalid schema input ${method}/${JSON.stringify(bad)} rejected BEFORE actor/read/helper`, async () => {
      const h = setup(); await expectDenied(h.adapter.suppliers[method](worker, bad), "INVALID_INPUT");
      expect(h.resolveActor).not.toHaveBeenCalled(); expect(h.repository.readPolicy).not.toHaveBeenCalled(); assertNoHelpers(h);
    });
  }
  it("preserves exact unknown stripping, optional filters, non-positive/fractional business IDs and nullable/email transforms", async () => {
    const h = setup(); await h.adapter.suppliers.list(admin);
    expect(h.business.listSuppliers).toHaveBeenLastCalledWith(undefined);
    await h.adapter.suppliers.list(admin, { category: "", isActive: false, role: "admin", ignored: true });
    expect(h.business.listSuppliers).toHaveBeenLastCalledWith({ category: "", isActive: false });
    await h.adapter.suppliers.getById(admin, { id: -0.5, ignored: true }); expect(h.business.getSupplierById).toHaveBeenLastCalledWith(-0.5);
    await h.adapter.suppliers.create(admin, { name: " ", email: "", notes: "", isActive: false });
    expect(h.business.createSupplier).toHaveBeenLastCalledWith({ name: " ", email: undefined, notes: "" });
    await h.adapter.suppliers.update(admin, { id: 0, email: "", phone: null, contactPerson: null, preferredContactMethod: "both", extra: true });
    expect(h.business.updateSupplier).toHaveBeenLastCalledWith(0, { email: null, phone: null, contactPerson: null, preferredContactMethod: "both" });
    await h.adapter.suppliers.update(admin, { id: 4, email: null }); expect(h.business.updateSupplier).toHaveBeenLastCalledWith(4, { email: null });
    await h.adapter.suppliers.delete(admin, { id: -2.25, ignored: true }); expect(h.business.deleteSupplier).toHaveBeenLastCalledWith(-2.25);
  });
  for (const method of methods) {
    it(`policy read failure denies ${method} before any business helper`, async () => {
      const h = setup(); h.repository.readPolicy.mockRejectedValue(Error("synthetic unavailable policy"));
      await expectDenied(h.adapter.suppliers[method](worker, inputs[method]), "POLICY_UNAVAILABLE"); assertNoHelpers(h);
    });
    it(`activity revoked during policy read denies ${method} before any business helper`, async () => {
      const h = setup(); h.repository.readPolicy.mockImplementation(async role => {
        h.actors.set(92, { id: 92, role: "production_worker", isActive: 0 }); return { ok: true, policy: h.model.getPolicy(role) };
      });
      await expectDenied(h.adapter.suppliers[method](worker, inputs[method]), "INACTIVE_ACTOR"); assertNoHelpers(h);
    });
  }
  it("permission allow cannot bypass ordinary helper denial/error; result/errors remain opaque", async () => {
    const h = setup(); const helperError = new Error("ordinary business guard synthetic error");
    h.business.updateSupplier.mockRejectedValueOnce(helperError);
    await expect(h.adapter.suppliers.update(admin, { id: 4 })).rejects.toBe(helperError);
    h.business.deleteSupplier.mockResolvedValueOnce(false as never);
    expect(await h.adapter.suppliers.delete(admin, { id: 4 })).toBe(false);
    const get = vi.fn(() => { throw Error("opaque result access"); });
    // Promise resolution necessarily probes then; test opaque OTHER getters, not JS Promise mechanics.
    const object = Object.defineProperty({}, "secret", { enumerable: true, get });
    h.business.listSuppliers.mockReset().mockResolvedValue(object as never);
    expect(await h.adapter.suppliers.list(admin)).toBe(object); expect(get).not.toHaveBeenCalled();
  });
});
