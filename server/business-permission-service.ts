import { createPool } from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import {
  BUSINESS_PERMISSION_DEFINITIONS, BUSINESS_PERMISSION_ROUTES, isBusinessScope,
} from "../shared/business-permission-definitions";
import type { BusinessPermissionDefinition, BusinessScope } from "../shared/business-permission-definitions";
import type {
  BusinessEditorErrorCode, BusinessEditorLoadResult, BusinessEditorSaveResult,
  BusinessEditorRole, BusinessEditorSnapshot, BusinessPolicySaveRequest,
} from "../shared/business-permission-editor-contract";
import {
  createScopedPermissionPolicyModel, SCOPED_POLICY_MAX_VERSION, SCOPED_POLICY_ROLES,
} from "../shared/scoped-permission-policy-model";
import type { ScopedPersistedPolicy, ScopedPolicyRole } from "../shared/scoped-permission-policy-model";
import { createScopedPermissionDb, scopedPermissionDbErrorCode } from "./scoped-permission-db";

/** Only primitive stored identity and scoped policy operations cross this boundary. */
export interface BusinessPermissionRepository {
  readonly resolveActor: (actorId: number) => unknown | Promise<unknown>;
  readonly readPolicy: (role: ScopedPolicyRole) => Promise<unknown>;
  /** The repository rechecks active Admin under its own transaction/lock. */
  readonly save: (actorId: number, request: unknown) => Promise<unknown>;
}
type ErrorCode = BusinessEditorErrorCode | "PERMISSION_DENIED";
const OWN_ERRORS = new WeakMap<object, ErrorCode>();
export function businessPermissionServiceErrorCode(error: unknown): ErrorCode | undefined {
  return ((typeof error === "object" && error !== null) || typeof error === "function")
    ? OWN_ERRORS.get(error as object) : undefined;
}
function fail(code: ErrorCode): never {
  const unavailable = code === "POLICY_UNAVAILABLE" || code === "SAVE_FAILED" || code === "COMMIT_OUTCOME_UNKNOWN";
  const error = new TRPCError({
    code: unavailable ? "INTERNAL_SERVER_ERROR" : code === "UNAUTHENTICATED" ? "UNAUTHORIZED" : "FORBIDDEN",
    message: unavailable ? "Business permissions are unavailable. Please try again."
      : "Your role does not allow this business action.",
  });
  OWN_ERRORS.set(error, code);
  throw error;
}
function resultFailure(error: unknown, fallback: BusinessEditorErrorCode) {
  const code = businessPermissionServiceErrorCode(error);
  return Object.freeze({ ok: false as const, code: code && code !== "PERMISSION_DENIED" ? code : fallback });
}
/** Own enumerable data descriptors only. Proxy reflection traps can throw; they cannot be sandboxed by JS. */
function fields(input: unknown, allowed: readonly string[] | undefined, max: number, exact = true): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("INVALID_INPUT");
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) fail("INVALID_INPUT");
  const keys = Reflect.ownKeys(input);
  if (keys.length > max || (exact && allowed && keys.length !== allowed.length)) fail("INVALID_INPUT");
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string" || key.length > 160 || ["__proto__", "constructor", "prototype"].includes(key)
      || (allowed && !allowed.includes(key))) fail("INVALID_INPUT");
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("INVALID_INPUT");
    out[key] = descriptor.value;
  }
  if (exact && allowed && !allowed.every(key => Object.hasOwn(out, key))) fail("INVALID_INPUT");
  return out;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) fail("INVALID_INPUT");
  const length: unknown = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 1 || length > 32
    || Reflect.ownKeys(input).length !== length + 1) fail("INVALID_INPUT");
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("INVALID_INPUT");
    out.push(descriptor.value);
  }
  return out;
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function version(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= SCOPED_POLICY_MAX_VERSION;
}
function nonAdminRole(value: unknown): value is ScopedPolicyRole {
  return typeof value === "string" && SCOPED_POLICY_ROLES.some(role => role === value);
}
function editorRole(value: unknown): value is BusinessEditorRole { return value === "admin" || nonAdminRole(value); }
function publicRepositoryFailure(input: unknown): BusinessEditorErrorCode {
  const error = fields(input, ["code", "recovery"], 2, false);
  if (!Object.hasOwn(error, "code") || typeof error.code !== "string") return "SAVE_FAILED";
  switch (error.code) {
    case "STALE_VERSION": case "CATALOGUE_MISMATCH": case "ADMIN_REQUIRED":
    case "UNAUTHENTICATED": case "COMMIT_OUTCOME_UNKNOWN": return error.code;
    case "INACTIVE_PRINCIPAL": return "INACTIVE_ACTOR";
    case "INVALID_PRINCIPAL": return "UNAUTHENTICATED";
    case "ADMIN_POLICY_FORBIDDEN": return "ADMIN_PROTECTED";
    case "INVALID_REQUEST": case "INVALID_GRANTS": case "INVALID_REASON":
    case "INVALID_VERSION": case "UNKNOWN_ROLE": return "INVALID_INPUT";
    default: return "SAVE_FAILED";
  }
}
function sameGrants(a: Readonly<Record<string, boolean>>, b: Readonly<Record<string, boolean>>) {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && a[key] === b[key]);
}
function deactivation(input: unknown): boolean {
  if (input === undefined) return false;
  const copy = fields(input, undefined, 32);
  if (Object.hasOwn(copy, "isActive") && copy.isActive !== undefined && typeof copy.isActive !== "boolean") fail("INVALID_INPUT");
  return copy.isActive === false;
}

