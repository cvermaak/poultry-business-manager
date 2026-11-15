/** Reuses the acknowledged-commit/CAS/audit repository protocol.
 * Static trusted scope/catalogue, same existing additive policy/audit tables.
 * Does not modify Supplier storage, auth transport, users, grants or global settings. */
import type { Pool, PoolConnection } from "mysql2/promise";
import { createScopedPermissionPolicyModel, SCOPED_POLICY_ROLES, SCOPED_POLICY_MAX_VERSION } from "../shared/scoped-permission-policy-model";
import type { ScopedPermissionDefinition } from "../shared/scoped-permission-policy-model";
import type { ScopedPersistedPolicy, ScopedPolicyErrorCode, ScopedPolicyRole,
  ScopedPolicySaveRequest, ScopedPolicySaveResult } from "../shared/scoped-permission-policy-model";
import type { PermissionCatalogue, PermissionRole } from "../shared/role-permission-types";

export type ScopedPermissionDbErrorCode = ScopedPolicyErrorCode | "CORRUPT_POLICY" | "DB_FAILURE"
  | "DATABASE_IDENTITY_MISMATCH" | "UNSUPPORTED_DATABASE_VERSION" | "COMMIT_OUTCOME_UNKNOWN";
export const COMMIT_RECOVERY_GUIDANCE = "Outcome unknown. Read durable policy and reconcile its audit before a new versioned request. Do not blindly retry.";
export type ScopedPermissionDbFailure = Readonly<{ ok: false; error: Readonly<{
  code: ScopedPermissionDbErrorCode; recovery?: typeof COMMIT_RECOVERY_GUIDANCE;
}> }>;
export interface ScopedPermissionDbOptions {
  readonly pool: Pool;
  readonly catalogue: unknown;
  readonly clock: () => number;
  readonly expectedDatabase: string;
}
export interface ScopedPermissionDbActor {
  readonly id: number;
  readonly role: PermissionRole;
  readonly isActive: 0 | 1;
}
const OWN_ERRORS = new WeakMap<object, ScopedPermissionDbErrorCode>();
function fail(code: ScopedPermissionDbErrorCode): never {
  const error = new Error(code);
  OWN_ERRORS.set(error, code);
  throw error;
}
export function scopedPermissionDbErrorCode(error: unknown): ScopedPermissionDbErrorCode | undefined {
  return ((typeof error === "object" && error !== null) || typeof error === "function")
    ? OWN_ERRORS.get(error as object) : undefined;
}
function failure(code: ScopedPermissionDbErrorCode): ScopedPermissionDbFailure {
  return Object.freeze({ ok: false as const, error: Object.freeze(code === "COMMIT_OUTCOME_UNKNOWN"
    ? { code, recovery: COMMIT_RECOVERY_GUIDANCE } : { code }) });
}
/** Bounded own data descriptors only. JS cannot bound a Proxy's own trap execution. */
function fields(input: unknown, allowed: readonly string[] | undefined, max: number,
  code: ScopedPermissionDbErrorCode, exact = true): Record<string, unknown> {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) fail(code);
    const proto = Object.getPrototypeOf(input);
    if (proto !== null && proto !== Object.prototype) fail(code);
    const keys = Reflect.ownKeys(input);
    if (keys.length > max || (exact && allowed && keys.length !== allowed.length)) fail(code);
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (typeof key !== "string" || key.length > 160 || ["__proto__", "constructor", "prototype"].includes(key)
        || (allowed && !allowed.includes(key))) fail(code);
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail(code);
      out[key] = descriptor.value;
    }
    if (exact && allowed && !allowed.every(key => Object.prototype.hasOwnProperty.call(out, key))) fail(code);
    return out;
  } catch { fail(code); }
}
function array(input: unknown, max: number, code: ScopedPermissionDbErrorCode): unknown[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) fail(code);
    const length: unknown = Object.getOwnPropertyDescriptor(input, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max
      || Reflect.ownKeys(input).length !== length + 1) fail(code);
    const out: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail(code);
      out.push(descriptor.value);
    }
    return out;
  } catch { fail(code); }
}
function copyCatalogue(input: unknown, budget = { left: 100000 }, depth = 0): unknown {
  if (--budget.left < 0 || depth > 12) fail("INVALID_CATALOGUE");
  if (input === null || typeof input === "boolean" || typeof input === "number") return input;
  if (typeof input === "string") {
    if (input.length > 10000) fail("INVALID_CATALOGUE");
    return input;
  }
  if (Array.isArray(input)) return Object.freeze(array(input, 2048, "INVALID_CATALOGUE")
    .map(item => copyCatalogue(item, budget, depth + 1)));
  const out = fields(input, undefined, 16, "INVALID_CATALOGUE");
  for (const key of Object.keys(out)) out[key] = copyCatalogue(out[key], budget, depth + 1);
  return Object.freeze(out);
}
export function createScopedPermissionDb(definition: ScopedPermissionDefinition, options: ScopedPermissionDbOptions) {
 const SCOPED_POLICY_SCOPE = definition.scope;
 const SCOPED_PERMISSION_KEYS = Object.freeze(definition.catalogue.capabilities.map(c => c.key));
 const ScopedPermissionPolicyModel = createScopedPermissionPolicyModel(definition);
function grantsFrom(input: unknown): Readonly<Record<string, boolean>> {
  const out = fields(input, SCOPED_PERMISSION_KEYS, SCOPED_PERMISSION_KEYS.length, "INVALID_GRANTS", false);
  if (Object.keys(out).some(key => typeof out[key] !== "boolean")) fail("INVALID_GRANTS");
  return Object.freeze(out) as Record<string, boolean>;
}
function roleFrom(input: unknown): ScopedPolicyRole {
  if (input === "admin") fail("ADMIN_POLICY_FORBIDDEN");
  if (typeof input !== "string" || !SCOPED_POLICY_ROLES.some(role => role === input)) fail("UNKNOWN_ROLE");
  return input as ScopedPolicyRole;
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= SCOPED_POLICY_MAX_VERSION;
}
function storedNumber(value: unknown): number {
  if (typeof value === "string") {
    if (!/^(0|[1-9][0-9]{0,15})$/.test(value)) fail("CORRUPT_POLICY");
    value = Number(value);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail("CORRUPT_POLICY");
  return value;
}
function boundedJson(text: unknown, bytes: unknown, limit: number): unknown {
  const size = storedNumber(bytes);
  if (typeof text !== "string" || size < 2 || size > limit || Buffer.byteLength(text, "utf8") > limit) fail("CORRUPT_POLICY");
  return JSON.parse(text as string);
}
function sameGrants(a: Readonly<Record<string, boolean>>, b: Readonly<Record<string, boolean>>): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}
function oneAffected(header: unknown, code: ScopedPermissionDbErrorCode): void {
  try {
    if (typeof header !== "object" || header === null) fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(header, "affectedRows");
    if (!descriptor || !("value" in descriptor) || descriptor.value !== 1) fail(code);
  } catch { fail(code); }
}
const POLICY_FIELDS = ["scope", "role", "catalogue_revision", "version", "updated_at_ms", "grants_bytes", "grants_json"];
const POLICY_COLUMNS = "scope,role,catalogue_revision,version,updated_at_ms,OCTET_LENGTH(grants_json) AS grants_bytes,CAST(CASE WHEN OCTET_LENGTH(grants_json)<=4096 THEN grants_json ELSE NULL END AS CHAR CHARACTER SET utf8mb4) AS grants_json";
const AUDIT_FIELDS = ["id", "scope", "role", "before_version", "after_version", "actor_id", "utc_ms", "reason_bytes", "reason", "audit_bytes", "audit_json"];
const AUDIT_COLUMNS = "id,scope,role,before_version,after_version,actor_id,utc_ms,OCTET_LENGTH(reason) AS reason_bytes,CAST(CASE WHEN OCTET_LENGTH(reason)<=2000 THEN reason ELSE NULL END AS CHAR CHARACTER SET utf8mb4) AS reason,OCTET_LENGTH(audit_json) AS audit_bytes,CAST(CASE WHEN OCTET_LENGTH(audit_json)<=16384 THEN audit_json ELSE NULL END AS CHAR CHARACTER SET utf8mb4) AS audit_json";

function initialize(options: ScopedPermissionDbOptions) {
  let pool: Pool;
  let catalogue: PermissionCatalogue;
  let clock: () => number;
  let expectedDatabase: string;
  try {
    const config = fields(options, ["pool", "catalogue", "clock", "expectedDatabase"], 4, "INVALID_CONFIGURATION");
    if (typeof config.clock !== "function" || typeof config.expectedDatabase !== "string"
      || config.expectedDatabase.length < 1 || config.expectedDatabase.length > 64
      || config.expectedDatabase !== config.expectedDatabase.trim() || /[\u0000-\u001f\u007f]/.test(config.expectedDatabase)) fail("INVALID_CONFIGURATION");
    pool = config.pool as Pool; // Trusted existing mysql2/promise Pool; no auth/configuration inference.
    if (!pool || typeof pool.getConnection !== "function") fail("INVALID_CONFIGURATION");
    clock = config.clock as () => number;
    expectedDatabase = config.expectedDatabase;
    try {
      const source = copyCatalogue(config.catalogue) as PermissionCatalogue;
      new ScopedPermissionPolicyModel({ catalogue: source, clock: () => 1 }); // Exact source-defined scoped baseline, including per-role Blocks.
      catalogue = Object.freeze({ revision: source.revision, capabilities: Object.freeze(source.capabilities
        .filter(item => SCOPED_PERMISSION_KEYS.some(key => key === item.key))) }) as unknown as PermissionCatalogue;
    } catch { fail("INVALID_CATALOGUE"); }
  } catch (error) { fail(scopedPermissionDbErrorCode(error) ?? "INVALID_CONFIGURATION"); }

  async function rows(connection: PoolConnection, sql: string, values: unknown[] = [], max = 1): Promise<unknown[]> {
    const [result] = await connection.execute(sql, values);
    return array(result, max, "CORRUPT_POLICY");
  }
  async function verify(connection: PoolConnection): Promise<boolean> {
    const [result] = await connection.query("SELECT DATABASE() AS db, VERSION() AS version");
    const identity = array(result, 1, "DATABASE_IDENTITY_MISMATCH");
    if (identity.length !== 1) fail("DATABASE_IDENTITY_MISMATCH");
    const row = fields(identity[0], ["db", "version"], 2, "DATABASE_IDENTITY_MISMATCH");
    if (row.db !== expectedDatabase) fail("DATABASE_IDENTITY_MISMATCH");
    if (typeof row.version !== "string" || row.version.length > 128) fail("UNSUPPORTED_DATABASE_VERSION");
    if (/^(5\.7\.25|8\.0\.11)-TiDB-v[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:-[A-Za-z0-9][A-Za-z0-9.+-]{0,80})?$/.test(row.version)) return true;
    if (!/^[89]\.[0-9]{1,3}\.[0-9]{1,3}(?:-(?:commercial|community|log|debug))*$/.test(row.version)) fail("UNSUPPORTED_DATABASE_VERSION");
    return false;
  }
  function discard(connection: PoolConnection): void { try { connection.destroy(); } catch { /* never inspect driver errors */ } }
  async function acquired<T>(operation: (connection: PoolConnection) => Promise<T>, transactional = true): Promise<T> {
    let connection: PoolConnection | undefined;
    let begun = false;
    let commitSent = false;
    let success = false;
    try {
      connection = await pool.getConnection();
      const tidb = await verify(connection); // Exact trusted namespace on EVERY acquisition, including resolver/reads.
      if (transactional) {
        begun = true;
        if (tidb) await connection.query("BEGIN PESSIMISTIC");
        else await connection.beginTransaction(); // No SET SESSION/global changes.
      }
      const result = await operation(connection);
      if (transactional) { commitSent = true; await connection.commit(); begun = false; }
      success = true;
      return result;
    } catch (error) {
      if (commitSent) fail("COMMIT_OUTCOME_UNKNOWN");
      if (connection && begun) { try { await connection.rollback(); } catch { /* discard regardless */ } }
      return fail(scopedPermissionDbErrorCode(error) ?? "DB_FAILURE");
    } finally {
      if (connection) {
        if (!success) discard(connection);
        else { try { connection.release(); } catch { discard(connection); } }
      }
    }
  }
  async function actor(connection: PoolConnection, id: number, locked: boolean): Promise<ScopedPermissionDbActor> {
    const found = await rows(connection, `SELECT id,role,isActive FROM users WHERE id=?${locked ? " FOR UPDATE" : ""}`, [id]);
    if (found.length !== 1) fail("INVALID_PRINCIPAL");
    const row = fields(found[0], ["id", "role", "isActive"], 3, "INVALID_PRINCIPAL");
    if (row.id !== id || !positive(row.id) || (row.isActive !== 0 && row.isActive !== 1)) fail("INVALID_PRINCIPAL");
    if (row.role !== "admin" && !SCOPED_POLICY_ROLES.some(role => role === row.role)) fail("UNKNOWN_ROLE");
    if (locked && row.isActive === 0) fail("INACTIVE_PRINCIPAL");
    if (locked && row.role !== "admin") fail("ADMIN_REQUIRED");
    return Object.freeze(row) as unknown as ScopedPermissionDbActor;
  }
  function decoded(role: ScopedPolicyRole, raw: unknown): { policy: ScopedPersistedPolicy; updated: number | null } {
    try {
      const row = fields(raw, POLICY_FIELDS, 7, "CORRUPT_POLICY");
      if (row.scope !== SCOPED_POLICY_SCOPE || row.role !== role || row.catalogue_revision !== catalogue.revision) fail("CORRUPT_POLICY");
      const version = storedNumber(row.version);
      const updated = row.updated_at_ms === null ? null : storedNumber(row.updated_at_ms);
      if (!validVersion(version) || (version === 0 ? updated !== null : !positive(updated))) fail("CORRUPT_POLICY");
      const grants = grantsFrom(boundedJson(row.grants_json, row.grants_bytes, 4096));
      const policy = new ScopedPermissionPolicyModel({ catalogue, clock: () => 1, initialPolicies: [{
        scope: SCOPED_POLICY_SCOPE, version, policy: { role, catalogueRevision: catalogue.revision, grants },
      }] }).getPolicy(role);
      return { policy, updated };
    } catch { fail("CORRUPT_POLICY"); }
  }
  function auditSnapshot(raw: unknown, role: ScopedPolicyRole, version: number): Readonly<Record<string, boolean>> {
    const snapshot = fields(raw, ["version", "grants", "effectiveGrants"], 3, "CORRUPT_POLICY");
    if (snapshot.version !== version) fail("CORRUPT_POLICY");
    const grants = grantsFrom(snapshot.grants);
    const effective = fields(snapshot.effectiveGrants, SCOPED_PERMISSION_KEYS, SCOPED_PERMISSION_KEYS.length, "CORRUPT_POLICY");
    const model = new ScopedPermissionPolicyModel({ catalogue, clock: () => 1, initialPolicies: [{
      scope: SCOPED_POLICY_SCOPE, version, policy: { role, catalogueRevision: catalogue.revision, grants },
    }] });
    for (const key of SCOPED_PERMISSION_KEYS) {
      if (typeof effective[key] !== "boolean" || effective[key] !== model.evaluate({
        authenticated: true, active: true, role, actorId: 1 }, key).roleGatePassed) fail("CORRUPT_POLICY");
    }
    return grants;
  }
  async function policyWithAudit(connection: PoolConnection, role: ScopedPolicyRole): Promise<ScopedPersistedPolicy> {
    const values = [SCOPED_POLICY_SCOPE, role];
    const found = await rows(connection, `SELECT ${POLICY_COLUMNS} FROM supplier_permission_policies WHERE scope=? AND role=? FOR UPDATE`, values);
    if (found.length !== 1) fail("CORRUPT_POLICY"); // All five rows must be seeded by deployment; never lazy-upsert.
    const { policy, updated } = decoded(role, found[0]);
    try {
      // Current locking reads under the policy lock; bounded payloads, scoped indexed COUNT, not history download.
      const counts = await rows(connection, "SELECT COUNT(*) AS audit_count FROM supplier_permission_audit WHERE scope=? AND role=? FOR UPDATE", values);
      if (counts.length !== 1 || storedNumber(fields(counts[0], ["audit_count"], 1, "CORRUPT_POLICY").audit_count) !== policy.version) fail("CORRUPT_POLICY");
      const latest = await rows(connection, `SELECT ${AUDIT_COLUMNS} FROM supplier_permission_audit WHERE scope=? AND role=? ORDER BY after_version DESC LIMIT 1 FOR UPDATE`, values);
      if (policy.version === 0) { if (latest.length !== 0) fail("CORRUPT_POLICY"); return policy; }
      if (latest.length !== 1) fail("CORRUPT_POLICY");
      const row = fields(latest[0], AUDIT_FIELDS, 11, "CORRUPT_POLICY");
      const before = storedNumber(row.before_version);
      const after = storedNumber(row.after_version);
      const actorId = storedNumber(row.actor_id);
      const utcMs = storedNumber(row.utc_ms);
      const reasonBytes = storedNumber(row.reason_bytes);
      if (!positive(storedNumber(row.id)) || row.scope !== SCOPED_POLICY_SCOPE || row.role !== role
        || before !== policy.version - 1 || after !== policy.version || !positive(actorId) || utcMs !== updated
        || reasonBytes < 1 || reasonBytes > 2000 || typeof row.reason !== "string" || row.reason.length > 500
        || row.reason.length === 0 || row.reason !== row.reason.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(row.reason)) fail("CORRUPT_POLICY");
      const audit = fields(boundedJson(row.audit_json, row.audit_bytes, 16384),
        ["actorId", "actorRole", "targetRole", "scope", "catalogueRevision", "before", "after", "reason", "utcMs"], 9, "CORRUPT_POLICY");
      if (audit.actorId !== actorId || audit.actorRole !== "admin" || audit.targetRole !== role
        || audit.scope !== SCOPED_POLICY_SCOPE || audit.catalogueRevision !== catalogue.revision
        || audit.reason !== row.reason || audit.utcMs !== utcMs) fail("CORRUPT_POLICY");
      const beforeGrants = auditSnapshot(audit.before, role, before);
      const afterGrants = auditSnapshot(audit.after, role, after);
      if (!sameGrants(afterGrants, policy.policy.grants) || sameGrants(beforeGrants, afterGrants)) fail("CORRUPT_POLICY");
      return policy;
    } catch { fail("CORRUPT_POLICY"); }
  }
  async function readPolicy(input: unknown): Promise<Readonly<{ ok: true; policy: ScopedPersistedPolicy }> | ScopedPermissionDbFailure> {
    try {
      const role = roleFrom(input);
      return await acquired(async connection => Object.freeze({ ok: true as const, policy: await policyWithAudit(connection, role) }));
    } catch (error) { return failure(scopedPermissionDbErrorCode(error) ?? "DB_FAILURE"); }
  }
  async function resolveActor(id: unknown): Promise<ScopedPermissionDbActor> {
    if (!positive(id)) fail("INVALID_PRINCIPAL");
    return acquired(connection => actor(connection, id, false), false);
  }
  async function save(trustedActorId: unknown, request: unknown): Promise<ScopedPolicySaveResult | ScopedPermissionDbFailure> {
    try {
      if (!positive(trustedActorId)) fail("INVALID_PRINCIPAL");
      // Original descriptors/scalars/grants captured before ANY await, including model preflight.
      const source = fields(request, ["role", "catalogueRevision", "expectedVersion", "grants", "reason"], 5, "INVALID_REQUEST");
      const role = roleFrom(source.role);
      if (typeof source.catalogueRevision !== "string" || source.catalogueRevision.length > 160) fail("INVALID_REQUEST");
      if (!validVersion(source.expectedVersion)) fail("INVALID_VERSION");
      if (typeof source.reason !== "string" || source.reason.length > 4096) fail("INVALID_REASON");
      const grants = grantsFrom(source.grants);
      const preflight = await new ScopedPermissionPolicyModel({ catalogue, clock: () => 1 }).save(
        { authenticated: true, active: true, role: "admin", actorId: 1 }, Object.freeze({
          role, catalogueRevision: source.catalogueRevision, expectedVersion: 0, grants, reason: source.reason,
        }));
      if (!preflight.ok) return preflight;
      const draft: ScopedPolicySaveRequest = Object.freeze({ role, catalogueRevision: preflight.policy.policy.catalogueRevision,
        expectedVersion: source.expectedVersion, grants: preflight.policy.policy.grants, reason: preflight.reason });
      return await acquired(async connection => {
        await actor(connection, trustedActorId, true); // Lock users.id FIRST, then unique scope/role policy.
        const before = await policyWithAudit(connection, role);
        const result = await new ScopedPermissionPolicyModel({ catalogue, clock, initialPolicies: [before] }).save(
          { authenticated: true, active: true, role: "admin", actorId: trustedActorId }, draft);
        if (!result.ok) fail(result.error.code);
        if (result.changed) {
          if (!result.audit) fail("AUDIT_FAILURE");
          const audit = result.audit;
          const auditJson = JSON.stringify(audit); // Only model-owned frozen data, never original request/driver errors.
          if (Buffer.byteLength(auditJson, "utf8") > 16384) fail("AUDIT_FAILURE");
          try {
            const [updated] = await connection.execute("UPDATE supplier_permission_policies SET catalogue_revision=?,version=?,grants_json=?,updated_at_ms=? WHERE scope=? AND role=? AND version=?",
              [catalogue.revision, result.policy.version, JSON.stringify(result.policy.policy.grants), audit.utcMs, SCOPED_POLICY_SCOPE, role, before.version]);
            oneAffected(updated, "STALE_VERSION");
          } catch (error) { fail(scopedPermissionDbErrorCode(error) ?? "POLICY_FAILURE"); }
          try {
            const [inserted] = await connection.execute("INSERT INTO supplier_permission_audit(scope,role,before_version,after_version,actor_id,utc_ms,reason,audit_json) VALUES(?,?,?,?,?,?,?,?)",
              [audit.scope, audit.targetRole, audit.before.version, audit.after.version, audit.actorId, audit.utcMs, audit.reason, auditJson]);
            oneAffected(inserted, "AUDIT_FAILURE");
          } catch { fail("AUDIT_FAILURE"); }
        }
        await actor(connection, trustedActorId, true); // Fresh numeric active Admin while the original lock remains held.
        return result; // acquired() publishes success only after acknowledged COMMIT; no-op has no mutation/clock.
      });
    } catch (error) { return failure(scopedPermissionDbErrorCode(error) ?? "DB_FAILURE"); }
  }
  return Object.freeze({ resolveActor, readPolicy, save });
}

return initialize(options);
}

export type ScopedPermissionDb = ReturnType<typeof createScopedPermissionDb>;
