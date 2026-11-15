/**
 * PREPARATION ONLY: pure, in-memory role-gate evaluation. No persistence, router,
 * authentication, UI or deployment integration is provided by this module.
 *
 * Public signatures (catalogue first):
 *   validateCatalogue(catalogue: unknown): PolicyValidation
 *   validatePolicy(catalogue: unknown, policy: unknown, expectedRole?: unknown): PolicyValidation
 *   evaluatePermission(catalogue: unknown, principal: unknown, capabilityKey: unknown,
 *                      policy?: unknown): PermissionDecision
 *   buildDefaultPolicy(catalogue: unknown, role: unknown): PermissionPolicy
 *
 * A catalogue is trusted, source-owned configuration, not a client policy. The
 * validator checks its structure, not whether its evidence faithfully describes
 * an API. Never replace it with a client-supplied catalogue in a future adapter.
 * An Allow passes only the role gate; every original residual guard still applies.
 */
import type {
  PermissionCapability,
  PermissionCatalogue,
  PermissionDecision,
  PermissionDecisionStatus,
  PermissionPolicy,
  PermissionPrincipal,
  PermissionRole,
  PolicyValidation,
  RoleBaseline,
} from "./role-permission-types";

// Keep the supported role set independent of mutations to exported type constants.
const ROLES: readonly PermissionRole[] = Object.freeze([
  "admin", "farm_manager", "accountant", "sales_staff", "production_worker",
  "chicken_house_operator",
]);
const ACTIONS = Object.freeze(["View", "Create", "Edit", "Delete", "Export", "Sensitive"]);
const SUPPORTS = Object.freeze(["implemented", "not_implemented", "review_required", "outside_scope"]);
const CONTROLS = Object.freeze(["editable_ordinary", "fixed_sensitive", "fixed_system"]);
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const OBJECT_PROTOTYPE_FIELDS = new Set([
  "constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty",
  "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable",
  "toString", "valueOf", "__proto__", "toLocaleString",
]);
const CAPABILITY_FIELDS = Object.freeze([
  "key", "module", "resource", "action", "support", "control", "baseline",
  "ordinaryDeleteDelegation", "residualGuards", "notes", "endpointRefs", "consumerRefs",
]);

type Fields = Map<string, unknown>;
type Parsed<T> = { value?: T; errors: string[] };

function isRole(value: unknown): value is PermissionRole {
  return typeof value === "string" && ROLES.some(role => role === value);
}

function isNonAdminRole(value: unknown): value is PermissionPolicy["role"] {
  return isRole(value) && value !== "admin";
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRevision(value: unknown): value is string {
  return isText(value) && value === value.trim();
}

function isCapabilityKey(value: unknown): value is string {
  return isText(value) && !/\s|[\u0000-\u001f\u007f]/.test(value)
    && !value.split(/[.:/]/).some(part => RESERVED_KEYS.has(part));
}

function hasSafeObjectPrototype(): boolean {
  if (Object.getPrototypeOf(Object.prototype) !== null) return false;
  for (const key of Reflect.ownKeys(Object.prototype)) {
    if (typeof key !== "string" || !OBJECT_PROTOTYPE_FIELDS.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
    if (!descriptor || descriptor.enumerable) return false;
    if (key !== "__proto__" && (!("value" in descriptor) || typeof descriptor.value !== "function")) return false;
  }
  return true;
}

/**
 * Inspect descriptors rather than reading untrusted properties. Only ordinary
 * local plain records and null-prototype dictionaries are accepted. Accessors,
 * custom/inherited prototypes, symbols, reserved fields and extra schema fields
 * are rejected. Throwing proxy/reflection traps are caught by public parsers;
 * JavaScript cannot promise that an arbitrary Proxy's own traps have no effects.
 */
function readRecord(
  input: unknown,
  path: string,
  expected: readonly string[] | undefined,
  errors: string[],
): Fields | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors.push(`${path}: EXPECTED_PLAIN_RECORD`);
    return undefined;
  }
  const proto = Object.getPrototypeOf(input);
  if ((proto !== Object.prototype && proto !== null) || !hasSafeObjectPrototype()) {
    errors.push(`${path}: UNSAFE_PROTOTYPE`);
    return undefined;
  }
  const fields: Fields = new Map();
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string") {
      errors.push(`${path}: SYMBOL_FIELD`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      errors.push(`${path}: ACCESSOR_OR_NONENUMERABLE_FIELD`);
      continue;
    }
    if (RESERVED_KEYS.has(key)) {
      errors.push(`${path}: RESERVED_FIELD`);
      continue;
    }
    if (expected && !expected.includes(key)) {
      errors.push(`${path}: UNEXPECTED_FIELD`);
      continue;
    }
    fields.set(key, descriptor.value);
  }
  if (expected) {
    for (const key of expected) {
      if (!fields.has(key)) errors.push(`${path}.${key}: MISSING_FIELD`);
    }
  }
  return fields;
}

