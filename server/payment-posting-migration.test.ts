import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("customer payment posting migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0047_automatic_customer_payment_posting.sql"),
    "utf8",
  );

  it("creates an invoice-linked receipt table with decimal rand amounts and idempotency protection", () => {
    expect(migration).toContain("CREATE TABLE `customer_invoice_payments`");
    expect(migration).toContain("`amount` decimal(15,2) NOT NULL");
    expect(migration).toContain("CONSTRAINT `uq_cip_idempotency_key` UNIQUE (`idempotency_key`)");
    expect(migration).toContain("CONSTRAINT `cip_invoice_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`)");
  });

  it("uses information-schema checks rather than unsupported MySQL IF NOT EXISTS DDL", () => {
    expect(migration).toContain("information_schema.TABLES");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toContain("CREATE INDEX IF NOT EXISTS");
  });
});
