import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mysqlTimestamp } from "./db";

const dbSourcePath = resolve(process.cwd(), "server/db.ts");

describe("Sales Order MySQL timestamp handling", () => {
  it("formats UTC dates in the strict MySQL timestamp format", () => {
    expect(mysqlTimestamp(new Date("2026-09-19T20:09:05.867Z"))).toBe(
      "2026-09-19 20:09:05"
    );
  });

  it("uses the MySQL-safe timestamp helper for order update, status, and cancellation writes", () => {
    const source = readFileSync(dbSourcePath, "utf8");
    const salesOrderUpdateSource = source.slice(
      source.indexOf("export async function updateSalesOrder("),
      source.indexOf("export async function replaceSalesOrderItems(")
    );

    expect(salesOrderUpdateSource.match(/updatedAt: mysqlTimestamp\(\)/g)).toHaveLength(3);
    expect(salesOrderUpdateSource).not.toContain("updatedAt: new Date().toISOString()");
  });
});
