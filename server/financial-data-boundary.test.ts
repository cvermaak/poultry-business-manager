import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import {
  hasFinancialVisibility,
  FINANCIAL_DATA_ROLES,
  isFinancialDataKey,
} from "../shared/financial-data-policy";
import {
  createFinancialDataBoundary as createProductionBoundary,
  createFinancialDataBoundaryError,
  FINANCIAL_DATA_REDACTION_LIMITS,
  getFinancialActorIdFromContext,
  getFinancialDataBoundaryErrorCode,
  isFinancialDataBoundaryError,
  redactFinancialData,
  type FinancialDataBoundaryOptions,
} from "./financial-data-boundary";

// INITIAL baseline supplied by the parent policy repo, NOT hardcoded in boundary.
function createFinancialDataBoundary(
  options: Pick<FinancialDataBoundaryOptions, "resolveActor"> &
    Partial<Pick<FinancialDataBoundaryOptions, "canViewFinancialData">>,
) {
  return createProductionBoundary({
    canViewFinancialData: (actor) => actor.role !== "farm_manager",
    ...options,
  });
}
const stored = (role = "farm_manager", isActive: unknown = 1) => ({
  id: 7,
  role,
  isActive,
});
const boundaryFor = (role = "farm_manager") =>
  createFinancialDataBoundary({ resolveActor: () => stored(role) });
const otherRoles = FINANCIAL_DATA_ROLES.filter(
  (role) => role !== "farm_manager",
);

function expectSafeFailure(run: () => unknown, code = "INTERNAL_SERVER_ERROR") {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(TRPCError);
  expect(getFinancialDataBoundaryErrorCode(error)).toBe(code);
  expect((error as TRPCError).cause).toBeUndefined();
  expect((error as TRPCError).message).not.toContain("secret");
}

