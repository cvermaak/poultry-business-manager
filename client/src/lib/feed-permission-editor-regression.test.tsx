import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BUSINESS_PERMISSION_DEFINITIONS } from "@shared/business-permission-definitions";
import {
  BUSINESS_EDITOR_ROLES,
  type BusinessEditorClient,
  type BusinessEditorRole,
  type BusinessEditorSnapshot,
  type BusinessScope,
} from "@shared/business-permission-editor-contract";
import { BusinessEditorPolicyFields, BusinessRolePermissionsEditor } from "../components/BusinessRolePermissionsEditor";
import { BusinessEditorValidationError, createBusinessEditorModel } from "./business-permission-editor-model";

const feed = BUSINESS_PERMISSION_DEFINITIONS.feed_management;
const key = feed.actions.view[0];
function feedSnapshot(role: BusinessEditorRole, grants: Record<string, boolean> = {}): BusinessEditorSnapshot {
  const allowed = feed.catalogue.capabilities[0].baseline[role].allowed;
  if (typeof allowed !== "boolean") throw new Error("Unresolved Feed fixture default");
  const defaults = { [key]: allowed };
  return {
    role,
    scope: "feed_management",
    catalogueRevision: feed.catalogue.revision,
    version: Object.keys(grants).length ? 1 : 0,
    grants,
    defaults,
    effective: { [key]: Object.prototype.hasOwnProperty.call(grants, key) ? grants[key] : defaults[key] },
    protectedAdmin: role === "admin",
  };
}

describe("Actual deployed business editor definitions", () => {
  for (const scope of Object.keys(BUSINESS_PERMISSION_DEFINITIONS) as BusinessScope[]) {
    it(`constructs and mounts ${scope}, not merely its tab label`, () => {
      const definition = BUSINESS_PERMISSION_DEFINITIONS[scope];
      expect(createBusinessEditorModel(definition).EDITOR_KEYS.length).toBeGreaterThan(0);
      const client: BusinessEditorClient = {
        load: vi.fn(async () => ({ ok: false as const, code: "POLICY_UNAVAILABLE" as const })),
        save: vi.fn(async () => ({ ok: false as const, code: "SAVE_FAILED" as const })),
      };
      const html = renderToStaticMarkup(<BusinessRolePermissionsEditor definition={definition} client={client} />);
      expect(html).toContain(`${definition.label} role permissions`);
      expect(html).toContain("Admin (protected)");
      expect(html).toContain("Loading current policy");
      expect(client.load).not.toHaveBeenCalled();
      expect(client.save).not.toHaveBeenCalled();
    });
  }
});

describe("Feed editor remains View-only and fail-closed", () => {
  it.each(BUSINESS_EDITOR_ROLES)("validates the real default snapshot for %s", role => {
    const model = createBusinessEditorModel(feed);
    const snapshot = model.validateSnapshot(feedSnapshot(role), role);
    expect(snapshot.effective[key]).toBe(role !== "farm_manager");
    expect(model.supportedActions).toEqual(["view"]);
    expect(snapshot.protectedAdmin).toBe(role === "admin");
  });
  it("renders one editable View choice and four unavailable actions for Farm Manager", () => {
    const model = createBusinessEditorModel(feed);
    const html = renderToStaticMarkup(<BusinessEditorPolicyFields model={model} draft={model.createEditorDraft(feedSnapshot("farm_manager"))} disabled={false} onPick={() => undefined} />);
    expect(html.match(/<select\b/g)).toHaveLength(1);
    expect(html.match(/Unavailable — no implemented ordinary/g)).toHaveLength(4);
    expect(html).toContain("module: Block");
    for (const action of ["create", "edit", "delete", "export"] as const)
      expect(() => model.chooseAction(model.createEditorDraft(feedSnapshot("farm_manager")), action, "allow")).toThrow(BusinessEditorValidationError);
  });
  it("keeps Admin immutable and renders no editable permission choice", () => {
    const model = createBusinessEditorModel(feed);
    const draft = model.createEditorDraft(feedSnapshot("admin"));
    expect(model.chooseAction(draft, "view", "block")).toBe(draft);
    expect(() => model.prepareSaveRequest(draft)).toThrow(BusinessEditorValidationError);
    const html = renderToStaticMarkup(<BusinessEditorPolicyFields model={model} draft={draft} disabled={false} onPick={() => undefined} />);
    expect(html).toContain("Use source — protected Admin");
    expect(html).not.toMatch(/<select\b/);
  });
  it("preserves a saved explicit Block and only builds an audited in-memory draft when changed", () => {
    const model = createBusinessEditorModel(feed);
    const raw = feedSnapshot("farm_manager", { [key]: false });
    const draft = model.createEditorDraft(raw);
    expect(model.actionChoice(draft.grants, "view")).toBe("block");
    expect(model.isEditorDirty(draft)).toBe(false);
    const changed = model.setEditorReason(model.chooseAction(draft, "view", "allow"), "Reviewed access");
    expect(model.prepareSaveRequest(changed)).toEqual({ role: "farm_manager", catalogueRevision: feed.catalogue.revision, expectedVersion: 1, grants: { [key]: true }, reason: "Reviewed access" });
    expect(raw.grants[key]).toBe(false);
    expect(raw.effective[key]).toBe(false);
  });
  it("still rejects unknown scopes and foreign capability keys", () => {
    expect(() => createBusinessEditorModel({ ...feed, scope: "feed_mamangement" })).toThrow(BusinessEditorValidationError);
    const model = createBusinessEditorModel(feed);
    expect(() => model.validateSnapshot({ ...feedSnapshot("farm_manager"), grants: { "customers.records.view.list": true }, version: 1 })).toThrow(BusinessEditorValidationError);
  });
});
