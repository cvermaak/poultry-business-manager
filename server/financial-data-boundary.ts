import { types as nodeTypes } from "node:util";
import { TRPCError } from "@trpc/server";
import {
  hasFinancialVisibility,
  isFinancialDataKey,
  isFinancialDataRole,
  type FinancialDataRole,
} from "../shared/financial-data-policy";

/**
 * Wiring contract: resolveActor performs a fresh, read-only lookup of ONLY
 * id/role/isActive using the existing pool/configuration. Project mysql rows into
 * a plain three-field DTO. Never use a JWT role or cache actors across requests.
 * canViewFinancialData reads trusted fresh editable FinancialDataView policy;
 * parent supplies initial Farm Manager Block / other-role unchanged defaults.
 * Permission Allow authorizes VISIBILITY only, never a financial write/action.
 * This module imports no auth/database code and grants no new baseline permission.
 *
 * Parent middleware must classify paths explicitly: financial (also unknown or
 * opaque audit/document/CSV/PDF/pay-link/status endpoints) is gated BEFORE next(),
 * especially mutations. Only audited mixed operational DTOs are redacted AFTER
 * successful next(); replace ONLY res.data, retaining the original tRPC OK shape.
 * Do not pass a whole tRPC envelope, raw Error, or failed result to the redactor.
 * No key-based filter can prove that free-form strings or opaque bytes are safe.
 */
export type FinancialDataLevel = "financial" | "operational" | "unrestricted";
export interface StoredFinancialActor {
  readonly id: number;
  readonly role: FinancialDataRole;
  readonly isActive: true;
}
export interface FinancialDataDecision {
  /** Internal server metadata: expose only the fresh visibility BOOLEAN to UI. */
  readonly actor: StoredFinancialActor;
  readonly level: FinancialDataLevel;
  readonly canViewFinancialData: boolean;
  readonly requiresRedaction: boolean;
}
export interface FinancialDataBoundaryOptions {
  /** Unknown return type forces runtime validation of trusted adapter output. */
  resolveActor: (actorId: number) => unknown | Promise<unknown>;
  /** Parent resolves stored policy/defaults; must return a literal boolean. */
  canViewFinancialData: (
    actor: StoredFinancialActor,
  ) => unknown | Promise<unknown>;
}

export type FinancialDataBoundaryErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL_SERVER_ERROR";
const fixedMessages: Readonly<Record<FinancialDataBoundaryErrorCode, string>> =
  Object.freeze({
    UNAUTHORIZED: "Authentication is required.",
    FORBIDDEN: "Financial data access is not permitted.",
    INTERNAL_SERVER_ERROR: "Financial data could not be processed safely.",
  });
const boundaryErrors = new WeakMap<object, FinancialDataBoundaryErrorCode>();

/** No caller-provided message, actor, payload, or underlying cause is echoed. */
export function createFinancialDataBoundaryError(
  code: FinancialDataBoundaryErrorCode,
): TRPCError {
  // Validate even runtime callers outside TypeScript; never index by an object.
  const safeCode =
    code === "UNAUTHORIZED" || code === "FORBIDDEN"
      ? code
      : "INTERNAL_SERVER_ERROR";
  const error = new TRPCError({
    code: safeCode,
    message: fixedMessages[safeCode],
  });
  boundaryErrors.set(error, safeCode);
  return Object.freeze(error);
}

/** WeakMap identity only: no untrusted code/message getters or proxy traps. */
export function getFinancialDataBoundaryErrorCode(
  error: unknown,
): FinancialDataBoundaryErrorCode | undefined {
  return typeof error === "object" && error !== null
    ? boundaryErrors.get(error)
    : undefined;
}
export function isFinancialDataBoundaryError(error: unknown): boolean {
  return getFinancialDataBoundaryErrorCode(error) !== undefined;
}

function fail(code: FinancialDataBoundaryErrorCode): never {
  throw createFinancialDataBoundaryError(code);
}
function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}
function plainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function dataDescriptor(
  object: object,
  key: string,
): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, "value")
    ? descriptor
    : undefined;
}

