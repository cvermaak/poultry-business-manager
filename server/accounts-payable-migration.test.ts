import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Accounts Payable migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0050_accounts_payable_mill_invoice_posting.sql"),
    "utf8",
  );

  it("adds supplier and balance controls to mill invoices and creates decimal-rand supplier receipts", () => {
    expect(migration).toContain("ADD COLUMN `supplier_id` int NULL");
    expect(migration).toContain("ADD COLUMN `balance_due` decimal(12,2) NOT NULL DEFAULT");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `supplier_invoice_payments`");
    expect(migration).toContain("`amount` decimal(15,2) NOT NULL");
    expect(migration).toContain("CREATE UNIQUE INDEX `uq_sip_idempotency_key`");
    expect(migration).toContain("CONSTRAINT `sip_mill_invoice_fk` FOREIGN KEY (`mill_invoice_id`) REFERENCES `mill_invoices`(`id`)");
  });

  it("uses Railway-safe information-schema guards for repeated DDL", () => {
    expect(migration).toContain("information_schema.COLUMNS");
    expect(migration).toContain("information_schema.STATISTICS");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toContain("CREATE INDEX IF NOT EXISTS");
  });
});
