/**
 * PREPARATION ONLY — reference model, never a production repository or live gate.
 * No network, DB, schema, credentials, route, UI, filesystem or clock globals.
 *
 * API:
 *   new SupplierPermissionPolicyModel({ catalogue, clock, failureHooks?, initialPolicies? })
 *   save(trustedPrincipal: unknown, request: unknown): Promise<SupplierPolicySaveResult>
 *   getPolicy(role: unknown): SupplierPersistedPolicy
 *   getAudit(): readonly SupplierPolicyAudit[]
 *   evaluate(trustedPrincipal: unknown, key: unknown): PermissionDecision
 *
 * Principal comes ONLY from a future trusted adapter: authenticated/active/exact
 * stored role/positive safe actorId (audit actorId is the AdminId). Request fields
 * are exactly role, catalogueRevision, expectedVersion, grants, reason. Grants
 * replace the entire sparse draft; omission resets to the source baseline.
 * Scope/version wrap policy; ONLY wrapper.policy is given to Module 1 evaluators.
 *
 * catalogue, injected UTC-ms clock, optional non-reentrant failure hooks and seed
 * policies are trusted test/design configuration, never request input. Seeds are
 * solely for reference restart/overflow examples; normal construction starts all
 * five roles at version 0 with empty grants and no audit. No Admin policy exists.
 * Failures return fixed codes without raw payloads, exception text or logging.
 *
 * Atomicity/concurrency here mean one JS instance's serialized, in-memory state
 * pointer publication. They establish NOTHING about MySQL transactions, multiple
 * instances/processes, crash durability, deployment or real authorization. Hooks
 * run before publication; hooks must not await a reentrant save on this instance.
 * Frozen copies isolate callers; TypeScript private fields are not a security
 * boundary against arbitrary code/reflection. Reflection traps are caught, but
 * JS cannot detect all transparent Proxies or prevent their trap side effects.
 * Own-key enumeration itself cannot be made resource-bounded for arbitrary Proxy
 * code; accepted data traversal is bounded and accessors are never invoked.
 * Version (not time) orders changes; valid clock values may repeat or go backward.
 * A role-gate Allow never bypasses original ownership/state/stock/period guards.
 */
import { evaluatePermission, validateCatalogue, validatePolicy } from "./role-permission-engine";
import type { PermissionCatalogue, PermissionDecision, PermissionPolicy, PermissionRole } from "./role-permission-types";

export const SUPPLIER_POLICY_SCOPE = "supplier_management" as const;
export const SUPPLIER_POLICY_MAX_VERSION = 2147483647;
export const SUPPLIER_PERMISSION_KEYS = Object.freeze([
  "suppliers.records.view.list",
  "suppliers.records.view.getbyid",
  "suppliers.records.create.create",
  "suppliers.records.edit.update",
  "suppliers.records.delete.delete",
] as const);
export const SUPPLIER_POLICY_ROLES = Object.freeze([
  "farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator",
] as const);
export type SupplierPolicyRole = (typeof SUPPLIER_POLICY_ROLES)[number];
export type SupplierPermissionKey = (typeof SUPPLIER_PERMISSION_KEYS)[number];
export type SupplierGrants = Readonly<Partial<Record<SupplierPermissionKey, boolean>>>;
export interface SupplierPolicyPrincipal {
  readonly authenticated: boolean;
  readonly active: boolean;
  readonly role: PermissionRole;
  readonly actorId: number;
}
export interface SupplierPolicySaveRequest {
  readonly role: SupplierPolicyRole;
  readonly catalogueRevision: string;
  readonly expectedVersion: number;
  readonly grants: SupplierGrants;
  readonly reason: string;
}
export interface SupplierPersistedPolicy {
  readonly scope: typeof SUPPLIER_POLICY_SCOPE;
  readonly version: number;
  readonly policy: Readonly<PermissionPolicy>;
}
export interface SupplierPolicyAuditSnapshot {
  readonly version: number;
  readonly grants: SupplierGrants;
  readonly effectiveGrants: Readonly<Record<SupplierPermissionKey, boolean>>;
}
export interface SupplierPolicyAudit {
  readonly actorId: number;
  readonly actorRole: "admin";
  readonly targetRole: SupplierPolicyRole;
  readonly scope: typeof SUPPLIER_POLICY_SCOPE;
  readonly catalogueRevision: string;
  readonly before: SupplierPolicyAuditSnapshot;
  readonly after: SupplierPolicyAuditSnapshot;
  readonly reason: string;
  readonly utcMs: number;
}
export type SupplierPolicyErrorCode =
  | "INVALID_CATALOGUE" | "INVALID_CONFIGURATION" | "INVALID_PRINCIPAL"
  | "UNAUTHENTICATED" | "INACTIVE_PRINCIPAL" | "UNKNOWN_ROLE" | "ADMIN_REQUIRED"
  | "ADMIN_POLICY_FORBIDDEN" | "INVALID_REQUEST" | "INVALID_GRANTS" | "INVALID_REASON"
  | "INVALID_VERSION" | "CATALOGUE_MISMATCH" | "STALE_VERSION" | "VERSION_OVERFLOW"
  | "INVALID_CLOCK" | "POLICY_FAILURE" | "AUDIT_FAILURE" | "COMMIT_FAILURE";
