/** Scoped role policy model. Source-defined scope/catalogue only, never request-selected metadata.
 * Reuses bounded descriptor validation, fail-closed evaluation, immutable Admin,
 * sparse inheritance and atomic reference staging from the validated Supplier model.
 * SQL durability remains the repository responsibility. Supplier module is unchanged. */
import { evaluatePermission, validateCatalogue, validatePolicy } from "./role-permission-engine";
import type { PermissionCatalogue, PermissionDecision, PermissionPolicy, PermissionRole } from "./role-permission-types";

export const SCOPED_POLICY_MAX_VERSION = 2147483647;
export const SCOPED_POLICY_ROLES = Object.freeze([
  "farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator",
] as const);
export type ScopedPolicyRole = (typeof SCOPED_POLICY_ROLES)[number];
export type ScopedPermissionKey = string;
export type ScopedGrants = Readonly<Record<ScopedPermissionKey, boolean>>;
export interface ScopedPolicyPrincipal {
  readonly authenticated: boolean;
  readonly active: boolean;
  readonly role: PermissionRole;
  readonly actorId: number;
}
export interface ScopedPolicySaveRequest {
  readonly role: ScopedPolicyRole;
  readonly catalogueRevision: string;
  readonly expectedVersion: number;
  readonly grants: ScopedGrants;
  readonly reason: string;
}
export interface ScopedPersistedPolicy {
  readonly scope: string;
  readonly version: number;
  readonly policy: Readonly<PermissionPolicy>;
}
export interface ScopedPolicyAuditSnapshot {
  readonly version: number;
  readonly grants: ScopedGrants;
  readonly effectiveGrants: Readonly<Record<ScopedPermissionKey, boolean>>;
}
export interface ScopedPolicyAudit {
  readonly actorId: number;
  readonly actorRole: "admin";
  readonly targetRole: ScopedPolicyRole;
  readonly scope: string;
  readonly catalogueRevision: string;
  readonly before: ScopedPolicyAuditSnapshot;
  readonly after: ScopedPolicyAuditSnapshot;
  readonly reason: string;
  readonly utcMs: number;
}
export type ScopedPolicyErrorCode =
  | "INVALID_CATALOGUE" | "INVALID_CONFIGURATION" | "INVALID_PRINCIPAL"
  | "UNAUTHENTICATED" | "INACTIVE_PRINCIPAL" | "UNKNOWN_ROLE" | "ADMIN_REQUIRED"
  | "ADMIN_POLICY_FORBIDDEN" | "INVALID_REQUEST" | "INVALID_GRANTS" | "INVALID_REASON"
  | "INVALID_VERSION" | "CATALOGUE_MISMATCH" | "STALE_VERSION" | "VERSION_OVERFLOW"
  | "INVALID_CLOCK" | "POLICY_FAILURE" | "AUDIT_FAILURE" | "COMMIT_FAILURE";
export interface ScopedPolicyError { readonly code: ScopedPolicyErrorCode }
export type ScopedPolicySaveResult =
  | { readonly ok: false; readonly error: ScopedPolicyError }
  | { readonly ok: true; readonly changed: boolean; readonly reason: string;
      readonly policy: ScopedPersistedPolicy; readonly audit?: ScopedPolicyAudit };
export interface ScopedPolicyStagedChange {
  readonly policy: ScopedPersistedPolicy;
  readonly audit: ScopedPolicyAudit;
}
export interface ScopedPolicyFailureHooks {
  readonly beforePolicyPublish?: (change: ScopedPolicyStagedChange) => void | Promise<void>;
  readonly beforeAuditPublish?: (change: ScopedPolicyStagedChange) => void | Promise<void>;
  readonly beforeCommit?: (change: ScopedPolicyStagedChange) => void | Promise<void>;
}
export interface ScopedPolicyModelOptions {
  readonly catalogue: unknown;
  /** Injected by trusted server/test code; a positive safe integer in UTC milliseconds. */
  readonly clock: () => number;
  readonly failureHooks?: ScopedPolicyFailureHooks;
  /** Trusted design/test seeds only; no request-based restoration API. */
  readonly initialPolicies?: readonly ScopedPersistedPolicy[];
}
export class ScopedPolicyModelError extends Error {
  readonly code: ScopedPolicyErrorCode;
  constructor(code: ScopedPolicyErrorCode) {
    super(code);
    this.name = "ScopedPolicyModelError";
    this.code = code;
  }
}

export interface ScopedPermissionDefinition { readonly scope: string; readonly catalogue: PermissionCatalogue }
export function createScopedPermissionPolicyModel(definition: ScopedPermissionDefinition) {
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(definition.scope) || definition.scope === "supplier_management") throw new Error("INVALID_SCOPE_DEFINITION");
  const SCOPED_POLICY_SCOPE = definition.scope;
  const SCOPED_PERMISSION_KEYS = Object.freeze(definition.catalogue.capabilities.map(c => c.key));
  if (SCOPED_PERMISSION_KEYS.length < 1 || SCOPED_PERMISSION_KEYS.length > 32 || new Set(SCOPED_PERMISSION_KEYS).size !== SCOPED_PERMISSION_KEYS.length) throw new Error("INVALID_SCOPE_DEFINITION");
