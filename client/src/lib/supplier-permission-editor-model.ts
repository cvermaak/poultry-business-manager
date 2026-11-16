/** MODULE4 preparation only: pure editor state; no auth, network, storage or clock. */
import {
  SUPPLIER_EDITOR_ACTION_KEYS, SUPPLIER_EDITOR_ROLES,
  type SupplierEditorAction, type SupplierEditorChoice, type SupplierEditorErrorCode,
  type SupplierEditorLoadResult, type SupplierEditorPendingChange, type SupplierEditorRole,
  type SupplierEditorSaveResult, type SupplierEditorSnapshot, type SupplierGrants,
  type SupplierPolicySaveRequest,
} from "@shared/supplier-permission-editor-contract";

export const EDITOR_ACTIONS = Object.freeze(["view", "create", "edit", "delete"] as const);
export const EDITOR_KEYS = Object.freeze(EDITOR_ACTIONS.flatMap(action => Array.from(SUPPLIER_EDITOR_ACTION_KEYS[action])));
const MAX_VERSION = 2147483647;
const SNAPSHOT_FIELDS = ["role", "scope", "catalogueRevision", "version", "grants", "defaults", "effective", "protectedAdmin"];
const ERROR_CODES: readonly SupplierEditorErrorCode[] = Object.freeze([
  "UNAUTHENTICATED", "INACTIVE_ACTOR", "ADMIN_REQUIRED", "INVALID_INPUT", "POLICY_UNAVAILABLE",
  "STALE_VERSION", "CATALOGUE_MISMATCH", "ADMIN_PROTECTED", "SAVE_FAILED", "COMMIT_OUTCOME_UNKNOWN",
]);
export class SupplierEditorValidationError extends Error {
  constructor() { super("Invalid supplier permission editor data."); this.name = "SupplierEditorValidationError"; }
}
function invalid(): never { throw new SupplierEditorValidationError(); }
/** Own, enumerable, data descriptors only. No getter or raw error is exposed. */
function fields(input: unknown, expected?: readonly string[], maximum = 8): Map<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length > maximum || (expected && keys.length !== expected.length)) invalid();
  const out = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== "string" || key.length > 160 || key === "__proto__" || key === "constructor" || key === "prototype"
      || (expected && expected.indexOf(key) < 0)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    out.set(key, descriptor.value);
  }
  if (expected && !expected.every(key => out.has(key))) invalid();
  return out;
}
function safely<T>(operation: () => T): T {
  try { return operation(); } catch { return invalid(); }
}
export function isSupplierEditorRole(role: unknown): role is SupplierEditorRole {
  return typeof role === "string" && SUPPLIER_EDITOR_ROLES.some(value => value === role);
}
function booleanRecord(input: unknown, exact: boolean): Readonly<Record<string, boolean>> {
  const record = fields(input, exact ? EDITOR_KEYS : undefined, 5);
  const out = Object.create(null) as Record<string, boolean>;
  for (const [key, value] of Array.from(record.entries())) {
    if (EDITOR_KEYS.indexOf(key as typeof EDITOR_KEYS[number]) < 0 || typeof value !== "boolean") invalid();
    out[key] = value;
  }
  return Object.freeze(out);
}
function sameGrants(left: SupplierGrants, right: SupplierGrants): boolean {
  return EDITOR_KEYS.every(key => Object.prototype.hasOwnProperty.call(left, key) === Object.prototype.hasOwnProperty.call(right, key)
    && left[key] === right[key]);
}
/** Returns a deep frozen, detached copy; malformed data never becomes an Allow fallback. */
export function validateSnapshot(input: unknown, expectedRole?: SupplierEditorRole): SupplierEditorSnapshot {
  return safely(() => {
    const record = fields(input, SNAPSHOT_FIELDS);
    const role = record.get("role"), version = record.get("version"), revision = record.get("catalogueRevision");
    if (!isSupplierEditorRole(role) || (expectedRole !== undefined && role !== expectedRole)
      || record.get("scope") !== "supplier_management" || typeof version !== "number" || !Number.isSafeInteger(version)
      || version < 0 || version > MAX_VERSION || typeof revision !== "string" || revision.length < 1 || revision.length > 160
      || revision !== revision.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(revision)
      || typeof record.get("protectedAdmin") !== "boolean" || record.get("protectedAdmin") !== (role === "admin")) invalid();
    const grants = booleanRecord(record.get("grants"), false) as SupplierGrants;
    const defaults = booleanRecord(record.get("defaults"), true);
    const effective = booleanRecord(record.get("effective"), true);
    if (version === 0 && Object.keys(grants).length !== 0) invalid();
    if (role === "admin" && (version !== 0 || Object.keys(grants).length !== 0 || !EDITOR_KEYS.every(key => defaults[key]))) invalid();
    if (!EDITOR_KEYS.every(key => effective[key] === (Object.prototype.hasOwnProperty.call(grants, key) ? grants[key] : defaults[key]))) invalid();
    return Object.freeze({ role, scope: "supplier_management" as const, catalogueRevision: revision, version,
      grants, defaults, effective, protectedAdmin: role === "admin" });
  });
}
export interface SupplierEditorDraft {
  readonly snapshot: SupplierEditorSnapshot;
  readonly grants: SupplierGrants;
  readonly reason: string;
}
export function createEditorDraft(snapshot: unknown): SupplierEditorDraft {
  const validated = validateSnapshot(snapshot);
  return Object.freeze({ snapshot: validated, grants: validated.grants, reason: "" });
}
export function setEditorReason(draft: SupplierEditorDraft, reason: string): SupplierEditorDraft {
  if (typeof reason !== "string") invalid();
  if (draft.snapshot.protectedAdmin) return draft;
  return Object.freeze({ ...draft, reason });
}
export function actionChoice(grants: SupplierGrants, action: SupplierEditorAction): SupplierEditorChoice | "mixed" {
  if (!EDITOR_ACTIONS.some(value => value === action)) invalid();
  const choices = SUPPLIER_EDITOR_ACTION_KEYS[action].map(key => Object.prototype.hasOwnProperty.call(grants, key)
    ? (grants[key] ? "allow" : "block") : "default");
  return choices.every(choice => choice === choices[0]) ? choices[0] : "mixed";
}
/** The only group normalization point: an explicit choice changes BOTH list and detail. */
export function chooseAction(draft: SupplierEditorDraft, action: SupplierEditorAction, choice: SupplierEditorChoice): SupplierEditorDraft {
  if (!EDITOR_ACTIONS.some(value => value === action) || !["default", "allow", "block"].some(value => value === choice)) invalid();
  if (draft.snapshot.protectedAdmin) return draft;
  const grants = Object.assign(Object.create(null), draft.grants) as Record<string, boolean>;
  for (const key of SUPPLIER_EDITOR_ACTION_KEYS[action]) {
    if (choice === "default") delete grants[key]; else grants[key] = choice === "allow";
  }
  return Object.freeze({ ...draft, grants: Object.freeze(grants) });
}
export function describeChoice(choice: SupplierEditorChoice | "mixed"): string {
  return choice === "default" ? "Use default" : choice === "allow" ? "Allow" : choice === "block" ? "Block" : "Mixed existing overrides";
}
export function describeAction(grants: SupplierGrants, action: SupplierEditorAction): string {
  const choice = actionChoice(grants, action);
  if (choice !== "mixed") return describeChoice(choice);
  return SUPPLIER_EDITOR_ACTION_KEYS[action].map(key => `${key.endsWith(".list") ? "List" : "Detail"}: ${describeChoice(
    Object.prototype.hasOwnProperty.call(grants, key) ? (grants[key] ? "allow" : "block") : "default")}`).join("; ");
}
export function pendingChanges(draft: SupplierEditorDraft): readonly SupplierEditorPendingChange[] {
  return Object.freeze(EDITOR_ACTIONS.filter(action => SUPPLIER_EDITOR_ACTION_KEYS[action].some(key =>
    Object.prototype.hasOwnProperty.call(draft.snapshot.grants, key) !== Object.prototype.hasOwnProperty.call(draft.grants, key)
    || draft.snapshot.grants[key] !== draft.grants[key])).map(action => Object.freeze({ action,
      before: describeAction(draft.snapshot.grants, action), after: describeAction(draft.grants, action),
      keys: SUPPLIER_EDITOR_ACTION_KEYS[action] })));
}
export function isEditorDirty(draft: SupplierEditorDraft): boolean {
  return pendingChanges(draft).length > 0 || draft.reason.length > 0;
}
/** Exactly Module2: raw <=4096, no C0/C1 controls, then trim, normalized 1..500 UTF-16 units. */
export function normalizeReason(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 4096 || /[\u0000-\u001f\u007f-\u009f]/.test(raw)) invalid();
  const reason = raw.trim();
  if (reason.length < 1 || reason.length > 500) invalid();
  return reason;
}
export function prepareSaveRequest(draft: SupplierEditorDraft): SupplierPolicySaveRequest {
  const snapshot = validateSnapshot(draft.snapshot);
  if (snapshot.role === "admin" || pendingChanges(draft).length === 0 || snapshot.version === MAX_VERSION) invalid();
  return Object.freeze({ role: snapshot.role, catalogueRevision: snapshot.catalogueRevision,
    expectedVersion: snapshot.version, grants: booleanRecord(draft.grants, false) as SupplierGrants, reason: normalizeReason(draft.reason) });
}
export function validateLoadResult(input: unknown, role: SupplierEditorRole): SupplierEditorLoadResult {
  return safely(() => {
    const record = fields(input, undefined, 2);
    if (record.get("ok") === true && record.size === 2 && record.has("snapshot"))
      return Object.freeze({ ok: true as const, snapshot: validateSnapshot(record.get("snapshot"), role) });
    if (record.get("ok") === false && record.size === 2 && ERROR_CODES.some(code => code === record.get("code")))
      return Object.freeze({ ok: false as const, code: record.get("code") as SupplierEditorErrorCode });
    return invalid();
  });
}
/** A success must echo the exact role/revision/grants and CAS version; never merge a stale response. */
export function validateSaveResult(input: unknown, request: SupplierPolicySaveRequest, before: SupplierEditorSnapshot): SupplierEditorSaveResult {
  return safely(() => {
    const record = fields(input, undefined, 3);
    if (record.get("ok") === false && record.size === 2 && ERROR_CODES.some(code => code === record.get("code")))
      return Object.freeze({ ok: false as const, code: record.get("code") as SupplierEditorErrorCode });
    if (record.get("ok") !== true || record.size !== 3 || !record.has("snapshot") || typeof record.get("changed") !== "boolean") invalid();
    const changed = record.get("changed") as boolean;
    const snapshot = validateSnapshot(record.get("snapshot"), request.role);
    if (before.role !== request.role || before.catalogueRevision !== request.catalogueRevision || before.version !== request.expectedVersion
      || snapshot.catalogueRevision !== request.catalogueRevision || snapshot.version !== request.expectedVersion + (changed ? 1 : 0)
      || changed !== !sameGrants(before.grants, request.grants) || !sameGrants(snapshot.grants, request.grants)
      || !EDITOR_KEYS.every(key => snapshot.defaults[key] === before.defaults[key])) invalid();
    return Object.freeze({ ok: true as const, changed, snapshot });
  });
}
