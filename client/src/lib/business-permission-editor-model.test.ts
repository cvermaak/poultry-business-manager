import { describe, expect, it } from "vitest";
import {
  createBusinessEditorModel,
  BusinessEditorValidationError,
} from "./business-permission-editor-model";
import type {
  BusinessEditorDefinition,
  BusinessEditorSnapshot,
  BusinessScope,
} from "@shared/business-permission-editor-contract";

export function fixtureDefinition(
  scope: BusinessScope,
): BusinessEditorDefinition {
  const prefix = scope === "customers" ? "customers.records" : "sales.orders";
  const actions = {
    view: [`${prefix}.view.getsummary`, `${prefix}.view.findactive`],
    create: [`${prefix}.create.create`],
    edit: [`${prefix}.edit.update`],
    delete: [],
    export: scope === "customers" ? [] : [`${prefix}.export.download`],
  };
  return {
    scope,
    label: scope === "customers" ? "Customers" : "Sales Orders",
    actions,
    catalogue: {
      revision: `${scope}-fixture-r1`,
      capabilities: Object.values(actions)
        .flat()
        .map((key) => ({
          key,
        })) as BusinessEditorDefinition["catalogue"]["capabilities"],
    },
    notes: ["Payments, posting and financial-status transitions are excluded."],
  };
}
function context(scope: BusinessScope) {
  const definition = fixtureDefinition(scope),
    model = createBusinessEditorModel(definition);
  const snapshot = (
    patch: Partial<BusinessEditorSnapshot> = {},
  ): BusinessEditorSnapshot => {
    const grants = patch.grants ?? {},
      defaults =
        patch.defaults ??
        Object.fromEntries(model.EDITOR_KEYS.map((key) => [key, true]));
    return {
      role: "farm_manager",
      scope,
      catalogueRevision: `${scope}-synthetic-r1`,
      version: Object.keys(grants).length ? 7 : 0,
      grants,
      defaults,
      effective: Object.fromEntries(
        model.EDITOR_KEYS.map((key) => [
          key,
          Object.prototype.hasOwnProperty.call(grants, key)
            ? grants[key]
            : defaults[key],
        ]),
      ),
      protectedAdmin: false,
      ...patch,
    };
  };
  return { definition, model, snapshot };
}
const invalid = (operation: () => unknown) =>
  expect(operation).toThrow(BusinessEditorValidationError);
