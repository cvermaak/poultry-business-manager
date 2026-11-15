/** PREPARATION ONLY: pure/reference memory tests; no application/DB/live imports. */
import { describe, expect, it, vi } from "vitest";
import { PREPARED_PERMISSION_CATALOGUE } from "../shared/role-permission-catalogue.generated";
import { evaluatePermission, validatePolicy } from "../shared/role-permission-engine";
import type { PermissionCatalogue, PermissionRole } from "../shared/role-permission-types";
import {
  SupplierPermissionPolicyModel, SupplierPolicyModelError,
  SUPPLIER_PERMISSION_KEYS, SUPPLIER_POLICY_ROLES, SUPPLIER_POLICY_SCOPE, SUPPLIER_POLICY_MAX_VERSION,
} from "../shared/supplier-permission-policy-model";
import type {
  SupplierPolicyRole, SupplierPermissionKey, SupplierPolicySaveResult,
  SupplierPolicyFailureHooks, SupplierPolicyModelOptions, SupplierPolicyAudit,
} from "../shared/supplier-permission-policy-model";

const REVISION = PREPARED_PERMISSION_CATALOGUE.revision;
const UTC_MS = 1794648000123;
const KEY = SUPPLIER_PERMISSION_KEYS[0];
const ADMIN = Object.freeze({ authenticated: true, active: true, role: "admin", actorId: 42 });
// These are source-owned catalogue copies, not a new fixture or source mapping.
function catalogue(): PermissionCatalogue {
  return JSON.parse(JSON.stringify({ revision: REVISION,
    capabilities: PREPARED_PERMISSION_CATALOGUE.capabilities.filter(item =>
      SUPPLIER_PERMISSION_KEYS.some(key => key === item.key)) }));
}
function model(options: Partial<SupplierPolicyModelOptions> = {}): SupplierPermissionPolicyModel {
  return new SupplierPermissionPolicyModel({ catalogue: catalogue(), clock: () => UTC_MS, ...options });
}
function principal(role: PermissionRole = "farm_manager") {
  return { authenticated: true, active: true, role, actorId: 7 };
}
function request(overrides: Record<string, unknown> = {}) {
  return { role: "farm_manager", catalogueRevision: REVISION, expectedVersion: 0,
    grants: { [KEY]: false }, reason: "  Delegation review  ", ...overrides };
}
function success(result: SupplierPolicySaveResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}
function failure(result: SupplierPolicySaveResult, code: string) {
  expect(result).toEqual({ ok: false, error: { code } });
}
function pristine(value: SupplierPermissionPolicyModel) {
  expect(value.getAudit()).toEqual([]);
  for (const role of SUPPLIER_POLICY_ROLES) {
    expect(value.getPolicy(role)).toEqual({ scope: SUPPLIER_POLICY_SCOPE, version: 0,
      policy: { catalogueRevision: REVISION, role, grants: {} } });
  }
}
const matrix: [SupplierPolicyRole, SupplierPermissionKey][] = [];
for (const role of SUPPLIER_POLICY_ROLES) for (const key of SUPPLIER_PERMISSION_KEYS) matrix.push([role, key]);