export interface SupplierPolicyError { readonly code: SupplierPolicyErrorCode }
export type SupplierPolicySaveResult =
  | { readonly ok: false; readonly error: SupplierPolicyError }
  | { readonly ok: true; readonly changed: boolean; readonly reason: string;
      readonly policy: SupplierPersistedPolicy; readonly audit?: SupplierPolicyAudit };
export interface SupplierPolicyStagedChange {
  readonly policy: SupplierPersistedPolicy;
  readonly audit: SupplierPolicyAudit;
}
export interface SupplierPolicyFailureHooks {
  readonly beforePolicyPublish?: (change: SupplierPolicyStagedChange) => void | Promise<void>;
  readonly beforeAuditPublish?: (change: SupplierPolicyStagedChange) => void | Promise<void>;
  readonly beforeCommit?: (change: SupplierPolicyStagedChange) => void | Promise<void>;
}
export interface SupplierPolicyModelOptions {
  readonly catalogue: unknown;
  /** Injected by trusted server/test code; a positive safe integer in UTC milliseconds. */
  readonly clock: () => number;
  readonly failureHooks?: SupplierPolicyFailureHooks;
  /** Trusted design/test seeds only; no request-based restoration API. */
  readonly initialPolicies?: readonly SupplierPersistedPolicy[];
}
export class SupplierPolicyModelError extends Error {
  readonly code: SupplierPolicyErrorCode;
  constructor(code: SupplierPolicyErrorCode) {
    super(code);
    this.name = "SupplierPolicyModelError";
    this.code = code;
  }
}

type Fields = Map<string, unknown>;
const REQUEST_FIELDS = ["role", "catalogueRevision", "expectedVersion", "grants", "reason"];
const PRINCIPAL_FIELDS = ["authenticated", "active", "role", "actorId"];
const SORTED_KEYS = Object.freeze(Array.from(SUPPLIER_PERMISSION_KEYS).sort());
const PROTOTYPE_FIELDS = ["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty",
  "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString",
  "valueOf", "__proto__", "toLocaleString"];