for (const scope of ["customers", "sales_orders"] as const)
  describe(`${scope}: isolated business model`, () => {
    const { model, snapshot, definition } = context(scope);
    const [first, second] = model.actionKeys.view;
    it("detaches and freezes exact boolean maps, accepting role-specific mixed defaults", () => {
      const raw = snapshot({
        defaults: Object.fromEntries(
          model.EDITOR_KEYS.map((key) => [key, key !== second]),
        ),
      });
      const parsed = model.validateSnapshot(raw, "farm_manager");
      expect(parsed).not.toBe(raw);
      expect(Object.isFrozen(parsed.defaults)).toBe(true);
      expect(parsed.defaults[first]).toBe(true);
      expect(parsed.defaults[second]).toBe(false);
      expect(model.actionChoice(parsed.grants, "view")).toBe("default");
      const initial = model.createEditorDraft(parsed),
        next = model.chooseAction(initial, "view", "default");
      expect(next.grants).toEqual({});
      expect(next.snapshot.defaults).toEqual(parsed.defaults);
      expect(model.chooseAction(initial, "view", "allow").grants).toEqual({
        [first]: true,
        [second]: true,
      });
    });
    it("preserves mixed overrides through other actions and review; labels arbitrary API methods", () => {
      const initial = model.createEditorDraft(
        snapshot({ grants: { [first]: false } }),
      );
      const next = model.setEditorReason(
        model.chooseAction(initial, "edit", "allow"),
        "  reviewed  ",
      );
      expect(model.actionChoice(next.grants, "view")).toBe("mixed");
      expect(model.describeAction(next.grants, "view")).toBe(
        "getsummary: Block; findactive: Use default",
      );
      expect(model.pendingChanges(next).map((change) => change.action)).toEqual(
        ["edit"],
      );
      const request = model.prepareSaveRequest(next);
      expect(request.grants[first]).toBe(false);
      expect(Object.hasOwn(request.grants, second)).toBe(false);
      expect(request.reason).toBe("reviewed");
      expect(Object.isFrozen(request.grants)).toBe(true);
      expect(Object.keys(request)).toEqual([
        "role",
        "catalogueRevision",
        "expectedVersion",
        "grants",
        "reason",
      ]);
    });
    it("unsupported cells cannot mutate grants and export is available only when defined", () => {
      const draft = model.createEditorDraft(snapshot());
      invalid(() => model.chooseAction(draft, "delete", "allow"));
      invalid(() => model.actionChoice({}, "delete"));
      if (scope === "customers")
        invalid(() => model.chooseAction(draft, "export", "allow"));
      else
        expect(
          model.chooseAction(draft, "export", "allow").grants[
            model.actionKeys.export[0]
          ],
        ).toBe(true);
      const bad = { ...draft, grants: { "invoices.financial.post": true } };
      invalid(() => model.chooseAction(bad, "view", "allow"));
      invalid(() =>
        model.prepareSaveRequest(model.setEditorReason(bad, "bad")),
      );
    });
    it("enforces scope, role, version, revision, exact defaults and computed effective maps", () => {
      for (const patch of [
        { scope: scope === "customers" ? "sales_orders" : "customers" },
        { role: "unknown" },
        { version: -1 },
        { version: 2147483648 },
        { catalogueRevision: "r\n1" },
        { protectedAdmin: true },
        { defaults: {} },
        { effective: {} },
        { grants: { [first]: "true" } },
        { grants: { "financial.posting": true } },
      ])
        invalid(() => model.validateSnapshot({ ...snapshot(), ...patch }));
      invalid(() => model.validateSnapshot(snapshot(), "accountant"));
      invalid(() =>
        model.validateSnapshot(
          snapshot({ version: 0, grants: { [first]: false } }),
        ),
      );
    });
    it("never executes record getters or returns raw errors", () => {
      let calls = 0;
      const value = snapshot();
      Object.defineProperty(value, "grants", {
        enumerable: true,
        get() {
          calls++;
          throw new Error("SECRET");
        },
      });
      invalid(() => model.validateSnapshot(value));
      expect(calls).toBe(0);
      for (const bad of [
        Object.create(snapshot()),
        { ...snapshot(), extra: true },
        { ...snapshot(), [Symbol("x")]: 1 },
        { ...snapshot(), grants: JSON.parse('{"__proto__":true}') },
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("SECRET");
            },
          },
        ),
      ])
        invalid(() => model.validateSnapshot(bad));
    });
    it("protects Admin at version zero with empty overrides and all source ordinary Allows", () => {
      const admin = snapshot({ role: "admin", protectedAdmin: true });
      const draft = model.createEditorDraft(admin);
      expect(model.chooseAction(draft, "view", "block")).toBe(draft);
      expect(model.setEditorReason(draft, "attempt")).toBe(draft);
      invalid(() => model.prepareSaveRequest(draft));
      for (const patch of [
        { version: 1 },
        { grants: { [first]: false } },
        {
          defaults: Object.fromEntries(
            model.EDITOR_KEYS.map((key) => [key, false]),
          ),
        },
      ])
        invalid(() => model.validateSnapshot({ ...admin, ...patch }));
    });
    it("validates exact scoped CAS success and locks malformed/wrong-role responses", () => {
      const before = model.validateSnapshot(snapshot({ version: 7 }));
      const draft = model.setEditorReason(
        model.chooseAction(model.createEditorDraft(before), "edit", "block"),
        "reviewed",
      );
      const request = model.prepareSaveRequest(draft);
      const after = snapshot({ version: 8, grants: request.grants });
      expect(
        model.validateSaveResult(
          { ok: true, changed: true, snapshot: after },
          request,
          before,
        ).ok,
      ).toBe(true);
      for (const patch of [
        { version: 7 },
        { version: 9 },
        { catalogueRevision: "other" },
        { role: "accountant" },
        { scope: scope === "customers" ? "sales_orders" : "customers" },
        { grants: {} },
      ])
        invalid(() =>
          model.validateSaveResult(
            { ok: true, changed: true, snapshot: { ...after, ...patch } },
            request,
            before,
          ),
        );
      invalid(() =>
        model.validateSaveResult(
          { ok: true, changed: false, snapshot: before },
          request,
          before,
        ),
      );
      expect(
        model.validateSaveResult(
          { ok: true, changed: false, snapshot: before },
          { ...request, grants: before.grants },
          before,
        ).ok,
      ).toBe(true);
      for (const code of [
        "STALE_VERSION",
        "CATALOGUE_MISMATCH",
        "COMMIT_OUTCOME_UNKNOWN",
        "SAVE_FAILED",
      ])
        expect(
          model.validateSaveResult({ ok: false, code }, request, before),
        ).toEqual({ ok: false, code });
      invalid(() =>
        model.validateLoadResult(
          { ok: false, code: "SECRET_SQL" },
          "farm_manager",
        ),
      );
      invalid(() =>
        model.validateLoadResult(
          { ok: true, snapshot: snapshot({ role: "accountant" }) },
          "farm_manager",
        ),
      );
    });
    it("rejects audit controls, oversized reason, version overflow and reason-only saves", () => {
      for (const raw of [
        "",
        " ",
        "x".repeat(501),
        "x".repeat(4097),
        "a\nb",
        "a\u0085b",
      ])
        invalid(() => model.normalizeReason(raw));
      expect(model.normalizeReason("  review  ")).toBe("review");
      invalid(() =>
        model.prepareSaveRequest(
          model.setEditorReason(
            model.createEditorDraft(snapshot()),
            "reason only",
          ),
        ),
      );
      invalid(() =>
        model.prepareSaveRequest(
          model.setEditorReason(
            model.chooseAction(
              model.createEditorDraft(snapshot({ version: 2147483647 })),
              "view",
              "block",
            ),
            "review",
          ),
        ),
      );
    });
    it("rejects untrusted scope definitions, duplicate and oversized key sets", () => {
      invalid(() =>
        createBusinessEditorModel({
          ...definition,
          scope: "supplier_management",
        }),
      );
      invalid(() =>
        createBusinessEditorModel({
          ...definition,
          actions: { ...definition.actions, edit: [first] },
        }),
      );
      const keys = Array.from(
        { length: 33 },
        (_, index) => `test.view.method${index}`,
      );
      invalid(() =>
        createBusinessEditorModel({
          ...definition,
          actions: { view: keys, create: [], edit: [], delete: [], export: [] },
          catalogue: {
            revision: "test",
            capabilities: keys.map((key) => ({
              key,
            })) as BusinessEditorDefinition["catalogue"]["capabilities"],
          },
        }),
      );
    });
  });

