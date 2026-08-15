import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "drizzle/0051_supplier_management_railway_compatibility.sql");
const migration = readFileSync(migrationPath, "utf8");
const executableSql = migration.replace(/^--.*$/gm, "");

describe("Supplier Management Railway compatibility migration", () => {
  it("creates or completes the canonical supplier table used by the active Supplier Management module", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `suppliers`");
    expect(migration).toContain("`supplierNumber` varchar(50)");
    expect(migration).toContain("`preferredContactMethod` enum('email','whatsapp','phone','both')");
    expect(migration).toContain("`isActive` tinyint NOT NULL DEFAULT 1");
    expect(migration).toContain("`bankAccountNumber` varchar(100)");
  });

  it("uses Railway-safe information_schema guards and generates unique legacy supplier numbers", () => {
    expect(migration).toContain("information_schema.COLUMNS");
    expect(migration).toContain("information_schema.STATISTICS");
    expect(executableSql).not.toMatch(/ADD COLUMN IF NOT EXISTS/i);
    expect(executableSql).not.toMatch(/CREATE INDEX IF NOT EXISTS/i);
    expect(migration).toContain("SUP-LEGACY-");
    expect(migration).toContain("CREATE UNIQUE INDEX `uq_suppliers_supplier_number`");
  });
});
