import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("fully paid invoice status repair migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0048_fix_fully_paid_invoice_status.sql"),
    "utf8",
  );

  it("repairs only active invoice statuses whose stored decimal balance is zero or less", () => {
    expect(migration).toContain("SET\n  `status` = 'paid'");
    expect(migration).toContain("`status` IN ('sent', 'partial', 'overdue')");
    expect(migration).toContain("CAST(`balanceDue` AS DECIMAL(15,2)) <= 0.00");
    expect(migration).not.toContain("'cancelled'");
  });
});