describe("nondelegable static financial restrictions", () => {
  it.each(["sales_orders", "invoices"] as const)(
    "locks Farm Manager in %s regardless of editable grants",
    (scope) => {
      const model = createBusinessEditorModel({
        ...fixtureDefinition(scope),
        financialRestrictedRoles: ["farm_manager"],
      });
      const defaults = Object.fromEntries(
        model.EDITOR_KEYS.map((key) => [key, false]),
      );
      const raw = {
        role: "farm_manager",
        scope,
        catalogueRevision: "restriction-test",
        version: 0,
        grants: {},
        defaults,
        effective: defaults,
        protectedAdmin: false,
      };
      const draft = model.createEditorDraft(raw);
      expect(model.isFinancialRestricted("farm_manager")).toBe(true);
      expect(model.isFinancialRestricted("accountant")).toBe(false);
      for (const action of model.supportedActions)
        for (const choice of ["default", "allow", "block"] as const)
          invalid(() => model.chooseAction(draft, action, choice));
      expect(model.setEditorReason(draft, "attempt")).toBe(draft);
      invalid(() => model.prepareSaveRequest(draft));
      const key = model.EDITOR_KEYS[0];
      invalid(() =>
        model.validateSnapshot({
          ...raw,
          version: 1,
          grants: { [key]: true },
          effective: { ...defaults, [key]: true },
        }),
      );
      invalid(() =>
        model.validateSnapshot({
          ...raw,
          version: 1,
          grants: { [key]: false },
        }),
      );
      invalid(() =>
        model.validateSnapshot({
          ...raw,
          defaults: { ...defaults, [key]: true },
          effective: { ...defaults, [key]: true },
        }),
      );
      invalid(() =>
        model.prepareSaveRequest({
          ...draft,
          grants: { [key]: true },
          reason: "attempt",
        }),
      );
    },
  );
});