type Fields = Map<string, unknown>;
const REQUEST_FIELDS = ["role", "catalogueRevision", "expectedVersion", "grants", "reason"];
const PRINCIPAL_FIELDS = ["authenticated", "active", "role", "actorId"];
const SORTED_KEYS = Object.freeze(Array.from(SCOPED_PERMISSION_KEYS).sort());
const PROTOTYPE_FIELDS = ["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty",
  "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString",
  "valueOf", "__proto__", "toLocaleString"];

// Object identity only: never inspect prototype/code properties of arbitrary thrown values.
const INTERNAL_ERRORS = new WeakMap<object, ScopedPolicyErrorCode>();
function fail(code: ScopedPolicyErrorCode): never {
  const error = new ScopedPolicyModelError(code);
  INTERNAL_ERRORS.set(error, code);
  throw error;
}
function errorResult(code: ScopedPolicyErrorCode): ScopedPolicySaveResult {
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
  maxFields: number, code: ScopedPolicyErrorCode): Fields {
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
function nonAdminRole(value: unknown): value is ScopedPolicyRole {
  return typeof value === "string" && SCOPED_POLICY_ROLES.some(role => value === role);
}
function roleOrFail(value: unknown): ScopedPolicyRole {
  if (value === "admin") fail("ADMIN_POLICY_FORBIDDEN");
  if (!nonAdminRole(value)) fail("UNKNOWN_ROLE");
  return value;
}
function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= SCOPED_POLICY_MAX_VERSION;
}
function grantsFrom(input: unknown): Record<string, boolean> {
  const fields = record(input, undefined, SCOPED_PERMISSION_KEYS.length, "INVALID_GRANTS");
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
function principalFrom(input: unknown): ScopedPolicyPrincipal {
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
function codeOf(error: unknown, fallback: ScopedPolicyErrorCode): ScopedPolicyErrorCode {
  return ((typeof error === "object" && error !== null) || typeof error === "function")
    ? INTERNAL_ERRORS.get(error as object) ?? fallback
    : fallback;
}
function requestFrom(input: unknown): ScopedPolicySaveRequest {
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
  if (catalogue.revision !== definition.catalogue.revision || catalogue.capabilities.length !== SCOPED_PERMISSION_KEYS.length) fail("INVALID_CATALOGUE");
  const capabilities = SCOPED_PERMISSION_KEYS.map(key => {
    const capability = catalogue.capabilities.find(item => item.key === key);
    const expected = definition.catalogue.capabilities.find(item => item.key === key);
    if (!capability || !expected || capability.module !== expected.module || capability.resource !== expected.resource
      || capability.support !== "implemented" || capability.control !== "editable_ordinary"
      || capability.action !== expected.action || capability.ordinaryDeleteDelegation !== expected.ordinaryDeleteDelegation
      || !(["admin", ...SCOPED_POLICY_ROLES] as PermissionRole[]).every(role =>
        capability.baseline[role].allowed === expected.baseline[role].allowed)) fail("INVALID_CATALOGUE");
    return capability;
  });
  // Validate all source entries above, but keep the evaluator's reference scope at exactly five.
  return Object.freeze({ revision: catalogue.revision, capabilities: Object.freeze(capabilities) }) as unknown as PermissionCatalogue;
}
function persisted(catalogue: PermissionCatalogue, role: ScopedPolicyRole,
  version: number, grants: Record<string, boolean>): ScopedPersistedPolicy {
  const policy = Object.freeze({ catalogueRevision: catalogue.revision, role, grants });
  if (!validatePolicy(catalogue, policy, role).valid) fail("INVALID_GRANTS");
  return Object.freeze({ scope: SCOPED_POLICY_SCOPE, version, policy });
}
function sameGrants(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}
interface ModelState {
  readonly policies: Map<ScopedPolicyRole, ScopedPersistedPolicy>;
  readonly audit: readonly ScopedPolicyAudit[];
}

class ScopedPermissionPolicyModel {
  private readonly catalogue: PermissionCatalogue;
  private readonly clock: () => number;
  private readonly hooks: ScopedPolicyFailureHooks;
  private state: ModelState;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: ScopedPolicyModelOptions) {
    try {
      this.catalogue = trustedCatalogue(options.catalogue);
    } catch { fail("INVALID_CATALOGUE"); }
    if (typeof options.clock !== "function") fail("INVALID_CONFIGURATION");
    this.clock = options.clock;
    const hooks = options.failureHooks;
    this.hooks = Object.freeze({ beforePolicyPublish: hooks?.beforePolicyPublish,
      beforeAuditPublish: hooks?.beforeAuditPublish, beforeCommit: hooks?.beforeCommit });
    if (Object.values(this.hooks).some(value => value !== undefined && typeof value !== "function")) fail("INVALID_CONFIGURATION");
    const policies = new Map<ScopedPolicyRole, ScopedPersistedPolicy>();
    for (const role of SCOPED_POLICY_ROLES) policies.set(role, persisted(this.catalogue, role, 0, grantsFrom({})));
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
          if (seen.has(role) || fields.get("scope") !== SCOPED_POLICY_SCOPE || !validVersion(version)
            || draft.get("catalogueRevision") !== this.catalogue.revision) fail("INVALID_CONFIGURATION");
          const grants = grantsFrom(draft.get("grants"));
          if (version === 0 && Object.keys(grants).length > 0) fail("INVALID_CONFIGURATION");
          seen.add(role);
          policies.set(role, persisted(this.catalogue, role, version, grants));
        }
      } catch { fail("INVALID_CONFIGURATION"); }
    }
    this.state = Object.freeze({ policies, audit: Object.freeze([] as ScopedPolicyAudit[]) });
  }

  /** Frozen reference snapshots; audit and nested grants/effective records are frozen. */
  getPolicy(role: unknown): ScopedPersistedPolicy { return this.state.policies.get(roleOrFail(role))!; }
  getAudit(): readonly ScopedPolicyAudit[] { return this.state.audit; }

  /** Exact pilot role-gate evaluation only; trusted actor identity is validated even for Admin. */
  evaluate(input: unknown, key: unknown): PermissionDecision {
    let principal: ScopedPolicyPrincipal;
    try { principal = principalFrom(input); }
    catch (error) { return { capabilityKey: typeof key === "string" ? key : "", status: "deny",
      reason: codeOf(error, "INVALID_PRINCIPAL"), roleGatePassed: false, residualGuards: [] }; }
    if (typeof key !== "string" || !SCOPED_PERMISSION_KEYS.some(item => item === key)) {
      return { capabilityKey: typeof key === "string" ? key : "", status: "deny", reason: "OUTSIDE_PILOT_SCOPE",
        roleGatePassed: false, residualGuards: [] };
    }
    const evaluatorPrincipal = { authenticated: principal.authenticated, active: principal.active, role: principal.role };
    return evaluatePermission(this.catalogue, evaluatorPrincipal, key,
      principal.role === "admin" ? undefined : this.getPolicy(principal.role).policy);
  }

  /** Parse/copy immediately, then serialize version check and all publication within one instance. */
  save(input: unknown, request: unknown): Promise<ScopedPolicySaveResult> {
    let principal: ScopedPolicyPrincipal;
    let draft: ScopedPolicySaveRequest;
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

  private snapshot(value: ScopedPersistedPolicy): ScopedPolicyAuditSnapshot {
    const effective = Object.create(null) as Record<ScopedPermissionKey, boolean>;
    for (const key of SORTED_KEYS) {
      const decision = evaluatePermission(this.catalogue,
        { authenticated: true, active: true, role: value.policy.role }, key, value.policy);
      effective[key] = decision.roleGatePassed;
    }
    return Object.freeze({ version: value.version, grants: value.policy.grants, effectiveGrants: Object.freeze(effective) });
  }

  private async saveCritical(principal: ScopedPolicyPrincipal,
    draft: ScopedPolicySaveRequest): Promise<ScopedPolicySaveResult> {
    if (draft.catalogueRevision !== this.catalogue.revision) return errorResult("CATALOGUE_MISMATCH");
    const before = this.getPolicy(draft.role);
    if (draft.expectedVersion !== before.version) return errorResult("STALE_VERSION");
    const policy = { catalogueRevision: draft.catalogueRevision, role: draft.role, grants: draft.grants };
    if (!validatePolicy(this.catalogue, policy, draft.role).valid) return errorResult("INVALID_GRANTS");
    if (sameGrants(before.policy.grants, draft.grants)) {
      return Object.freeze({ ok: true as const, changed: false, reason: draft.reason, policy: before });
    }
    if (before.version === SCOPED_POLICY_MAX_VERSION) return errorResult("VERSION_OVERFLOW");
    let utcMs: number;
    try {
      utcMs = this.clock();
      if (typeof utcMs !== "number" || !Number.isSafeInteger(utcMs) || utcMs <= 0) return errorResult("INVALID_CLOCK");
    } catch { return errorResult("INVALID_CLOCK"); }
    const after = persisted(this.catalogue, draft.role, before.version + 1, draft.grants);
    const audit: ScopedPolicyAudit = Object.freeze({ actorId: principal.actorId, actorRole: "admin",
      targetRole: draft.role, scope: SCOPED_POLICY_SCOPE, catalogueRevision: this.catalogue.revision,
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

return ScopedPermissionPolicyModel;
}
