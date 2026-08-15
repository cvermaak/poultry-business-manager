import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy invoice amount repair migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0049_repair_legacy_invoice_header_rands.sql"),
    "utf8",
  );

  it("repairs only invoices whose canonical inclusive total proves their old header is exactly 100×", () => {
    expect(migration).toContain("`totalAmount` = CAST(`inclusiveTotal` AS DECIMAL(15,2))");
    expect(migration).toContain("`balanceDue` = GREATEST(");
    expect(migration).toContain("ABS(CAST(`totalAmount` AS DECIMAL(15,2)) - CAST(`inclusiveTotal` AS DECIMAL(15,2)) * 100) <= 0.01");
    expect(migration).toContain("`updatedAt` = CURRENT_TIMESTAMP");
  });
});
