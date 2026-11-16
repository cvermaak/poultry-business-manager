import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  createBusinessPermissionService, businessPermissionServiceErrorCode, authorizeBusinessAction,
} from "./business-permission-service";
import { BUSINESS_PERMISSION_DEFINITIONS as definitions, BUSINESS_PERMISSION_ROUTES as routes } from "../shared/business-permission-definitions";
import type { BusinessScope } from "../shared/business-permission-definitions";
import { createScopedPermissionPolicyModel, SCOPED_POLICY_ROLES as roles } from "../shared/scoped-permission-policy-model";
import type { ScopedPolicyRole } from "../shared/scoped-permission-policy-model";
import type { PermissionRole } from "../shared/role-permission-types";

function setup(scope: BusinessScope = "customers") {
  const definition = definitions[scope];
  const Model = createScopedPermissionPolicyModel(definition);
  const model = new Model({ catalogue: definition.catalogue, clock: () => 123 });
  const actors = new Map<number, { id: number; role: PermissionRole; isActive: 0 | 1 }>([
    [91, { id: 91, role: "admin", isActive: 1 }],
    [92, { id: 92, role: "farm_manager", isActive: 1 }],
  ]);
  const repository = {
    resolveActor: vi.fn(async (id: number): Promise<unknown> => actors.get(id)),
    readPolicy: vi.fn(async (role: ScopedPolicyRole): Promise<unknown> => ({ ok: true, policy: model.getPolicy(role) })),
    save: vi.fn(async (id: number, input: unknown): Promise<unknown> => {
      const actor = actors.get(id);
      return model.save({ authenticated: !!actor, active: actor?.isActive === 1, role: actor?.role ?? "invalid", actorId: id }, input);
    }),
  };
  const service = createBusinessPermissionService(definition, repository);
  const keys = definition.catalogue.capabilities.map(item => item.key);
  const draft = (grants: Record<string, boolean> = {}, expectedVersion = 0, role: ScopedPolicyRole = "farm_manager") => ({
    role, catalogueRevision: definition.catalogue.revision, expectedVersion, grants, reason: " Synthetic reviewed decision ",
  });
  return { definition, model, actors, repository, service, keys, draft };
}
async function denied(operation: Promise<unknown>, code: string) {
  const error = await operation.then(() => undefined, caught => caught);
  expect(error).toBeInstanceOf(TRPCError);
  expect(businessPermissionServiceErrorCode(error)).toBe(code);
  expect(error.message).not.toMatch(/SQL|secret|LEAK/);
}

