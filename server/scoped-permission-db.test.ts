import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { createScopedPermissionDb, scopedPermissionDbErrorCode } from "./scoped-permission-db";
import { BUSINESS_PERMISSION_DEFINITIONS } from '../shared/business-permission-definitions';
import { createScopedPermissionPolicyModel, SCOPED_POLICY_ROLES as SUPPLIER_POLICY_ROLES } from '../shared/scoped-permission-policy-model';
const definition=BUSINESS_PERMISSION_DEFINITIONS.customers;
const PREPARED_PERMISSION_CATALOGUE=definition.catalogue;
const SUPPLIER_PERMISSION_KEYS=definition.catalogue.capabilities.map(c=>c.key);
const SUPPLIER_POLICY_SCOPE=definition.scope;
const SupplierPermissionPolicyModel=createScopedPermissionPolicyModel(definition);

const dbName = "injected_namespace";
const revision = PREPARED_PERMISSION_CATALOGUE.revision;
const key = SUPPLIER_PERMISSION_KEYS[0];
const role = "farm_manager" as const;
const request = (grants: Record<string, boolean> = { [key]: false }, expectedVersion = 0) =>
  ({ role, catalogueRevision: revision, expectedVersion, grants, reason: "Reason for review" });
const code = (value: any) => value.error?.code;
const hostile = new Proxy({}, { get() { throw new Error("MUST NOT INSPECT DRIVER ERROR"); },
  getPrototypeOf() { throw new Error("MUST NOT INSPECT PROTOTYPE"); } });
function fixture() {
  const state = {
    db: dbName, version: "8.0.43", actor: { id: 7, role: "admin", isActive: 1 } as any,
    policy: { scope: SUPPLIER_POLICY_SCOPE, role, catalogue_revision: revision, version: 0,
      updated_at_ms: null, grants_bytes: 2, grants_json: "{}" } as any,
    audits: [] as any[], countOverride: undefined as unknown, calls: [] as string[],
    updateAffected: 1, insertAffected: 1, fault: "", readOverride: undefined as unknown,
    recheckActor: undefined as unknown, lockedActors: 0, rollbackThrows: false,
  };
  let snapshot: any;
  const connection = {
    query: vi.fn(async (sql: string) => {
      state.calls.push(sql);
      if (state.fault === "query") throw hostile;
      if (sql.startsWith("SELECT DATABASE")) return [[{ db: state.db, version: state.version }], []];
      if (sql === "BEGIN PESSIMISTIC") snapshot = JSON.parse(JSON.stringify([state.policy, state.audits]));
      else throw new Error("Unexpected SQL");
      return [[], []];
    }),
    beginTransaction: vi.fn(async () => {
      state.calls.push("beginTransaction");
      snapshot = JSON.parse(JSON.stringify([state.policy, state.audits]));
      if (state.fault === "begin") throw hostile;
    }),
    execute: vi.fn(async (sql: string, values: any[]) => {
      state.calls.push(sql);
      if (state.fault && sql.startsWith(state.fault)) throw hostile;
      if (sql.startsWith("SELECT id,role,isActive")) {
        if (sql.endsWith("FOR UPDATE")) {
          state.lockedActors++;
          if (state.lockedActors === 2 && state.recheckActor !== undefined) return [[state.recheckActor], []];
        }
        return [state.actor === null ? [] : [state.actor], []];
      }
      if (sql.includes("FROM supplier_permission_policies")) {
        return [state.readOverride !== undefined ? state.readOverride : state.policy === null ? [] : [state.policy], []];
      }
      if (sql.startsWith("SELECT COUNT")) return [[{ audit_count: state.countOverride ?? state.audits.length }], []];
      if (sql.includes("FROM supplier_permission_audit")) return [state.audits.slice(-1), []];
      if (sql.startsWith("UPDATE")) {
        if (state.updateAffected === 1) Object.assign(state.policy, { catalogue_revision: values[0], version: values[1],
          grants_json: values[2], grants_bytes: Buffer.byteLength(values[2]), updated_at_ms: values[3] });
        return [{ affectedRows: state.updateAffected }, []];
      }
      if (sql.startsWith("INSERT")) {
        if (state.insertAffected === 1) state.audits.push({ id: state.audits.length + 1, scope: values[0], role: values[1],
          before_version: values[2], after_version: values[3], actor_id: values[4], utc_ms: values[5], reason: values[6],
          reason_bytes: Buffer.byteLength(values[6]), audit_json: values[7], audit_bytes: Buffer.byteLength(values[7]) });
        return [{ affectedRows: state.insertAffected }, []];
      }
      throw new Error("Unexpected SQL");
    }),
    commit: vi.fn(async () => { state.calls.push("COMMIT"); if (state.fault === "commit") throw hostile; }),
    rollback: vi.fn(async () => {
      state.calls.push("ROLLBACK");
      if (state.rollbackThrows) throw hostile;
      if (snapshot) [state.policy, state.audits] = snapshot;
    }),
    destroy: vi.fn(() => { state.calls.push("destroy"); }),
    release: vi.fn(() => { state.calls.push("release"); }),
  };
  const pool = { getConnection: vi.fn(async () => connection) };
  const clock = vi.fn(() => 1770000000123);
  const repository = createScopedPermissionDb(definition,{ pool: pool as unknown as Pool, catalogue: PREPARED_PERMISSION_CATALOGUE,
    clock, expectedDatabase: dbName });
  return { state, connection, pool, clock, repository };
}