/** Extract identity ONLY; deliberately never read context/JWT role or isActive. */
export function getFinancialActorIdFromContext(context: unknown): number {
  if (!plainObject(context)) return fail("UNAUTHORIZED");
  const user = dataDescriptor(context, "user")?.value;
  if (!plainObject(user)) return fail("UNAUTHORIZED");
  const id = dataDescriptor(user, "id")?.value;
  if (!validId(id)) return fail("UNAUTHORIZED");
  return id;
}

function validateStoredActor(
  row: unknown,
  actorId: number,
): StoredFinancialActor {
  if (row === null || row === undefined) return fail("UNAUTHORIZED");
  if (!plainObject(row)) return fail("FORBIDDEN");
  const keys = Reflect.ownKeys(row);
  if (
    keys.length !== 3 ||
    !keys.every((key) => key === "id" || key === "role" || key === "isActive")
  )
    return fail("FORBIDDEN");
  const descriptors = keys.map((key) => dataDescriptor(row, key as string));
  if (descriptors.some((descriptor) => !descriptor || !descriptor.enumerable)) {
    return fail("FORBIDDEN");
  }
  const id = dataDescriptor(row, "id")!.value;
  const role = dataDescriptor(row, "role")!.value;
  const active = dataDescriptor(row, "isActive")!.value;
  if (!validId(id) || id !== actorId || !isFinancialDataRole(role)) {
    return fail("FORBIDDEN");
  }
  // mysql tinyint 1 or an explicit trusted adapter boolean; no coercion.
  if (active !== 1 && active !== true) return fail("FORBIDDEN");
  return Object.freeze({ id, role, isActive: true });
}

export function createFinancialDataBoundary({
  resolveActor,
  canViewFinancialData,
}: FinancialDataBoundaryOptions) {
  if (
    typeof resolveActor !== "function" ||
    typeof canViewFinancialData !== "function"
  ) {
    return fail("INTERNAL_SERVER_ERROR");
  }

  async function getActor(actorId: unknown): Promise<StoredFinancialActor> {
    if (!validId(actorId)) return fail("UNAUTHORIZED");
    let row: unknown;
    try {
      const candidate = resolveActor(actorId);
      // Only await an undecorated native Promise, not arbitrary thenables/rows.
      // The trusted adapter must itself avoid assimilating untrusted thenables.
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        !nodeTypes.isProxy(candidate) &&
        nodeTypes.isPromise(candidate)
      ) {
        if (
          Object.getPrototypeOf(candidate) !== Promise.prototype ||
          Reflect.ownKeys(candidate).length !== 0
        ) {
          return fail("INTERNAL_SERVER_ERROR");
        }
        row = await candidate;
      } else {
        row = candidate;
      }
    } catch {
      return fail("INTERNAL_SERVER_ERROR");
    }
    return validateStoredActor(row, actorId);
  }

  async function authorize(
    actorId: unknown,
    level: FinancialDataLevel,
  ): Promise<FinancialDataDecision> {
    if (
      level !== "financial" &&
      level !== "operational" &&
      level !== "unrestricted"
    ) {
      return fail("FORBIDDEN");
    }
    const actor = await getActor(actorId);
    let permission: unknown;
    try {
      const candidate = canViewFinancialData(actor);
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        !nodeTypes.isProxy(candidate) &&
        nodeTypes.isPromise(candidate)
      ) {
        if (
          Object.getPrototypeOf(candidate) !== Promise.prototype ||
          Reflect.ownKeys(candidate).length !== 0
        ) {
          return fail("INTERNAL_SERVER_ERROR");
        }
        permission = await candidate;
      } else {
        permission = candidate;
      }
    } catch {
      return fail("INTERNAL_SERVER_ERROR");
    }
    const allowed = hasFinancialVisibility(permission);
    if (level === "financial" && !allowed) return fail("FORBIDDEN");
    return Object.freeze({
      actor,
      level,
      canViewFinancialData: allowed,
      requiresRedaction: level === "operational" && !allowed,
    });
  }

  /** Visibility gate ONLY. Keep original sensitive financial-action guards. */
  async function authorizeFinancial(
    actorId: unknown,
  ): Promise<FinancialDataDecision> {
    return authorize(actorId, "financial");
  }

  async function filterOperational(
    actorId: unknown,
    result: unknown,
  ): Promise<unknown> {
    const decision = await authorize(actorId, "operational");
    // Preserve identity/bytes/shapes whenever fresh visibility is allowed.
    // An administrator may also Block other roles: they then receive redaction.
    return decision.requiresRedaction ? redactFinancialData(result) : result;
  }

  // No persisted memoization. A caller may reuse a decision within ONE request.
  return Object.freeze({
    getActor,
    authorize,
    authorizeFinancial,
    filterOperational,
  });
}