function readArray(input: unknown, path: string, errors: string[]): unknown[] | undefined {
  if (!Array.isArray(input)) {
    errors.push(`${path}: EXPECTED_ARRAY`);
    return undefined;
  }
  if (Object.getPrototypeOf(input) !== Array.prototype) {
    errors.push(`${path}: UNSAFE_PROTOTYPE`);
    return undefined;
  }
  const keys = Reflect.ownKeys(input);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  const length: unknown = lengthDescriptor?.value;
  // The key count check rejects sparse/oversized sparse arrays without walking length.
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0
      || keys.length !== length + 1) {
    errors.push(`${path}: SPARSE_OR_EXTENDED_ARRAY`);
    return undefined;
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      errors.push(`${path}: ACCESSOR_OR_MISSING_ARRAY_ENTRY`);
      return undefined;
    }
    result.push(descriptor.value);
  }
  return result;
}

function readStrings(input: unknown, path: string, errors: string[]): string[] | undefined {
  const values = readArray(input, path, errors);
  if (!values) return undefined;
  const result: string[] = [];
  for (const value of values) {
    if (!isText(value)) errors.push(`${path}: EXPECTED_NONEMPTY_STRING_ENTRY`);
    else result.push(value);
  }
  return result;
}

function parseCatalogue(input: unknown): Parsed<PermissionCatalogue> {
  const errors: string[] = [];
  try {
    const root = readRecord(input, "catalogue", ["revision", "capabilities"], errors);
    if (!root) return { errors };
    const revision = root.get("revision");
    if (!isRevision(revision)) errors.push("catalogue.revision: INVALID_REVISION");
    const entries = readArray(root.get("capabilities"), "catalogue.capabilities", errors);
    if (!entries) return { errors };
    const capabilities: PermissionCapability[] = [];
    const keys = new Set<string>();
    for (let index = 0; index < entries.length; index += 1) {
      const path = `catalogue.capabilities[${index}]`;
      const before = errors.length;
      const fields = readRecord(entries[index], path, CAPABILITY_FIELDS, errors);
      if (!fields) continue;
      const key = fields.get("key");
      const module = fields.get("module");
      const resource = fields.get("resource");
      const action = fields.get("action");
      const support = fields.get("support");
      const control = fields.get("control");
      const ordinaryDeleteDelegation = fields.get("ordinaryDeleteDelegation");
      if (!isCapabilityKey(key)) errors.push(`${path}.key: INVALID_CAPABILITY_KEY`);
      else if (keys.has(key)) errors.push(`${path}.key: DUPLICATE_CAPABILITY`);
      else keys.add(key);
      if (!isText(module)) errors.push(`${path}.module: INVALID_MODULE`);
      if (!isText(resource)) errors.push(`${path}.resource: INVALID_RESOURCE`);
      if (typeof action !== "string" || !ACTIONS.includes(action)) errors.push(`${path}.action: INVALID_ACTION`);
      if (typeof support !== "string" || !SUPPORTS.includes(support)) errors.push(`${path}.support: INVALID_SUPPORT`);
      if (typeof control !== "string" || !CONTROLS.includes(control)) errors.push(`${path}.control: INVALID_CONTROL`);
      if (typeof ordinaryDeleteDelegation !== "boolean") errors.push(`${path}: NONBOOLEAN_DELETE_DELEGATION`);
      if (action === "Sensitive" && control === "editable_ordinary") errors.push(`${path}: SENSITIVE_EDITABLE_CONTROL`);
      if (ordinaryDeleteDelegation === true
          && (action !== "Delete" || control !== "editable_ordinary" || support !== "implemented")) {
        errors.push(`${path}: INVALID_DELETE_DELEGATION`);
      }
      const baselineFields = readRecord(fields.get("baseline"), `${path}.baseline`, ROLES, errors);
      const baseline = Object.create(null) as Record<PermissionRole, RoleBaseline>;
      if (baselineFields) {
        for (const role of ROLES) {
          const rolePath = `${path}.baseline.${role}`;
          const roleFields = readRecord(baselineFields.get(role), rolePath, ["allowed", "evidence"], errors);
          if (!roleFields) continue;
          const allowed = roleFields.get("allowed");
          const evidence = readStrings(roleFields.get("evidence"), `${rolePath}.evidence`, errors);
          if (allowed !== null && typeof allowed !== "boolean") errors.push(`${rolePath}.allowed: INVALID_BASELINE`);
          if ((allowed === null || typeof allowed === "boolean") && evidence) baseline[role] = { allowed, evidence };
        }
      }
      const residualGuards = readStrings(fields.get("residualGuards"), `${path}.residualGuards`, errors);
      const notes = readStrings(fields.get("notes"), `${path}.notes`, errors);
      const endpointRefs = readStrings(fields.get("endpointRefs"), `${path}.endpointRefs`, errors);
      const consumerRefs = readStrings(fields.get("consumerRefs"), `${path}.consumerRefs`, errors);
      if (errors.length === before) {
        capabilities.push({
          key: key as string,
          module: module as string,
          resource: resource as string,
          action: action as PermissionCapability["action"],
          support: support as PermissionCapability["support"],
          control: control as PermissionCapability["control"],
          ordinaryDeleteDelegation: ordinaryDeleteDelegation as boolean,
          baseline,
          residualGuards: residualGuards!,
          notes: notes!,
          endpointRefs: endpointRefs!,
          consumerRefs: consumerRefs!,
        });
      }
    }
    if (errors.length > 0) return { errors };
    return { value: { revision: revision as string, capabilities }, errors };
  } catch {
    errors.push("catalogue: UNSAFE_RUNTIME_INPUT");
    return { errors };
  }
}

