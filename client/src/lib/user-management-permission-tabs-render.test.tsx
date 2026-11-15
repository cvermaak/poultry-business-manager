import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SupplierEditorClient } from "@shared/supplier-permission-editor-contract";
import { UserManagementPermissionTabs } from "@/components/UserManagementPermissionTabs";

const admin = { id: 13, role: "admin", isActive: 1 };
function setup(viewer: unknown = admin, connected = true) {
  const client: SupplierEditorClient = {
    load: vi.fn(async () => { throw new Error("No permission calls during initial SSR"); }),
    save: vi.fn(async () => { throw new Error("No permission calls during initial SSR"); }),
  };
  const child = <section><h1>Existing account fixture</h1><button type="button">Existing permitted action</button></section>;
  const html = renderToStaticMarkup(<UserManagementPermissionTabs viewer={viewer} permissionClient={connected ? client : undefined}>{child}</UserManagementPermissionTabs>);
  return { html, client, child };
}

describe("prepared permission tabs: initial SSR and structural contract, not DOM transition proof", () => {
  it("renders accessible controlled tabs with User Accounts selected by default", () => {
    const { html, client } = setup();
    expect(html).toContain('role="tablist"'); expect(html).toContain('aria-label="User management sections"');
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>User Accounts<\/button>/);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="false"[^>]*>Role Permissions<\/button>/);
    expect(html).toContain("Manage role permissions"); expect(html).toContain("Existing permitted action");
    expect(html).not.toContain("Supplier role permissions");
    expect(html).not.toContain("Audit reason (required)");
    expect(client.load).not.toHaveBeenCalled(); expect(client.save).not.toHaveBeenCalled();
  });
  it.each(["farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator"])("passes children through unchanged and omits permission UI for %s", role => {
    const { html, client, child } = setup({ ...admin, role });
    expect(html).toBe(renderToStaticMarkup(child)); expect(html).not.toContain("Role Permissions");
    expect(html).not.toContain("Manage role permissions"); expect(html).not.toContain('role="tab"');
    expect(client.load).not.toHaveBeenCalled(); expect(client.save).not.toHaveBeenCalled();
  });
  it.each([null, undefined, {}, { ...admin, isActive: 0 }, { ...admin, isActive: true }, { ...admin, id: 0 }, { ...admin, role: "unknown" }])("fails closed for malformed or inactive viewer %s", viewer => {
    // Explicit undefined must be passed instead of the helper's default parameter.
    const { client, child } = setup(null);
    const html = renderToStaticMarkup(<UserManagementPermissionTabs viewer={viewer} permissionClient={client}>{child}</UserManagementPermissionTabs>);
    expect(html).toBe(renderToStaticMarkup(child)); expect(html).not.toContain("Role Permissions");
    expect(client.load).not.toHaveBeenCalled(); expect(client.save).not.toHaveBeenCalled();
  });
  it("keeps the force-mounted initial permission panel truly hidden", () => {
    const { html } = setup();
    const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
    expect(panels).toHaveLength(2);
    expect(panels[1]).toContain('hidden=""'); expect(panels[1]).toContain('style="display:none"');
    expect(panels[1]).toContain('data-state="inactive"');
  });
  it("has an explicit inert unconnected panel, with no fake policies or edit inputs", () => {
    const { html, client } = setup(admin, false);
    expect(html).toContain("Prepared but not connected; no policies loaded or saved");
    expect(html).not.toContain("Supplier role permissions"); expect(html).not.toMatch(/<(select|textarea|input)/);
    expect(html).not.toContain("Use default"); expect(html).not.toContain("Confirm save");
    expect(client.load).not.toHaveBeenCalled(); expect(client.save).not.toHaveBeenCalled();
  });
  it("structurally uses the existing Radix primitives, lazily mounts only visited permissions, and preserves the editor across same-scope tab changes", () => {
    const source = readFileSync(new URL("../components/UserManagementPermissionTabs.tsx", import.meta.url), "utf8");
    expect(source).toContain('from "@/components/ui/tabs"');
    expect(source).toContain('useState<Selection>("UserAccounts")'); expect(source).toContain("useState(false)");
    expect(source).toContain('if (value === "RolePermissions") setVisitedPermissions(true)');
    expect(source).toContain("visitedPermissions && (businessClients ? <RolePermissionsModulePanel");
    expect(source).toContain("<SupplierRolePermissionsEditor client={permissionClient}");
    expect(source).toContain('<TabsContent value="RolePermissions" forceMount hidden={selection !== "RolePermissions"}');
    expect(source).toContain('<TabsContent value="UserAccounts" className="space-y-4">');
    expect(source).not.toContain("setVisitedPermissions(false)");
    expect(source).not.toMatch(/<TabsContent value="UserAccounts"[^>]*forceMount/);
    expect(source).not.toMatch(/\b(fetch|trpc|useAuth|localStorage|sessionStorage)\b/);
  });
  it("structurally resets before child rendering on client replacement, keys viewer identity, and removes the entire authorized scope on revocation", () => {
    const source = readFileSync(new URL("../components/UserManagementPermissionTabs.tsx", import.meta.url), "utf8");
    expect(source).toContain("session.client !== permissionClient");
    expect(source).toContain("useEffect(() => {");
    expect(source).toMatch(/setSession\(current => current\.client === permissionClient \? current\s*: \{ client: permissionClient, generation: current\.generation \+ 1 \}\)/);
    expect(source).toMatch(/if \(session\.client !== permissionClient\) return null;/);
    expect(source.indexOf("if (session.client !== permissionClient) return null;")).toBeLessThan(source.indexOf("return <AuthorizedTabs"));
    expect(source).toContain("key={`${principal.id}:${session.generation}`}");
    expect(source).toContain("if (!principal) return <>{children}</>");
    expect(source).not.toMatch(/setSession\(\{ client:/); expect(source).not.toContain("WeakMap");
  });
});
