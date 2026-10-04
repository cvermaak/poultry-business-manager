import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const projectRoot = process.cwd();
const routerSource = readFileSync(resolve(projectRoot, "server/routers.ts"), "utf8");
const pageSource = readFileSync(resolve(projectRoot, "client/src/pages/CompanySettings.tsx"), "utf8");
const migrationSource = readFileSync(
  resolve(projectRoot, "drizzle/0057_company_settings_timezone_compatibility.sql"),
  "utf8",
);

function createNonAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "settings-test-user",
      email: "settings-test@example.com",
      name: "Settings Test User",
      loginMethod: "email",
      role: "farm_manager",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Company Settings release readiness", () => {
  it("requires administrator access for both reading and updating Company Settings", () => {
    const settingsRouter = routerSource.slice(
      routerSource.indexOf("companySettings: router({"),
      routerSource.indexOf("invoices: router({"),
    );

    expect(settingsRouter).toContain("get: adminProcedure.query");
    expect(settingsRouter).toContain("update: adminProcedure");
  });

  it("returns a FORBIDDEN error before a non-administrator can read Company Settings", async () => {
    const caller = appRouter.createCaller(createNonAdminContext());

    await expect(caller.companySettings.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks non-administrators in the direct Company Settings route before loading sensitive data", () => {
    expect(pageSource).toContain('const canManageCompanySettings = user?.role === "admin"');
    expect(pageSource).toContain("enabled: canManageCompanySettings");
    expect(pageSource).toContain("Administrator access required");
  });

  it("ships a forward, idempotent timezone compatibility migration", () => {
    expect(migrationSource).toContain("information_schema.columns");
    expect(migrationSource).toContain("table_name = 'company_settings'");
    expect(migrationSource).toContain("column_name = 'timezone'");
    expect(migrationSource).toContain("ADD COLUMN `timezone` varchar(100) NOT NULL DEFAULT ''UTC''");
    expect(migrationSource).toContain("PREPARE company_settings_timezone_statement");
  });
});
