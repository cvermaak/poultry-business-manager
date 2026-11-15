/** PREPARATION ONLY: no router imports, persistence, network or live enforcement. */
import { evaluatePermission, validatePolicy } from "./role-permission-engine";
import type { PermissionDecision, PermissionPolicy, PermissionPrincipal } from "./role-permission-types";

export const SUPPLIER_METHOD_KEYS = Object.freeze({
  list: "suppliers.records.view.list",
  getById: "suppliers.records.view.getbyid",
  create: "suppliers.records.create.create",
  update: "suppliers.records.edit.update",
  delete: "suppliers.records.delete.delete",
});
const KEYS = Object.freeze(Object.values(SUPPLIER_METHOD_KEYS));
export const SUPPLIER_PILOT_SCOPE = "supplier_management";

/** Trusted adapter result: missing row is different from failed/unverified read. */
export type SupplierPilotRead =
  | { state: "verified_absent"; catalogueRevision: string; scope: "supplier_management"; role: string }
  | { state: "verified_present"; snapshot: unknown }
  | { state: "unavailable" };
export interface SupplierPilotGateResult {
  decision: PermissionDecision;
  /** A version documents an observed policy; it is not a database locking proof. */
  observedVersion: number | null;
}
function denied(key: string, reason: string, guards: string[] = []): SupplierPilotGateResult {
  return { decision: { capabilityKey: key, status: "deny", reason, roleGatePassed: false, residualGuards: guards.slice() }, observedVersion: null };
}
function record(value: unknown, fields: string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const own = Reflect.ownKeys(value);
  if (own.length !== fields.length) return undefined;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of own) {
    if (typeof key !== "string" || fields.indexOf(key) === -1) return undefined;
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !("value" in d) || !d.enumerable) return undefined;
    result[key] = d.value;
  }
  return result;
}

/**
 * A future server adapter must derive principal and read state itself for each
 * request. This pure simulation accepts them as injected trusted test inputs.
 * No cached/token-embedded policy, fallback on read failure or client role is used.
 * An allow invokes no handler here and does not satisfy original business guards.
 */
export function simulateSupplierPilotGate(
  catalogue: unknown,
  principal: PermissionPrincipal,
  method: unknown,
  read: unknown,
): SupplierPilotGateResult {
  try {
    const mapped = typeof method === "string" && Object.getOwnPropertyDescriptor(SUPPLIER_METHOD_KEYS, method);
    if (!mapped || !("value" in mapped)) return denied("", "UNMAPPED_SUPPLIER_METHOD");
    const key = mapped.value as string;
    const fields = record(principal, ["authenticated", "active", "role"]);
    if (!fields) return denied(key, "INVALID_PRINCIPAL");
    // The original object is never read again, even if its Proxy get trap disagrees.
    const actor = { authenticated: fields.authenticated, active: fields.active, role: fields.role } as PermissionPrincipal;
    const baseline = evaluatePermission(catalogue, actor, key);
    if (["INVALID_CATALOGUE", "INVALID_PRINCIPAL", "UNAUTHENTICATED", "INACTIVE_PRINCIPAL", "UNKNOWN_ROLE", "UNKNOWN_CAPABILITY"].indexOf(baseline.reason) !== -1) {
      return { decision: baseline, observedVersion: null };
    }
    // Protected Admin uses source baseline only, never policy-table state.
    if (actor.role === "admin") return { decision: baseline, observedVersion: null };
    const readProto = typeof read === "object" && read !== null && !Array.isArray(read) ? Object.getPrototypeOf(read) : undefined;
    if (readProto !== Object.prototype && readProto !== null) return denied(key, "POLICY_READ_UNAVAILABLE", baseline.residualGuards);
    const stateDescriptor = Object.getOwnPropertyDescriptor(read, "state");
    if (!stateDescriptor || !("value" in stateDescriptor)) return denied(key, "POLICY_READ_UNAVAILABLE", baseline.residualGuards);
    if (stateDescriptor.value === "verified_absent") {
      const absent = record(read, ["state", "catalogueRevision", "scope", "role"]);
      const revision = Object.getOwnPropertyDescriptor(catalogue, "revision");
      if (!absent || absent.scope !== SUPPLIER_PILOT_SCOPE || absent.role !== actor.role || absent.catalogueRevision !== revision?.value) return denied(key, "INVALID_POLICY_READ", baseline.residualGuards);
      return { decision: baseline, observedVersion: 0 };
    }
    if (stateDescriptor.value !== "verified_present") return denied(key, "POLICY_READ_UNAVAILABLE", baseline.residualGuards);
    const present = record(read, ["state", "snapshot"]);
    const snapshot = present && record(present.snapshot, ["scope", "role", "catalogueRevision", "version", "grants"]);
    if (!snapshot || snapshot.scope !== SUPPLIER_PILOT_SCOPE || snapshot.role !== actor.role || typeof snapshot.version !== "number" || !Number.isInteger(snapshot.version) || snapshot.version < 1 || snapshot.version > 2147483647) return denied(key, "INVALID_POLICY_READ", baseline.residualGuards);
    const policy = { role: snapshot.role, catalogueRevision: snapshot.catalogueRevision, grants: snapshot.grants };
    if (!validatePolicy(catalogue, policy, actor.role).valid) return denied(key, "INVALID_POLICY_READ", baseline.residualGuards);
    // Module 1 accepts other mapped ordinary controls; this pilot never does.
    if (Object.keys(snapshot.grants as object).some(grant => !KEYS.some(allowedKey => allowedKey === grant))) return denied(key, "OUT_OF_PILOT_POLICY", baseline.residualGuards);
    return { decision: evaluatePermission(catalogue, actor, key, policy as PermissionPolicy), observedVersion: snapshot.version };
  } catch {
    return denied("", "INVALID_RUNTIME_INPUT");
  }
}
