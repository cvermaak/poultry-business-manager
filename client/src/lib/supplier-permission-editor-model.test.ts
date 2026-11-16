import { describe, expect, it } from "vitest";
import { SUPPLIER_EDITOR_ACTION_KEYS, SUPPLIER_EDITOR_ROLES, type SupplierEditorAction, type SupplierEditorChoice, type SupplierEditorSnapshot, type SupplierGrants } from "@shared/supplier-permission-editor-contract";
import { EDITOR_ACTIONS, EDITOR_KEYS, SupplierEditorValidationError, actionChoice, chooseAction, createEditorDraft, describeAction, isEditorDirty, isSupplierEditorRole, normalizeReason, pendingChanges, prepareSaveRequest, setEditorReason, validateLoadResult, validateSaveResult, validateSnapshot } from "./supplier-permission-editor-model";
const [LIST, DETAIL, CREATE, EDIT, DELETE] = EDITOR_KEYS;
function snapshot(overrides: Partial<SupplierEditorSnapshot> = {}): SupplierEditorSnapshot {
  const grants = overrides.grants ?? {};
  const defaults = overrides.defaults ?? Object.fromEntries(EDITOR_KEYS.map(key => [key, true]));
  return { role: "farm_manager", scope: "supplier_management", catalogueRevision: "supplier-test-r1", version: Object.keys(grants).length ? 3 : 0,
    grants, defaults, effective: Object.fromEntries(EDITOR_KEYS.map(key => [key, Object.prototype.hasOwnProperty.call(grants, key) ? grants[key]! : defaults[key]])), protectedAdmin: false, ...overrides };
}
function requestAndBefore() {
  const before = validateSnapshot(snapshot({ version: 7 }));
  const draft = setEditorReason(chooseAction(createEditorDraft(before), "edit", "block"), " Reviewed supplier gate ");
  return { before, draft, request: prepareSaveRequest(draft) };
}
function changedResult() {
  const { before, request } = requestAndBefore();
  return { before, request, result: { ok: true, changed: true, snapshot: snapshot({ version: 8, grants: request.grants }) } };
}
const throwsInvalid = (operation: () => unknown) => expect(operation).toThrow(SupplierEditorValidationError);

