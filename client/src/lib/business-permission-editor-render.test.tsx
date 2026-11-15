import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BusinessEditorPolicyFields,
  BusinessRolePermissionsEditor,
} from "@/components/BusinessRolePermissionsEditor";
import { RolePermissionsModulePanel } from "@/components/RolePermissionsModulePanel";
import { createBusinessEditorModel } from "./business-permission-editor-model";
import type {
  BusinessEditorClient,
  BusinessEditorClients,
  BusinessEditorDefinition,
} from "@shared/business-permission-editor-contract";
import type { SupplierEditorClient } from "@shared/supplier-permission-editor-contract";

const definition: BusinessEditorDefinition = {
  scope: "invoices",
  label: "Invoices",
  notes: ["Financial posting is not an ordinary edit."],
  actions: {
    view: [
      "invoices.records.view.getsummary",
      "invoices.records.view.findactive",
    ],
    create: [],
    edit: ["invoices.records.edit.update"],
    delete: [],
    export: ["invoices.records.export.download"],
  },
  catalogue: {
    revision: "synthetic-render-r1",
    capabilities: [
      "invoices.records.view.getsummary",
      "invoices.records.view.findactive",
      "invoices.records.edit.update",
      "invoices.records.export.download",
    ].map((key) => ({
      key,
    })) as BusinessEditorDefinition["catalogue"]["capabilities"],
  },
};
const model = createBusinessEditorModel(definition);
function draft(admin = false, mixed = false) {
  const defaults = Object.fromEntries(
    model.EDITOR_KEYS.map((key) => [key, true]),
  );
  const grants = mixed ? { [model.actionKeys.view[0]]: false } : {};
  return model.createEditorDraft({
    role: admin ? "admin" : "farm_manager",
    scope: "invoices",
    catalogueRevision: "synthetic-render-r1",
    version: mixed ? 4 : 0,
    grants,
    defaults,
    effective: { ...defaults, ...grants },
    protectedAdmin: admin,
  });
}
const noop = () => {};
describe("synthetic business editor SSR (not DOM-interaction proof)", () => {
  it("renders all five action columns and no enabled controls for unsupported Create/Delete", () => {
    const html = renderToStaticMarkup(
      <BusinessEditorPolicyFields
        model={model}
        draft={draft()}
        disabled={false}
        onPick={noop}
      />,
    );
    const headers = Array.from(
      html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g),
      (match) => match[1],
    );
    expect(headers).toEqual([
      "Module",
      "View",
      "Create",
      "Edit",
      "Delete",
      "Export",
    ]);
    expect(html.match(/<select /g) ?? []).toHaveLength(3);
    expect(html).toContain("Export permission choice");
    expect(html).not.toContain("Create permission choice");
    expect(html).not.toContain("Delete permission choice");
    expect(html.match(/Unavailable/g) ?? []).toHaveLength(2);
    expect(html).toContain("Source default");
    expect(html).toContain("Effective role gate");
    expect(html).toContain("getsummary:");
    expect(html).toContain("findactive:");
    expect(html).not.toContain("Detail:");
  });
  it("renders a disabled mixed sentinel and preserves API-method explanations", () => {
    const html = renderToStaticMarkup(
      <BusinessEditorPolicyFields
        model={model}
        draft={draft(false, true)}
        disabled={false}
        onPick={noop}
      />,
    );
    expect(html).toMatch(
      /<option value="mixed" disabled="" selected="">Mixed existing overrides — preserved/,
    );
    expect(html).toContain("Existing API-method choices stay unchanged");
  });
  it("renders protected Admin without permission controls and disables every ordinary choice while locked", () => {
    const admin = renderToStaticMarkup(
      <BusinessEditorPolicyFields
        model={model}
        draft={draft(true)}
        disabled={false}
        onPick={noop}
      />,
    );
    expect(admin).not.toMatch(/<(select|input|textarea|button)/);
    expect(admin.match(/Use source — protected Admin/g) ?? []).toHaveLength(3);
    const locked = renderToStaticMarkup(
      <BusinessEditorPolicyFields
        model={model}
        draft={draft()}
        disabled={true}
        onPick={noop}
      />,
    );
    for (const select of locked.match(/<select[^>]*>/g) ?? [])
      expect(select).toContain('disabled=""');
  });
  it("uses the correct module label and excludes financial/state permissions without SSR client calls", () => {
    let calls = 0;
    const client: BusinessEditorClient = {
      load: async () => {
        calls++;
        throw new Error("no SSR calls");
      },
      save: async () => {
        calls++;
        throw new Error("no SSR calls");
      },
    };
    const html = renderToStaticMarkup(
      <BusinessRolePermissionsEditor definition={definition} client={client} />,
    );
    expect(html).toContain("Invoices role permissions");
    expect(html).toContain("Invoices management");
    expect(html).not.toContain("isolated preparation");
    expect(html).toContain("financial-status transition");
    expect(html).toContain("accounting-period");
    expect(html).toContain("Financial posting is not an ordinary edit.");
    expect(html).toContain("Admin (protected)");
    expect(html).toContain("Loading current policy");
    expect(calls).toBe(0);
  });
  it("shows six labelled module tabs including Financial Data and Feed Management and initially mounts only Suppliers", () => {
    const fail = async (): Promise<never> => {
      throw new Error("no SSR calls");
    };
    const supplierClient: SupplierEditorClient = { load: fail, save: fail };
    const client: BusinessEditorClient = { load: fail, save: fail };
    const businessClients: BusinessEditorClients = {
      customers: client,
      sales_orders: client,
      invoices: client,
      financial_data: client, feed_management: client,
    };
    const html = renderToStaticMarkup(
      <RolePermissionsModulePanel
        supplierClient={supplierClient}
        businessClients={businessClients}
      />,
    );
    for (const label of ["Suppliers", "Customers", "Sales Orders", "Invoices", "Financial Data", "Feed Management"])
      expect(html).toContain(label);
    expect(html.match(/role="tabpanel"/g) ?? []).toHaveLength(6);
    expect(html.match(/display:none/g) ?? []).toHaveLength(5);
    expect(html).toContain("Supplier role permissions");
    expect(html).not.toContain("Customers role permissions");
    expect(html).not.toContain("Invoices role permissions");
  });
});

describe("financial-role restriction rows", () => {
  it("shows Farm Manager nondelegable Block instead of editable Allow controls", () => {
    const restricted = createBusinessEditorModel({
      ...definition,
      financialRestrictedRoles: ["farm_manager"],
    });
    const defaults = Object.fromEntries(
      restricted.EDITOR_KEYS.map((key) => [key, false]),
    );
    const draft = restricted.createEditorDraft({
      role: "farm_manager",
      scope: "invoices",
      catalogueRevision: "restriction-render",
      version: 0,
      grants: {},
      defaults,
      effective: defaults,
      protectedAdmin: false,
    });
    const html = renderToStaticMarkup(
      <BusinessEditorPolicyFields
        model={restricted}
        draft={draft}
        disabled={false}
        onPick={noop}
      />,
    );
    expect(
      html.match(
        /Unavailable for Farm Manager — financial data is restricted/g,
      ) ?? [],
    ).toHaveLength(5);
    expect(html).not.toMatch(/<(select|input|textarea|button)/);
    expect(html).not.toContain("Allow");
    expect(html).toContain("Block — nondelegable");
  });
});