function editableForRole(capability: PermissionCapability, role: PermissionPolicy["role"]): boolean {
  return capability.support === "implemented"
    && capability.control === "editable_ordinary"
    && capability.action !== "Sensitive"
    && typeof capability.baseline[role].allowed === "boolean"
    && (capability.action !== "Delete" || capability.ordinaryDeleteDelegation);
}

function parsePolicy(
  catalogue: PermissionCatalogue,
  input: unknown,
  expectedRole?: unknown,
): Parsed<PermissionPolicy> {
  const errors: string[] = [];
  try {
    if (expectedRole !== undefined && !isNonAdminRole(expectedRole)) errors.push("policy: INVALID_EXPECTED_ROLE");
    const fields = readRecord(input, "policy", ["catalogueRevision", "role", "grants"], errors);
    if (!fields) return { errors };
    const revision = fields.get("catalogueRevision");
    const role = fields.get("role");
    if (!isRevision(revision)) errors.push("policy.catalogueRevision: INVALID_REVISION");
    else if (revision !== catalogue.revision) errors.push("policy: STALE_CATALOGUE_REVISION");
    if (role === "admin") errors.push("policy: ADMIN_POLICY_FORBIDDEN");
    else if (!isNonAdminRole(role)) errors.push("policy.role: UNKNOWN_ROLE");
    if (expectedRole !== undefined && role !== expectedRole) errors.push("policy: ROLE_MISMATCH");
    const grantFields = readRecord(fields.get("grants"), "policy.grants", undefined, errors);
    const grants = Object.create(null) as Record<string, boolean>;
    const byKey = new Map(catalogue.capabilities.map(capability => [capability.key, capability]));
    if (grantFields) {
      for (const [key, allowed] of Array.from(grantFields.entries())) {
        if (!isCapabilityKey(key)) errors.push("policy.grants: INVALID_CAPABILITY_KEY");
        const capability = byKey.get(key);
        if (!capability) errors.push("policy.grants: UNKNOWN_CAPABILITY");
        if (typeof allowed !== "boolean") errors.push("policy.grants: NONBOOLEAN_GRANT");
        if (capability) {
          if (capability.control !== "editable_ordinary" || capability.action === "Sensitive") {
            errors.push("policy.grants: FIXED_CONTROL");
          }
          if (capability.support !== "implemented") errors.push("policy.grants: UNSUPPORTED_CAPABILITY_EDIT");
          if (isNonAdminRole(role) && capability.baseline[role].allowed === null) {
            errors.push("policy.grants: UNRESOLVED_BASELINE_EDIT");
          }
          if (capability.action === "Delete" && !capability.ordinaryDeleteDelegation) {
            errors.push("policy.grants: UNSUPPORTED_DELETE_DELEGATION");
          }
        }
        if (typeof allowed === "boolean") grants[key] = allowed;
      }
    }
    if (errors.length > 0) return { errors };
    return { value: { catalogueRevision: revision as string, role: role as PermissionPolicy["role"], grants }, errors };
  } catch {
    errors.push("policy: UNSAFE_RUNTIME_INPUT");
    return { errors };
  }
}