// Object identity only: never inspect prototype/code properties of arbitrary thrown values.
const INTERNAL_ERRORS = new WeakMap<object, SupplierPolicyErrorCode>();
function fail(code: SupplierPolicyErrorCode): never {
  const error = new SupplierPolicyModelError(code);
  INTERNAL_ERRORS.set(error, code);
  throw error;
}
function errorResult(code: SupplierPolicyErrorCode): SupplierPolicySaveResult {
  return Object.freeze({ ok: false as const, error: Object.freeze({ code }) });
}
function safePrototype(): boolean {
  if (Object.getPrototypeOf(Object.prototype) !== null) return false;
  return Reflect.ownKeys(Object.prototype).every(key => {
    if (typeof key !== "string" || PROTOTYPE_FIELDS.indexOf(key) === -1) return false;
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
    return !!descriptor && !descriptor.enumerable && (key === "__proto__"
      || ("value" in descriptor && typeof descriptor.value === "function"));
  });
}
/** Bounded own descriptors only, accepting local plain or null-prototype records. */
function record(input: unknown, expected: readonly string[] | undefined,
  maxFields: number, code: SupplierPolicyErrorCode): Fields {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail(code);
  const proto = Object.getPrototypeOf(input);
  if ((proto !== Object.prototype && proto !== null) || !safePrototype()) fail(code);
  const keys = Reflect.ownKeys(input);
  if (keys.length > maxFields || (expected && keys.length !== expected.length)) fail(code);
  const fields = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== "string" || key.length > 160 || key === "__proto__"
      || key === "constructor" || key === "prototype"
      || (expected && expected.indexOf(key) === -1)) fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail(code);
    fields.set(key, descriptor.value);
  }
  if (expected && !expected.every(key => fields.has(key))) fail(code);
  return fields;
}
function nonAdminRole(value: unknown): value is SupplierPolicyRole {
  return typeof value === "string" && SUPPLIER_POLICY_ROLES.some(role => value === role);
}
function roleOrFail(value: unknown): SupplierPolicyRole {
  if (value === "admin") fail("ADMIN_POLICY_FORBIDDEN");
  if (!nonAdminRole(value)) fail("UNKNOWN_ROLE");
  return value;
}
function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= SUPPLIER_POLICY_MAX_VERSION;
}
function grantsFrom(input: unknown): Record<string, boolean> {
  const fields = record(input, undefined, 5, "INVALID_GRANTS");
  const grants = Object.create(null) as Record<string, boolean>;
  for (const key of SORTED_KEYS) {
    if (fields.has(key)) {
      const value = fields.get(key);
      if (typeof value !== "boolean") fail("INVALID_GRANTS");
      grants[key] = value;
    }
  }
  if (Object.keys(grants).length !== fields.size) fail("INVALID_GRANTS");
  return Object.freeze(grants);
}
function principalFrom(input: unknown): SupplierPolicyPrincipal {
  const fields = record(input, PRINCIPAL_FIELDS, 4, "INVALID_PRINCIPAL");
  const authenticated = fields.get("authenticated");
  const active = fields.get("active");
  const role = fields.get("role");
  const actorId = fields.get("actorId");
  if (typeof authenticated !== "boolean" || typeof active !== "boolean"
    || typeof role !== "string" || typeof actorId !== "number"
    || !Number.isSafeInteger(actorId) || actorId <= 0) fail("INVALID_PRINCIPAL");
  if (!authenticated) fail("UNAUTHENTICATED");
  if (!active) fail("INACTIVE_PRINCIPAL");
  if (role !== "admin" && !nonAdminRole(role)) fail("UNKNOWN_ROLE");
  return Object.freeze({ authenticated, active, role: role as PermissionRole, actorId });
}
function codeOf(error: unknown, fallback: SupplierPolicyErrorCode): SupplierPolicyErrorCode {
  return ((typeof error === "object" && error !== null) || typeof error === "function")
    ? INTERNAL_ERRORS.get(error as object) ?? fallback
    : fallback;
}
function requestFrom(input: unknown): SupplierPolicySaveRequest {
  const fields = record(input, REQUEST_FIELDS, 5, "INVALID_REQUEST");
  const role = roleOrFail(fields.get("role"));
  const catalogueRevision = fields.get("catalogueRevision");
  const expectedVersion = fields.get("expectedVersion");
  const rawReason = fields.get("reason");
  if (typeof catalogueRevision !== "string" || catalogueRevision.length === 0
    || catalogueRevision.length > 160 || catalogueRevision !== catalogueRevision.trim()
    || /[\u0000-\u001f\u007f-\u009f]/.test(catalogueRevision)) fail("INVALID_REQUEST");
  if (!validVersion(expectedVersion)) fail("INVALID_VERSION");
  if (typeof rawReason !== "string" || rawReason.length > 4096
    || /[\u0000-\u001f\u007f-\u009f]/.test(rawReason)) fail("INVALID_REASON");
  const reason = rawReason.trim();
  if (reason.length === 0 || reason.length > 500) fail("INVALID_REASON");
  return Object.freeze({ role, catalogueRevision, expectedVersion, grants: grantsFrom(fields.get("grants")), reason });
}

