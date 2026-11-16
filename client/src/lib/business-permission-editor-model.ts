/** Frontend-only pure scoped editor; no auth, network, storage or clock. */
import {
  BUSINESS_EDITOR_ROLES,
  type BusinessEditorAction,
  type BusinessEditorChoice,
  type BusinessEditorErrorCode,
  type BusinessEditorLoadResult,
  type BusinessEditorPendingChange,
  type BusinessEditorRole,
  type BusinessEditorSaveResult,
  type BusinessEditorSnapshot,
  type BusinessGrants,
  type BusinessPolicySaveRequest,
  type BusinessEditorDefinition,
  type BusinessScope,
} from "@shared/business-permission-editor-contract";

export const EDITOR_ACTIONS = Object.freeze([
  "view",
  "create",
  "edit",
  "delete",
  "export",
] as const);
const MAX_VERSION = 2147483647;
const SNAPSHOT_FIELDS = [
  "role",
  "scope",
  "catalogueRevision",
  "version",
  "grants",
  "defaults",
  "effective",
  "protectedAdmin",
];
const ERROR_CODES: readonly BusinessEditorErrorCode[] = Object.freeze([
  "UNAUTHENTICATED",
  "INACTIVE_ACTOR",
  "ADMIN_REQUIRED",
  "INVALID_INPUT",
  "POLICY_UNAVAILABLE",
  "STALE_VERSION",
  "CATALOGUE_MISMATCH",
  "ADMIN_PROTECTED",
  "SAVE_FAILED",
  "COMMIT_OUTCOME_UNKNOWN",
]);
export class BusinessEditorValidationError extends Error {
  constructor() {
    super("Invalid business permission editor data.");
    this.name = "BusinessEditorValidationError";
  }
}
function invalid(): never {
  throw new BusinessEditorValidationError();
}
/** Own, enumerable, data descriptors only. No getter or raw error is exposed. */
function fields(
  input: unknown,
  expected?: readonly string[],
  maximum = 8,
): Map<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length > maximum || (expected && keys.length !== expected.length))
    invalid();
  const out = new Map<string, unknown>();
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      key.length > 160 ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype" ||
      (expected && expected.indexOf(key) < 0)
    )
      invalid();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      invalid();
    out.set(key, descriptor.value);
  }
  if (expected && !expected.every((key) => out.has(key))) invalid();
  return out;
}
function safely<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return invalid();
  }
}
export function isBusinessEditorRole(
  role: unknown,
): role is BusinessEditorRole {
  return (
    typeof role === "string" &&
    BUSINESS_EDITOR_ROLES.some((value) => value === role)
  );
}
export interface BusinessEditorDraft {
  readonly snapshot: BusinessEditorSnapshot;
  readonly grants: BusinessGrants;
  readonly reason: string;
}
/** Factory metadata comes from trusted static code, never from a response or request. */
export function createBusinessEditorModel(
  definition: BusinessEditorDefinition,
) {
  if (
    !["customers", "sales_orders", "invoices", "financial_data", "feed_management"].some(
      (scope) => scope === definition.scope,
    )
  )
    invalid();
  const scope = definition.scope as BusinessScope;
  const actionKeys = Object.freeze(
    Object.fromEntries(
      EDITOR_ACTIONS.map((action) => [
        action,
        Object.freeze(Array.from(definition.actions[action])),
      ]),
    ) as Record<BusinessEditorAction, readonly string[]>,
  );
  const EDITOR_KEYS = Object.freeze(
    EDITOR_ACTIONS.flatMap((action) => Array.from(actionKeys[action])),
  );
  const catalogueKeys = definition.catalogue.capabilities.map(
    (capability) => capability.key,
  );
  if (
    EDITOR_KEYS.length < 1 ||
    EDITOR_KEYS.length > 32 ||
    new Set(EDITOR_KEYS).size !== EDITOR_KEYS.length ||
    catalogueKeys.length !== EDITOR_KEYS.length ||
    new Set(catalogueKeys).size !== catalogueKeys.length ||
    !EDITOR_KEYS.every(
      (key) =>
        typeof key === "string" &&
        key.length <= 160 &&
        key.length > 0 &&
        !["__proto__", "constructor", "prototype"].includes(key) &&
        catalogueKeys.includes(key),
    )
  )
    invalid();
  const supportedActions = Object.freeze(
    EDITOR_ACTIONS.filter((action) => actionKeys[action].length > 0),
  );
  const financialRestrictedRoles = Object.freeze(
    Array.from(definition.financialRestrictedRoles ?? []),
  );
  if (
    !financialRestrictedRoles.every(
      (role) => isBusinessEditorRole(role) && role !== "admin",
    )
  )
    invalid();
  const isFinancialRestricted = (role: BusinessEditorRole) =>
    financialRestrictedRoles.some(candidate => candidate === role);
  function booleanRecord(
    input: unknown,
    exact: boolean,
  ): Readonly<Record<string, boolean>> {
    const record = fields(input, exact ? EDITOR_KEYS : undefined, 32);
    const out = Object.create(null) as Record<string, boolean>;
    for (const [key, value] of Array.from(record.entries())) {
      if (
        EDITOR_KEYS.indexOf(key as (typeof EDITOR_KEYS)[number]) < 0 ||
        typeof value !== "boolean"
      )
        invalid();
      out[key] = value;
    }
    return Object.freeze(out);
  }
  function sameGrants(left: BusinessGrants, right: BusinessGrants): boolean {
    return EDITOR_KEYS.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(left, key) ===
          Object.prototype.hasOwnProperty.call(right, key) &&
        left[key] === right[key],
    );
  }
  /** Returns a deep frozen, detached copy; malformed data never becomes an Allow fallback. */
  function validateSnapshot(
    input: unknown,
    expectedRole?: BusinessEditorRole,
  ): BusinessEditorSnapshot {
    return safely(() => {
      const record = fields(input, SNAPSHOT_FIELDS);
      const role = record.get("role"),
        version = record.get("version"),
        revision = record.get("catalogueRevision");
      if (
        !isBusinessEditorRole(role) ||
        (expectedRole !== undefined && role !== expectedRole) ||
        record.get("scope") !== scope ||
        typeof version !== "number" ||
        !Number.isSafeInteger(version) ||
        version < 0 ||
        version > MAX_VERSION ||
        typeof revision !== "string" ||
        revision.length < 1 ||
        revision.length > 160 ||
        revision !== revision.trim() ||
        /[\u0000-\u001f\u007f-\u009f]/.test(revision) ||
        typeof record.get("protectedAdmin") !== "boolean" ||
        record.get("protectedAdmin") !== (role === "admin")
      )
        invalid();
      const grants = booleanRecord(
        record.get("grants"),
        false,
      ) as BusinessGrants;
      const defaults = booleanRecord(record.get("defaults"), true);
      const effective = booleanRecord(record.get("effective"), true);
      if (version === 0 && Object.keys(grants).length !== 0) invalid();
      if (
        role === "admin" &&
        (version !== 0 ||
          Object.keys(grants).length !== 0 ||
          !EDITOR_KEYS.every((key) => defaults[key]))
      )
        invalid();
      if (
        isFinancialRestricted(role) &&
        (Object.keys(grants).length !== 0 ||
          !EDITOR_KEYS.every(
            (key) => defaults[key] === false && effective[key] === false,
          ))
      )
        invalid();
      if (
        !EDITOR_KEYS.every(
          (key) =>
            effective[key] ===
            (Object.prototype.hasOwnProperty.call(grants, key)
              ? grants[key]
              : defaults[key]),
        )
      )
        invalid();
      return Object.freeze({
        role,
        scope,
        catalogueRevision: revision,
        version,
        grants,
        defaults,
        effective,
        protectedAdmin: role === "admin",
      });
    });
  }
  function createEditorDraft(snapshot: unknown): BusinessEditorDraft {
    const validated = validateSnapshot(snapshot);
    return Object.freeze({
      snapshot: validated,
      grants: validated.grants,
      reason: "",
    });
  }
  function setEditorReason(
    draft: BusinessEditorDraft,
    reason: string,
  ): BusinessEditorDraft {
    if (typeof reason !== "string") invalid();
    if (
      draft.snapshot.protectedAdmin ||
      isFinancialRestricted(draft.snapshot.role)
    )
      return draft;
    return Object.freeze({ ...draft, reason });
  }
  function actionChoice(
    grants: BusinessGrants,
    action: BusinessEditorAction,
  ): BusinessEditorChoice | "mixed" {
    if (!supportedActions.some((value) => value === action)) invalid();
    grants = booleanRecord(grants, false);
    const choices = actionKeys[action].map((key) =>
      Object.prototype.hasOwnProperty.call(grants, key)
        ? grants[key]
          ? "allow"
          : "block"
        : "default",
    );
    return choices.every((choice) => choice === choices[0])
      ? choices[0]
      : "mixed";
  }
  /** Only explicit choices normalize a supported group; default removes overrides, not source differences. */
  function chooseAction(
    draft: BusinessEditorDraft,
    action: BusinessEditorAction,
    choice: BusinessEditorChoice,
  ): BusinessEditorDraft {
    if (
      !supportedActions.some((value) => value === action) ||
      !["default", "allow", "block"].some((value) => value === choice)
    )
      invalid();
    validateSnapshot(draft.snapshot);
    const validatedGrants = booleanRecord(draft.grants, false);
    if (draft.snapshot.protectedAdmin) return draft;
    if (isFinancialRestricted(draft.snapshot.role)) invalid();
    const grants = Object.assign(
      Object.create(null),
      validatedGrants,
    ) as Record<string, boolean>;
    for (const key of actionKeys[action]) {
      if (choice === "default") delete grants[key];
      else grants[key] = choice === "allow";
    }
    return Object.freeze({ ...draft, grants: Object.freeze(grants) });
  }
  function describeChoice(choice: BusinessEditorChoice | "mixed"): string {
    return choice === "default"
      ? "Use default"
      : choice === "allow"
        ? "Allow"
        : choice === "block"
          ? "Block"
          : "Mixed existing overrides";
  }
  function describeAction(
    grants: BusinessGrants,
    action: BusinessEditorAction,
  ): string {
    const choice = actionChoice(grants, action);
    if (choice !== "mixed") return describeChoice(choice);
    return actionKeys[action]
      .map(
        (key) =>
          `${key.split(".").pop()}: ${describeChoice(
            Object.prototype.hasOwnProperty.call(grants, key)
              ? grants[key]
                ? "allow"
                : "block"
              : "default",
          )}`,
      )
      .join("; ");
  }
  function pendingChanges(
    draft: BusinessEditorDraft,
  ): readonly BusinessEditorPendingChange[] {
    return Object.freeze(
      supportedActions
        .filter((action) =>
          actionKeys[action].some(
            (key) =>
              Object.prototype.hasOwnProperty.call(
                draft.snapshot.grants,
                key,
              ) !== Object.prototype.hasOwnProperty.call(draft.grants, key) ||
              draft.snapshot.grants[key] !== draft.grants[key],
          ),
        )
        .map((action) =>
          Object.freeze({
            action,
            before: describeAction(draft.snapshot.grants, action),
            after: describeAction(draft.grants, action),
            keys: actionKeys[action],
          }),
        ),
    );
  }
  function isEditorDirty(draft: BusinessEditorDraft): boolean {
    return pendingChanges(draft).length > 0 || draft.reason.length > 0;
  }
  /** Exactly Module2: raw <=4096, no C0/C1 controls, then trim, normalized 1..500 UTF-16 units. */
  function normalizeReason(raw: unknown): string {
    if (
      typeof raw !== "string" ||
      raw.length > 4096 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(raw)
    )
      invalid();
    const reason = raw.trim();
    if (reason.length < 1 || reason.length > 500) invalid();
    return reason;
  }
  function prepareSaveRequest(
    draft: BusinessEditorDraft,
  ): BusinessPolicySaveRequest {
    const snapshot = validateSnapshot(draft.snapshot);
    if (
      snapshot.role === "admin" ||
      isFinancialRestricted(snapshot.role) ||
      pendingChanges(draft).length === 0 ||
      snapshot.version === MAX_VERSION
    )
      invalid();
    return Object.freeze({
      role: snapshot.role,
      catalogueRevision: snapshot.catalogueRevision,
      expectedVersion: snapshot.version,
      grants: booleanRecord(draft.grants, false) as BusinessGrants,
      reason: normalizeReason(draft.reason),
    });
  }
  function validateLoadResult(
    input: unknown,
    role: BusinessEditorRole,
  ): BusinessEditorLoadResult {
    return safely(() => {
      const record = fields(input, undefined, 2);
      if (
        record.get("ok") === true &&
        record.size === 2 &&
        record.has("snapshot")
      )
        return Object.freeze({
          ok: true as const,
          snapshot: validateSnapshot(record.get("snapshot"), role),
        });
      if (
        record.get("ok") === false &&
        record.size === 2 &&
        ERROR_CODES.some((code) => code === record.get("code"))
      )
        return Object.freeze({
          ok: false as const,
          code: record.get("code") as BusinessEditorErrorCode,
        });
      return invalid();
    });
  }
  /** A success must echo the exact role/revision/grants and CAS version; never merge a stale response. */
  function validateSaveResult(
    input: unknown,
    request: BusinessPolicySaveRequest,
    before: BusinessEditorSnapshot,
  ): BusinessEditorSaveResult {
    return safely(() => {
      before = validateSnapshot(before, request.role);
      if (isFinancialRestricted(request.role)) invalid();
      booleanRecord(request.grants, false);
      const record = fields(input, undefined, 3);
      if (
        record.get("ok") === false &&
        record.size === 2 &&
        ERROR_CODES.some((code) => code === record.get("code"))
      )
        return Object.freeze({
          ok: false as const,
          code: record.get("code") as BusinessEditorErrorCode,
        });
      if (
        record.get("ok") !== true ||
        record.size !== 3 ||
        !record.has("snapshot") ||
        typeof record.get("changed") !== "boolean"
      )
        invalid();
      const changed = record.get("changed") as boolean;
      const snapshot = validateSnapshot(record.get("snapshot"), request.role);
      if (
        before.role !== request.role ||
        before.catalogueRevision !== request.catalogueRevision ||
        before.version !== request.expectedVersion ||
        snapshot.catalogueRevision !== request.catalogueRevision ||
        snapshot.version !== request.expectedVersion + (changed ? 1 : 0) ||
        changed !== !sameGrants(before.grants, request.grants) ||
        !sameGrants(snapshot.grants, request.grants) ||
        !EDITOR_KEYS.every(
          (key) => snapshot.defaults[key] === before.defaults[key],
        )
      )
        invalid();
      return Object.freeze({ ok: true as const, changed, snapshot });
    });
  }

  return Object.freeze({
    scope,
    label: definition.label,
    notes: Object.freeze(Array.from(definition.notes)),
    actionKeys,
    EDITOR_KEYS,
    supportedActions,
    isFinancialRestricted,
    validateSnapshot,
    createEditorDraft,
    setEditorReason,
    actionChoice,
    chooseAction,
    describeChoice,
    describeAction,
    pendingChanges,
    isEditorDirty,
    normalizeReason,
    prepareSaveRequest,
    validateLoadResult,
    validateSaveResult,
  });
}
export type BusinessEditorModel = ReturnType<typeof createBusinessEditorModel>;