export const FINANCIAL_DATA_REDACTION_LIMITS = Object.freeze({
  maxDepth: 20,
  maxNodes: 100_000,
});

/**
 * Pure, bounded clone of plain DTOs and arrays; originals are never changed.
 * BigInts, dates, null/undefined and scalar values survive. Strings are NEVER
 * scanned/replaced: deny endpoints carrying unaudited free-form financial text.
 * Binary/Buffer, classes, raw Errors, accessors, proxies, symbols, cycles, exotic
 * prototypes and decorated dates fail closed, even inside a removed money field.
 * Repeated non-cyclic references are independently cloned (no identity leaks).
 */
export function redactFinancialData(input: unknown): unknown {
  let nodes = 0;
  const ancestors = new WeakSet<object>();
  const { maxDepth, maxNodes } = FINANCIAL_DATA_REDACTION_LIMITS;

  function spend(count: number) {
    nodes += count;
    if (nodes > maxNodes) fail("INTERNAL_SERVER_ERROR");
  }

  function visit(
    value: unknown,
    depth: number,
    retain: boolean,
    counted = false,
  ): unknown {
    if (depth > maxDepth) return fail("INTERNAL_SERVER_ERROR");
    if (!counted) spend(1);
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      return retain ? value : undefined;
    }
    if (typeof value !== "object" || nodeTypes.isProxy(value)) {
      return fail("INTERNAL_SERVER_ERROR");
    }
    if (ancestors.has(value)) return fail("INTERNAL_SERVER_ERROR");
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Date.prototype) {
      if (Reflect.ownKeys(value).length !== 0)
        return fail("INTERNAL_SERVER_ERROR");
      const time = Date.prototype.getTime.call(value);
      if (!Number.isFinite(time)) return fail("INTERNAL_SERVER_ERROR");
      return retain ? new Date(time) : undefined;
    }
    const array = Array.isArray(value);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    ) {
      return fail("INTERNAL_SERVER_ERROR");
    }
    // Array length is read through a descriptor, never an overridden getter.
    const length = array ? dataDescriptor(value, "length")?.value : undefined;
    if (
      array &&
      (typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > maxNodes - nodes)
    )
      return fail("INTERNAL_SERVER_ERROR");
    if (array) spend(length);
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxNodes - (array ? 0 : nodes))
      return fail("INTERNAL_SERVER_ERROR");
    if (!array) spend(keys.length);
    const output = retain
      ? array
        ? new Array(length)
        : Object.create(prototype)
      : undefined;
    ancestors.add(value);
    try {
      for (const key of keys) {
        if (array && key === "length") continue;
        if (
          typeof key !== "string" ||
          key === "__proto__" ||
          key === "constructor" ||
          key === "prototype"
        )
          return fail("INTERNAL_SERVER_ERROR");
        const descriptor = dataDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable)
          return fail("INTERNAL_SERVER_ERROR");
        if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
          return fail("INTERNAL_SERVER_ERROR");
        const keep = retain && (array || !isFinancialDataKey(key));
        const child = visit(descriptor.value, depth + 1, keep, true);
        if (keep)
          Object.defineProperty(output, key, {
            value: child,
            enumerable: true,
            writable: true,
            configurable: true,
          });
      }
    } finally {
      ancestors.delete(value);
    }
    return output;
  }

  try {
    return visit(input, 0, true);
  } catch (error) {
    // Even internal reflection/date failures become fixed, cause-free errors.
    const code = getFinancialDataBoundaryErrorCode(error);
    if (code) throw error;
    return fail("INTERNAL_SERVER_ERROR");
  }
}
