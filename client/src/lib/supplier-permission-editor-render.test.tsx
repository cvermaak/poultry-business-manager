import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupplierEditorPolicyFields, SupplierRolePermissionsEditor } from "@/components/SupplierRolePermissionsEditor";
import { EDITOR_KEYS, createEditorDraft } from "./supplier-permission-editor-model";
import type { SupplierEditorClient, SupplierEditorRole } from "@shared/supplier-permission-editor-contract";
function draft(role: SupplierEditorRole = "farm_manager", grants: Record<string, boolean> = {}) {
  const defaults = Object.fromEntries(EDITOR_KEYS.map(key => [key, true]));
  return createEditorDraft({ role, scope: "supplier_management", catalogueRevision: "synthetic-ssr-r1", version: Object.keys(grants).length ? 4 : 0,
    grants, defaults, effective: Object.fromEntries(EDITOR_KEYS.map(key => [key, Object.prototype.hasOwnProperty.call(grants, key) ? grants[key] : true])), protectedAdmin: role === "admin" });
}
const noop = () => {};
describe("focused synthetic supplier editor SSR (not DOM interaction proof)", () => {
  it("renders unmounted client-injected editor shell with labelled role and protected Admin option without client calls", () => {
    let loads = 0, saves = 0;
    const client: SupplierEditorClient = { load: async () => { loads++; throw new Error("must not run in SSR"); }, save: async () => { saves++; throw new Error("must not run in SSR"); } };
    const html = renderToStaticMarkup(<SupplierRolePermissionsEditor client={client} />);
    expect(html).toContain("Supplier role permissions"); expect(html).toContain("Role to edit");
    expect(html).toMatch(/<label[^>]*for="[^"]+-role"/); expect(html).toMatch(/<select[^>]*id="[^"]+-role"/);
    expect(html).toContain('value="farm_manager" selected=""');
    expect(html).toContain("Admin (protected)"); expect(html).toContain("Loading current policy");
    expect(html).not.toContain("Audit reason (required)"); expect(html).not.toContain("Confirm save");
    expect(loads).toBe(0); expect(saves).toBe(0);
  });
  it("labels four native tri-choice inputs, shows source/effective and Export without any Export input", () => {
    const html = renderToStaticMarkup(<SupplierEditorPolicyFields draft={draft()} disabled={false} onPick={noop} />);
    expect((html.match(/<select /g) ?? [])).toHaveLength(4);
    for (const action of ["View", "Create", "Edit", "Delete"]) expect(html).toContain(`${action} permission choice`);
    expect((html.match(/Use default<\/option>/g) ?? [])).toHaveLength(4);
    expect((html.match(/>Allow<\/option>/g) ?? [])).toHaveLength(4);
    expect((html.match(/>Block<\/option>/g) ?? [])).toHaveLength(4);
    expect(html).toContain("Source default"); expect(html).toContain("Effective role gate");
    expect(html).toContain("List and detail (getById)"); expect(html).toContain("Includes soft deactivation");
    expect(html).toContain("Export"); expect(html).toContain("Unavailable — no implemented supplier export permission. Not editable.");
    const exportCell = html.slice(html.lastIndexOf("<td")); expect(exportCell).not.toMatch(/<(select|input|textarea|button)/);
    expect(html).toContain("overflow-x-auto"); expect(html).toContain("sr-only"); expect(html).not.toContain("supplierName");
  });
  it("renders mixed existing View as disabled display-only sentinel, not a fourth save choice", () => {
    const html = renderToStaticMarkup(<SupplierEditorPolicyFields draft={draft("accountant", { [EDITOR_KEYS[0]]: false })} disabled={false} onPick={noop} />);
    expect(html).toMatch(/<option value="mixed" disabled="" selected="">Mixed existing overrides — preserved/);
    expect(html).toContain("Existing list/detail choices stay unchanged until you explicitly choose View.");
    expect(html).toContain("List: "); expect(html).toContain("Detail: ");
  });
  it("protected Admin uses source-only readonly text with no permission inputs", () => {
    const html = renderToStaticMarkup(<SupplierEditorPolicyFields draft={draft("admin")} disabled={false} onPick={noop} />);
    expect((html.match(/Use source — protected Admin/g) ?? [])).toHaveLength(4);
    expect(html).not.toMatch(/<(select|input|textarea|button)/);
    expect(html).toContain("Export"); expect(html).toContain("Unavailable");
  });
  it("disabled editing markup disables every native choice", () => {
    const html = renderToStaticMarkup(<SupplierEditorPolicyFields draft={draft()} disabled={true} onPick={noop} />);
    const selects = html.match(/<select[^>]*>/g) ?? [];
    expect(selects).toHaveLength(4); for (const select of selects) expect(select).toContain('disabled=""');
  });
  it("uses one Supplier row with the approved five action columns", () => {
    const html = renderToStaticMarkup(<SupplierEditorPolicyFields draft={draft()} disabled={false} onPick={noop} />);
    const headers = Array.from(html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g), match => match[1]);
    expect(headers).toEqual(["Module", "View", "Create", "Edit", "Delete", "Export"]);
    expect((html.match(/<th scope="row"/g) ?? [])).toHaveLength(1);
    expect(html).toMatch(/<th scope="row"[^>]*>Supplier<\/th>/);
  });
  it("states the approved deactivation requirement without inventing a View prerequisite", () => {
    const client: SupplierEditorClient = { load: async () => { throw new Error("no SSR calls"); }, save: async () => { throw new Error("no SSR calls"); } };
    const html = renderToStaticMarkup(<SupplierRolePermissionsEditor client={client} />);
    expect(html).toContain("Ordinary edits and reactivation require Edit.");
    expect(html).toContain("Setting inactive requires both Edit and Delete.");
    expect(html).not.toContain("Edit requires both View");
  });
});