/** Pure injected factory: no SQL, network, environment or business helper calls. */
export function createBusinessPermissionService(definition: BusinessPermissionDefinition, repository: BusinessPermissionRepository) {
  let Model: ReturnType<typeof createScopedPermissionPolicyModel>;
  try {
    if (!isBusinessScope(definition.scope) || definition !== BUSINESS_PERMISSION_DEFINITIONS[definition.scope]) fail("POLICY_UNAVAILABLE");
    Model = createScopedPermissionPolicyModel(definition);
    new Model({ catalogue: definition.catalogue, clock: () => 1 });
  } catch { return fail("POLICY_UNAVAILABLE"); }
  const keys = Object.freeze(definition.catalogue.capabilities.map(capability => capability.key));
  const resolveActor = repository.resolveActor.bind(repository);
  const readPolicy = repository.readPolicy.bind(repository);
  const repositorySave = repository.save.bind(repository);
  function model(stored?: ScopedPersistedPolicy) {
    return new Model({ catalogue: definition.catalogue, clock: () => 1, initialPolicies: stored ? [stored] : undefined });
  }
  function grants(input: unknown): Readonly<Record<string, boolean>> {
    const copy = fields(input, keys, keys.length, false);
    if (Object.values(copy).some(value => typeof value !== "boolean")) fail("INVALID_INPUT");
    return Object.freeze(copy) as Record<string, boolean>;
  }
  function wrapper(input: unknown, role: ScopedPolicyRole): ScopedPersistedPolicy {
    const copy = fields(input, ["scope", "version", "policy"], 3);
    const policy = fields(copy.policy, ["role", "catalogueRevision", "grants"], 3);
    if (copy.scope !== definition.scope || !version(copy.version) || policy.role !== role
      || policy.catalogueRevision !== definition.catalogue.revision) fail("POLICY_UNAVAILABLE");
    const stored = Object.freeze({ scope: definition.scope, version: copy.version,
      policy: Object.freeze({ role, catalogueRevision: definition.catalogue.revision, grants: grants(policy.grants) }) });
    // Constructor independently validates the complete persisted initial state, including v0 sparse inheritance.
    return model(stored).getPolicy(role);
  }
  async function actor(id: unknown, adminOnly = false) {
    if (!positive(id)) return fail("UNAUTHENTICATED");
    let raw: unknown;
    try { raw = await resolveActor(id); }
    catch (error) {
      const code = scopedPermissionDbErrorCode(error);
      if (code === "INVALID_PRINCIPAL" || code === "UNKNOWN_ROLE") return fail("UNAUTHENTICATED");
      if (code === "INACTIVE_PRINCIPAL") return fail("INACTIVE_ACTOR");
      return fail("POLICY_UNAVAILABLE");
    }
    let copy: Record<string, unknown>;
    try { copy = fields(raw, ["id", "role", "isActive"], 3); }
    catch { return fail("UNAUTHENTICATED"); }
    if (copy.id !== id || !editorRole(copy.role) || (copy.isActive !== 0 && copy.isActive !== 1)) return fail("UNAUTHENTICATED");
    if (copy.isActive === 0) return fail("INACTIVE_ACTOR");
    if (adminOnly && copy.role !== "admin") return fail("ADMIN_REQUIRED");
    return Object.freeze({ id, role: copy.role, isActive: 1 as const });
  }
  async function read(role: ScopedPolicyRole) {
    try {
      const result = fields(await readPolicy(role), ["ok", "policy"], 2);
      if (result.ok !== true) return fail("POLICY_UNAVAILABLE");
      return wrapper(result.policy, role);
    } catch { return fail("POLICY_UNAVAILABLE"); }
  }
  function snapshot(role: BusinessEditorRole, stored?: ScopedPersistedPolicy): BusinessEditorSnapshot {
    const defaults: Record<string, boolean> = Object.create(null);
    const effective: Record<string, boolean> = Object.create(null);
    const initial = model();
    const current = stored ? model(stored) : initial;
    for (const key of keys) {
      const principal = { authenticated: true, active: true, role, actorId: 1 };
      defaults[key] = role === "admin" || initial.evaluate(principal, key).roleGatePassed;
      effective[key] = role === "admin" || current.evaluate(principal, key).roleGatePassed;
    }
    return Object.freeze({ role, scope: definition.scope, catalogueRevision: definition.catalogue.revision,
      version: stored?.version ?? 0, grants: stored?.policy.grants ?? Object.freeze({}),
      defaults: Object.freeze(defaults), effective: Object.freeze(effective), protectedAdmin: role === "admin" });
  }
  async function request(input: unknown): Promise<BusinessPolicySaveRequest> {
    // This copy, including nested grants and all scalar fields, runs synchronously before the first await.
    let copy: Record<string, unknown>;
    try {
      copy = fields(input, ["role", "catalogueRevision", "expectedVersion", "grants", "reason"], 5);
      if (copy.role === "admin") return fail("ADMIN_PROTECTED");
      if (!nonAdminRole(copy.role) || !version(copy.expectedVersion)) return fail("INVALID_INPUT");
      copy.grants = grants(copy.grants);
    } catch (error) { return fail(businessPermissionServiceErrorCode(error) ?? "INVALID_INPUT"); }
    const result = await model().save({ authenticated: true, active: true, role: "admin", actorId: 1 },
      Object.freeze({ ...copy, expectedVersion: 0 }));
    if (!result.ok) return fail(result.error.code === "CATALOGUE_MISMATCH" ? "CATALOGUE_MISMATCH" : "INVALID_INPUT");
    return Object.freeze({ role: result.policy.policy.role as ScopedPolicyRole,
      catalogueRevision: result.policy.policy.catalogueRevision, expectedVersion: copy.expectedVersion as number,
      grants: result.policy.policy.grants, reason: result.reason });
  }
  async function load(actorId: number, role: unknown): Promise<BusinessEditorLoadResult> {
    try {
      await actor(actorId, true);
      if (!editorRole(role)) return fail("INVALID_INPUT");
      const stored = role === "admin" ? undefined : await read(role);
      await actor(actorId, true);
      return Object.freeze({ ok: true, snapshot: snapshot(role, stored) });
    } catch (error) { return resultFailure(error, "POLICY_UNAVAILABLE"); }
  }
  async function save(actorId: number, input: unknown): Promise<BusinessEditorSaveResult> {
    // Attach rejection handling immediately while identity lookup is in flight.
    const outcome = request(input).then(draft => ({ draft }), error => ({ error }));
    let persistenceReached = false;
    try {
      await actor(actorId, true);
      const captured = await outcome;
      if ("error" in captured) throw captured.error;
      const draft = captured.draft;
      await actor(actorId, true);
      persistenceReached = true;
      const result = fields(await repositorySave(actorId, draft), ["ok", "changed", "reason", "policy", "audit", "error"], 6, false);
      if (result.ok === false && Object.keys(result).length === 2 && Object.hasOwn(result, "error")) {
        return Object.freeze({ ok: false, code: publicRepositoryFailure(result.error) });
      }
      if (result.ok !== true || typeof result.changed !== "boolean" || result.reason !== draft.reason
        || Object.hasOwn(result, "error") || Object.keys(result).length !== (result.changed ? 5 : 4)
        || Object.hasOwn(result, "audit") !== result.changed) return fail("SAVE_FAILED");
      const committed = wrapper(result.policy, draft.role);
      if (committed.version !== draft.expectedVersion + (result.changed ? 1 : 0)
        || !sameGrants(committed.policy.grants, draft.grants)
        || (result.changed && draft.expectedVersion === SCOPED_POLICY_MAX_VERSION)) return fail("SAVE_FAILED");
      if (result.changed) {
        const audit = fields(result.audit, ["actorId", "actorRole", "targetRole", "scope", "catalogueRevision", "before", "after", "reason", "utcMs"], 9);
        if (audit.actorId !== actorId || audit.actorRole !== "admin" || audit.targetRole !== draft.role
          || audit.scope !== definition.scope || audit.catalogueRevision !== draft.catalogueRevision
          || audit.reason !== draft.reason || !positive(audit.utcMs)) return fail("SAVE_FAILED");
        const before = fields(audit.before, ["version", "grants", "effectiveGrants"], 3);
        const after = fields(audit.after, ["version", "grants", "effectiveGrants"], 3);
        if (before.version !== draft.expectedVersion || after.version !== committed.version
          || !sameGrants(grants(after.grants), draft.grants) || sameGrants(grants(before.grants), draft.grants)) return fail("SAVE_FAILED");
        for (const value of [before, after]) {
          const seeded = wrapper({ scope: definition.scope, version: value.version,
            policy: { role: draft.role, catalogueRevision: draft.catalogueRevision, grants: value.grants } }, draft.role);
          const expected = snapshot(draft.role, seeded).effective;
          const effective = fields(value.effectiveGrants, keys, keys.length);
          if (keys.some(key => typeof effective[key] !== "boolean" || effective[key] !== expected[key])) return fail("SAVE_FAILED");
        }
      }
      // Operation's acknowledged committed snapshot, not a second racing current-policy read.
      return Object.freeze({ ok: true, changed: result.changed, snapshot: snapshot(draft.role, committed) });
    } catch (error) {
      const code = businessPermissionServiceErrorCode(error);
      return resultFailure(persistenceReached && (code === "INVALID_INPUT" || code === "POLICY_UNAVAILABLE") ? undefined : error, "SAVE_FAILED");
    }
  }
  async function current(actorId: number) {
    const first = await actor(actorId);
    const stored = first.role === "admin" ? undefined : await read(first.role);
    const fresh = await actor(actorId);
    if (fresh.role !== first.role) return fail("PERMISSION_DENIED");
    return { fresh, stored };
  }
  async function authorize(actorId: number, requestedKeys: readonly string[], needDeleteOrInput?: unknown): Promise<void> {
    let selected: string[];
    try {
      selected = array(requestedKeys).map(key => {
        if (typeof key !== "string" || !keys.includes(key)) return fail("INVALID_INPUT");
        return key;
      });
      if (definition.scope === "customers" && selected.includes("customers.records.edit.update")
        && (needDeleteOrInput === true || (needDeleteOrInput !== false && deactivation(needDeleteOrInput)))) {
        selected.push(...definition.actions.delete);
      }
    } catch { return fail("INVALID_INPUT"); }
    try {
      const { fresh, stored } = await current(actorId);
      const policyModel = model(stored);
      for (const key of selected) {
        if (!policyModel.evaluate({ authenticated: true, active: true, role: fresh.role, actorId: fresh.id }, key).roleGatePassed) return fail("PERMISSION_DENIED");
      }
    } catch (error) { return fail(businessPermissionServiceErrorCode(error) ?? "POLICY_UNAVAILABLE"); }
  }
  /** Visibility only. It never authorizes payments, posting, reopening, or financial mutations. */
  async function canReadFinancialData(actorId: number): Promise<boolean> {
    if (definition.scope !== "financial_data") return fail("INVALID_INPUT");
    try {
      const { fresh, stored } = await current(actorId);
      return model(stored).evaluate({ authenticated: true, active: true, role: fresh.role, actorId: fresh.id }, keys[0]).roleGatePassed;
    } catch (error) {
      const code = businessPermissionServiceErrorCode(error);
      if (code === "UNAUTHENTICATED" || code === "INACTIVE_ACTOR" || code === "PERMISSION_DENIED") return false;
      return fail("POLICY_UNAVAILABLE");
    }
  }
  return Object.freeze({ load, save, authorize, canReadFinancialData, getActor: (actorId:number) => actor(actorId) });
}
export type BusinessPermissionService = ReturnType<typeof createBusinessPermissionService>;

