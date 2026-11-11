import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { ModuleNavigationLanding } from "../components/ModuleNavigationLanding";
import { canReadProductionReports } from "../../../shared/production-reports";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const menuSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
const feedPaths = ["/feed-management/formulations", "/feed-management/mill-costs", "/feed-management/customer-pricing", "/feed-orders", "/feed-management/additive-inventory"];
function renderFeed(role?: string, loading = false) {
  return renderToStaticMarkup(React.createElement(Router, { ssrPath: "/feed-management" },
    React.createElement(ModuleNavigationLanding, { moduleKey: "feed-management", role, loading })));
}
function hrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]+)"/g)].map(match => match[1]).sort();
}

describe("approved report and overview routes", () => {
  it.each([["/reports", "Reports"], ["/feed-management", "FeedManagement"]])("registers %s inside the existing authenticated layout", (path, page) => {
    const block = appSource.match(new RegExp(`<Route path="${path}">([\\s\\S]*?)<\\/Route>`));
    expect(block).not.toBeNull();
    expect(block![1]).toContain("<DashboardLayout>");
    expect(block![1]).toContain(`<${page} />`);
    expect(appSource.indexOf(`<Route path="${path}">`)).toBeLessThan(appSource.indexOf('<Route component={NotFound}'));
    expect(appSource).toContain(`import ${page} from "./pages/${page}"`);
  });
  it.each(feedPaths)("retains an existing destination %s", path => {
    expect(appSource).toContain(`<Route path="${path}">`);
  });
  it("renames Reports and places it immediately below Catch Operations", () => {
    const lines = menuSource.split("\n");
    const i = lines.findIndex(line => line.includes('label: "Catch Operations"'));
    expect(lines[i + 1]).toContain('label: "Production Reports", path: "/reports", roles: ["admin", "farm_manager", "accountant"]');
    expect(menuSource).not.toContain('label: "Reports"');
    expect(lines.filter(line => line.includes('path: "/reports"'))).toHaveLength(1);
  });
  it("does not change Finance or Feed Management visibility", () => {
    expect(menuSource).toContain('label: "Financial Reports", path: "/finance", roles: ["admin", "accountant"]');
    expect(menuSource).toContain('label: "Feed Management", path: "/feed-management", roles: ["admin", "farm_manager"]');
  });
  it("replaces the generic report shortcut index with the protected production API", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");
    expect(source).toContain("useAuth");
    expect(source).toContain("productionReports");
    expect(source).not.toContain("ModuleNavigationLanding");
    expect(source).not.toContain('href="/finance"');
  });
  it.each(["admin", "farm_manager", "accountant"])("retains report access for %s", role => {
    expect(canReadProductionReports(role)).toBe(true);
  });
  it.each(["sales_staff", "production_worker", "chicken_house_operator", "unknown", "", undefined])("denies report access for %s", role => {
    expect(canReadProductionReports(role)).toBe(false);
  });
});

describe("Feed Management remains a navigation-only overview", () => {
  it.each(["admin", "farm_manager"])("shows precisely the five existing screens for %s", role => {
    expect(hrefs(renderFeed(role))).toEqual(feedPaths.slice().sort());
  });
  it.each(["accountant", "sales_staff", "production_worker", "chicken_house_operator", "unknown", "", undefined])("does not grant overview access to %s", role => {
    expect(hrefs(renderFeed(role))).toEqual([]);
  });
  it("does not flash links while authentication loads", () => {
    const markup = renderFeed("admin", true);
    expect(hrefs(markup)).toEqual([]);
    expect(markup).toMatch(/loading/i);
  });
  it("uses single-anchor links without invented functionality", () => {
    const markup = renderFeed("admin");
    expect(markup).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
    expect(markup).not.toMatch(/<form|<button|Page Not Found/);
  });
  it("contains no query or mutation logic in the overview presenter or wrapper", () => {
    for (const path of ["client/src/components/ModuleNavigationLanding.tsx", "client/src/pages/FeedManagement.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), path), "utf8")).not.toMatch(/\btrpc\b|\.useQuery\(|\.useMutation\(|\bfetch\(/);
    }
  });
});
