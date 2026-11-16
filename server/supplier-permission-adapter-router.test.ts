import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createSupplierPermissionAdapterRouter } from "./supplier-permission-adapter-router";
import type { SupplierPermissionAdapterRouter } from "./supplier-permission-adapter-router";
import type { SupplierPermissionAdapterActor } from "./supplier-permission-adapter";
import type { SupplierEditorClient } from "../shared/supplier-permission-editor-contract";
import { SupplierPermissionPolicyModel, SUPPLIER_POLICY_ROLES as roles, SUPPLIER_PERMISSION_KEYS as keys } from "../shared/supplier-permission-policy-model";
import type { SupplierPolicyRole } from "../shared/supplier-permission-policy-model";
import { PREPARED_PERMISSION_CATALOGUE as catalogue } from "../shared/role-permission-catalogue.generated";
const methods = ["list", "getById", "create", "update", "delete"] as const;
const inputs = { list: undefined, getById: { id: 2 }, create: { name: "Synthetic caller supplier" }, update: { id: 2, name: "Synthetic caller update" }, delete: { id: 2 } };
function setup() {
  const actors = new Map<number, SupplierPermissionAdapterActor>([
    [71, { id: 71, role: "admin", isActive: 1 }], [72, { id: 72, role: "sales_staff", isActive: 1 }],
  ]);
  const model = new SupplierPermissionPolicyModel({ catalogue, clock: () => 123 });
  const resolveActor = vi.fn(async (id: number): Promise<unknown> => actors.get(id));
  const repository = {
    readPolicy: vi.fn(async (role: SupplierPolicyRole): Promise<unknown> => ({ ok: true, policy: model.getPolicy(role) })),
    save: vi.fn(async (id: number, input: unknown): Promise<unknown> => {
      const actor = actors.get(id);
      return model.save({ actorId: id, authenticated: !!actor, active: actor?.isActive === 1, role: actor?.role ?? "invalid" }, input);
    }),
  };
  const result = { synthetic: "no real supplier", id: 2 };
  const business = {
    listSuppliers: vi.fn(async (_input?: unknown) => result), getSupplierById: vi.fn(async (_id: number) => result),
    createSupplier: vi.fn(async (_input: unknown) => result), updateSupplier: vi.fn(async (_id: number, _data: unknown) => result),
    deleteSupplier: vi.fn(async (_id: number) => result),
  };
  const router = createSupplierPermissionAdapterRouter({ catalogue, resolveActor, repository, business });
  const admin = router.createCaller({ actorId: 71 }); const staff = router.createCaller({ actorId: 72 });
  // Static proof that the real createCaller editor binding satisfies the completed shared UI protocol.
  const editor: SupplierEditorClient = admin.supplierPermissions;
  return { actors, model, resolveActor, repository, business, result, router, admin, staff, editor,
    helpers: [business.listSuppliers, business.getSupplierById, business.createSupplier, business.updateSupplier, business.deleteSupplier] };
}
function draft(grants: Record<string, boolean> = {}, expectedVersion = 0) {
  return { role: "sales_staff" as const, expectedVersion, catalogueRevision: catalogue.revision, grants, reason: "Synthetic caller decision" };
}
function invoke(caller: ReturnType<SupplierPermissionAdapterRouter["createCaller"]>, method: typeof methods[number], input: unknown): Promise<unknown> {
  return caller.suppliers[method](input);
}
function noHelpers(h: ReturnType<typeof setup>) { h.helpers.forEach(helper => expect(helper).not.toHaveBeenCalled()); }