/** Validate the complete finite catalogue. Invalid entries invalidate the whole catalogue. */
export function validateCatalogue(catalogue: unknown): PolicyValidation {
  const parsed = parseCatalogue(catalogue);
  return { valid: parsed.value !== undefined, errors: parsed.errors };
}

/**
 * Validate a non-admin draft, optionally bound to a particular principal role.
 * Every supplied entry is an edit, even a redundant false/same-baseline entry;
 * fixed, unsupported, unresolved and unmapped Delete entries must be omitted.
 * No View prerequisite or cross-action dependency is introduced.
 */
export function validatePolicy(
  catalogue: unknown,
  policy: unknown,
  expectedRole?: unknown,
): PolicyValidation {
  const parsedCatalogue = parseCatalogue(catalogue);
  if (!parsedCatalogue.value) return { valid: false, errors: parsedCatalogue.errors };
  const parsedPolicy = parsePolicy(parsedCatalogue.value, policy, expectedRole);
  return { valid: parsedPolicy.value !== undefined, errors: parsedPolicy.errors };
}

function parsePrincipal(input: unknown): { value?: PermissionPrincipal; reason: string } {
  const errors: string[] = [];
  try {
    const fields = readRecord(input, "principal", ["authenticated", "active", "role"], errors);
    if (!fields || errors.length > 0) return { reason: "INVALID_PRINCIPAL" };
    const authenticated = fields.get("authenticated");
    const active = fields.get("active");
    const role = fields.get("role");
    if (typeof authenticated !== "boolean" || typeof active !== "boolean" || typeof role !== "string") {
      return { reason: "INVALID_PRINCIPAL" };
    }
    if (!authenticated) return { reason: "UNAUTHENTICATED" };
    if (!active) return { reason: "INACTIVE_PRINCIPAL" };
    if (!isRole(role)) return { reason: "UNKNOWN_ROLE" };
    return { value: { authenticated, active, role }, reason: "VALID_PRINCIPAL" };
  } catch {
    return { reason: "INVALID_PRINCIPAL" };
  }
}