describe("exact defensive supplier snapshots", () => {
  it.each(SUPPLIER_EDITOR_ROLES)("accepts only known role %s and copies frozen values", role => {
    const raw = snapshot({ role, protectedAdmin: role === "admin" });
    const parsed = validateSnapshot(raw, role);
    expect(parsed.role).toBe(role); expect(parsed).not.toBe(raw);
    for (const value of [parsed, parsed.grants, parsed.defaults, parsed.effective]) expect(Object.isFrozen(value)).toBe(true);
    expect(isSupplierEditorRole(role)).toBe(true);
  });
  it.each(["manager", "Admin", "", "farm_manager ", undefined, 1, {}, "supplier"])("rejects unknown role %j", role => {
    expect(isSupplierEditorRole(role)).toBe(false);
    throwsInvalid(() => validateSnapshot({ ...snapshot(), role }));
  });
  it.each([null, undefined, [], new Date(), 1, "snapshot", Object.create({ role: "farm_manager" })])("rejects non-plain input %j", value => throwsInvalid(() => validateSnapshot(value)));
  it.each([-1, 0.5, NaN, Infinity, 2147483648, "1", undefined, null])("rejects invalid version %j", version => throwsInvalid(() => validateSnapshot({ ...snapshot(), version })));
  it.each(["", " r1", "r1 ", "a".repeat(161), "r\n1", "r\u007f1", "r\u00851", 42, undefined])("rejects invalid revision %j", catalogueRevision => throwsInvalid(() => validateSnapshot({ ...snapshot(), catalogueRevision })));
  it.each(["suppliers", "supplier_management ", "other", null])("rejects invalid scope %j", scope => throwsInvalid(() => validateSnapshot({ ...snapshot(), scope })));
  it("rejects a wrong requested role", () => throwsInvalid(() => validateSnapshot(snapshot(), "accountant")));
  it("accepts the maximum version and exact 160-character revision", () => expect(validateSnapshot(snapshot({ version: 2147483647, catalogueRevision: "x".repeat(160) })).version).toBe(2147483647));
  it("accepts null-prototype own records, preserving false grants", () => {
    const value = Object.assign(Object.create(null), snapshot({ grants: Object.assign(Object.create(null), { [EDIT]: false }) }));
    expect(validateSnapshot(value).grants[EDIT]).toBe(false);
  });
  it.each(["role", "scope", "catalogueRevision", "version", "grants", "defaults", "effective", "protectedAdmin"])("rejects missing own field %s", key => {
    const value = { ...snapshot() } as Record<string, unknown>; delete value[key];
    throwsInvalid(() => validateSnapshot(value));
  });
  it("rejects added, symbol, non-enumerable fields and accessor descriptors without invoking getters", () => {
    for (const key of ["extra", Symbol("extra")]) { const value = { ...snapshot(), [key]: true }; throwsInvalid(() => validateSnapshot(value)); }
    const nonEnumerable = { ...snapshot() }; Object.defineProperty(nonEnumerable, "version", { value: 0, enumerable: false });
    throwsInvalid(() => validateSnapshot(nonEnumerable));
    let calls = 0; const accessor = { ...snapshot() }; Object.defineProperty(accessor, "grants", { enumerable: true, get() { calls++; throw new Error("secret"); } });
    throwsInvalid(() => validateSnapshot(accessor)); expect(calls).toBe(0);
  });
  it("rejects prototype injection and reflection traps without raw exception leakage", () => {
    const grants = JSON.parse('{"__proto__":false}'); throwsInvalid(() => validateSnapshot(snapshot({ grants })));
    const value = new Proxy({}, { ownKeys() { throw new Error("SECRET_SQL"); } });
    expect(() => validateSnapshot(value)).toThrow("Invalid supplier permission editor data.");
    expect(() => validateSnapshot(value)).not.toThrow("SECRET_SQL");
  });
  it.each(["grants", "defaults", "effective"])("rejects unknown/nonboolean/accessor/inherited %s keys", field => {
    const valid = field === "grants" ? {} : Object.fromEntries(EDITOR_KEYS.map(key => [key, true]));
    for (const value of [{ ...valid, [EDIT]: "allow" }, { ...valid, "suppliers.export.export": true }, Object.create(valid), [], null])
      throwsInvalid(() => validateSnapshot({ ...snapshot(), [field]: value }));
    const getter = { ...valid }; Object.defineProperty(getter, EDIT, { enumerable: true, get() { throw new Error("should not run"); } });
    throwsInvalid(() => validateSnapshot({ ...snapshot(), [field]: getter }));
  });
  it.each(["defaults", "effective"])("requires all five exact %s entries", field => {
    const values = Object.fromEntries(EDITOR_KEYS.slice(1).map(key => [key, true]));
    throwsInvalid(() => validateSnapshot({ ...snapshot(), [field]: values }));
  });
  it("checks false source defaults and exact effective/default/grant consistency", () => {
    const defaults = Object.fromEntries(EDITOR_KEYS.map(key => [key, false]));
    expect(validateSnapshot(snapshot({ defaults })).effective[EDIT]).toBe(false);
    expect(validateSnapshot(snapshot({ defaults, grants: { [EDIT]: true } })).effective[EDIT]).toBe(true);
    throwsInvalid(() => validateSnapshot(snapshot({ effective: defaults })));
    throwsInvalid(() => validateSnapshot(snapshot({ grants: { [EDIT]: false }, effective: Object.fromEntries(EDITOR_KEYS.map(key => [key, true])) })));
  });
  it("forbids grants at version zero", () => throwsInvalid(() => validateSnapshot(snapshot({ version: 0, grants: { [CREATE]: true } }))));
  it.each([false, "true", undefined, 1])("requires exact Admin protection %j", protectedAdmin => throwsInvalid(() => validateSnapshot({ ...snapshot({ role: "admin" }), protectedAdmin })));
  it("forbids protected nonadmin and any Admin override/version/default block", () => {
    throwsInvalid(() => validateSnapshot(snapshot({ protectedAdmin: true })));
    for (const patch of [{ version: 1 }, { grants: { [EDIT]: false } }, { defaults: Object.fromEntries(EDITOR_KEYS.map(key => [key, false])) }])
      throwsInvalid(() => validateSnapshot(snapshot({ role: "admin", protectedAdmin: true, ...patch })));
  });
  it("detaches mutable source maps", () => {
    const value = snapshot({ grants: { [EDIT]: false } }); const parsed = validateSnapshot(value);
    (value.grants as Record<string, boolean>)[EDIT] = true;
    (value.defaults as Record<string, boolean>)[EDIT] = false;
    expect(parsed.grants[EDIT]).toBe(false); expect(parsed.defaults[EDIT]).toBe(true);
  });
});

