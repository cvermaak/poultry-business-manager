import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Period Close migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0053_period_close_financial_controls.sql"), "utf8");

  it("creates period locks, review evidence, and financial-control action audit records", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `financial_periods`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `financial_control_reviews`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `financial_period_actions`");
    expect(migration).toContain("`status` enum('open','closed')");
    expect(migration).toContain("`actionType` enum('period_created','review_approved','review_exception','period_closed','period_reopened','journal_reversed')");
  });

  it("uses information-schema guarded indexes and avoids unsupported Railway DDL shortcuts", () => {
    expect(migration).toContain("information_schema.STATISTICS");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toContain("CREATE INDEX IF NOT EXISTS");
  });
});