/** Bounded descriptor snapshot of trusted catalogue/configuration; never JSON stringify input. */
function copyTrusted(input: unknown, budget: { remaining: number }, depth = 0): unknown {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 12) fail("INVALID_CATALOGUE");
  if (input === null || typeof input === "boolean" || typeof input === "number") return input;
  if (typeof input === "string") {
    if (input.length > 10000) fail("INVALID_CATALOGUE");
    return input;
  }
  if (Array.isArray(input)) {
    if (Object.getPrototypeOf(input) !== Array.prototype) fail("INVALID_CATALOGUE");
    const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
    const keys = Reflect.ownKeys(input);
    if (!Number.isSafeInteger(length) || length < 0 || length > 2048
      || keys.length !== length + 1) fail("INVALID_CATALOGUE");
    const out: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("INVALID_CATALOGUE");
      out.push(copyTrusted(descriptor.value, budget, depth + 1));
    }
    return Object.freeze(out);
  }
  const fields = record(input, undefined, 16, "INVALID_CATALOGUE");
  const out = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Array.from(fields.entries())) out[key] = copyTrusted(value, budget, depth + 1);
  return Object.freeze(out);
}
function trustedCatalogue(input: unknown): PermissionCatalogue {
  const copy = copyTrusted(input, { remaining: 100000 });
  if (!validateCatalogue(copy).valid) fail("INVALID_CATALOGUE");
  const catalogue = copy as PermissionCatalogue;
  const actions = ["View", "View", "Create", "Edit", "Delete"];
  const capabilities = SUPPLIER_PERMISSION_KEYS.map((key, index) => {
    const capability = catalogue.capabilities.find(item => item.key === key);
    if (!capability || capability.module !== "Suppliers" || capability.resource !== "Supplier records"
      || capability.support !== "implemented" || capability.control !== "editable_ordinary"
      || capability.action !== actions[index] || capability.ordinaryDeleteDelegation !== (actions[index] === "Delete")
      || !(["admin", ...SUPPLIER_POLICY_ROLES] as PermissionRole[])
        .every(role => capability.baseline[role].allowed === true)) fail("INVALID_CATALOGUE");
    return capability;
  });
  // Validate all source entries above, but keep the evaluator's reference scope at exactly five.
  return Object.freeze({ revision: catalogue.revision, capabilities: Object.freeze(capabilities) }) as unknown as PermissionCatalogue;
}
function persisted(catalogue: PermissionCatalogue, role: SupplierPolicyRole,
  version: number, grants: Record<string, boolean>): SupplierPersistedPolicy {
  const policy = Object.freeze({ catalogueRevision: catalogue.revision, role, grants });
  if (!validatePolicy(catalogue, policy, role).valid) fail("INVALID_GRANTS");
  return Object.freeze({ scope: SUPPLIER_POLICY_SCOPE, version, policy });
}
function sameGrants(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}
interface ModelState {
  readonly policies: Map<SupplierPolicyRole, SupplierPersistedPolicy>;
  readonly audit: readonly SupplierPolicyAudit[];
}