describe("injected Supplier database repository (synthetic driver only)", () => {
  it("constructs without acquisition and snapshots catalogue configuration", () => {
    const f = fixture(); expect(f.pool.getConnection).not.toHaveBeenCalled();
    expect(Object.isFrozen(f.repository)).toBe(true);
  });
  it("native MySQL save locks actor before unique role policy, CAS and audit, rechecks before commit", async () => {
    const f = fixture(); const result = await f.repository.save(7, request());
    expect(result).toMatchObject({ ok: true, changed: true, policy: { version: 1 }, audit: { actorId: 7 } });
    expect(f.state.calls[0]).toBe("SELECT DATABASE() AS db, VERSION() AS version");
    expect(f.state.calls[1]).toBe("beginTransaction");
    expect(f.state.calls[2]).toBe("SELECT id,role,isActive FROM users WHERE id=? FOR UPDATE");
    expect(f.state.calls[3]).toContain("WHERE scope=? AND role=? FOR UPDATE");
    expect(f.state.calls.slice(-3)).toEqual(["SELECT id,role,isActive FROM users WHERE id=? FOR UPDATE", "COMMIT", "release"]);
    const update = f.connection.execute.mock.calls.find(call => call[0].startsWith("UPDATE"))!;
    expect(update[0]).toContain("AND version=?"); expect(update[1].slice(-3)).toEqual([SUPPLIER_POLICY_SCOPE, role, 0]);
    expect(f.state.audits).toHaveLength(1); expect(f.connection.rollback).not.toHaveBeenCalled();
    expect(f.state.calls.join("\n")).not.toMatch(/SET SESSION|SET GLOBAL|password|hash|\bGRANT\b|UPSERT|ON DUPLICATE/i);
  });
  it.each(["5.7.25-TiDB-v7.5.1", "8.0.11-TiDB-v8.5.3-serverless"])("TiDB %s uses explicit pessimistic begin without session mutation", async version => {
    const f = fixture(); f.state.version = version;
    expect((await f.repository.save(7, request())).ok).toBe(true);
    expect(f.state.calls[1]).toBe("BEGIN PESSIMISTIC"); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
  });
  it.each(["8.4.6", "9.1.0", "8.0.43-commercial-log"])("recognizes bounded native MySQL %s", async version => {
    const f = fixture(); f.state.version = version; expect((await f.repository.readPolicy(role)).ok).toBe(true);
  });
  it.each(["5.7.25", "10.11.6-MariaDB", "8.0.43-TiDB-ish", "8.0.43 arbitrary", "8.0.43-TiDB-v8.5.3", "x".repeat(129)])(
    "fails closed on unsupported/ambiguous version %s", async version => {
      const f = fixture(); f.state.version = version;
      expect(code(await f.repository.readPolicy(role))).toBe("UNSUPPORTED_DATABASE_VERSION");
      expect(f.connection.beginTransaction).not.toHaveBeenCalled(); expect(f.connection.destroy).toHaveBeenCalledOnce();
    });
  it.each(["read", "save", "resolve"])("guards exact database identity for %s", async method => {
    const f = fixture(); f.state.db = dbName.toUpperCase();
    if (method === "resolve") {
      await expect(f.repository.resolveActor(7)).rejects.toSatisfy(error => scopedPermissionDbErrorCode(error) === "DATABASE_IDENTITY_MISMATCH");
    } else expect(code(await (method === "read" ? f.repository.readPolicy(role) : f.repository.save(7, request())))).toBe("DATABASE_IDENTITY_MISMATCH");
    expect(f.connection.execute).not.toHaveBeenCalled(); expect(f.connection.destroy).toHaveBeenCalledOnce();
  });
  it("reverifies each acquisition, including repeat reads", async () => {
    const f = fixture(); expect((await f.repository.readPolicy(role)).ok).toBe(true);
    f.state.db = "other"; expect(code(await f.repository.readPolicy(role))).toBe("DATABASE_IDENTITY_MISMATCH");
    expect(f.connection.query).toHaveBeenCalledTimes(2);
  });
  it("resolver returns exactly three fields and no role-filtering/auth change", async () => {
    const f = fixture(); f.state.actor = { id: 7, role: "sales_staff", isActive: 0 };
    expect(await f.repository.resolveActor(7)).toEqual(f.state.actor);
    expect(f.state.calls).toEqual(["SELECT DATABASE() AS db, VERSION() AS version", "SELECT id,role,isActive FROM users WHERE id=?", "release"]);
  });
  it.each([null, { id: 8, role: "admin", isActive: 1 }, { id: 7, role: "admin", isActive: true },
    { id: 7, role: "admin", isActive: 1, password: "not accepted" }])("rejects malformed resolver actor %j", async actor => {
      const f = fixture(); f.state.actor = actor;
      await expect(f.repository.resolveActor(7)).rejects.toSatisfy(error => scopedPermissionDbErrorCode(error) === "INVALID_PRINCIPAL");
    });
  it.each([["sales_staff", 1, "ADMIN_REQUIRED"], ["admin", 0, "INACTIVE_PRINCIPAL"], ["Admin", 1, "UNKNOWN_ROLE"]])(
    "rejects stored nonadmin/inactive/unknown actor %s", async (actorRole, active, expected) => {
      const f = fixture(); f.state.actor = { id: 7, role: actorRole, isActive: active };
      expect(code(await f.repository.save(7, request()))).toBe(expected);
      expect(f.state.calls.some(sql => sql.includes("FROM supplier_permission_policies"))).toBe(false);
      expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.destroy).toHaveBeenCalledOnce();
    });
  it("recheck fails before commit and rolls back policy/audit", async () => {
    const f = fixture(); f.state.recheckActor = { id: 7, role: "admin", isActive: 0 };
    expect(code(await f.repository.save(7, request()))).toBe("INACTIVE_PRINCIPAL");
    expect(f.state.policy.version).toBe(0); expect(f.state.audits).toHaveLength(0); expect(f.connection.commit).not.toHaveBeenCalled();
  });
  it.each(SUPPLIER_POLICY_ROLES)("missing preseeded row for %s fails closed without insert", async target => {
    const f = fixture(); f.state.policy = null;
    expect(code(await f.repository.readPolicy(target))).toBe("CORRUPT_POLICY");
    expect(code(await f.repository.save(7, { ...request(), role: target }))).toBe("CORRUPT_POLICY");
    expect(f.state.calls.some(sql => sql.startsWith("INSERT"))).toBe(false);
  });
  it("v0 no-op does no mutation and never calls clock", async () => {
    const f = fixture(); expect(await f.repository.save(7, request({}))).toMatchObject({ ok: true, changed: false, policy: { version: 0 } });
    expect(f.clock).not.toHaveBeenCalled(); expect(f.state.calls.some(sql => /^(UPDATE|INSERT)/.test(sql))).toBe(false);
    expect(f.connection.commit).toHaveBeenCalledOnce();
  });
  it("positive-version no-op checks durable audit and does not call clock again", async () => {
    const f = fixture(); await f.repository.save(7, request()); f.clock.mockClear();
    expect(await f.repository.save(7, request({ [key]: false }, 1))).toMatchObject({ ok: true, changed: false, policy: { version: 1 } });
    expect(f.clock).not.toHaveBeenCalled(); expect(f.state.audits).toHaveLength(1);
  });
  it("stale expected version and zero-row CAS never create audit", async () => {
    const f = fixture(); expect(code(await f.repository.save(7, request({ [key]: false }, 1)))).toBe("STALE_VERSION");
    expect(f.clock).not.toHaveBeenCalled(); f.state.updateAffected = 0;
    expect(code(await f.repository.save(7, request()))).toBe("STALE_VERSION"); expect(f.state.audits).toHaveLength(0);
  });
  it("two changes survive re-read with count/version linkage and current latest audit", async () => {
    const f = fixture(); await f.repository.save(7, request());
    expect(await f.repository.save(7, request({}, 1))).toMatchObject({ ok: true, changed: true, policy: { version: 2 } });
    expect((await f.repository.readPolicy(role)).ok).toBe(true); expect(f.state.audits).toHaveLength(2);
    // Explicit design limit: historical payloads are not downloaded or cryptographically verified.
    f.state.audits[0].audit_json = "historical operator tamper";
    expect((await f.repository.readPolicy(role)).ok).toBe(true);
  });
  it.each(["UPDATE", "INSERT"])("never invokes hostile affectedRows getter on %s response", async prefix => {
    const f = fixture(); const original = f.connection.execute.getMockImplementation()!;
    const getter = vi.fn(() => { throw hostile; });
    f.connection.execute.mockImplementation(async (sql, values) => {
      if (sql.startsWith(prefix)) return [Object.defineProperty({}, "affectedRows", { enumerable: true, get: getter }), []];
      return original(sql, values);
    });
    expect(code(await f.repository.save(7, request()))).toBe(prefix === "UPDATE" ? "STALE_VERSION" : "AUDIT_FAILURE");
    expect(getter).not.toHaveBeenCalled(); expect(f.connection.rollback).toHaveBeenCalledOnce();
  });
  it("SQL bounds JSON payload transport before CAST and selects only indexed target rows", async () => {
    const f = fixture(); await f.repository.readPolicy(role);
    const sql = f.connection.execute.mock.calls.map(call => call[0]).join("\n");
    expect(sql).toContain("CASE WHEN OCTET_LENGTH(grants_json)<=4096 THEN grants_json ELSE NULL");
    expect(sql).toContain("CASE WHEN OCTET_LENGTH(audit_json)<=16384 THEN audit_json ELSE NULL");
    expect(sql).toContain("ORDER BY after_version DESC LIMIT 1");
    expect(f.connection.execute.mock.calls.every(call => call[1][0] === SUPPLIER_POLICY_SCOPE && call[1][1] === role)).toBe(true);
  });
  it.each([0, 2])("audit insert affectedRows=%s rolls back both durable changes", async affected => {
    const f = fixture(); f.state.insertAffected = affected;
    expect(code(await f.repository.save(7, request()))).toBe("AUDIT_FAILURE");
    expect(f.state.policy.version).toBe(0); expect(f.state.audits).toHaveLength(0);
  });
  it.each([["UPDATE", "POLICY_FAILURE"], ["INSERT", "AUDIT_FAILURE"], ["begin", "DB_FAILURE"], ["query", "DB_FAILURE"]])(
    "sanitizes hostile %s errors without exception reflection", async (fault, expected) => {
      const f = fixture(); f.state.fault = fault;
      expect(code(await f.repository.save(7, request()))).toBe(expected); expect(f.connection.destroy).toHaveBeenCalledOnce();
      expect(f.connection.release).not.toHaveBeenCalled();
    });
  it("lost commit acknowledgement returns unknown, destroys, and never rolls back/retries", async () => {
    const f = fixture(); f.state.fault = "commit";
    expect(await f.repository.save(7, request())).toMatchObject({ ok: false, error: { code: "COMMIT_OUTCOME_UNKNOWN", recovery: expect.stringContaining("Do not blindly retry") } });
    expect(f.pool.getConnection).toHaveBeenCalledOnce(); expect(f.connection.rollback).not.toHaveBeenCalled();
    expect(f.connection.destroy).toHaveBeenCalledOnce(); expect(f.connection.release).not.toHaveBeenCalled();
    expect(f.state.policy.version).toBe(1); // Synthetic commit fault intentionally leaves publication ambiguous.
  });
  it("read commit failure also discards and returns unknown", async () => {
    const f = fixture(); f.state.fault = "commit"; expect(code(await f.repository.readPolicy(role))).toBe("COMMIT_OUTCOME_UNKNOWN");
    expect(f.connection.rollback).not.toHaveBeenCalled(); expect(f.connection.destroy).toHaveBeenCalledOnce();
  });
  it("rollback failure is swallowed and discarded without driver leakage", async () => {
    const f = fixture(); f.state.updateAffected = 0; f.state.rollbackThrows = true;
    expect(code(await f.repository.save(7, request()))).toBe("STALE_VERSION");
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.destroy).toHaveBeenCalledOnce();
  });
  it("consistent read begins before policy/count/latest and commits afterward", async () => {
    const f = fixture(); await f.repository.save(7, request()); f.state.calls = [];
    expect(await f.repository.readPolicy(role)).toMatchObject({ ok: true, policy: { version: 1 } });
    expect(f.state.calls[1]).toBe("beginTransaction"); expect(f.state.calls[2]).toContain("supplier_permission_policies");
    expect(f.state.calls[3]).toContain("COUNT(*)"); expect(f.state.calls[4]).toContain("LIMIT 1 FOR UPDATE");
    expect(f.state.calls.slice(-2)).toEqual(["COMMIT", "release"]);
  });
  it.each(["version", "grants", "scope", "role", "revision", "time", "json", "oversize", "noncanonical", "extra"])(
    "rejects corrupt exact policy field %s", async mode => {
      const f = fixture(); const row = f.state.policy;
      if (mode === "version") row.version = -1;
      if (mode === "grants") row.grants_json = JSON.stringify({ [key]: false });
      if (mode === "scope") row.scope = "Supplier_management";
      if (mode === "role") row.role = "Farm_manager";
      if (mode === "revision") row.catalogue_revision = "other";
      if (mode === "time") row.updated_at_ms = 1;
      if (mode === "json") row.grants_json = "{bad";
      if (mode === "oversize") row.grants_bytes = 4097;
      if (mode === "noncanonical") row.version = "00";
      if (mode === "extra") row.extra = "no";
      expect(code(await f.repository.readPolicy(role))).toBe("CORRUPT_POLICY");
    });
  it.each(["lost", "count", "before", "after", "actor", "time", "reason", "json", "bytes", "effective", "grants", "extra"])(
    "rejects latest durable audit inconsistency %s", async mode => {
      const f = fixture(); await f.repository.save(7, request()); const row = f.state.audits[0];
      const audit = JSON.parse(row.audit_json);
      if (mode === "lost") f.state.audits = [];
      if (mode === "count") f.state.countOverride = 2;
      if (mode === "before") row.before_version = 1;
      if (mode === "after") row.after_version = 2;
      if (mode === "actor") audit.actorId = 8;
      if (mode === "time") row.utc_ms++;
      if (mode === "reason") audit.reason = "tampered";
      if (mode === "bytes") row.audit_bytes = 16385;
      if (mode === "effective") audit.after.effectiveGrants[key] = true;
      if (mode === "grants") audit.after.grants = {};
      if (mode === "extra") audit.extra = true;
      row.audit_json = mode === "json" ? "bad" : JSON.stringify(audit);
      expect(code(await f.repository.readPolicy(role))).toBe("CORRUPT_POLICY");
    });
  it("v0 cannot coexist with audit history", async () => {
    const f = fixture(); f.state.audits = [{}]; expect(code(await f.repository.readPolicy(role))).toBe("CORRUPT_POLICY");
  });
  it("canonical numeric/text BIGINTs decode without coercing JSON scalars", async () => {
    const f = fixture(); await f.repository.save(7, request()); f.state.policy.version = "1";
    f.state.policy.updated_at_ms = String(f.state.policy.updated_at_ms);
    const row = f.state.audits[0]; for (const field of ["id", "before_version", "after_version", "actor_id", "utc_ms"]) row[field] = String(row[field]);
    expect((await f.repository.readPolicy(role)).ok).toBe(true);
  });
  it.each([null, {}, { length: 0 }, [null], new Proxy([], { getPrototypeOf() { throw hostile; } })])(
    "malformed row/rowset responses fail closed", async value => {
      const f = fixture(); f.state.readOverride = value; expect(code(await f.repository.readPolicy(role))).toBe("CORRUPT_POLICY");
    });
  it("descriptor getters are never invoked for requests or SQL rows", async () => {
    const f = fixture(); const getter = vi.fn(() => { throw hostile; });
    const input = request(); Object.defineProperty(input, "reason", { enumerable: true, get: getter });
    expect(code(await f.repository.save(7, input))).toBe("INVALID_REQUEST"); expect(f.pool.getConnection).not.toHaveBeenCalled();
    const returned = { ...f.state.policy };
    Object.defineProperty(returned, "scope", { enumerable: true, get: getter }); f.state.readOverride = [returned];
    expect(code(await f.repository.readPolicy(role))).toBe("CORRUPT_POLICY"); expect(getter).not.toHaveBeenCalled();
  });
  it("malicious request reflection rejects before SQL", async () => {
    const f = fixture(); const input = new Proxy(request(), { ownKeys() { throw hostile; } });
    expect(code(await f.repository.save(7, input))).toBe("INVALID_REQUEST"); expect(f.pool.getConnection).not.toHaveBeenCalled();
  });
  it("mutable caller request cannot change across model/acquisition awaits", async () => {
    const f = fixture(); const input = request(); const pending = f.repository.save(7, input);
    input.role = "accountant" as any; input.reason = "changed"; input.grants[key] = true; input.expectedVersion = 55;
    const result = await pending; expect(result).toMatchObject({ ok: true, reason: "Reason for review", policy: { policy: { role, grants: { [key]: false } } } });
    expect(Object.isFrozen((result as any).audit.after.grants)).toBe(true);
  });
  it.each([[{ role: "admin" }, "ADMIN_POLICY_FORBIDDEN"], [{ expectedVersion: -1 }, "INVALID_VERSION"],
    [{ grants: { evil: true } }, "INVALID_GRANTS"], [{ grants: { [key]: 1 } }, "INVALID_GRANTS"],
    [{ reason: " " }, "INVALID_REASON"], [{ catalogueRevision: "mismatch" }, "CATALOGUE_MISMATCH"]])(
    "semantic preflight rejects without acquiring DB", async (patch, expected) => {
      const f = fixture(); expect(code(await f.repository.save(7, { ...request(), ...patch }))).toBe(expected);
      expect(f.pool.getConnection).not.toHaveBeenCalled();
    });
  it("injected hostile clock becomes fixed INVALID_CLOCK before any mutation", async () => {
    const f = fixture(); f.clock.mockImplementation(() => { throw hostile; });
    expect(code(await f.repository.save(7, request()))).toBe("INVALID_CLOCK"); expect(f.state.policy.version).toBe(0);
  });
  it("model construction still enforces original six-role Supplier baseline", () => {
    const source = JSON.parse(JSON.stringify(PREPARED_PERMISSION_CATALOGUE));
    source.capabilities.find((item: any) => item.key === key).baseline.admin.allowed = false;
    expect(() => createScopedPermissionDb(definition,{ pool: fixture().pool as unknown as Pool, catalogue: source, clock: () => 1,
      expectedDatabase: dbName })).toThrow("INVALID_CATALOGUE");
    expect(new SupplierPermissionPolicyModel({ catalogue: PREPARED_PERMISSION_CATALOGUE, clock: () => 1 }).getPolicy(role).version).toBe(0);
  });
});
