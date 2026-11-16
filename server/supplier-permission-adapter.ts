/** PREPARATION ONLY. Injected identity/repository/helpers; no live auth, DB or router imports. */
import { z } from "zod";
import { evaluatePermission, validatePolicy } from "../shared/role-permission-engine";
import { simulateSupplierLifecycleGate } from "../shared/supplier-lifecycle-permission-gate";
import {
  SupplierPermissionPolicyModel, SUPPLIER_PERMISSION_KEYS, SUPPLIER_POLICY_ROLES,
  SUPPLIER_POLICY_SCOPE, SUPPLIER_POLICY_MAX_VERSION,
} from "../shared/supplier-permission-policy-model";
import type {
  SupplierPersistedPolicy, SupplierPolicyRole, SupplierPolicySaveRequest, SupplierGrants,
} from "../shared/supplier-permission-policy-model";
import type { PermissionCatalogue, PermissionRole } from "../shared/role-permission-types";
import type {
  SupplierEditorErrorCode, SupplierEditorLoadResult, SupplierEditorSaveResult, SupplierEditorSnapshot,
  SupplierEditorRole,
} from "../shared/supplier-permission-editor-contract";
import type { SupplierPilotRead } from "../shared/supplier-permission-pilot-gate";

export interface SupplierPermissionAdapterContext { readonly actorId: number | null }
/** External trusted resolver must project EXACTLY these stored fields; numeric project activity. */
export interface SupplierPermissionAdapterActor {
  readonly id: number;
  readonly role: PermissionRole;
  readonly isActive: 0 | 1;
}