function decision(
  key: string,
  status: PermissionDecisionStatus,
  reason: string,
  residualGuards: readonly string[] = [],
): PermissionDecision {
  return { status, reason, capabilityKey: key, roleGatePassed: status === "allow", residualGuards: [...residualGuards] };
}

/**
 * Evaluate one exact catalogue key. Unknown keys always deny UNKNOWN_CAPABILITY.
 * An invalid non-admin draft fails closed in its entirety, never partially applies.
 * Admin ignores all drafts without inspecting them and uses only its source baseline.
 * Unspecified ordinary entries use their original per-role baseline. Null and review
 * support remain Review required; other unsupported states stay distinct. An Allow
 * does not prove ownership, financial-period, stock, retention or any business guard.
 */
export function evaluatePermission(
  catalogue: unknown,
  principal: unknown,
  capabilityKey: unknown,
  policy?: unknown,
): PermissionDecision {
  const key = typeof capabilityKey === "string" ? capabilityKey : "";
  const parsedCatalogue = parseCatalogue(catalogue);
  if (!parsedCatalogue.value) return decision(key, "deny", "INVALID_CATALOGUE");
  const capability = isCapabilityKey(capabilityKey)
    ? parsedCatalogue.value.capabilities.find(entry => entry.key === capabilityKey)
    : undefined;
  if (!capability) return decision(key, "deny", "UNKNOWN_CAPABILITY");
  const guards = capability.residualGuards;
  const parsedPrincipal = parsePrincipal(principal);
  if (!parsedPrincipal.value) return decision(key, "deny", parsedPrincipal.reason, guards);
  const role = parsedPrincipal.value.role as PermissionRole;
  let parsedPolicy: PermissionPolicy | undefined;
  if (role !== "admin" && policy !== undefined) {
    const result = parsePolicy(parsedCatalogue.value, policy, role);
    if (!result.value) return decision(key, "deny", "INVALID_POLICY", guards);
    parsedPolicy = result.value;
  }
  if (capability.support === "not_implemented") return decision(key, "not_implemented", "NOT_IMPLEMENTED", guards);
  if (capability.support === "outside_scope") return decision(key, "outside_scope", "OUTSIDE_SCOPE", guards);
  if (capability.support === "review_required" || capability.baseline[role].allowed === null) {
    return decision(key, "review_required", "REVIEW_REQUIRED", guards);
  }
  const override = parsedPolicy && Object.getOwnPropertyDescriptor(parsedPolicy.grants, capability.key);
  if (override) return decision(key, override.value ? "allow" : "deny", override.value ? "POLICY_ALLOW" : "POLICY_DENY", guards);
  const allowed = capability.baseline[role].allowed === true;
  return decision(key, allowed ? "allow" : "deny", allowed ? "BASELINE_ALLOW" : "BASELINE_DENY", guards);
}

/**
 * Build a fresh non-admin in-memory default draft. Materialize only resolved,
 * supported editable entries, exactly matching their individual source baseline.
 * Fixed/unresolved/unsupported/unmapped-Delete entries are absent, not saved Deny;
 * evaluation still uses their source baseline/status. Create/Edit without View is
 * preserved. Throws on invalid catalogue or role; never changes either input.
 */
export function buildDefaultPolicy(catalogue: unknown, role: unknown): PermissionPolicy {
  const parsedCatalogue = parseCatalogue(catalogue);
  if (!parsedCatalogue.value) throw new Error(`INVALID_CATALOGUE: ${parsedCatalogue.errors.join("; ")}`);
  if (!isNonAdminRole(role)) throw new Error(role === "admin" ? "ADMIN_POLICY_FORBIDDEN" : "UNKNOWN_ROLE");
  const grants = Object.create(null) as Record<string, boolean>;
  for (const capability of parsedCatalogue.value.capabilities) {
    if (editableForRole(capability, role)) grants[capability.key] = capability.baseline[role].allowed as boolean;
  }
  return { catalogueRevision: parsedCatalogue.value.revision, role, grants };
}