async function expectSafeRejection(run: Promise<unknown>, code: string) {
  let error: unknown;
  try {
    await run;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(TRPCError);
  expect(getFinancialDataBoundaryErrorCode(error)).toBe(code);
  expect((error as TRPCError).cause).toBeUndefined();
}

describe("financial-data-policy", () => {
  it("uses only an authoritative literal permission true, not role labels", () => {
    expect(hasFinancialVisibility(true)).toBe(true);
  });
  it.each([
    false,
    "true",
    "farm_manager",
    "admin",
    "unknown",
    "",
    null,
    undefined,
    1,
    {},
  ])("fails closed for non-authoritative visibility %s", (permission) => {
    expect(hasFinancialVisibility(permission)).toBe(false);
  });
  it.each([
    "PRICE",
    "Unit_Price",
    "unit-cost",
    "COSTPERKG",
    "financial_summary",
    "FinancialStats",
    "invoice",
    "invoices",
    "journal",
    "accountingPosting",
    "PAYMENT",
    "Bank_Details",
    "bankAccountNumber",
    "credit_limit",
    "balanceDue",
    "paidAmount",
    "openingBalance",
    "invoiceTotal",
    "totalRevenue",
    "taxRate",
    "discountPercentage",
    "profitMargin",
    "amount",
    "amount_due",
    "balance",
  ])("classifies the canonical financial key %s", (key) => {
    expect(isFinancialDataKey(key)).toBe(true);
  });
  it.each([
    "remainingBirds",
    "waterConsumption",
    "waterAmount",
    "feedingAmount",
    "feedAmount",
    "feedKg",
    "medicineAmount",
    "mortalityRate",
    "bodyWeight",
    "health",
    "taxonomy",
    "taxon",
    "limit",
    "total",
    "count",
    "capacity",
    "notes",
    "message",
    "name",
    "birdsPerCrate",
    "operationalStatus",
  ])("keeps explicitly physical or nonmonetary key %s", (key) => {
    expect(isFinancialDataKey(key)).toBe(false);
  });
});

describe("fresh stored actor boundary", () => {
  it("denies Farm Manager regardless of a stale JWT admin role and overrideAllow", async () => {
    const context = {
      user: { id: 7, role: "admin", isActive: true, overrideAllow: true },
    };
    const resolver = vi.fn(() => stored());
    const boundary = createFinancialDataBoundary({ resolveActor: resolver });
    await expectSafeRejection(
      boundary.authorizeFinancial(getFinancialActorIdFromContext(context)),
      "FORBIDDEN",
    );
    expect(resolver).toHaveBeenCalledWith(7);
  });
  it("never reads untrusted role/isActive/override getters in context", async () => {
    const getter = vi.fn(() => {
      throw new Error("secret JWT");
    });
    const user = { id: 7 };
    for (const key of ["role", "isActive", "overrideAllow"]) {
      Object.defineProperty(user, key, { get: getter });
    }
    await expectSafeRejection(
      boundaryFor().authorizeFinancial(
        getFinancialActorIdFromContext({ user }),
      ),
      "FORBIDDEN",
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(otherRoles)(
    "allows fresh active %s and returns data without a transform",
    async (role) => {
      const boundary = boundaryFor(role);
      const decision = await boundary.authorizeFinancial(7);
      expect(decision.actor).toEqual({ id: 7, role, isActive: true });
      expect(decision.requiresRedaction).toBe(false);
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.actor)).toBe(true);
      const input = { amount: "secret money", invoice: Buffer.from("secret") };
      expect(await boundary.filterOperational(7, input)).toBe(input);
      const rawError = new Error("secret");
      expect(await boundary.filterOperational(7, rawError)).toBe(rawError);
    },
  );
  it.each(FINANCIAL_DATA_ROLES)(
    "rejects inactive %s at every boundary level",
    async (role) => {
      const boundary = createFinancialDataBoundary({
        resolveActor: () => stored(role, 0),
      });
      for (const level of [
        "financial",
        "operational",
        "unrestricted",
      ] as const) {
        await expectSafeRejection(boundary.authorize(7, level), "FORBIDDEN");
      }
    },
  );
  it("accepts explicitly normalized active true", async () => {
    const boundary = createFinancialDataBoundary({
      resolveActor: () => stored("admin", true),
    });
    expect((await boundary.getActor(7)).isActive).toBe(true);
  });
  it.each([false, "1", "true", 2, null, undefined, NaN])(
    "does not coerce active state %s",
    async (active) => {
      const boundary = createFinancialDataBoundary({
        resolveActor: () => ({
          id: 7,
          role: "admin",
          isActive: active,
        }),
      });
      await expectSafeRejection(boundary.getActor(7), "FORBIDDEN");
    },
  );
  it.each([undefined, null])("rejects absent stored rows %s", async (row) => {
    const boundary = createFinancialDataBoundary({ resolveActor: () => row });
    await expectSafeRejection(boundary.authorizeFinancial(7), "UNAUTHORIZED");
  });
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "7",
    null,
    {},
    7n,
  ])("rejects malformed identities %s before resolver use", async (id) => {
    const resolveActor = vi.fn(() => stored("admin"));
    const boundary = createFinancialDataBoundary({ resolveActor });
    await expectSafeRejection(boundary.authorizeFinancial(id), "UNAUTHORIZED");
    expect(resolveActor).not.toHaveBeenCalled();
  });
  it.each([
    { id: 8, role: "admin", isActive: 1 },
    { id: "7", role: "admin", isActive: 1 },
    { id: 7, role: "unknown", isActive: 1 },
    { id: 7, role: "ADMIN", isActive: 1 },
    { id: 7, role: "admin" },
    { ...stored("admin"), overrideAllow: true },
    { ...stored("admin"), staleRole: "farm_manager" },
    [],
    new Date(),
    new Error("secret"),
  ])("rejects malformed/conflicting stored actor %s", async (row) => {
    await expectSafeRejection(
      createFinancialDataBoundary({ resolveActor: () => row }).getActor(7),
      "FORBIDDEN",
    );
  });
  it("validates stored descriptors without invoking role getters or thenables", async () => {
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    for (const key of ["id", "role", "isActive"]) {
      const actor = stored("admin");
      Object.defineProperty(actor, key, { get: getter });
      await expectSafeRejection(
        createFinancialDataBoundary({ resolveActor: () => actor }).getActor(7),
        "FORBIDDEN",
      );
    }
    const thenable = stored("admin");
    Object.defineProperty(thenable, "then", { get: getter });
    await expectSafeRejection(
      createFinancialDataBoundary({ resolveActor: () => thenable }).getActor(7),
      "FORBIDDEN",
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects actor proxies without invoking traps", async () => {
    const trap = vi.fn(() => {
      throw new Error("secret");
    });
    const proxy = new Proxy(stored("admin"), {
      get: trap,
      ownKeys: trap,
      getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap,
    });
    await expectSafeRejection(
      createFinancialDataBoundary({ resolveActor: () => proxy }).getActor(7),
      "FORBIDDEN",
    );
    expect(trap).not.toHaveBeenCalled();
  });
  it("uses a fresh row on each invocation without a cross-request actor cache", async () => {
    let role = "admin";
    const resolver = vi.fn(async () => stored(role));
    const boundary = createFinancialDataBoundary({ resolveActor: resolver });
    await boundary.authorizeFinancial(7);
    role = "farm_manager";
    await expectSafeRejection(boundary.authorizeFinancial(7), "FORBIDDEN");
    role = "accountant";
    expect((await boundary.getActor(7)).role).toBe("accountant");
    expect(resolver).toHaveBeenCalledTimes(3);
  });
  it("reads editable visibility freshly and allows Farm Manager when trusted policy permits it", async () => {
    let visible = false;
    const permission = vi.fn(async (actor) => {
      expect(actor).toEqual({ id: 7, role: "farm_manager", isActive: true });
      expect(Object.isFrozen(actor)).toBe(true);
      return visible;
    });
    const boundary = createFinancialDataBoundary({
      resolveActor: () => stored(),
      canViewFinancialData: permission,
    });
    await expectSafeRejection(boundary.authorizeFinancial(7), "FORBIDDEN");
    visible = true;
    expect((await boundary.authorizeFinancial(7)).canViewFinancialData).toBe(
      true,
    );
    const data = { amount: "visible money", invoice: { id: 1 } };
    expect(await boundary.filterOperational(7, data)).toBe(data);
    visible = false;
    expect(await boundary.filterOperational(7, data)).toEqual({});
    expect(permission).toHaveBeenCalledTimes(4);
  });
  it.each(otherRoles)(
    "respects administrator visibility Block for %s",
    async (role) => {
      const boundary = createFinancialDataBoundary({
        resolveActor: () => stored(role),
        canViewFinancialData: () => false,
      });
      await expectSafeRejection(boundary.authorizeFinancial(7), "FORBIDDEN");
      expect(
        await boundary.filterOperational(7, { birdCount: 9, price: 22 }),
      ).toEqual({ birdCount: 9 });
    },
  );
  it.each([undefined, null, 1, "true", { allowed: true }])(
    "requires a literal boolean policy value rather than %s",
    async (value) => {
      const boundary = createFinancialDataBoundary({
        resolveActor: () => stored("admin"),
        canViewFinancialData: () => value,
      });
      await expectSafeRejection(boundary.authorizeFinancial(7), "FORBIDDEN");
      expect(
        await boundary.filterOperational(7, { birds: 4, amount: 9 }),
      ).toEqual({ birds: 4 });
    },
  );
  it("rejects hostile visibility values without evaluating getters or traps", async () => {
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    const value = {};
    Object.defineProperty(value, "then", { get: getter });
    const proxy = new Proxy({}, { get: getter, getPrototypeOf: getter });
    for (const permission of [value, proxy]) {
      const boundary = createFinancialDataBoundary({
        resolveActor: () => stored("admin"),
        canViewFinancialData: () => permission,
      });
      await expectSafeRejection(boundary.authorizeFinancial(7), "FORBIDDEN");
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it("does not lift the parent's separate sensitive financial-write guard when visibility is Allow", async () => {
    const boundary = createFinancialDataBoundary({
      resolveActor: () => stored(),
      canViewFinancialData: () => true,
    });
    const existingSensitiveGuard = vi.fn(() => {
      throw new TRPCError({ code: "FORBIDDEN" });
    });
    const write = vi.fn();
    const execute = async () => {
      await boundary.authorizeFinancial(7); // visibility is allowed, action is NOT granted
      existingSensitiveGuard();
      write();
    };
    await expect(execute()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(existingSensitiveGuard).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });
  it("does not invoke policy for an inactive actor, and hides policy resolver failures", async () => {
    const visibility = vi.fn(() => true);
    await expectSafeRejection(
      createFinancialDataBoundary({
        resolveActor: () => stored("admin", 0),
        canViewFinancialData: visibility,
      }).authorizeFinancial(7),
      "FORBIDDEN",
    );
    expect(visibility).not.toHaveBeenCalled();
    await expectSafeRejection(
      createFinancialDataBoundary({
        resolveActor: () => stored("admin"),
        canViewFinancialData: async () => {
          throw new Error("secret stored grants");
        },
      }).authorizeFinancial(7),
      "INTERNAL_SERVER_ERROR",
    );
  });
  it("gates financial mutations before fake helper/write execution", async () => {
    const write = vi.fn();
    const execute = async () => {
      await boundaryFor().authorizeFinancial(7);
      write({ amount: 100 });
    };
    await expectSafeRejection(execute(), "FORBIDDEN");
    expect(write).not.toHaveBeenCalled();
  });
  it("returns a fresh permission-derived operational flag and pure redaction", async () => {
    const boundary = boundaryFor();
    const decision = await boundary.authorize(7, "operational");
    expect(decision).toMatchObject({
      requiresRedaction: true,
      canViewFinancialData: false,
    });
    const input = { birdCount: 15, amount: "99.00" };
    expect(await boundary.filterOperational(7, input)).toEqual({
      birdCount: 15,
    });
    expect(input.amount).toBe("99.00");
    const unrestricted = await boundary.authorize(7, "unrestricted");
    expect(unrestricted.canViewFinancialData).toBe(false);
    expect(unrestricted.requiresRedaction).toBe(false);
  });
  it("denies unknown classification without resolving an actor", async () => {
    const resolver = vi.fn(() => stored("admin"));
    const boundary = createFinancialDataBoundary({ resolveActor: resolver });
    await expectSafeRejection(
      boundary.authorize(7, "unknown" as never),
      "FORBIDDEN",
    );
    expect(resolver).not.toHaveBeenCalled();
  });
  it("replaces resolver failures with fixed errors without exposing causes", async () => {
    const boundary = createFinancialDataBoundary({
      resolveActor: async () => {
        throw new Error("secret db details, amount=500");
      },
    });
    await expectSafeRejection(boundary.getActor(7), "INTERNAL_SERVER_ERROR");
  });
});

describe("context identity and fixed errors", () => {
  it.each([
    null,
    {},
    { user: null },
    { user: { id: "7" } },
    { user: { id: -1 } },
  ])("rejects invalid context %s", (context) => {
    expectSafeFailure(
      () => getFinancialActorIdFromContext(context),
      "UNAUTHORIZED",
    );
  });
  it("rejects identity accessors and proxies without invoking traps", () => {
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    const context = {};
    Object.defineProperty(context, "user", { get: getter });
    expectSafeFailure(
      () => getFinancialActorIdFromContext(context),
      "UNAUTHORIZED",
    );
    const user = {};
    Object.defineProperty(user, "id", { get: getter });
    expectSafeFailure(
      () => getFinancialActorIdFromContext({ user }),
      "UNAUTHORIZED",
    );
    expectSafeFailure(
      () =>
        getFinancialActorIdFromContext(
          new Proxy({}, { getPrototypeOf: getter }),
        ),
      "UNAUTHORIZED",
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it("brands only local boundary errors; never reads spoofed error fields", () => {
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    const hostile = new Proxy({}, { get: getter, getPrototypeOf: getter });
    expect(isFinancialDataBoundaryError(hostile)).toBe(false);
    expect(getFinancialDataBoundaryErrorCode(hostile)).toBeUndefined();
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(getFinancialDataBoundaryErrorCode(revoked.proxy)).toBeUndefined();
    expect(
      isFinancialDataBoundaryError(new TRPCError({ code: "FORBIDDEN" })),
    ).toBe(false);
    expect(isFinancialDataBoundaryError({ code: "FORBIDDEN" })).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    for (const code of [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "INTERNAL_SERVER_ERROR",
    ] as const) {
      const error = createFinancialDataBoundaryError(code);
      expect(error).toBeInstanceOf(TRPCError);
      expect(Object.isFrozen(error)).toBe(true);
      expect(getFinancialDataBoundaryErrorCode(error)).toBe(code);
      expect(error.cause).toBeUndefined();
    }
  });
});

describe("bounded immutable financial DTO redaction", () => {
  it("removes nested structures and money but preserves exact physical/scalar values", () => {
    const date = new Date("2026-11-14T00:00:00Z");
    const input = {
      id: 17,
      remainingBirds: 200,
      waterAmount: "7.50",
      feedingAmount: 12,
      mortalityRate: 0.5,
      healthy: true,
      missing: undefined,
      optional: null,
      huge: 9007199254740993n,
      date,
      name: "Price Farm",
      notes: "water, feeding, health; invoice amount $123 is opaque",
      financialSummary: { amount: "secret" },
      invoice: { id: 1 },
      invoices: [{ total: "secret" }],
      payment: { url: "secret" },
      pricing: { base: "secret" },
      bankDetails: { number: "secret" },
      accountingPosting: { id: 3 },
      journal: [{ id: 4 }],
      nested: [
        { price: "secret", weight: "1.500", deep: { COST: 22, birdCount: 8 } },
      ],
      customer: {
        name: "Person",
        creditLimit: "secret",
        balanceDue: "secret",
        paidAmount: "secret",
      },
    };
    const output = redactFinancialData(input) as typeof input;
    expect(output).toEqual({
      id: 17,
      remainingBirds: 200,
      waterAmount: "7.50",
      feedingAmount: 12,
      mortalityRate: 0.5,
      healthy: true,
      missing: undefined,
      optional: null,
      huge: 9007199254740993n,
      date,
      name: "Price Farm",
      notes: "water, feeding, health; invoice amount $123 is opaque",
      nested: [{ weight: "1.500", deep: { birdCount: 8 } }],
      customer: { name: "Person" },
    });
    expect(output).not.toBe(input);
    expect(output.nested).not.toBe(input.nested);
    expect(output.date).not.toBe(date);
    expect(output.date.getTime()).toBe(date.getTime());
    expect(input.invoice.id).toBe(1);
    expect(input.nested[0].price).toBe("secret");
  });
  it("preserves null-prototype DTOs, empty and sparse arrays without mutating frozen inputs", () => {
    const dto = Object.assign(Object.create(null), { flockId: 4, unitCost: 5 });
    const sparse = new Array(3);
    sparse[1] = Object.freeze({ birdCount: 2, amount: 9 });
    Object.freeze(sparse);
    Object.freeze(dto);
    const output = redactFinancialData({ dto, sparse }) as {
      dto: object;
      sparse: object[];
    };
    expect(Object.getPrototypeOf(output.dto)).toBeNull();
    expect(output.dto).toEqual({ flockId: 4 });
    expect(output.sparse).toHaveLength(3);
    expect(0 in output.sparse).toBe(false);
    expect(output.sparse[1]).toEqual({ birdCount: 2 });
    expect(redactFinancialData([])).toEqual([]);
  });
  it("does not turn monetary-valued scalars or strings into claimed-safe text", () => {
    expect(redactFinancialData("secret amount $1,200")).toBe(
      "secret amount $1,200",
    );
    expect(redactFinancialData(500)).toBe(500);
    expect(redactFinancialData(5n)).toBe(5n);
    // This is why opaque/freeform and scalar financial endpoints must be denied.
  });
  it.each([
    new Error("secret"),
    Buffer.from("secret"),
    new Uint8Array([1]),
    new Map(),
    new Set(),
    /secret/,
    () => 1,
    Symbol("secret"),
  ])("fails closed for unsafe non-DTO input %s", (value) => {
    expectSafeFailure(() => redactFinancialData(value));
    expectSafeFailure(() => redactFinancialData({ invoice: value }));
  });
  it("rejects accessors, even under removed financial structures, without invoking them", () => {
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    const dto = {};
    Object.defineProperty(dto, "amount", { get: getter, enumerable: true });
    expectSafeFailure(() => redactFinancialData(dto));
    expectSafeFailure(() => redactFinancialData({ invoice: dto }));
    const array = [1];
    Object.defineProperty(array, "0", { get: getter, enumerable: true });
    expectSafeFailure(() => redactFinancialData(array));
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects proxies, including revoked proxies, without invoking their traps", () => {
    const trap = vi.fn(() => {
      throw new Error("secret");
    });
    const proxy = new Proxy(
      {},
      {
        get: trap,
        ownKeys: trap,
        getPrototypeOf: trap,
        getOwnPropertyDescriptor: trap,
      },
    );
    expectSafeFailure(() => redactFinancialData({ invoice: proxy }));
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expectSafeFailure(() => redactFinancialData(revoked.proxy));
    expect(trap).not.toHaveBeenCalled();
  });
  it("rejects exotic prototypes, hidden properties, symbols and prototype pollution keys", () => {
    const inherited = Object.create({ amount: "secret" });
    inherited.id = 1;
    const hidden = {};
    Object.defineProperty(hidden, "amount", { value: "secret" });
    for (const value of [
      inherited,
      hidden,
      { [Symbol("secret")]: 1 },
      JSON.parse('{"__proto__":{"amount":"secret"}}'),
      { constructor: "secret" },
      { prototype: "secret" },
      Object.assign([], { amount: 1 }),
    ]) {
      expectSafeFailure(() => redactFinancialData(value));
    }
    expect(({} as { amount?: unknown }).amount).toBeUndefined();
  });
  it("rejects decorated/invalid dates, without invoking overridden getTime", () => {
    const date = new Date();
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    Object.defineProperty(date, "getTime", { get: getter });
    expectSafeFailure(() => redactFinancialData(date));
    expectSafeFailure(() => redactFinancialData(new Date(NaN)));
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects cycles, including inside removed money keys, but permits shared acyclic references", () => {
    const cycle: Record<string, unknown> = {};
    cycle.invoice = cycle;
    expectSafeFailure(() => redactFinancialData(cycle));
    const array: unknown[] = [];
    array.push(array);
    expectSafeFailure(() => redactFinancialData(array));
    const shared = { birds: 2, amount: 5 };
    expect(redactFinancialData({ a: shared, b: shared })).toEqual({
      a: { birds: 2 },
      b: { birds: 2 },
    });
  });
  it("enforces the exact depth boundary for retained and dropped payloads", () => {
    const nest = (depth: number) => {
      let value: unknown = "leaf";
      for (let i = 0; i < depth; i++) value = { child: value };
      return value;
    };
    expect(() => redactFinancialData(nest(20))).not.toThrow();
    expectSafeFailure(() => redactFinancialData(nest(21)));
    expectSafeFailure(() =>
      redactFinancialData({ financialSummary: nest(20) }),
    );
  });
  it("bounds dense and sparse arrays and wide objects at 100,000 visited slots/nodes", () => {
    expectSafeFailure(() =>
      redactFinancialData(new Array(FINANCIAL_DATA_REDACTION_LIMITS.maxNodes)),
    );
    expectSafeFailure(() => redactFinancialData(new Array(2 ** 32 - 1)));
    expectSafeFailure(() =>
      redactFinancialData(Array.from({ length: 60_000 }, () => ({ id: 1 }))),
    );
    expectSafeFailure(() =>
      redactFinancialData(
        Object.fromEntries(
          Array.from({ length: 100_000 }, (_, i) => [`field_${i}`, 1]),
        ),
      ),
    );
    expect(redactFinancialData(new Array(99_999))).toHaveLength(99_999);
  });
  it("allows parent integration to replace only OK result data while retaining envelope shape", async () => {
    const response = {
      ok: true,
      data: { birds: 8, price: 5 },
      marker: "retained",
    };
    const filtered = {
      ...response,
      data: await boundaryFor().filterOperational(7, response.data),
    };
    expect(filtered).toEqual({
      ok: true,
      data: { birds: 8 },
      marker: "retained",
    });
    expect(response.data.price).toBe(5);
  });
});