describe("Unmounted supplier adapter router — ACTUAL tRPC createCaller, mocks only", () => {
  for (const role of ["admin", ...roles] as const) for (const method of methods) {
    it(`real caller baseline ${role}/${method}`, async () => {
      const h = setup(); h.actors.set(72, { id: 72, role, isActive: 1 });
      expect(await invoke(h.staff, method, inputs[method])).toBe(h.result);
      expect(h.helpers[methods.indexOf(method)]).toHaveBeenCalledOnce();
      expect(h.repository.readPolicy).toHaveBeenCalledTimes(role === "admin" ? 0 : 1);
    });
  }
  for (const method of methods) {
    it(`null server identity denies ${method}, regardless of request role/id hints`, async () => {
      const h = setup(); const caller = h.router.createCaller({ actorId: null });
      const input = method === "list" ? { role: "admin", actorId: 71 }
        : { ...inputs[method], role: "admin", actorId: 71 };
      await expect(invoke(caller, method, input)).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
      expect(h.resolveActor).not.toHaveBeenCalled(); noHelpers(h);
    });
    it(`inactive actor denies ${method}`, async () => {
      const h = setup(); h.actors.set(72, { id: 72, role: "sales_staff", isActive: 0 });
      await expect(invoke(h.staff, method, inputs[method])).rejects.toMatchObject({ code: "FORBIDDEN", message: "INACTIVE_ACTOR" }); noHelpers(h);
    });
    it(`fresh deny override blocks ${method} in actual caller`, async () => {
      const h = setup(); expect((await h.editor.save(draft({ [keys[methods.indexOf(method)]]: false }))).ok).toBe(true);
      await expect(invoke(h.staff, method, inputs[method])).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" }); noHelpers(h);
    });
  }
  it("typed editor load/save snapshots and protected Admin; no live mount/auth transport", async () => {
    const h = setup(); expect(Object.keys(h.router._def.record).sort()).toEqual(["supplierPermissions", "suppliers"]);
    expect(await h.editor.load("admin")).toMatchObject({ ok: true, snapshot: { role: "admin", version: 0, grants: {}, protectedAdmin: true } });
    expect(await h.editor.load("sales_staff")).toMatchObject({ ok: true, snapshot: { role: "sales_staff", version: 0, grants: {} } });
    const saved = await h.editor.save(draft({ [keys[0]]: false }));
    expect(saved).toMatchObject({ ok: true, changed: true, snapshot: { version: 1, grants: { [keys[0]]: false } } });
    if (saved.ok) { expect(Object.keys(saved.snapshot.defaults).sort()).toEqual(Array.from(keys).sort()); expect(saved.snapshot.effective[keys[0]]).toBe(false); }
    expect(h.model.getAudit()[0].actorId).toBe(71);
  });
  it("non-admin editor requests remain fixed failures; target/client fields cannot elevate", async () => {
    const h = setup(); expect(await h.staff.supplierPermissions.load("admin")).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    expect(await h.staff.supplierPermissions.save({ ...draft(), actorId: 71, role: "admin" })).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    expect(h.repository.save).not.toHaveBeenCalled(); expect(h.repository.readPolicy).not.toHaveBeenCalled();
  });
  it("editor invalid role/extra fields fail closed in actual unknown-parser binding", async () => {
    const h = setup(); expect(await h.admin.supplierPermissions.load({ role: "sales_staff", actorId: 71 })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await h.admin.supplierPermissions.save({ ...draft(), actorRole: "admin" })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await h.admin.supplierPermissions.save({ ...draft(), role: "admin" })).toEqual({ ok: false, code: "ADMIN_PROTECTED" });
    expect(await h.admin.supplierPermissions.save(draft({ "suppliers.records.export.export": true }))).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(h.repository.save).not.toHaveBeenCalled();
  });
  it("one retained caller sees fresh role/activity and fresh policy every request", async () => {
    const h = setup(); await h.staff.suppliers.list(undefined);
    await h.editor.save(draft({ [keys[0]]: false }));
    await expect(h.staff.suppliers.list({ policy: {}, role: "admin", cachedPolicy: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.repository.readPolicy).toHaveBeenCalledTimes(2); expect(h.business.listSuppliers).toHaveBeenCalledOnce();
    h.actors.set(72, { id: 72, role: "accountant", isActive: 1 });
    await h.staff.suppliers.list(undefined); expect(h.repository.readPolicy).toHaveBeenLastCalledWith("accountant");
    h.actors.set(72, { id: 72, role: "accountant", isActive: 0 });
    await expect(h.staff.suppliers.list(undefined)).rejects.toMatchObject({ message: "INACTIVE_ACTOR" });
  });
  it("valid v0 wrapper allows and corrupt/failed reads deny rather than inherit", async () => {
    const h = setup(); await h.staff.suppliers.list(undefined); h.business.listSuppliers.mockClear();
    h.repository.readPolicy.mockResolvedValue({ ok: false, error: { code: "DB_FAILURE", detail: "not public" } });
    await expect(h.staff.suppliers.list(undefined)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "POLICY_UNAVAILABLE" });
    expect(await h.editor.load("sales_staff")).toEqual({ ok: false, code: "POLICY_UNAVAILABLE" });
    h.repository.readPolicy.mockResolvedValue({ ok: true, policy: { scope: "supplier_management", version: 0,
      policy: { role: "sales_staff", catalogueRevision: catalogue.revision, grants: { [keys[0]]: true } } } });
    await expect(h.staff.suppliers.list(undefined)).rejects.toMatchObject({ message: "POLICY_UNAVAILABLE" }); noHelpers(h);
  });
  it("Admin helper execution ignores unavailable editable policy storage", async () => {
    const h = setup(); h.repository.readPolicy.mockRejectedValue(Error("synthetic read failure"));
    for (const method of methods) expect(await invoke(h.admin, method, inputs[method])).toBe(h.result);
    expect(h.repository.readPolicy).not.toHaveBeenCalled();
  });
  it("actual caller preserves filters/undefined, unknown stripping, ID rules and original email/nullable transforms", async () => {
    const h = setup(); await h.admin.suppliers.list(undefined); expect(h.business.listSuppliers).toHaveBeenLastCalledWith(undefined);
    await h.admin.suppliers.list({ category: "", isActive: false, ignored: true }); expect(h.business.listSuppliers).toHaveBeenLastCalledWith({ category: "", isActive: false });
    await h.admin.suppliers.getById({ id: -0.25, ignored: true }); expect(h.business.getSupplierById).toHaveBeenLastCalledWith(-0.25);
    await h.admin.suppliers.create({ name: " ", email: "", category: "", isActive: false });
    expect(h.business.createSupplier).toHaveBeenLastCalledWith({ name: " ", email: undefined, category: "" });
    await h.admin.suppliers.update({ id: 0, email: "", notes: null, phone: null, isActive: undefined, ignored: true });
    expect(h.business.updateSupplier).toHaveBeenLastCalledWith(0, { email: null, notes: null, phone: null, isActive: undefined });
    await h.admin.suppliers.update({ id: 2, email: null }); expect(h.business.updateSupplier).toHaveBeenLastCalledWith(2, { email: null });
    await h.admin.suppliers.delete({ id: -2.5, ignored: true }); expect(h.business.deleteSupplier).toHaveBeenLastCalledWith(-2.5);
  });
  for (const [method, bad] of [
    ["list", { isActive: 1 }], ["getById", { id: "2" }], ["create", { name: "x", email: "bad email" }],
    ["create", { name: "x", notes: null }], ["create", { name: "" }], ["update", { id: 2, email: "bad email" }],
    ["update", { id: 2, isActive: null }], ["update", { id: 2, preferredContactMethod: "sms" }], ["delete", { id: "2" }],
  ] as const) {
    it(`caller validates ${method}/${JSON.stringify(bad)} BEFORE helper/read`, async () => {
      const h = setup(); await expect(invoke(h.admin, method, bad)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_INPUT" });
      expect(h.resolveActor).not.toHaveBeenCalled(); expect(h.repository.readPolicy).not.toHaveBeenCalled(); noHelpers(h);
    });
  }
  it("soft-deactivation requires Edit AND Delete; undefined/reactivation ordinary edit; no View prerequisite", async () => {
    const h = setup(); await h.editor.save(draft({ [keys[0]]: false, [keys[1]]: false, [keys[3]]: true, [keys[4]]: false }));
    await h.staff.suppliers.update({ id: 2, isActive: undefined }); await h.staff.suppliers.update({ id: 2, isActive: true });
    await expect(h.staff.suppliers.update({ id: 2, isActive: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.business.updateSupplier).toHaveBeenCalledTimes(2);
    await h.editor.save(draft({ [keys[3]]: true, [keys[4]]: true }, 1)); await h.staff.suppliers.update({ id: 2, isActive: false });
    await h.editor.save(draft({ [keys[3]]: false, [keys[4]]: true }, 2));
    await expect(h.staff.suppliers.update({ id: 2, isActive: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.business.updateSupplier).toHaveBeenCalledTimes(3); await h.staff.suppliers.delete({ id: 2 });
  });
  it("actual concurrent callers return one model save and one fixed stale result", async () => {
    const h = setup(); const secondAdmin = h.router.createCaller({ actorId: 71 });
    const results = await Promise.all([h.admin.supplierPermissions.save(draft({ [keys[0]]: false })), secondAdmin.supplierPermissions.save(draft({ [keys[3]]: false }))]);
    expect(results.filter(result => result.ok)).toHaveLength(1); expect(results.filter(result => !result.ok)).toEqual([{ ok: false, code: "STALE_VERSION" }]);
    expect(h.model.getAudit()).toHaveLength(1); expect(h.repository.save).toHaveBeenCalledTimes(2);
  });
  for (const code of ["STALE_VERSION", "CATALOGUE_MISMATCH", "COMMIT_OUTCOME_UNKNOWN"] as const) {
    it(`actual caller preserves fixed ${code} without retry or raw details`, async () => {
      const h = setup(); h.repository.save.mockResolvedValue({ ok: false, error: { code, recovery: "private synthetic recovery" } });
      expect(await h.editor.save(draft({ [keys[0]]: false }))).toEqual({ ok: false, code });
      expect(h.repository.save).toHaveBeenCalledOnce(); expect(h.repository.readPolicy).not.toHaveBeenCalled();
    });
  }
  it("exception getter cannot forge a stale public result", async () => {
    const h = setup(); const getter = vi.fn(() => "STALE_VERSION");
    h.repository.save.mockRejectedValue(Object.defineProperty({}, "code", { enumerable: true, get: getter }));
    expect(await h.editor.save(draft())).toEqual({ ok: false, code: "SAVE_FAILED" }); expect(getter).not.toHaveBeenCalled();
  });
  it("original helper guarded outcome/error is retained, not replaced by permission allow", async () => {
    const h = setup(); const guarded = new TRPCError({ code: "CONFLICT", message: "Synthetic ordinary business state guard" });
    h.business.updateSupplier.mockRejectedValueOnce(guarded);
    await expect(h.admin.suppliers.update({ id: 2 })).rejects.toBe(guarded);
    h.business.deleteSupplier.mockResolvedValueOnce(false as never); expect(await h.admin.suppliers.delete({ id: 2 })).toBe(false);
    expect(h.business.updateSupplier).toHaveBeenCalledOnce(); expect(h.business.deleteSupplier).toHaveBeenCalledOnce();
  });
});