describe("tri-choice grouped editor and immutable draft", () => {
  it("locks the exact five keys and four write actions; no Export or business data", () => {
    expect(EDITOR_KEYS).toEqual(["suppliers.records.view.list", "suppliers.records.view.getbyid", "suppliers.records.create.create", "suppliers.records.edit.update", "suppliers.records.delete.delete"]);
    expect(EDITOR_ACTIONS).toEqual(["view", "create", "edit", "delete"]);
  });
  for (const action of EDITOR_ACTIONS) for (const choice of ["default", "allow", "block"] as const)
    it(`${action}: explicit ${choice} expands only its action keys`, () => {
      const initial = createEditorDraft(snapshot({ grants: { [LIST]: false, [DETAIL]: true, [CREATE]: false, [EDIT]: true, [DELETE]: false } }));
      const next = chooseAction(initial, action, choice);
      expect(actionChoice(next.grants, action)).toBe(choice);
      for (const key of EDITOR_KEYS) {
        if (SUPPLIER_EDITOR_ACTION_KEYS[action].some(item => item === key)) {
          expect(Object.prototype.hasOwnProperty.call(next.grants, key)).toBe(choice !== "default");
          if (choice !== "default") expect(next.grants[key]).toBe(choice === "allow");
        } else expect(next.grants[key]).toBe(initial.grants[key]);
      }
      expect(initial.grants[LIST]).toBe(false); expect(Object.isFrozen(next)).toBe(true); expect(Object.isFrozen(next.grants)).toBe(true);
    });
  const choices = [undefined, true, false] as const;
  for (const list of choices) for (const detail of choices)
    it(`preserves mixed View combination ${String(list)}/${String(detail)} when editing another action or reason`, () => {
      const grants: Record<string, boolean> = {}; if (list !== undefined) grants[LIST] = list; if (detail !== undefined) grants[DETAIL] = detail;
      const initial = createEditorDraft(snapshot({ grants }));
      const next = setEditorReason(chooseAction(initial, "create", "block"), "Need restricted creation");
      expect(next.grants[LIST]).toBe(list); expect(next.grants[DETAIL]).toBe(detail);
      const toChoice = (value: boolean | undefined) => value === undefined ? "default" : value ? "allow" : "block";
      expect(actionChoice(next.grants, "view")).toBe(list === detail ? toChoice(list) : "mixed");
      expect(pendingChanges(next).map(change => change.action)).toEqual(["create"]);
      const request = prepareSaveRequest(next);
      expect(Object.prototype.hasOwnProperty.call(request.grants, LIST)).toBe(list !== undefined);
      expect(Object.prototype.hasOwnProperty.call(request.grants, DETAIL)).toBe(detail !== undefined);
    });
  it("summarizes mixed before/after accurately and can restore exact grants to clean", () => {
    const draft = createEditorDraft(snapshot({ grants: { [LIST]: false } }));
    expect(describeAction(draft.grants, "view")).toBe("List: Block; Detail: Use default");
    const next = chooseAction(draft, "view", "allow");
    expect(pendingChanges(next)).toEqual([{ action: "view", before: "List: Block; Detail: Use default", after: "Allow", keys: [LIST, DETAIL] }]);
    const clean = createEditorDraft(snapshot());
    expect(isEditorDirty(chooseAction(chooseAction(clean, "edit", "block"), "edit", "default"))).toBe(false);
    expect(isEditorDirty(setEditorReason(clean, "reason only"))).toBe(true);
    throwsInvalid(() => prepareSaveRequest(setEditorReason(clean, "reason only")));
  });
  it.each(["mixed", "inherit", "ALLOW", true, undefined])("rejects non-save choice %j", choice => throwsInvalid(() => chooseAction(createEditorDraft(snapshot()), "view", choice as SupplierEditorChoice)));
  it.each(["export", "View", LIST, "", undefined])("rejects non-editor action %j", action => {
    throwsInvalid(() => chooseAction(createEditorDraft(snapshot()), action as SupplierEditorAction, "allow"));
    throwsInvalid(() => actionChoice({}, action as SupplierEditorAction));
  });
  it("protected Admin remains identical, cannot reason/edit/save", () => {
    const draft = createEditorDraft(snapshot({ role: "admin", protectedAdmin: true }));
    for (const action of EDITOR_ACTIONS) expect(chooseAction(draft, action, "block")).toBe(draft);
    expect(setEditorReason(draft, "attempt")).toBe(draft); expect(pendingChanges(draft)).toEqual([]);
    throwsInvalid(() => prepareSaveRequest(draft));
  });
  it("requires reason without losing any draft state and returns frozen sparse CAS request", () => {
    const draft = chooseAction(createEditorDraft(snapshot({ version: 12 })), "view", "block");
    throwsInvalid(() => prepareSaveRequest(draft));
    expect(draft.reason).toBe(""); expect(pendingChanges(draft)).toHaveLength(1);
    const reasoned = setEditorReason(draft, "  review  "); const request = prepareSaveRequest(reasoned);
    expect(request).toEqual({ role: "farm_manager", catalogueRevision: "supplier-test-r1", expectedVersion: 12, grants: { [LIST]: false, [DETAIL]: false }, reason: "review" });
    expect(reasoned.reason).toBe("  review  "); expect(Object.isFrozen(request)).toBe(true); expect(Object.isFrozen(request.grants)).toBe(true);
  });
  it("refuses version overflow rather than constructing an unsaveable request", () => {
    const draft = setEditorReason(chooseAction(createEditorDraft(snapshot({ version: 2147483647 })), "delete", "block"), "review");
    throwsInvalid(() => prepareSaveRequest(draft));
  });
});