describe("business services — injected synthetic actors/model; no database", () => {
  for (const scope of ["customers", "sales_orders", "invoices", "financial_data"] as const) {
    for (const role of ["admin", ...roles] as const) {
      it(`loads source-defined defaults for ${scope}/${role}`, async () => {
        const h = setup(scope);
        const loaded = await h.service.load(91, role);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        expect(loaded.snapshot).toMatchObject({ scope, role, version: 0, grants: {}, protectedAdmin: role === "admin" });
        expect(Object.isFrozen(loaded.snapshot)).toBe(true);
        expect(Object.isFrozen(loaded.snapshot.effective)).toBe(true);
        for (const key of h.keys) {
          const expected = !(scope === "financial_data" && role === "farm_manager");
          expect(loaded.snapshot.defaults[key]).toBe(expected);
          expect(loaded.snapshot.effective[key]).toBe(expected);
        }
        expect(h.repository.readPolicy).toHaveBeenCalledTimes(role === "admin" ? 0 : 1);
      });
    }
  }
  for (const scope of ["customers", "sales_orders", "invoices"] as const) {
    it(`preserves all ordinary ${scope} defaults for every stored role`, async () => {
      const h = setup(scope);
      for (const role of ["admin", ...roles] as const) {
        h.actors.set(92, { id: 92, role, isActive: 1 });
        await h.service.authorize(92, h.keys);
      }
    });
  }
  it("protects Admin with empty v0 grants and no editable policy read", async () => {
    const h = setup();
    h.repository.readPolicy.mockRejectedValue(Error("LEAK secret SQL"));
    expect(await h.service.load(91, "admin")).toMatchObject({ ok: true, snapshot: { protectedAdmin: true, version: 0, grants: {} } });
    await h.service.authorize(91, h.keys);
    expect(await h.service.save(91, { ...h.draft(), role: "admin" })).toEqual({ ok: false, code: "ADMIN_PROTECTED" });
    expect(h.repository.readPolicy).not.toHaveBeenCalled();
    expect(h.repository.save).not.toHaveBeenCalled();
  });
  it("requires current active Admin for editor operations; target role never authenticates", async () => {
    const h = setup();
    expect(await h.service.load(92, "admin")).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    expect(await h.service.save(92, h.draft())).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    expect(await h.service.load(91, "superadmin")).toEqual({ ok: false, code: "INVALID_INPUT" });
    h.actors.set(91, { id: 91, role: "admin", isActive: 0 });
    expect(await h.service.load(91, "admin")).toEqual({ ok: false, code: "INACTIVE_ACTOR" });
  });
  for (const value of [null, 0, -1, 1.5, "91", {}, { id: 91, role: "admin" }]) {
    it(`rejects invalid primitive actor ID ${typeof value}`, async () => {
      const h = setup();
      expect(await h.service.load(value as never, "admin")).toEqual({ ok: false, code: "UNAUTHENTICATED" });
      await denied(h.service.authorize(value as never, h.keys), "UNAUTHENTICATED");
      expect(h.repository.resolveActor).not.toHaveBeenCalled();
    });
  }
  for (const raw of [undefined, { id: 99, role: "admin", isActive: 1 }, { id: 91, role: "owner", isActive: 1 },
    { id: 91, role: "admin", isActive: true }, { id: 91, role: "admin", isActive: "1" },
    { id: 91, role: "admin", isActive: 1, extra: true }]) {
    it("rejects malformed stored actor projection", async () => {
      const h = setup(); h.repository.resolveActor.mockResolvedValue(raw);
      expect(await h.service.load(91, "admin")).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    });
  }
  it("Allow/Block/default saves are audited; no-op is unchanged; stale CAS is public", async () => {
    const h = setup(); const key = h.keys[0];
    expect(await h.service.save(91, h.draft({ [key]: false }))).toMatchObject({ ok: true, changed: true, snapshot: { version: 1, effective: { [key]: false } } });
    await denied(h.service.authorize(92, [key]), "PERMISSION_DENIED");
    expect(await h.service.save(91, h.draft({ [key]: false }, 1))).toMatchObject({ ok: true, changed: false, snapshot: { version: 1 } });
    expect(await h.service.save(91, h.draft({ [key]: true }))).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(await h.service.save(91, h.draft({ [key]: true }, 1))).toMatchObject({ ok: true, changed: true });
    await h.service.authorize(92, [key]);
    expect(await h.service.save(91, h.draft({}, 2))).toMatchObject({ ok: true, changed: true, snapshot: { version: 3, grants: {} } });
    expect(h.model.getAudit()).toHaveLength(3);
    expect(h.model.getAudit()[0].reason).toBe("Synthetic reviewed decision");
  });
  it("Farm financial visibility starts false, audited Allow enables it, Block withholds it", async () => {
    const h = setup("financial_data"); const key = h.keys[0];
    expect(await h.service.canReadFinancialData(92)).toBe(false);
    expect(await h.service.save(91, h.draft({ [key]: true }))).toMatchObject({ ok: true, changed: true });
    expect(await h.service.canReadFinancialData(92)).toBe(true);
    expect(await h.service.save(91, h.draft({ [key]: false }, 1))).toMatchObject({ ok: true, changed: true });
    expect(await h.service.canReadFinancialData(92)).toBe(false);
    expect(h.model.getAudit()).toHaveLength(2);
    for (const role of roles.filter(role => role !== "farm_manager")) {
      h.actors.set(92, { id: 92, role, isActive: 1 });
      expect(await h.service.canReadFinancialData(92)).toBe(true);
    }
    h.actors.set(92, { id: 92, role: "admin", isActive: 1 });
    expect(await h.service.canReadFinancialData(92)).toBe(true);
    h.actors.set(92, { id: 92, role: "admin", isActive: 0 });
    expect(await h.service.canReadFinancialData(92)).toBe(false);
  });
  it("financial resolver/read outages throw internal errors, never a baseline/fallback", async () => {
    const h = setup("financial_data");
    h.repository.readPolicy.mockResolvedValue({ ok: false, error: { code: "DB_FAILURE" } });
    await denied(h.service.canReadFinancialData(92), "POLICY_UNAVAILABLE");
    h.repository.resolveActor.mockRejectedValue(Error("LEAK"));
    await denied(h.service.canReadFinancialData(92), "POLICY_UNAVAILABLE");
  });
  for (const mutate of [
    (p: any) => ({ ...p, scope: "invoices" }),
    (p: any) => ({ ...p, version: -1 }),
    (p: any) => ({ ...p, version: 0, policy: { ...p.policy, grants: { "customers.records.view.list": true } } }),
    (p: any) => ({ ...p, policy: { ...p.policy, role: "accountant" } }),
    (p: any) => ({ ...p, policy: { ...p.policy, catalogueRevision: "wrong" } }),
    (p: any) => ({ ...p, version: 1, policy: { ...p.policy, grants: { unknown: true } } }),
    (p: any) => ({ ...p, extra: "SQL" }),
  ]) {
    it("fails closed on corrupt persisted wrappers without inherited business access", async () => {
      const h = setup(); h.repository.readPolicy.mockResolvedValue({ ok: true, policy: mutate(h.model.getPolicy("farm_manager")) });
      expect(await h.service.load(91, "farm_manager")).toEqual({ ok: false, code: "POLICY_UNAVAILABLE" });
      await denied(h.service.authorize(92, h.keys), "POLICY_UNAVAILABLE");
    });
  }
  it("requires Edit AND Delete only for customer deactivation", async () => {
    const h = setup();
    await h.service.save(91, h.draft({ [h.definition.actions.delete[0]]: false }));
    await h.service.authorize(92, h.definition.actions.edit, { id: 4, isActive: true });
    await h.service.authorize(92, h.definition.actions.edit, { id: 4 });
    await denied(h.service.authorize(92, h.definition.actions.edit, { id: 4, isActive: false }), "PERMISSION_DENIED");
  });
  it("PDF requires static View AND Export; unsupported financial mutations have no routes", async () => {
    const h = setup("invoices");
    expect(routes.invoices.methods.generatePDF).toEqual([...h.definition.actions.view, ...h.definition.actions.export]);
    await h.service.save(91, h.draft({ [h.definition.actions.view[0]]: false }));
    await denied(h.service.authorize(92, routes.invoices.methods.generatePDF), "PERMISSION_DENIED");
    expect(routes.invoices.methods.generateFromOrder).toEqual(["invoices.records.create.generatefromorder"]);
    await denied(authorizeBusinessAction(91, "financial_data", "create"), "INVALID_INPUT");
    await denied(authorizeBusinessAction(91, "invoices", "markAsSent"), "INVALID_INPUT");
  });
  it("rejects getters, unknown keys and reflection failures without invoking property getters", async () => {
    const h = setup(); const getter = vi.fn(() => { throw Error("LEAK"); });
    const input = Object.defineProperty(h.draft(), "reason", { enumerable: true, get: getter });
    expect(await h.service.save(91, input)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await h.service.save(91, h.draft({ unknown: true }))).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await h.service.save(91, h.draft({ [h.keys[0]]: "true" as never }))).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await h.service.save(91, { ...h.draft(), scope: "invoices" })).toEqual({ ok: false, code: "INVALID_INPUT" });
    await denied(h.service.authorize(91, ["unknown"]), "INVALID_INPUT");
    const badKeys = Object.defineProperty([h.keys[0]], "0", { enumerable: true, get: getter });
    await denied(h.service.authorize(91, badKeys), "INVALID_INPUT");
    const proxy = new Proxy({}, { ownKeys: getter });
    expect(await h.service.save(91, proxy)).toEqual({ ok: false, code: "INVALID_INPUT" });
    // Only Proxy reflection trap was invoked; accessors are never called.
    expect(getter).toHaveBeenCalledTimes(1);
  });
  it("never inspects arbitrary thrown code/message/getter traps", async () => {
    const h = setup(); const trap = vi.fn(() => { throw Error("LEAK"); });
    const poison = new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap });
    h.repository.readPolicy.mockRejectedValue(poison);
    expect(await h.service.load(91, "farm_manager")).toEqual({ ok: false, code: "POLICY_UNAVAILABLE" });
    h.repository.save.mockRejectedValue(poison);
    expect(await h.service.save(91, h.draft())).toEqual({ ok: false, code: "SAVE_FAILED" });
    expect(businessPermissionServiceErrorCode(poison)).toBeUndefined();
    expect(trap).not.toHaveBeenCalled();
  });
  it("rejects actor and nested grant accessors without evaluating them", async () => {
    const h = setup(); const getter = vi.fn(() => "admin");
    const badActor = Object.defineProperty({ id: 91, isActive: 1 }, "role", { enumerable: true, get: getter });
    h.repository.resolveActor.mockResolvedValueOnce(badActor);
    expect(await h.service.load(91, "admin")).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    const badGrants = Object.defineProperty({}, h.keys[0], { enumerable: true, get: getter });
    expect(await h.service.save(91, h.draft(badGrants))).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(getter).not.toHaveBeenCalled();
    expect(h.repository.save).not.toHaveBeenCalled();
  });
  it("uses model-authoritative catalogue and bounded reason validation", async () => {
    const h = setup();
    expect(await h.service.save(91, { ...h.draft(), catalogueRevision: "old-revision" })).toEqual({ ok: false, code: "CATALOGUE_MISMATCH" });
    for (const reason of ["", " ", "line\nfeed", "x".repeat(501)]) {
      expect(await h.service.save(91, { ...h.draft(), reason })).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    expect(h.repository.save).not.toHaveBeenCalled();
  });
  it("concurrent fake-CAS saves return one commit and one stale version", async () => {
    const h = setup();
    const results = await Promise.all([
      h.service.save(91, h.draft({ [h.keys[0]]: false })),
      h.service.save(91, h.draft({ [h.keys[1]]: false })),
    ]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toEqual([{ ok: false, code: "STALE_VERSION" }]);
    expect(h.model.getAudit()).toHaveLength(1);
  });
  it("captures all request scalars and grants before awaited resolver mutation", async () => {
    const h = setup(); const input = h.draft({ [h.keys[0]]: false });
    h.repository.resolveActor.mockImplementation(async id => {
      input.role = "accountant"; input.expectedVersion = 42; input.reason = "mutated";
      input.catalogueRevision = "mutated"; input.grants[h.keys[0]] = true;
      return h.actors.get(id);
    });
    expect(await h.service.save(91, input)).toMatchObject({ ok: true, snapshot: { role: "farm_manager", version: 1, effective: { [h.keys[0]]: false } } });
    expect(h.model.getAudit()[0].reason).toBe("Synthetic reviewed decision");
  });
  it("rechecks role/activity after policy read and independently inside fake persistence", async () => {
    const h = setup();
    h.repository.readPolicy.mockImplementation(async role => {
      h.actors.set(92, { id: 92, role: "accountant", isActive: 1 });
      return { ok: true, policy: h.model.getPolicy(role) };
    });
    await denied(h.service.authorize(92, h.keys), "PERMISSION_DENIED");
    h.repository.save.mockImplementation(async (id, input) => {
      h.actors.set(id, { id, role: "accountant", isActive: 1 });
      return h.model.save({ authenticated: true, active: true, role: "accountant", actorId: id }, input);
    });
    expect(await h.service.save(91, h.draft({ [h.keys[0]]: false }))).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    expect(h.model.getAudit()).toHaveLength(0);
  });
  for (const code of ["STALE_VERSION", "COMMIT_OUTCOME_UNKNOWN", "POLICY_FAILURE", "AUDIT_FAILURE", "CORRUPT_POLICY"]) {
    it(`maps repository structured ${code} safely`, async () => {
      const h = setup(); h.repository.save.mockResolvedValue({ ok: false, error: { code } });
      expect(await h.service.save(91, h.draft())).toEqual({ ok: false, code: ["STALE_VERSION", "COMMIT_OUTCOME_UNKNOWN"].includes(code) ? code : "SAVE_FAILED" });
    });
  }
  for (const malformed of [
    { ok: true, changed: "yes", reason: "Synthetic reviewed decision" },
    { ok: true, changed: false, reason: "Synthetic reviewed decision", policy: { scope: "customers", version: 1, policy: { role: "farm_manager", catalogueRevision: definitions.customers.catalogue.revision, grants: {} } } },
    { ok: false, error: { code: "STALE_VERSION" }, rawSql: "LEAK" },
  ]) {
    it("rejects malformed committed results rather than returning an editor snapshot", async () => {
      const h = setup(); h.repository.save.mockResolvedValue(malformed);
      expect(await h.service.save(91, h.draft())).toEqual({ ok: false, code: "SAVE_FAILED" });
    });
  }
});