// EXACT fixture server/routers.ts:1259-1333. Ordinary unknown fields are stripped by Zod.
const listSchema = z.object({ category: z.string().optional(), isActive: z.boolean().optional() }).optional();
const idSchema = z.object({ id: z.number() });
const createSchema = z.object({
  name: z.string().min(1), contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")), phone: z.string().optional(),
  whatsapp: z.string().optional(), preferredContactMethod: z.enum(["email", "whatsapp", "phone", "both"]).optional(),
  category: z.string().optional(), paymentTerms: z.string().optional(), taxNumber: z.string().optional(),
  bankName: z.string().optional(), bankAccountNumber: z.string().optional(), notes: z.string().optional(),
});
const updateSchema = z.object({
  id: z.number(), name: z.string().min(1).optional(), contactPerson: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")), phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(), preferredContactMethod: z.enum(["email", "whatsapp", "phone", "both"]).optional(),
  category: z.string().nullable().optional(), paymentTerms: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(), bankName: z.string().nullable().optional(),
  bankAccountNumber: z.string().nullable().optional(), notes: z.string().nullable().optional(), isActive: z.boolean().optional(),
});
export type SupplierListInput = z.infer<typeof listSchema>;
export type SupplierCreateInput = z.infer<typeof createSchema>;
export type SupplierUpdateInput = z.infer<typeof updateSchema>;
export interface SupplierPermissionAdapterDependencies {
  readonly catalogue: unknown;
  readonly resolveActor: (actorId: number) => unknown | Promise<unknown>;
  readonly repository: {
    readonly readPolicy: (role: SupplierPolicyRole) => Promise<unknown>;
    /** Module 3 rechecks the actor ID's fresh Admin status within its OWN transaction. */
    readonly save: (actorId: number, request: unknown) => Promise<unknown>;
  };
  readonly business: {
    readonly listSuppliers: (input: SupplierListInput) => unknown | Promise<unknown>;
    readonly getSupplierById: (id: number) => unknown | Promise<unknown>;
    readonly createSupplier: (input: SupplierCreateInput) => unknown | Promise<unknown>;
    readonly updateSupplier: (id: number, data: Omit<SupplierUpdateInput, "id">) => unknown | Promise<unknown>;
    readonly deleteSupplier: (id: number) => unknown | Promise<unknown>;
  };
}
export type SupplierAdapterErrorCode = SupplierEditorErrorCode | "PERMISSION_DENIED";
const OWN_ERRORS = new WeakMap<object, SupplierAdapterErrorCode>();
export class SupplierPermissionAdapterError extends Error {
  constructor(code: SupplierAdapterErrorCode) {
    super(code);
    this.name = "SupplierPermissionAdapterError";
    OWN_ERRORS.set(this, code);
  }
}
/** Identity lookup only; NEVER inspect an arbitrary exception's code/message/getters. */
export function supplierPermissionAdapterErrorCode(error: unknown): SupplierAdapterErrorCode | undefined {
  return (typeof error === "object" && error !== null) || typeof error === "function"
    ? OWN_ERRORS.get(error as object) : undefined;
}
function fail(code: SupplierAdapterErrorCode): never { throw new SupplierPermissionAdapterError(code); }
function fields(value: unknown, allowed: readonly string[] | undefined, max: number, exact = false): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("INVALID_RECORD");
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) throw new Error("INVALID_RECORD");
  const keys = Reflect.ownKeys(value);
  if (keys.length > max || (exact && keys.length !== allowed?.length)) throw new Error("INVALID_RECORD");
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)
      || (allowed && !allowed.includes(key))) throw new Error("INVALID_RECORD");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("INVALID_RECORD");
    out[key] = descriptor.value;
  }
  if (exact && !allowed?.every(key => Object.prototype.hasOwnProperty.call(out, key))) throw new Error("INVALID_RECORD");
  return out;
}
/** Trusted source configuration snapshot; arbitrary Proxy reflection traps cannot be prevented by JS. */
function copyCatalogue(value: unknown, budget = { left: 100000 }, depth = 0): unknown {
  if (--budget.left < 0 || depth > 12) throw new Error("INVALID_CATALOGUE");
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string" && value.length <= 10000) return value;
  if (Array.isArray(value)) {
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (Object.getPrototypeOf(value) !== Array.prototype || typeof length !== "number"
      || !Number.isSafeInteger(length) || length < 0 || length > 2048 || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID_CATALOGUE");
    const out: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("INVALID_CATALOGUE");
      out.push(copyCatalogue(descriptor.value, budget, depth + 1));
    }
    return Object.freeze(out);
  }
  const out = fields(value, undefined, 16);
  for (const key of Object.keys(out)) out[key] = copyCatalogue(out[key], budget, depth + 1);
  return Object.freeze(out);
}
function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= SUPPLIER_POLICY_MAX_VERSION;
}
function nonAdminRole(role: unknown): role is SupplierPolicyRole { return typeof role === "string" && SUPPLIER_POLICY_ROLES.some(item => item === role); }
function editorRole(role: unknown): role is SupplierEditorRole { return role === "admin" || nonAdminRole(role); }
function grantsFrom(value: unknown): SupplierGrants {
  const copy = fields(value, SUPPLIER_PERMISSION_KEYS, 5);
  if (Object.keys(copy).some(key => typeof copy[key] !== "boolean")) throw new Error("INVALID_GRANTS");
  return Object.freeze(copy) as SupplierGrants;
}
function sameGrants(left: SupplierGrants, right: SupplierGrants): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key) && (left as Record<string, boolean>)[key] === (right as Record<string, boolean>)[key]);
}
const REPOSITORY_CODES = Object.freeze([
  "INVALID_CATALOGUE", "INVALID_CONFIGURATION", "INVALID_PRINCIPAL", "UNAUTHENTICATED", "INACTIVE_PRINCIPAL",
  "UNKNOWN_ROLE", "ADMIN_REQUIRED", "ADMIN_POLICY_FORBIDDEN", "INVALID_REQUEST", "INVALID_GRANTS", "INVALID_REASON",
  "INVALID_VERSION", "CATALOGUE_MISMATCH", "STALE_VERSION", "VERSION_OVERFLOW", "INVALID_CLOCK", "POLICY_FAILURE",
  "AUDIT_FAILURE", "COMMIT_FAILURE", "INVALID_SOCKET_PATH", "FIXTURE_IDENTITY_MISMATCH", "FIXTURE_METADATA_MISMATCH",
  "CORRUPT_POLICY", "DB_FAILURE", "REPOSITORY_CLOSED", "COMMIT_OUTCOME_UNKNOWN",
]);
function publicRepositoryFailure(value: unknown): SupplierEditorErrorCode {
  const error = fields(value, ["code", "recovery"], 2);
  const code = error.code;
  if (typeof code !== "string" || !REPOSITORY_CODES.includes(code)) return "SAVE_FAILED";
  switch (code) {
    case "STALE_VERSION": case "CATALOGUE_MISMATCH": case "ADMIN_REQUIRED": case "UNAUTHENTICATED": case "COMMIT_OUTCOME_UNKNOWN": return code;
    case "INACTIVE_PRINCIPAL": return "INACTIVE_ACTOR";
    case "INVALID_PRINCIPAL": return "UNAUTHENTICATED";
    case "ADMIN_POLICY_FORBIDDEN": return "ADMIN_PROTECTED";
    case "INVALID_REQUEST": case "INVALID_GRANTS": case "INVALID_REASON": case "INVALID_VERSION": case "UNKNOWN_ROLE": return "INVALID_INPUT";
    default: return "SAVE_FAILED";
  }
}
function editorFailure(error: unknown, fallback: SupplierEditorErrorCode): { readonly ok: false; readonly code: SupplierEditorErrorCode } {
  const code = supplierPermissionAdapterErrorCode(error);
  return Object.freeze({ ok: false, code: code && code !== "PERMISSION_DENIED" ? code : fallback });
}

