/** PREPARATION ONLY. No live router, business helper, UI, authentication or database integration. */
import { SUPPLIER_METHOD_KEYS, simulateSupplierPilotGate } from "./supplier-permission-pilot-gate";
import type { SupplierPilotGateResult } from "./supplier-permission-pilot-gate";
import type { PermissionPrincipal } from "./role-permission-types";

const PRINCIPAL_FIELDS = Object.freeze(["authenticated", "active", "role"]);
const READ_FIELDS = Object.freeze(["state", "catalogueRevision", "scope", "role", "snapshot"]);
const SNAPSHOT_FIELDS = Object.freeze(["scope", "role", "catalogueRevision", "version", "grants"]);
const GRANT_FIELDS = Object.freeze(Object.values(SUPPLIER_METHOD_KEYS));
const UPDATE_FIELDS = Object.freeze([
  "id", "name", "contactPerson", "email", "phone", "whatsapp", "preferredContactMethod",
  "category", "paymentTerms", "taxNumber", "bankName", "bankAccountNumber", "notes", "isActive",
]);
const NULLABLE_TEXT_FIELDS = Object.freeze([
  "contactPerson", "email", "phone", "whatsapp", "category", "paymentTerms", "taxNumber",
  "bankName", "bankAccountNumber", "notes",
]);

function denied(key: string, reason: string): SupplierPilotGateResult {
  return {
    decision: { capabilityKey: key, status: "deny", reason, roleGatePassed: false, residualGuards: [] },
    observedVersion: null,
  };
}

/**
 * Fixed-schema, own enumerable data only. Each original descriptor is observed at
 * most once; no original property is accessed directly. Copies have a null
 * prototype, and nested read/grants records are copied separately below.
 * Reflecting on an arbitrary Proxy can itself have effects; JS cannot prevent
 * those traps, or make a database/actor snapshot atomic. Throwing traps fail closed.
 */
function snapshotRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowed.length) return undefined;
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function hasFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(record).length === fields.length
    && fields.every(field => Object.hasOwn(record, field));
}

/** This structural guard consumes the mounted router's already-Zod-validated input.
 * It is NOT an alternative to that schema: email syntax and other string rules
 * remain the trusted adapter's validation obligation. Only mounted fields are
 * accepted; id remains a finite number, not an invented positive/integer ID rule.
 * An own isActive is boolean or optional undefined under the original schema.
 * Absence/undefined mean ordinary edit, never deactivation. No coercion/getters.
 */
function snapshotUpdate(value: unknown): Record<string, unknown> | undefined {
  const update = snapshotRecord(value, UPDATE_FIELDS);
  if (!update || typeof update.id !== "number" || !Number.isFinite(update.id)) return undefined;
  if (Object.hasOwn(update, "isActive") && update.isActive !== undefined && typeof update.isActive !== "boolean") return undefined;
  if (update.name !== undefined && (typeof update.name !== "string" || update.name.length < 1)) return undefined;
  for (const field of NULLABLE_TEXT_FIELDS) {
    const text = update[field];
    if (text !== undefined && text !== null && typeof text !== "string") return undefined;
  }
  const preferred = update.preferredContactMethod;
  if (preferred !== undefined && (typeof preferred !== "string"
      || !["email", "whatsapp", "phone", "both"].includes(preferred))) return undefined;
  return update;
}

/** Keep Module 2's semantic validation on safe, bounded records. No wildcard grants. */
function snapshotRead(value: unknown): unknown {
  const read = snapshotRecord(value, READ_FIELDS);
  if (!read) return { state: "verified_present", snapshot: null };
  if (read.state === "verified_absent") {
    return hasFields(read, ["state", "catalogueRevision", "scope", "role"])
      ? read : { state: "verified_absent" };
  }
  if (read.state !== "verified_present") return { state: read.state };
  if (!hasFields(read, ["state", "snapshot"])) return { state: "verified_present", snapshot: null };
  const snapshot = snapshotRecord(read.snapshot, SNAPSHOT_FIELDS);
  if (!snapshot || !hasFields(snapshot, SNAPSHOT_FIELDS)) return { state: "verified_present", snapshot: null };
  const grants = snapshotRecord(snapshot.grants, GRANT_FIELDS);
  if (!grants) return { state: "verified_present", snapshot: null };
  snapshot.grants = grants;
  read.snapshot = snapshot;
  return read;
}

/**
 * Pure simulation for a future trusted server adapter. Catalogue is source-owned,
 * principal/read are request-derived (not a client role/token/cache), and update
 * input has already passed the exact mounted Zod schema. No helper runs here.
 * Delete uses its original key; ordinary edits/reactivation use Edit only; an
 * explicit own-data isActive:false requires BOTH original Edit and Delete keys.
 * Admin still uses immutable source baseline, but cannot bypass malformed update
 * input. No View dependency, role, Export or sensitive capability is introduced.
 */
export function simulateSupplierLifecycleGate(
  catalogue: unknown,
  principal: PermissionPrincipal,
  method: unknown,
  input: unknown,
  read: unknown,
): SupplierPilotGateResult {
  try {
    const mapped = typeof method === "string" && Object.getOwnPropertyDescriptor(SUPPLIER_METHOD_KEYS, method);
    if (!mapped || !("value" in mapped)) return denied("", "UNMAPPED_SUPPLIER_METHOD");
    const key = mapped.value as string;
    const update = method === "update" ? snapshotUpdate(input) : undefined;
    if (method === "update" && !update) return denied(key, "INVALID_SUPPLIER_UPDATE_INPUT");
    const actor = snapshotRecord(principal, PRINCIPAL_FIELDS);
    if (!actor || !hasFields(actor, PRINCIPAL_FIELDS)) return denied(key, "INVALID_PRINCIPAL");
    // Admin never reflects on policy-table state. Module 2 still validates actor
    // booleans/role and the source catalogue, including inactive Admin denial.
    const policyRead = actor.role === "admin" ? { state: "unavailable" } : snapshotRead(read);
    const editOrMethod = simulateSupplierPilotGate(catalogue, actor as unknown as PermissionPrincipal, method, policyRead);
    if (method !== "update" || update!.isActive !== false) return editOrMethod;
    const deletion = simulateSupplierPilotGate(catalogue, actor as unknown as PermissionPrincipal, "delete", policyRead);
    // Both evaluations see the same copied actor, read, nested snapshot and grants.
    // An observed version is documentation only, never a transaction/locking proof.
    if (editOrMethod.observedVersion !== deletion.observedVersion) return denied(key, "INCONSISTENT_POLICY_OBSERVATION");
    const selected = !editOrMethod.decision.roleGatePassed ? editOrMethod
      : !deletion.decision.roleGatePassed ? deletion : editOrMethod;
    return {
      decision: {
        ...selected.decision,
        residualGuards: Array.from(new Set([
          ...editOrMethod.decision.residualGuards, ...deletion.decision.residualGuards,
        ])),
      },
      observedVersion: selected.observedVersion,
    };
  } catch {
    return denied("", "INVALID_RUNTIME_INPUT");
  }
}