describe("Supplier Management PREPARATION-ONLY policy reference model", () => {
  it("validates the full copied source catalogue and preserves empty v0 for exactly five roles", () => {
    const value = model({ catalogue: PREPARED_PERMISSION_CATALOGUE });
    pristine(value);
    expect(SUPPLIER_PERMISSION_KEYS).toHaveLength(5);
    expect(SUPPLIER_POLICY_ROLES).toHaveLength(5);
    expect(() => value.getPolicy("admin")).toThrowError("ADMIN_POLICY_FORBIDDEN");
    expect(() => value.getPolicy("Farm Manager")).toThrowError("UNKNOWN_ROLE");
    for (const key of SUPPLIER_PERMISSION_KEYS) {
      const entry = PREPARED_PERMISSION_CATALOGUE.capabilities.find(item => item.key === key)!;
      for (const role of ["admin", ...SUPPLIER_POLICY_ROLES] as PermissionRole[]) expect(entry.baseline[role].allowed).toBe(true);
    }
  });

  it.each(matrix)("preserves baseline, denies override, resets inherited default for %s / %s", async (role, key) => {
    const value = model();
    expect(value.evaluate(principal(role), key)).toMatchObject({ status: "allow", reason: "BASELINE_ALLOW" });
    const denied = success(await value.save(ADMIN, request({ role, grants: { [key]: false } })));
    expect(denied.policy.version).toBe(1);
    expect(value.evaluate(principal(role), key)).toMatchObject({ status: "deny", reason: "POLICY_DENY" });
    const reset = success(await value.save(ADMIN, request({ role, expectedVersion: 1, grants: {} })));
    expect(reset.policy.version).toBe(2);
    expect(reset.policy.policy.grants).toEqual({});
    expect(value.evaluate(principal(role), key)).toMatchObject({ status: "allow", reason: "BASELINE_ALLOW" });
    expect(reset.audit!.before.grants).toEqual({ [key]: false });
    expect(reset.audit!.before.effectiveGrants[key]).toBe(false);
    expect(reset.audit!.after.grants).toEqual({});
    expect(reset.audit!.after.effectiveGrants[key]).toBe(true);
    expect(Object.keys(reset.audit!.after.effectiveGrants)).toEqual(Array.from(SUPPLIER_PERMISSION_KEYS).sort());
    for (const other of SUPPLIER_POLICY_ROLES.filter(item => item !== role)) {
      expect(value.getPolicy(other).version).toBe(0);
      expect(value.getPolicy(other).policy.grants).toEqual({});
      for (const otherKey of SUPPLIER_PERMISSION_KEYS) expect(value.evaluate(principal(other), otherKey).roleGatePassed).toBe(true);
    }
    for (const otherKey of SUPPLIER_PERMISSION_KEYS) expect(value.evaluate(ADMIN, otherKey).roleGatePassed).toBe(true);
  });

  it.each(Array.from(SUPPLIER_POLICY_ROLES))("denies policy saving by nonadmin %s even for a no-op", async role => {
    const value = model();
    failure(await value.save(principal(role), request({ grants: {} })), "ADMIN_REQUIRED");
    pristine(value);
  });

  it.each([
    ["unauthenticated", { ...ADMIN, authenticated: false }, "UNAUTHENTICATED"],
    ["inactive", { ...ADMIN, active: false }, "INACTIVE_PRINCIPAL"],
    ["unknown role", { ...ADMIN, role: "owner" }, "UNKNOWN_ROLE"],
    ["alias role", { ...ADMIN, role: "Admin" }, "UNKNOWN_ROLE"],
    ["padded role", { ...ADMIN, role: "admin " }, "UNKNOWN_ROLE"],
    ["missing actor", { authenticated: true, active: true, role: "admin" }, "INVALID_PRINCIPAL"],
    ["zero actor", { ...ADMIN, actorId: 0 }, "INVALID_PRINCIPAL"],
    ["negative actor", { ...ADMIN, actorId: -1 }, "INVALID_PRINCIPAL"],
    ["unsafe actor", { ...ADMIN, actorId: Number.MAX_SAFE_INTEGER + 1 }, "INVALID_PRINCIPAL"],
    ["fraction actor", { ...ADMIN, actorId: 1.5 }, "INVALID_PRINCIPAL"],
    ["string actor", { ...ADMIN, actorId: "42" }, "INVALID_PRINCIPAL"],
    ["NaN actor", { ...ADMIN, actorId: NaN }, "INVALID_PRINCIPAL"],
    ["truthy authentication", { ...ADMIN, authenticated: 1 }, "INVALID_PRINCIPAL"],
    ["truthy active", { ...ADMIN, active: "true" }, "INVALID_PRINCIPAL"],
    ["extra principal field", { ...ADMIN, AdminId: 999 }, "INVALID_PRINCIPAL"],
  ])("denies %s principal for saving and evaluation", async (_name, actor, code) => {
    const value = model();
    failure(await value.save(actor, request()), String(code));
    expect(value.evaluate(actor, KEY)).toMatchObject({ status: "deny", reason: code });
    pristine(value);
  });

  it.each([
    ["symbol", () => ({ ...ADMIN, [Symbol("x")]: true })],
    ["inherited", () => Object.assign(Object.create({ role: "admin" }), ADMIN)],
    ["array", () => [ADMIN]],
    ["constructor", () => ({ ...ADMIN, constructor: "hostile" })],
    ["throwing ownKeys", () => new Proxy(ADMIN, { ownKeys: () => { throw new Error("raw secret"); } })],
    ["throwing descriptor", () => new Proxy({ ...ADMIN }, { getOwnPropertyDescriptor: () => { throw new Error("raw secret"); } })],
    ["throwing prototype", () => new Proxy(ADMIN, { getPrototypeOf: () => { throw new Error("raw secret"); } })],
  ] as [string, () => unknown][])("rejects hostile trusted-principal record %s", async (_name, factory) => {
    const value = model();
    const actor = factory();
    failure(await value.save(actor, request()), "INVALID_PRINCIPAL");
    expect(value.evaluate(actor, KEY)).toMatchObject({ status: "deny", reason: "INVALID_PRINCIPAL" });
    pristine(value);
  });

  it.each(["owner", "Farm Manager", "farm_manager ", "ADMIN", "", null, 1])(
    "rejects nonexact target role %s", async role => {
      const value = model();
      failure(await value.save(ADMIN, request({ role })), "UNKNOWN_ROLE");
      pristine(value);
    });

  it("Admin remains source-fixed after all nonadmin role changes; no Admin draft is accepted", async () => {
    const value = model();
    for (const role of SUPPLIER_POLICY_ROLES) {
      const grants: Record<string, boolean> = {};
      for (const key of SUPPLIER_PERMISSION_KEYS) grants[key] = false;
      success(await value.save(ADMIN, request({ role, grants })));
    }
    failure(await value.save(ADMIN, request({ role: "admin" })), "ADMIN_POLICY_FORBIDDEN");
    expect(value.getAudit()).toHaveLength(5);
    for (const key of SUPPLIER_PERMISSION_KEYS) {
      expect(value.evaluate(ADMIN, key)).toMatchObject({ status: "allow", reason: "BASELINE_ALLOW" });
      expect(evaluatePermission(catalogue(), { authenticated: true, active: true, role: "admin" }, key,
        new Proxy({}, { get: () => { throw new Error("do not inspect admin policy"); } })).status).toBe("allow");
    }
  });

  it("keeps persistence version/scope outside the strict evaluator policy", async () => {
    const saved = success(await model().save(ADMIN, request()));
    expect(Object.keys(saved.policy).sort()).toEqual(["policy", "scope", "version"]);
    expect(Object.keys(saved.policy.policy).sort()).toEqual(["catalogueRevision", "grants", "role"]);
    expect(validatePolicy(catalogue(), saved.policy.policy, "farm_manager").valid).toBe(true);
    expect(validatePolicy(catalogue(), saved.policy, "farm_manager").valid).toBe(false);
  });

  it.each([
    "suppliers.records.export.unmapped", "suppliers.records.export.export", "suppliers.records.view.unknown",
    "accounting.accounts.create.createaccount", "accounting.post_journal.sensitive.postjournal",
    "production.losses.delete.coverage_unassessed", "system.fixed.sensitive.action", "unknown",
  ])("rejects whole draft containing out-of-scope/export/review/sensitive/system key %s", async badKey => {
    const value = model();
    failure(await value.save(ADMIN, request({ grants: { [KEY]: false, [badKey]: true } })), "INVALID_GRANTS");
    expect(value.evaluate(ADMIN, badKey)).toMatchObject({ status: "deny", reason: "OUTSIDE_PILOT_SCOPE" });
    pristine(value);
  });

  it.each([undefined, null, 0, 1, "true", "false", [], {}, NaN])("rejects nonboolean grant %s", async grant => {
    const value = model();
    failure(await value.save(ADMIN, request({ grants: { [KEY]: grant } })), "INVALID_GRANTS");
    pristine(value);
  });

  const malformed: [string, () => unknown][] = [
    ["null", () => null], ["array", () => []], ["string", () => "x"], ["function", () => () => request()],
    ["missing required field", () => { const out = request() as Record<string, unknown>; delete out.reason; return out; }],
    ["custom inherited prototype", () => Object.assign(Object.create({ inherited: true }), request())],
    ["inherited required fields", () => Object.create(request())],
    ["class instance", () => Object.assign(new (class Hostile {})(), request())],
    ["own symbol", () => ({ ...request(), [Symbol("secret")]: true })],
    ["nonenumerable field", () => Object.defineProperty(request(), "reason", { value: "x", enumerable: false })],
    ["own __proto__", () => JSON.parse(JSON.stringify(request()).replace('"reason":', '"__proto__":{},"reason":'))],
    ["own constructor", () => ({ ...request(), constructor: "hostile" })],
    ["own prototype", () => ({ ...request(), prototype: "hostile" })],
    ["oversized field record", () => ({ ...request(), a: 1, b: 2 })],
    ["ownKeys throwing proxy", () => new Proxy(request(), { ownKeys: () => { throw new Error("secret"); } })],
    ["prototype throwing proxy", () => new Proxy(request(), { getPrototypeOf: () => { throw new Error("secret"); } })],
    ["descriptor throwing proxy", () => new Proxy(request(), { getOwnPropertyDescriptor: () => { throw new Error("secret"); } })],
    ["revoked proxy", () => { const proxy = Proxy.revocable(request(), {}); proxy.revoke(); return proxy.proxy; }],
  ];
  it.each(malformed)("rejects malformed/hostile request record: %s", async (_name, factory) => {
    const value = model();
    failure(await value.save(ADMIN, factory()), "INVALID_REQUEST");
    pristine(value);
  });

  it("never invokes getters in request, grants, principal, or catalogue", async () => {
    let hits = 0;
    const getter = () => { hits += 1; throw new Error("raw sensitive data"); };
    const value = model();
    failure(await value.save(ADMIN, Object.defineProperty(request(), "reason", { get: getter, enumerable: true })), "INVALID_REQUEST");
    failure(await value.save(ADMIN, request({ grants: Object.defineProperty({}, KEY, { get: getter, enumerable: true }) })), "INVALID_GRANTS");
    failure(await value.save(Object.defineProperty({ ...ADMIN }, "actorId", { get: getter, enumerable: true }), request()), "INVALID_PRINCIPAL");
    expect(() => model({ catalogue: Object.defineProperty(catalogue(), "revision", { get: getter, enumerable: true }) })).toThrowError("INVALID_CATALOGUE");
    expect(hits).toBe(0);
    pristine(value);
  });

  it.each([
    ["array", () => []], ["inherited", () => Object.create({ [KEY]: false })],
    ["symbol", () => ({ [KEY]: false, [Symbol("x")]: true })],
    ["__proto__", () => JSON.parse('{"__proto__":false}')], ["constructor", () => ({ constructor: false })],
    ["prototype", () => ({ prototype: false })],
    ["nonenumerable", () => Object.defineProperty({}, KEY, { value: false, enumerable: false })],
    ["oversized", () => ({ ...Object.fromEntries(SUPPLIER_PERMISSION_KEYS.map(key => [key, false])), extra: false })],
    ["throwing proxy", () => new Proxy({}, { ownKeys: () => { throw new Error("secret"); } })],
  ] as [string, () => unknown][])("rejects malformed grant dictionary %s", async (_name, factory) => {
    const value = model();
    const result = await value.save(ADMIN, request({ grants: factory() }));
    expect(result.ok).toBe(false); // Proxy trap fallback is INVALID_REQUEST; no raw trap text is returned.
    if (!result.ok) expect(["INVALID_GRANTS", "INVALID_REQUEST"]).toContain(result.error.code);
    pristine(value);
  });

  it("accepts valid null-prototype records; transparent proxies cannot be reliably identified", async () => {
    const value = model();
    const actor = Object.assign(Object.create(null), ADMIN);
    const draft = Object.assign(Object.create(null), request({ grants: Object.assign(Object.create(null), { [KEY]: false }) }));
    expect(success(await value.save(actor, new Proxy(draft, {}))).policy.version).toBe(1);
  });

  it("fails closed if Object.prototype gains inherited fields, then restores the test environment", async () => {
    const value = model();
    try {
      Object.defineProperty(Object.prototype, "supplierInjected", { configurable: true, value: true });
      failure(await value.save(ADMIN, request()), "INVALID_PRINCIPAL");
    } finally { delete (Object.prototype as Record<string, unknown>).supplierInjected; }
    pristine(value);
  });

  it.each(["actorId", "AdminId", "adminId", "utcMs", "time", "scope", "catalogue", "principal", "version"])(
    "rejects request spoofing of trusted/context field %s", async field => {
      const value = model();
      failure(await value.save(ADMIN, request({ [field]: field === "actorId" ? 999 : "spoofed" })), "INVALID_REQUEST");
      pristine(value);
    });

  it.each(["", "   ", "x".repeat(501), "before\n after", "\tvalid", "NUL\u0000", "DEL\u007f", "C1\u0085", " ".repeat(4097)])(
    "rejects invalid/bounded/control reason %j including no-ops", async reason => {
      const value = model();
      failure(await value.save(ADMIN, request({ grants: {}, reason })), "INVALID_REASON");
      pristine(value);
    });

  it("returns the exact normalized reason in saved/no-op results and immutable audit", async () => {
    const value = model();
    const result = success(await value.save(ADMIN, request({ reason: "  Change — inherited access  " })));
    expect(result.reason).toBe("Change — inherited access");
    expect(result.audit!.reason).toBe(result.reason);
    expect(result.audit).toMatchObject({ actorId: 42, actorRole: "admin", targetRole: "farm_manager",
      scope: "supplier_management", catalogueRevision: REVISION, utcMs: UTC_MS,
      before: { version: 0, grants: {} }, after: { version: 1, grants: { [KEY]: false } } });
    const noOp = success(await value.save(ADMIN, request({ expectedVersion: 1, reason: "  Reviewed unchanged  " })));
    expect(noOp).toMatchObject({ changed: false, reason: "Reviewed unchanged", policy: { version: 1 } });
    expect(noOp.audit).toBeUndefined();
    expect(value.getAudit()).toHaveLength(1);
    success(await model().save(ADMIN, request({ reason: "x".repeat(500) })));
  });

  it.each([-1, 1.5, NaN, Infinity, "0", undefined, null, SUPPLIER_POLICY_MAX_VERSION + 1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid expected version %s including no-ops", async expectedVersion => {
      const value = model();
      failure(await value.save(ADMIN, request({ expectedVersion, grants: {} })), "INVALID_VERSION");
      pristine(value);
    });

  it("empty initial no-op never creates a policy version or audit, but stale no-ops reject", async () => {
    const clock = vi.fn(() => UTC_MS);
    const hook = vi.fn();
    const value = model({ clock, failureHooks: { beforeCommit: hook } });
    expect(success(await value.save(ADMIN, request({ grants: {} }))).changed).toBe(false);
    failure(await value.save(ADMIN, request({ expectedVersion: 1, grants: {} })), "STALE_VERSION");
    expect(clock).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
    success(await value.save(ADMIN, request()));
    failure(await value.save(ADMIN, request()), "STALE_VERSION"); // stale even if grants already match
    failure(await value.save(ADMIN, request({ expectedVersion: 0, grants: {} })), "STALE_VERSION");
    expect(clock).toHaveBeenCalledTimes(1);
    expect(value.getAudit()).toHaveLength(1);
  });

  it("canonicalizes grants, recognizes order-only no-op, and keeps explicit baseline overrides sparse", async () => {
    const value = model();
    const reverse: Record<string, boolean> = {};
    Array.from(SUPPLIER_PERMISSION_KEYS).reverse().forEach(key => { reverse[key] = true; });
    const first = success(await value.save(ADMIN, request({ grants: reverse })));
    expect(first.changed).toBe(true); // explicit true differs from inherited empty despite identical effective access
    expect(Object.keys(first.policy.policy.grants)).toEqual(Array.from(SUPPLIER_PERMISSION_KEYS).sort());
    expect(first.audit!.before.effectiveGrants).toEqual(first.audit!.after.effectiveGrants);
    const sorted = Object.fromEntries(Array.from(SUPPLIER_PERMISSION_KEYS).sort().map(key => [key, true]));
    expect(success(await value.save(ADMIN, request({ expectedVersion: 1, grants: sorted }))).changed).toBe(false);
    const reset = success(await value.save(ADMIN, request({ expectedVersion: 1, grants: {} })));
    expect(reset.changed).toBe(true);
    expect(reset.audit!.before.grants).toEqual(sorted);
    expect(reset.audit!.after.grants).toEqual({});
    expect(reset.audit!.before.effectiveGrants).toEqual(reset.audit!.after.effectiveGrants);
    expect(value.getAudit()).toHaveLength(2);
  });

  it("does not introduce a View dependency for Create/Edit/Delete", async () => {
    const value = model();
    success(await value.save(ADMIN, request({ grants: {
      [SUPPLIER_PERMISSION_KEYS[0]]: false, [SUPPLIER_PERMISSION_KEYS[1]]: false,
      [SUPPLIER_PERMISSION_KEYS[2]]: true, [SUPPLIER_PERMISSION_KEYS[3]]: true, [SUPPLIER_PERMISSION_KEYS[4]]: true,
    } })));
    expect(value.evaluate(principal(), KEY).status).toBe("deny");
    for (const key of SUPPLIER_PERMISSION_KEYS.slice(2)) expect(value.evaluate(principal(), key).status).toBe("allow");
  });

  it("same expectedVersion first-save Promise race has exactly one changed success and one stale rejection", async () => {
    const value = model({ failureHooks: { beforeCommit: async () => { await Promise.resolve(); } } });
    const results = await Promise.all([value.save(ADMIN, request()),
      value.save({ ...ADMIN, actorId: 43 }, request({ grants: { [KEY]: true } }))]);
    expect(results.filter(item => item.ok)).toHaveLength(1);
    expect(results.filter(item => !item.ok && item.error.code === "STALE_VERSION")).toHaveLength(1);
    expect(value.getPolicy("farm_manager").version).toBe(1);
    expect(value.getAudit()).toHaveLength(1);
    expect(value.getAudit()[0].actorId).toBe(42);
  });

  it("does not publish partial policy/audit while a hook awaits; queued save rechecks latest version", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const value = model({ failureHooks: { beforeCommit: async () => { entered(); await gate; } } });
    const first = value.save(ADMIN, request());
    await started;
    pristine(value);
    const second = value.save(ADMIN, request({ grants: { [KEY]: true } }));
    release();
    success(await first);
    failure(await second, "STALE_VERSION");
    expect(value.getAudit()).toHaveLength(1);
    expect(value.getPolicy("farm_manager").version).toBe(1);
  });

  it.each([
    ["beforePolicyPublish", "POLICY_FAILURE"], ["beforeAuditPublish", "AUDIT_FAILURE"], ["beforeCommit", "COMMIT_FAILURE"],
  ] as [keyof SupplierPolicyFailureHooks, string][])("rolls back simulated %s failures without consuming audit/version", async (stage, code) => {
    let shouldFail = true;
    let value!: SupplierPermissionPolicyModel;
    const hook = vi.fn(async () => {
      expect(value.getPolicy("farm_manager").version).toBe(0);
      expect(value.getAudit()).toHaveLength(0);
      if (shouldFail) throw new Error("raw confidential hook exception");
    });
    value = model({ failureHooks: { [stage]: hook } });
    failure(await value.save(ADMIN, request()), code);
    pristine(value);
    failure(await value.save(ADMIN, request()), code);
    pristine(value);
    shouldFail = false;
    const saved = success(await value.save(ADMIN, request()));
    expect(saved.policy.version).toBe(1);
    expect(value.getAudit()).toHaveLength(1);
    expect(saved.audit!.before.version).toBe(0);
    expect(hook).toHaveBeenCalledTimes(3);
  });

  it("rollback of a later change preserves previous state/audit and unrelated role snapshots", async () => {
    let reject = false;
    const value = model({ failureHooks: { beforeCommit: () => { if (reject) throw new Error("failure"); } } });
    success(await value.save(ADMIN, request()));
    const before = value.getPolicy("farm_manager");
    const audits = value.getAudit();
    const other = value.getPolicy("accountant");
    reject = true;
    failure(await value.save(ADMIN, request({ expectedVersion: 1, grants: {} })), "COMMIT_FAILURE");
    expect(value.getPolicy("farm_manager")).toBe(before);
    expect(value.getAudit()).toBe(audits);
    expect(value.getPolicy("accountant")).toBe(other);
    reject = false;
    expect(success(await value.save(ADMIN, request({ expectedVersion: 1, grants: {} }))).policy.version).toBe(2);
  });

  it("a failed first-save race releases queue and allows the other attempt without consuming version", async () => {
    let calls = 0;
    const value = model({ failureHooks: { beforeCommit: () => { calls += 1; if (calls === 1) throw new Error("fail once"); } } });
    const results = await Promise.all([value.save(ADMIN, request()), value.save(ADMIN, request())]);
    failure(results[0], "COMMIT_FAILURE");
    expect(success(results[1]).policy.version).toBe(1);
    expect(value.getAudit()).toHaveLength(1);
  });

  it.each([0, -1, 1.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1794648000123", undefined])(
    "rejects invalid server clock %s and leaves state untouched", async clockValue => {
      const value = model({ clock: () => clockValue as number });
      failure(await value.save(ADMIN, request()), "INVALID_CLOCK");
      pristine(value);
    });

  it("sanitizes throwing server clock and retries at the same version", async () => {
    let broken = true;
    const value = model({ clock: () => { if (broken) throw new Error("raw secret clock failure"); return UTC_MS; } });
    failure(await value.save(ADMIN, request()), "INVALID_CLOCK");
    pristine(value);
    broken = false;
    expect(success(await value.save(ADMIN, request())).policy.version).toBe(1);
  });

  it("monotonic versions, not wall-clock order, order audit; clock may repeat/go backwards", async () => {
    const times = [UTC_MS, UTC_MS, UTC_MS - 1000];
    const value = model({ clock: () => times.shift()! });
    success(await value.save(ADMIN, request()));
    success(await value.save(ADMIN, request({ expectedVersion: 1, grants: {} })));
    success(await value.save(ADMIN, request({ expectedVersion: 2 })));
    expect(value.getAudit().map(item => item.utcMs)).toEqual([UTC_MS, UTC_MS, UTC_MS - 1000]);
    expect(value.getAudit().map(item => item.after.version)).toEqual([1, 2, 3]);
    expect(value.getAudit().map(item => item.before.version)).toEqual([0, 1, 2]);
  });

  it("rejects changed save at SQL INT max version without clock/hooks/audit; validates no-op normally", async () => {
    const clock = vi.fn(() => UTC_MS);
    const hook = vi.fn();
    const value = model({ clock, failureHooks: { beforeCommit: hook }, initialPolicies: [{
      scope: SUPPLIER_POLICY_SCOPE, version: SUPPLIER_POLICY_MAX_VERSION,
      policy: { catalogueRevision: REVISION, role: "farm_manager", grants: { [KEY]: false } },
    }] });
    failure(await value.save(ADMIN, request({ expectedVersion: SUPPLIER_POLICY_MAX_VERSION, grants: {} })), "VERSION_OVERFLOW");
    expect(success(await value.save(ADMIN, request({ expectedVersion: SUPPLIER_POLICY_MAX_VERSION }))).changed).toBe(false);
    failure(await value.save(ADMIN, request({ expectedVersion: SUPPLIER_POLICY_MAX_VERSION - 1 })), "STALE_VERSION");
    expect(value.getPolicy("farm_manager").version).toBe(SUPPLIER_POLICY_MAX_VERSION);
    expect(value.getAudit()).toHaveLength(0);
    expect(clock).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
  });

  it("permits the final increment to INT max then refuses overflow without consuming another audit", async () => {
    const value = model({ initialPolicies: [{ scope: SUPPLIER_POLICY_SCOPE,
      version: SUPPLIER_POLICY_MAX_VERSION - 1,
      policy: { catalogueRevision: REVISION, role: "farm_manager", grants: {} } }] });
    const saved = success(await value.save(ADMIN, request({ expectedVersion: SUPPLIER_POLICY_MAX_VERSION - 1 })));
    expect(saved.policy.version).toBe(SUPPLIER_POLICY_MAX_VERSION);
    expect(saved.audit!.before.version).toBe(SUPPLIER_POLICY_MAX_VERSION - 1);
    failure(await value.save(ADMIN, request({ expectedVersion: SUPPLIER_POLICY_MAX_VERSION, grants: {} })), "VERSION_OVERFLOW");
    expect(value.getAudit()).toHaveLength(1);
  });

  it.each(["module1-source-old-v1", "other"])("rejects catalogue revision mismatch %s, including no-op", async catalogueRevision => {
    const value = model();
    failure(await value.save(ADMIN, request({ catalogueRevision, grants: {} })), "CATALOGUE_MISMATCH");
    pristine(value);
  });

  it.each(["", " padded ", "x".repeat(161), "bad\nrevision", null])("rejects malformed revision %s", async catalogueRevision => {
    const value = model();
    failure(await value.save(ADMIN, request({ catalogueRevision })), "INVALID_REQUEST");
    pristine(value);
  });

  it.each([
    ["action", "Export"], ["module", "Other"], ["resource", "Other records"],
    ["support", "review_required"], ["support", "not_implemented"], ["support", "outside_scope"],
    ["control", "fixed_sensitive"], ["control", "fixed_system"], ["ordinaryDeleteDelegation", true],
  ] as [string, unknown][])("rejects trusted source key with inappropriate %s=%s metadata", (field, replacement) => {
    const source = catalogue();
    const entry = source.capabilities.find(item => item.key === KEY)!;
    (entry as unknown as Record<string, unknown>)[field] = replacement;
    expect(() => model({ catalogue: source })).toThrowError("INVALID_CATALOGUE");
  });

  it.each(["admin", ...SUPPLIER_POLICY_ROLES])("rejects baseline drift away from preserved true for %s", role => {
    const source = catalogue();
    const entry = source.capabilities[0];
    entry.baseline[role as PermissionRole].allowed = false;
    expect(() => model({ catalogue: source })).toThrowError("INVALID_CATALOGUE");
  });

  it("requires complete five-key source mapping, valid full catalogue, supported Delete delegation", () => {
    const missing = catalogue(); missing.capabilities.pop();
    expect(() => model({ catalogue: missing })).toThrowError("INVALID_CATALOGUE");
    const duplicate = catalogue(); duplicate.capabilities.push(duplicate.capabilities[0]);
    expect(() => model({ catalogue: duplicate })).toThrowError("INVALID_CATALOGUE");
    const unmappedDelete = catalogue();
    unmappedDelete.capabilities.find(item => item.action === "Delete")!.ordinaryDeleteDelegation = false;
    expect(() => model({ catalogue: unmappedDelete })).toThrowError("INVALID_CATALOGUE");
    const invalidOutside = catalogue();
    invalidOutside.capabilities.push({ ...invalidOutside.capabilities[0], key: "other.records.create.invalid", action: "Wrong" as never });
    expect(() => model({ catalogue: invalidOutside })).toThrowError("INVALID_CATALOGUE");
    const sparse = catalogue(); delete sparse.capabilities[0];
    expect(() => model({ catalogue: sparse })).toThrowError("INVALID_CATALOGUE");
    const oversized = catalogue(); oversized.capabilities = Array(2049);
    expect(() => model({ catalogue: oversized })).toThrowError("INVALID_CATALOGUE");
    const throwing = new Proxy(catalogue(), { ownKeys: () => { throw new Error("raw catalogue secret"); } });
    try { model({ catalogue: throwing }); throw new Error("expected failure"); }
    catch (error) { expect(error).toBeInstanceOf(SupplierPolicyModelError); expect((error as SupplierPolicyModelError).code).toBe("INVALID_CATALOGUE"); }
  });

  it("catalogue caller mutation after construction never changes trusted defaults/revision/guards", async () => {
    const source = catalogue();
    const value = model({ catalogue: source });
    source.revision = "spoofed";
    source.capabilities[0].baseline.farm_manager.allowed = false;
    source.capabilities[0].residualGuards.push("spoofed guard");
    source.capabilities.length = 0;
    expect(value.evaluate(principal(), KEY)).toMatchObject({ status: "allow", reason: "BASELINE_ALLOW" });
    expect(value.getPolicy("farm_manager").policy.catalogueRevision).toBe(REVISION);
    expect(success(await value.save(ADMIN, request())).policy.version).toBe(1);
  });

  it("copies request/principal immediately and freezes returned snapshots/audits/hook staging", async () => {
    let stagedAudit!: SupplierPolicyAudit;
    const hooks: SupplierPolicyFailureHooks = { beforeCommit: change => {
      expect(Object.isFrozen(change)).toBe(true);
      expect(Object.isFrozen(change.policy)).toBe(true);
      expect(Object.isFrozen(change.policy.policy)).toBe(true);
      expect(Object.isFrozen(change.audit)).toBe(true);
      stagedAudit = change.audit;
      expect(() => { (change.policy.policy.grants as Record<string, boolean>)[KEY] = true; }).toThrow();
    } };
    const value = model({ failureHooks: hooks });
    const grants: Record<string, boolean> = { [KEY]: false };
    const actor: { authenticated: boolean; active: boolean; role: string; actorId: number } = { ...ADMIN };
    const draft = request({ grants });
    const operation = value.save(actor, draft);
    actor.actorId = 999;
    draft.reason = "changed caller reason";
    draft.role = "accountant";
    grants[KEY] = true;
    const result = success(await operation);
    expect(result.audit!.actorId).toBe(42);
    expect(result.audit!.reason).toBe("Delegation review");
    expect(result.audit!.targetRole).toBe("farm_manager");
    expect(result.policy.policy.grants[KEY]).toBe(false);
    expect(result.audit).toBe(stagedAudit);
    for (const object of [result, result.policy, result.policy.policy, result.policy.policy.grants,
      result.audit!, result.audit!.before, result.audit!.after, result.audit!.before.grants,
      result.audit!.after.grants, result.audit!.before.effectiveGrants, result.audit!.after.effectiveGrants, value.getAudit()]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(() => { (result.audit!.before.effectiveGrants as Record<string, boolean>)[KEY] = false; }).toThrow();
    expect(() => { (value.getAudit() as SupplierPolicyAudit[]).push(result.audit!); }).toThrow();
    const decision = value.evaluate(principal(), KEY);
    decision.residualGuards.push("caller mutation");
    expect(value.evaluate(principal(), KEY).residualGuards).not.toContain("caller mutation");
    const oldAudits = value.getAudit();
    const oldPolicy = value.getPolicy("farm_manager");
    success(await value.save(ADMIN, request({ expectedVersion: 1, grants: {} })));
    expect(oldAudits).toHaveLength(1);
    expect(oldPolicy.version).toBe(1);
    expect(oldPolicy.policy.grants[KEY]).toBe(false);
    expect(value.getAudit()).toHaveLength(2);
  });

  it("trusted seed configuration validates roles/version/scope/revision/grants and isolates input", () => {
    const seed = { scope: SUPPLIER_POLICY_SCOPE, version: 10,
      policy: { catalogueRevision: REVISION, role: "farm_manager" as const, grants: { [KEY]: false } } };
    const value = model({ initialPolicies: [seed] });
    seed.policy.grants[KEY] = true;
    seed.version = 20;
    expect(value.getPolicy("farm_manager").version).toBe(10);
    expect(value.getPolicy("farm_manager").policy.grants[KEY]).toBe(false);
    expect(value.getAudit()).toHaveLength(0);
    for (const invalid of [
      { ...seed, version: -1 }, { ...seed, version: 0 }, { ...seed, version: SUPPLIER_POLICY_MAX_VERSION + 1 },
      { ...seed, scope: "other" }, { ...seed, policy: { ...seed.policy, role: "admin" } },
      { ...seed, policy: { ...seed.policy, catalogueRevision: "stale" } },
      { ...seed, policy: { ...seed.policy, grants: { export: true } } },
    ]) expect(() => model({ initialPolicies: [invalid as never] })).toThrowError("INVALID_CONFIGURATION");
    expect(() => model({ initialPolicies: [seed, seed] })).toThrowError("INVALID_CONFIGURATION");
    expect(() => model({ clock: undefined as never })).toThrowError("INVALID_CONFIGURATION");
    expect(() => model({ failureHooks: { beforeCommit: "invalid" as never } })).toThrowError("INVALID_CONFIGURATION");
  });

  it("returns only structured fixed errors and emits no raw payload/exception logs", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    try {
      const value = model({ failureHooks: { beforeCommit: () => { throw new Error("RAW_SECRET"); } } });
      failure(await value.save(ADMIN, request({ reason: "RAW_SECRET\n" })), "INVALID_REASON");
      failure(await value.save(ADMIN, request()), "COMMIT_FAILURE");
      failure(await value.save(ADMIN, new Proxy({}, { ownKeys: () => { throw new Error("RAW_SECRET"); } })), "INVALID_REQUEST");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      pristine(value);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });
});

describe("Independent review P1 — fixed-code classification of hostile thrown values", () => {
  const thrownValues: [string, () => unknown][] = [
    ["primitive text", () => "RAW_PRIVATE_CANARY"],
    ["null", () => null],
    ["symbol", () => Symbol("RAW_PRIVATE_CANARY")],
    ["revoked proxy", () => { const value = Proxy.revocable({}, {}); value.revoke(); return value.proxy; }],
    ["throwing prototype proxy", () => new Proxy({}, { getPrototypeOf() { throw Error("RAW_PRIVATE_CANARY"); } })],
    ["forged error prototype with raw code", () => Object.assign(Object.create(SupplierPolicyModelError.prototype), { code: "RAW_PRIVATE_CANARY" })],
    ["forged error prototype with throwing code getter", () => Object.defineProperty(Object.create(SupplierPolicyModelError.prototype), "code", { get() { throw Error("RAW_PRIVATE_CANARY"); } })],
    ["external instance with plausible fixed code", () => new SupplierPolicyModelError("COMMIT_FAILURE")],
  ];
  for (const [label, factory] of thrownValues) {
    it(`returns fixed failures without state change for ${label}`, async () => {
      const value = model(); const thrown = factory();
      const actor = new Proxy({ ...ADMIN }, { ownKeys() { throw thrown; } });
      const draft = new Proxy(request(), { ownKeys() { throw thrown; } });
      const grants = new Proxy({}, { ownKeys() { throw thrown; } });
      // save must resolve a fixed result, not throw synchronously or reject the promise.
      failure(await value.save(actor, request()), "INVALID_PRINCIPAL");
      expect(value.evaluate(actor, KEY)).toMatchObject({ status: "deny", reason: "INVALID_PRINCIPAL" });
      failure(await value.save(ADMIN, draft), "INVALID_REQUEST");
      failure(await value.save(ADMIN, request({ grants })), "INVALID_REQUEST");
      pristine(value);
    });
  }
  it("never reads a forged code getter while sanitizing failures", async () => {
    const getter = vi.fn(() => "RAW_PRIVATE_CANARY");
    const thrown = Object.defineProperty(Object.create(SupplierPolicyModelError.prototype), "code", { enumerable: true, get: getter });
    const hostile = new Proxy({ ...ADMIN }, { getPrototypeOf() { throw thrown; } });
    const value = model();
    failure(await value.save(hostile, request()), "INVALID_PRINCIPAL");
    expect(value.evaluate(hostile, KEY).roleGatePassed).toBe(false);
    expect(getter).not.toHaveBeenCalled(); pristine(value);
  });
});