describe("Module2-identical audit reason normalization", () => {
  it.each(["x", "x".repeat(500), "  reason  ", "\u00a0reason\u00a0", "🙂".repeat(250), " ".repeat(4095) + "x"])("accepts source-compatible reason length %j", value => expect(normalizeReason(value)).toBe(value.trim()));
  it.each(["", " ", "x".repeat(501), "🙂".repeat(251), " ".repeat(4096) + "x", "r\n", "\tr", "r\r", "r\u0000", "r\u007f", "r\u0085", "r\u009f", undefined, null, 3])("rejects source-incompatible reason %j", value => throwsInvalid(() => normalizeReason(value)));
});

describe("untrusted load/save result validation used by UI", () => {
  it("accepts load success and fixed error without raw detail", () => {
    expect(validateLoadResult({ ok: true, snapshot: snapshot() }, "farm_manager").ok).toBe(true);
    expect(validateLoadResult({ ok: false, code: "ADMIN_REQUIRED" }, "farm_manager")).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
  });
  it.each([null, [], {}, { ok: "true", snapshot: snapshot() }, { ok: true, snapshot: snapshot({ role: "accountant" }) }, { ok: false, code: "RAW_SQL" }, { ok: false, code: "SAVE_FAILED", details: "secret" }, { ok: true, snapshot: snapshot(), code: "SAVE_FAILED" }])("rejects malformed load result %j", value => throwsInvalid(() => validateLoadResult(value, "farm_manager")));
  it("accepts exact changed result with incremented CAS version and detached immutable snapshot", () => {
    const { before, request, result } = changedResult();
    const checked = validateSaveResult(result, request, before);
    expect(checked.ok).toBe(true); expect(Object.isFrozen(checked)).toBe(true);
    if (checked.ok) expect(checked.snapshot.version).toBe(8);
  });
  it("accepts unchanged result only for exact no-op same version", () => {
    const { before, request } = requestAndBefore();
    const noop = Object.freeze({ ...request, grants: before.grants });
    expect(validateSaveResult({ ok: true, changed: false, snapshot: before }, noop, before)).toEqual({ ok: true, changed: false, snapshot: before });
    throwsInvalid(() => validateSaveResult({ ok: true, changed: false, snapshot: before }, request, before));
  });
  it.each(["STALE_VERSION", "CATALOGUE_MISMATCH", "COMMIT_OUTCOME_UNKNOWN", "SAVE_FAILED", "ADMIN_PROTECTED", "INVALID_INPUT", "UNAUTHENTICATED", "INACTIVE_ACTOR", "ADMIN_REQUIRED", "POLICY_UNAVAILABLE"])("accepts public error %s without merging draft", code => {
    const { before, request, draft } = requestAndBefore();
    expect(validateSaveResult({ ok: false, code }, request, before)).toEqual({ ok: false, code });
    expect(draft.snapshot.version).toBe(7); expect(draft.grants[EDIT]).toBe(false); expect(pendingChanges(draft)).toHaveLength(1);
  });
  it.each(["role", "revision", "old-version", "skipped-version", "false-changed", "wrong-grants", "changed-defaults", "wrong-effective", "scope", "extra", "wrong-changed-type"])("rejects invalid server success %s", mutation => {
    const { before, request, result } = changedResult();
    const bad = { ...result, snapshot: { ...result.snapshot } };
    switch (mutation) {
      case "role": bad.snapshot.role = "accountant"; break;
      case "revision": bad.snapshot.catalogueRevision = "different"; break;
      case "old-version": bad.snapshot.version = 7; break;
      case "skipped-version": bad.snapshot.version = 9; break;
      case "false-changed": bad.changed = false; break;
      case "wrong-grants": bad.snapshot = snapshot({ version: 8, grants: { [DELETE]: false } }); break;
      case "changed-defaults": bad.snapshot = snapshot({ version: 8, grants: request.grants, defaults: Object.fromEntries(EDITOR_KEYS.map(key => [key, false])) }); break;
      case "wrong-effective": bad.snapshot.effective = Object.fromEntries(EDITOR_KEYS.map(key => [key, true])); break;
      case "scope": (bad.snapshot as unknown as Record<string, unknown>).scope = "outside"; break;
      case "extra": Object.assign(bad, { raw: "SECRET" }); break;
      case "wrong-changed-type": (bad as unknown as Record<string, unknown>).changed = "yes"; break;
    }
    throwsInvalid(() => validateSaveResult(bad, request, before));
  });
  it("rejects response for mismatched captured version and raw/error/accessor response", () => {
    const { before, request, result } = changedResult();
    throwsInvalid(() => validateSaveResult(result, { ...request, expectedVersion: 6 }, before));
    for (const value of [{ ok: false, code: "SQL_ERROR" }, { ok: false, code: "STALE_VERSION", reason: "secret" }, null, { ok: true, snapshot: result.snapshot }])
      throwsInvalid(() => validateSaveResult(value, request, before));
    const value = {}; Object.defineProperty(value, "ok", { enumerable: true, get() { throw new Error("SECRET"); } });
    throwsInvalid(() => validateSaveResult(value, request, before));
  });
});