export function createSupplierPermissionAdapter(dependencies: SupplierPermissionAdapterDependencies) {
  let catalogue: PermissionCatalogue;
  try {
    const source = copyCatalogue(dependencies.catalogue) as PermissionCatalogue;
    // Preserve Module 2's configuration contract, including all six original Supplier baselines.
    new SupplierPermissionPolicyModel({ catalogue: source, clock: () => 1 });
    catalogue = Object.freeze({ revision: source.revision,
      capabilities: Object.freeze(source.capabilities.filter(item => SUPPLIER_PERMISSION_KEYS.some(key => key === item.key))),
    }) as unknown as PermissionCatalogue;
  } catch { throw new Error("INVALID_SUPPLIER_ADAPTER_CATALOGUE"); }
  const resolveActor = dependencies.resolveActor;
  const readPolicy = dependencies.repository.readPolicy.bind(dependencies.repository);
  const repositorySave = dependencies.repository.save.bind(dependencies.repository);
  const business = Object.freeze({
    listSuppliers: dependencies.business.listSuppliers.bind(dependencies.business),
    getSupplierById: dependencies.business.getSupplierById.bind(dependencies.business),
    createSupplier: dependencies.business.createSupplier.bind(dependencies.business),
    updateSupplier: dependencies.business.updateSupplier.bind(dependencies.business),
    deleteSupplier: dependencies.business.deleteSupplier.bind(dependencies.business),
  });
  function contextId(context: unknown): number {
    try {
      const copy = fields(context, ["actorId"], 1, true);
      if (positiveInt(copy.actorId)) return copy.actorId;
    } catch { /* fixed denial, no exception inspection */ }
    return fail("UNAUTHENTICATED");
  }
  async function actor(actorId: number, adminOnly = false): Promise<SupplierPermissionAdapterActor> {
    let copy: Record<string, unknown>;
    try { copy = fields(await resolveActor(actorId), ["id", "role", "isActive"], 3, true); }
    catch { return fail("UNAUTHENTICATED"); }
    if (!positiveInt(copy.id) || copy.id !== actorId || !editorRole(copy.role)
      || (copy.isActive !== 0 && copy.isActive !== 1)) return fail("UNAUTHENTICATED");
    if (copy.isActive === 0) return fail("INACTIVE_ACTOR");
    if (adminOnly && copy.role !== "admin") return fail("ADMIN_REQUIRED");
    return Object.freeze(copy) as unknown as SupplierPermissionAdapterActor;
  }
  function wrapper(value: unknown, role: SupplierPolicyRole): SupplierPersistedPolicy {
    const out = fields(value, ["scope", "version", "policy"], 3, true);
    const policy = fields(out.policy, ["role", "catalogueRevision", "grants"], 3, true);
    const grants = grantsFrom(policy.grants);
    if (out.scope !== SUPPLIER_POLICY_SCOPE || !validVersion(out.version) || policy.role !== role
      || policy.catalogueRevision !== catalogue.revision || (out.version === 0 && Object.keys(grants).length !== 0)) throw new Error("CORRUPT_POLICY");
    const safePolicy = Object.freeze({ role, catalogueRevision: catalogue.revision, grants }) as SupplierPersistedPolicy["policy"];
    if (!validatePolicy(catalogue, safePolicy, role).valid) throw new Error("CORRUPT_POLICY");
    return Object.freeze({ scope: SUPPLIER_POLICY_SCOPE, version: out.version, policy: safePolicy });
  }
  async function read(role: SupplierPolicyRole): Promise<SupplierPersistedPolicy> {
    try {
      const result = fields(await readPolicy(role), ["ok", "policy"], 2, true);
      if (result.ok !== true) throw new Error("FAILED_READ");
      return wrapper(result.policy, role);
    } catch { return fail("POLICY_UNAVAILABLE"); }
  }
  function snapshot(role: SupplierEditorRole, stored?: SupplierPersistedPolicy): SupplierEditorSnapshot {
    const defaults: Record<string, boolean> = Object.create(null);
    const effective: Record<string, boolean> = Object.create(null);
    const principal = { authenticated: true, active: true, role };
    for (const key of SUPPLIER_PERMISSION_KEYS) {
      defaults[key] = evaluatePermission(catalogue, principal, key).roleGatePassed;
      effective[key] = evaluatePermission(catalogue, principal, key, stored?.policy).roleGatePassed;
    }
    return Object.freeze({ role, scope: SUPPLIER_POLICY_SCOPE, catalogueRevision: catalogue.revision,
      version: stored?.version ?? 0, grants: stored?.policy.grants ?? Object.freeze({}),
      defaults: Object.freeze(defaults), effective: Object.freeze(effective), protectedAdmin: role === "admin" });
  }
  /** Copy request descriptors synchronously; Module 2 is the authoritative semantic preflight. */
  async function request(input: unknown): Promise<SupplierPolicySaveRequest> {
    let copy: Record<string, unknown>;
    try {
      copy = fields(input, ["role", "catalogueRevision", "expectedVersion", "grants", "reason"], 5, true);
      if (copy.role === "admin") return fail("ADMIN_PROTECTED");
      if (!nonAdminRole(copy.role) || !validVersion(copy.expectedVersion)) return fail("INVALID_INPUT");
      copy.grants = grantsFrom(copy.grants);
    } catch (error) { throw new SupplierPermissionAdapterError(supplierPermissionAdapterErrorCode(error) ?? "INVALID_INPUT"); }
    const result = await new SupplierPermissionPolicyModel({ catalogue, clock: () => 1 }).save(
      { authenticated: true, active: true, role: "admin", actorId: 1 }, { ...copy, expectedVersion: 0 });
    if (!result.ok) return fail(result.error.code === "CATALOGUE_MISMATCH" ? "CATALOGUE_MISMATCH" : "INVALID_INPUT");
    return Object.freeze({ role: result.policy.policy.role, catalogueRevision: result.policy.policy.catalogueRevision,
      expectedVersion: copy.expectedVersion as number, grants: result.policy.policy.grants, reason: result.reason });
  }
  async function load(context: SupplierPermissionAdapterContext, role: unknown): Promise<SupplierEditorLoadResult> {
    try {
      const id = contextId(context);
      await actor(id, true);
      if (!editorRole(role)) return fail("INVALID_INPUT");
      const stored = role === "admin" ? undefined : await read(role);
      await actor(id, true); // Fresh active Admin after the awaited read; NOT a locking guarantee.
      return Object.freeze({ ok: true, snapshot: snapshot(role, stored) });
    } catch (error) { return editorFailure(error, "POLICY_UNAVAILABLE"); }
  }
  async function save(context: SupplierPermissionAdapterContext, input: unknown): Promise<SupplierEditorSaveResult> {
    // Capture original request data BEFORE any await so mutation during actor lookup cannot change it.
    let draftPromise: Promise<SupplierPolicySaveRequest>;
    let id: number;
    try { id = contextId(context); draftPromise = request(input); }
    catch (error) { return editorFailure(error, "INVALID_INPUT"); }
    // Attach handler immediately, including for a rejected async semantic preflight.
    const draftOutcome = draftPromise.then(draft => ({ draft }), error => ({ error }));
    try {
      await actor(id, true);
      const outcome = await draftOutcome;
      if ("error" in outcome) throw outcome.error;
      const draft = outcome.draft;
      await actor(id, true);
      // ONLY the trusted primitive ID crosses to Module 3. Its transaction owns fresh Admin validation.
      const result = fields(await repositorySave(id, draft), ["ok", "changed", "reason", "policy", "audit", "error"], 6);
      if (result.ok === false && Object.keys(result).length === 2 && Object.prototype.hasOwnProperty.call(result, "error")) {
        return Object.freeze({ ok: false, code: publicRepositoryFailure(result.error) });
      }
      if (result.ok !== true || typeof result.changed !== "boolean" || typeof result.reason !== "string"
        || result.reason !== draft.reason || !Object.prototype.hasOwnProperty.call(result, "policy")
        || Object.prototype.hasOwnProperty.call(result, "error")) throw new Error("INVALID_SAVE_RESULT");
      const committed = wrapper(result.policy, draft.role);
      const expected = result.changed ? draft.expectedVersion + 1 : draft.expectedVersion;
      if (committed.version !== expected || !sameGrants(committed.policy.grants as SupplierGrants, draft.grants)
        || (result.changed && draft.expectedVersion === SUPPLIER_POLICY_MAX_VERSION)) throw new Error("INVALID_SAVE_RESULT");
      // Return this operation's acknowledged committed wrapper, NOT a racing second current-policy read.
      return Object.freeze({ ok: true, changed: result.changed, snapshot: snapshot(draft.role, committed) });
    } catch (error) { return editorFailure(error, "SAVE_FAILED"); }
  }
  async function gate(context: SupplierPermissionAdapterContext, method: "list" | "getById" | "create" | "update" | "delete", input: unknown): Promise<void> {
    const id = contextId(context);
    const first = await actor(id);
    const stored = first.role === "admin" ? undefined : await read(first.role);
    const fresh = await actor(id);
    if (fresh.role !== first.role) return fail("PERMISSION_DENIED");
    let policyRead: SupplierPilotRead = { state: "unavailable" };
    if (stored) policyRead = stored.version === 0
      ? { state: "verified_absent", catalogueRevision: catalogue.revision, scope: SUPPLIER_POLICY_SCOPE, role: fresh.role }
      : { state: "verified_present", snapshot: { scope: stored.scope, version: stored.version,
        role: stored.policy.role, catalogueRevision: stored.policy.catalogueRevision, grants: stored.policy.grants } };
    const decision = simulateSupplierLifecycleGate(catalogue,
      { authenticated: true, active: true, role: fresh.role }, method, input, policyRead);
    if (!decision.decision.roleGatePassed) return fail("PERMISSION_DENIED");
  }
  function parse<T>(schema: z.ZodType<T>, input: unknown): T {
    try { return schema.parse(input); } catch { return fail("INVALID_INPUT"); }
  }
  return Object.freeze({
    authorizeSupplier: gate,
    supplierPermissions: Object.freeze({ load, save }),
    suppliers: Object.freeze({
      async list(context: SupplierPermissionAdapterContext, input?: unknown): Promise<unknown> {
        const parsed = parse(listSchema, input); await gate(context, "list", parsed); return business.listSuppliers(parsed);
      },
      async getById(context: SupplierPermissionAdapterContext, input: unknown): Promise<unknown> {
        const parsed = parse(idSchema, input); await gate(context, "getById", parsed); return business.getSupplierById(parsed.id);
      },
      async create(context: SupplierPermissionAdapterContext, input: unknown): Promise<unknown> {
        const parsed = parse(createSchema, input); await gate(context, "create", parsed);
        return business.createSupplier({ ...parsed, email: parsed.email || undefined });
      },
      async update(context: SupplierPermissionAdapterContext, input: unknown): Promise<unknown> {
        const parsed = parse(updateSchema, input); await gate(context, "update", parsed);
        const { id, ...data } = parsed;
        return business.updateSupplier(id, { ...data, email: data.email === "" ? null : data.email });
      },
      async delete(context: SupplierPermissionAdapterContext, input: unknown): Promise<unknown> {
        const parsed = parse(idSchema, input); await gate(context, "delete", parsed); return business.deleteSupplier(parsed.id);
      },
    }),
  });
}
export type SupplierPermissionAdapter = ReturnType<typeof createSupplierPermissionAdapter>;
