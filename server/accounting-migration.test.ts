import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Financial Accounting ledger-line migration", () => {
  it("replaces the obsolete unique journal-line index with a non-unique lookup index", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0044_fix_general_ledger_journal_line_index.sql"),
      "utf8",
    );

    expect(migration).toContain("DROP INDEX `general_ledger_entries_entryNumber_unique`");
    expect(migration).toContain("CREATE INDEX `idx_general_ledger_entries_entry_number`");
    expect(migration).not.toContain("CREATE UNIQUE INDEX `idx_general_ledger_entries_entry_number`");
  });
});