// One private pool for all four static scopes. URI/TLS configuration stays server-only.
let pool: Pool | undefined;
let expectedDatabase: string | undefined;
const services = new Map<BusinessScope, BusinessPermissionService>();
export function getBusinessPermissionService(scope: BusinessScope): BusinessPermissionService {
  if (!isBusinessScope(scope)) return fail("INVALID_INPUT");
  const existing = services.get(scope);
  if (existing) return existing;
  try {
    if (!pool) {
      const uri = process.env.DATABASE_URL;
      if (!uri) return fail("POLICY_UNAVAILABLE");
      const url = new URL(uri);
      const namespace = decodeURIComponent(url.pathname.slice(1));
      if (!namespace) return fail("POLICY_UNAVAILABLE");
      pool = createPool({ uri, connectionLimit: 4, waitForConnections: true, queueLimit: 32,
        supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: "Z", multipleStatements: false });
      expectedDatabase = namespace;
    }
    const definition = BUSINESS_PERMISSION_DEFINITIONS[scope];
    const repository = createScopedPermissionDb(definition, { pool, expectedDatabase: expectedDatabase!,
      catalogue: definition.catalogue, clock: Date.now });
    const service = createBusinessPermissionService(definition, repository);
    services.set(scope, service);
    return service;
  } catch { return fail("POLICY_UNAVAILABLE"); }
}
export async function authorizeBusinessAction(actorId: number, scope: BusinessScope, method: string, input?: unknown): Promise<void> {
  try {
    if (!isBusinessScope(scope) || scope === "financial_data" || typeof method !== "string") return fail("INVALID_INPUT");
    const descriptor = Object.getOwnPropertyDescriptor(BUSINESS_PERMISSION_ROUTES[scope].methods, method);
    if (!descriptor || !("value" in descriptor)) return fail("INVALID_INPUT");
    // Only the approved static route keys; PDF includes View AND Export. No source-order extra gate is invented.
    const needDelete = scope === "customers" && method === "update" ? deactivation(input) : false;
    await getBusinessPermissionService(scope).authorize(actorId, descriptor.value, needDelete);
  } catch (error) { return fail(businessPermissionServiceErrorCode(error) ?? "POLICY_UNAVAILABLE"); }
}
export async function canReadFinancialData(actorId: number): Promise<boolean> {
  return getBusinessPermissionService("financial_data").canReadFinancialData(actorId);
}
export const getBusinessFinancialVisibility = canReadFinancialData;

/** Server-only fresh actor projection; not an API endpoint. */
export async function getBusinessStoredActor(actorId:number){return getBusinessPermissionService("financial_data").getActor(actorId);}