export class SupplierPermissionPolicyModel {
  private readonly catalogue: PermissionCatalogue;
  private readonly clock: () => number;
  private readonly hooks: SupplierPolicyFailureHooks;
  private state: ModelState;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: SupplierPolicyModelOptions) {
    try {
      this.catalogue = trustedCatalogue(options.catalogue);
    } catch { fail("INVALID_CATALOGUE"); }
    if (typeof options.clock !== "function") fail("INVALID_CONFIGURATION");
    this.clock = options.clock;
    const hooks = options.failureHooks;
    this.hooks = Object.freeze({ beforePolicyPublish: hooks?.beforePolicyPublish,
      beforeAuditPublish: hooks?.beforeAuditPublish, beforeCommit: hooks?.beforeCommit });
    if (Object.values(this.hooks).some(value => value !== undefined && typeof value !== "function")) fail("INVALID_CONFIGURATION");
    const policies = new Map<SupplierPolicyRole, SupplierPersistedPolicy>();
    for (const role of SUPPLIER_POLICY_ROLES) policies.set(role, persisted(this.catalogue, role, 0, grantsFrom({})));
    if (options.initialPolicies !== undefined) {
      try {
        // Reuse bounded data copy; configuration seeds are still independently validated.
        const seeds = copyTrusted(options.initialPolicies, { remaining: 1000 });
        if (!Array.isArray(seeds) || seeds.length > 5) fail("INVALID_CONFIGURATION");
        const seen = new Set<string>();
        for (const seed of seeds) {
          const fields = record(seed, ["scope", "version", "policy"], 3, "INVALID_CONFIGURATION");
          const draft = record(fields.get("policy"), ["role", "catalogueRevision", "grants"], 3, "INVALID_CONFIGURATION");
          const role = roleOrFail(draft.get("role"));
          const version = fields.get("version");
          if (seen.has(role) || fields.get("scope") !== SUPPLIER_POLICY_SCOPE || !validVersion(version)
            || draft.get("catalogueRevision") !== this.catalogue.revision) fail("INVALID_CONFIGURATION");
          const grants = grantsFrom(draft.get("grants"));
          if (version === 0 && Object.keys(grants).length > 0) fail("INVALID_CONFIGURATION");
          seen.add(role);
          policies.set(role, persisted(this.catalogue, role, version, grants));
        }
      } catch { fail("INVALID_CONFIGURATION"); }
    }
    this.state = Object.freeze({ policies, audit: Object.freeze([] as SupplierPolicyAudit[]) });
  }

  /** Frozen reference snapshots; audit and nested grants/effective records are frozen. */
  getPolicy(role: unknown): SupplierPersistedPolicy { return this.state.policies.get(roleOrFail(role))!; }
  getAudit(): readonly SupplierPolicyAudit[] { return this.state.audit; }

  /** Exact pilot role-gate evaluation only; trusted actor identity is validated even for Admin. */
  evaluate(input: unknown, key: unknown): PermissionDecision {
    let principal: SupplierPolicyPrincipal;
    try { principal = principalFrom(input); }
    catch (error) { return { capabilityKey: typeof key === "string" ? key : "", status: "deny",
      reason: codeOf(error, "INVALID_PRINCIPAL"), roleGatePassed: false, residualGuards: [] }; }
    if (typeof key !== "string" || !SUPPLIER_PERMISSION_KEYS.some(item => item === key)) {
      return { capabilityKey: typeof key === "string" ? key : "", status: "deny", reason: "OUTSIDE_PILOT_SCOPE",
        roleGatePassed: false, residualGuards: [] };
    }
    const evaluatorPrincipal = { authenticated: principal.authenticated, active: principal.active, role: principal.role };
    return evaluatePermission(this.catalogue, evaluatorPrincipal, key,
      principal.role === "admin" ? undefined : this.getPolicy(principal.role).policy);
  }

  /** Parse/copy immediately, then serialize version check and all publication within one instance. */
  save(input: unknown, request: unknown): Promise<SupplierPolicySaveResult> {
    let principal: SupplierPolicyPrincipal;
    let draft: SupplierPolicySaveRequest;
    try {
      principal = principalFrom(input);
      if (principal.role !== "admin") fail("ADMIN_REQUIRED");
    } catch (error) { return Promise.resolve(errorResult(codeOf(error, "INVALID_PRINCIPAL"))); }
    try { draft = requestFrom(request); }
    catch (error) { return Promise.resolve(errorResult(codeOf(error, "INVALID_REQUEST"))); }
    const operation = this.tail.then(() => this.saveCritical(principal, draft));
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private snapshot(value: SupplierPersistedPolicy): SupplierPolicyAuditSnapshot {
    const effective = Object.create(null) as Record<SupplierPermissionKey, boolean>;
    for (const key of SORTED_KEYS) {
      const decision = evaluatePermission(this.catalogue,
        { authenticated: true, active: true, role: value.policy.role }, key, value.policy);
      effective[key] = decision.roleGatePassed;
    }
    return Object.freeze({ version: value.version, grants: value.policy.grants, effectiveGrants: Object.freeze(effective) });
  }

  private async saveCritical(principal: SupplierPolicyPrincipal,
    draft: SupplierPolicySaveRequest): Promise<SupplierPolicySaveResult> {
    if (draft.catalogueRevision !== this.catalogue.revision) return errorResult("CATALOGUE_MISMATCH");
    const before = this.getPolicy(draft.role);
    if (draft.expectedVersion !== before.version) return errorResult("STALE_VERSION");
    const policy = { catalogueRevision: draft.catalogueRevision, role: draft.role, grants: draft.grants };
    if (!validatePolicy(this.catalogue, policy, draft.role).valid) return errorResult("INVALID_GRANTS");
    if (sameGrants(before.policy.grants, draft.grants)) {
      return Object.freeze({ ok: true as const, changed: false, reason: draft.reason, policy: before });
    }
    if (before.version === SUPPLIER_POLICY_MAX_VERSION) return errorResult("VERSION_OVERFLOW");
    let utcMs: number;
    try {
      utcMs = this.clock();
      if (typeof utcMs !== "number" || !Number.isSafeInteger(utcMs) || utcMs <= 0) return errorResult("INVALID_CLOCK");
    } catch { return errorResult("INVALID_CLOCK"); }
    const after = persisted(this.catalogue, draft.role, before.version + 1, draft.grants);
    const audit: SupplierPolicyAudit = Object.freeze({ actorId: principal.actorId, actorRole: "admin",
      targetRole: draft.role, scope: SUPPLIER_POLICY_SCOPE, catalogueRevision: this.catalogue.revision,
      before: this.snapshot(before), after: this.snapshot(after), reason: draft.reason, utcMs });
    const staged = Object.freeze({ policy: after, audit });
    // Prepare a complete replacement state BEFORE hooks; no externally-visible intermediate write.
    const policies = new Map(Array.from(this.state.policies.entries()));
    policies.set(draft.role, after);
    const nextState: ModelState = Object.freeze({ policies, audit: Object.freeze([...this.state.audit, audit]) });
    try { await this.hooks.beforePolicyPublish?.(staged); } catch { return errorResult("POLICY_FAILURE"); }
    try { await this.hooks.beforeAuditPublish?.(staged); } catch { return errorResult("AUDIT_FAILURE"); }
    try { await this.hooks.beforeCommit?.(staged); } catch { return errorResult("COMMIT_FAILURE"); }
    this.state = nextState;
    return Object.freeze({ ok: true as const, changed: true, reason: draft.reason, policy: after, audit });
  }
}
