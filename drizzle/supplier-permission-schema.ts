import { mysqlTable, varchar, mysqlEnum, int, bigint, json, primaryKey, uniqueIndex, foreignKey } from "drizzle-orm/mysql-core";

const profiles = ["farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator"] as const;
/** Active pilot tables. Defaults are inherited through exactly five explicit v0
 * rows at bootstrap; no Admin policy, automatic upsert, CHECK, trigger or auth FK.
 * Audit actor ID remains historical even if a user is later physically deleted.
 */
export const supplierPermissionPolicies = mysqlTable("supplier_permission_policies", {
  scope: varchar("scope", { length: 40 }).notNull(),
  role: mysqlEnum("role", profiles).notNull(),
  catalogueRevision: varchar("catalogue_revision", { length: 160 }).notNull(),
  version: int("version").notNull(),
  grantsJson: json("grants_json").notNull(),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }),
}, table => [primaryKey({ columns: [table.scope, table.role] })]);

export const supplierPermissionAudit = mysqlTable("supplier_permission_audit", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  scope: varchar("scope", { length: 40 }).notNull(),
  role: mysqlEnum("role", profiles).notNull(),
  beforeVersion: int("before_version").notNull(),
  afterVersion: int("after_version").notNull(),
  actorId: int("actor_id").notNull(),
  utcMs: bigint("utc_ms", { mode: "number" }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  auditJson: json("audit_json").notNull(),
}, table => [uniqueIndex("one_audit_per_role_version").on(table.scope, table.role, table.afterVersion),
  foreignKey({ name: "fk_supplier_permission_audit_policy", columns: [table.scope, table.role],
    foreignColumns: [supplierPermissionPolicies.scope, supplierPermissionPolicies.role] }).onDelete("restrict").onUpdate("restrict")]);
