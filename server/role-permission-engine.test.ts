/**
 * PREPARATION ONLY: isolated tests of the pure role gate, NOT live integration.
 * No router, application catalogue, database, environment or network imports.
 * Every capability below is synthetic; this is not evidence of live access.
 */
import { describe, expect, it, vi } from "vitest";
import {
  evaluatePermission,
  validateCatalogue,
  validatePolicy,
} from "../shared/role-permission-engine";
import {
  ORDINARY_ACTIONS,
  PERMISSION_ROLES,
} from "../shared/role-permission-types";
import type {
  PermissionCapability,
  PermissionCatalogue,
  PermissionDecision,
  PermissionDecisionStatus,
  PermissionPolicy,
  PermissionPrincipal,
  PermissionRole,
  PolicyValidation,
} from "../shared/role-permission-types";

type NonAdminRole = Exclude<PermissionRole, "admin">;
const ROLES = [
  "admin",
  "farm_manager",
  "accountant",
  "sales_staff",
  "production_worker",
  "chicken_house_operator",
] as const;
const NON_ADMIN_ROLES = [
  "farm_manager",
  "accountant",
  "sales_staff",
  "production_worker",
  "chicken_house_operator",
] as const;
const REVISION = "synthetic-test-r1";
const VIEW = "synthetic.records.view";
const CREATE = "synthetic.records.create";
const EDIT = "synthetic.records.edit";
const DELETE = "synthetic.records.delete";
const EXPORT = "synthetic.records.export";
const NONDELEGATABLE_DELETE = "synthetic.archives.delete";
const SENSITIVE = "synthetic.accounts.change-role";
const SYSTEM = "synthetic.system.reset";
const UNIMPLEMENTED = "synthetic.future.export";
const REVIEW = "synthetic.unmapped.edit";
const OUTSIDE = "synthetic.composite.view";
const UNRESOLVED = "synthetic.partial.view";
const GUARDS = [
  "ownership check",
  "open accounting period",
  "stock availability",
];

function baseline(
  values: readonly (boolean | null)[]
): PermissionCapability["baseline"] {
  return Object.fromEntries(
    ROLES.map((role, i) => [
      role,
      {
        allowed: values[i],
        evidence: [`synthetic evidence: ${role}`],
      },
    ])
  ) as PermissionCapability["baseline"];
}

function capability(
  key: string,
  action: PermissionCapability["action"],
  values: readonly (boolean | null)[],
  options: Partial<PermissionCapability> = {}
): PermissionCapability {
  return {
    key,
    module: "synthetic",
    resource: "records",
    action,
    support: "implemented",
    control: "editable_ordinary",
    baseline: baseline(values),
    ordinaryDeleteDelegation: false,
    residualGuards: [...GUARDS],
    notes: ["Synthetic fixture only; no live endpoint is represented."],
    endpointRefs: [],
    consumerRefs: [],
    ...options,
  };
}

function catalogue(): PermissionCatalogue {
  return {
    revision: REVISION,
    capabilities: [
      capability(VIEW, "View", [true, true, true, true, true, true]),
      capability(CREATE, "Create", [true, true, false, false, true, false]),
      capability(EDIT, "Edit", [true, true, false, false, false, false]),
      capability(DELETE, "Delete", [true, false, false, false, false, false], {
        ordinaryDeleteDelegation: true,
      }),
      capability(EXPORT, "Export", [true, true, true, true, false, false]),
      capability(
        NONDELEGATABLE_DELETE,
        "Delete",
        [true, false, false, false, false, false],
        {
          resource: "archives",
        }
      ),
      capability(
        SENSITIVE,
        "Sensitive",
        [true, false, false, false, false, false],
        {
          resource: "accounts",
          control: "fixed_sensitive",
        }
      ),
      capability(
        SYSTEM,
        "Sensitive",
        [true, false, false, false, false, false],
        {
          resource: "system",
          control: "fixed_system",
        }
      ),
      capability(
        UNIMPLEMENTED,
        "Export",
        [false, false, false, false, false, false],
        {
          resource: "future",
          support: "not_implemented",
        }
      ),
      capability(REVIEW, "Edit", [null, null, null, null, null, null], {
        resource: "unmapped",
        support: "review_required",
      }),
      capability(OUTSIDE, "View", [false, false, false, false, false, false], {
        resource: "composite",
        support: "outside_scope",
      }),
      capability(UNRESOLVED, "View", [true, null, false, false, false, false], {
        resource: "partial",
      }),
    ],
  };
}

function principal(role: PermissionRole = "farm_manager"): PermissionPrincipal {
  return { authenticated: true, active: true, role };
}

function draft(
  role: NonAdminRole = "farm_manager",
  grants: Record<string, boolean> = {}
): PermissionPolicy {
  return { catalogueRevision: REVISION, role, grants };
}

// Cast only at the untrusted-input boundary. Deliberately invalid runtime data
// must exercise the engine's validation, rather than be sanitised by a fixture.
function checkCatalogue(value: unknown): PolicyValidation {
  return validateCatalogue(value as PermissionCatalogue);
}
function checkPolicy(cat: unknown, value: unknown): PolicyValidation {
  return validatePolicy(cat as PermissionCatalogue, value as PermissionPolicy);
}
function decide(
  cat: unknown,
  who: unknown,
  key: unknown,
  policy?: unknown
): PermissionDecision {
  return evaluatePermission(
    cat as PermissionCatalogue,
    who as PermissionPrincipal,
    key as string,
    policy as PermissionPolicy | undefined
  );
}
function expectValid(result: PolicyValidation): void {
  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
}
function expectInvalid(result: PolicyValidation): void {
  expect(result.valid).toBe(false);
  expect(Array.isArray(result.errors)).toBe(true);
  expect(result.errors.length).toBeGreaterThan(0);
  for (const error of result.errors) {
    expect(typeof error).toBe("string");
    expect(error.trim().length).toBeGreaterThan(0);
  }
}
function expectStatus(
  result: PermissionDecision,
  status: PermissionDecisionStatus,
  key: string
): void {
  expect(result.status).toBe(status);
  expect(result.roleGatePassed).toBe(status === "allow");
  expect(result.capabilityKey).toBe(key);
  expect(typeof result.reason).toBe("string");
  expect(result.reason.trim().length).toBeGreaterThan(0);
  expect(Array.isArray(result.residualGuards)).toBe(true);
}
function expectDenied(result: PermissionDecision, key = VIEW): void {
  expectStatus(result, "deny", key);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function reverseObjectOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectOrder);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseObjectOrder(child)])
    );
  }
  return value;
}

// Independent expected decisions: do NOT calculate this oracle by inspecting
// catalogue.baseline, calling the engine, or importing a live access helper.
const EXPECTED_MATRIX: ReadonlyArray<
  readonly [string, readonly PermissionDecisionStatus[]]
> = [
  [VIEW, ["allow", "allow", "allow", "allow", "allow", "allow"]],
  [CREATE, ["allow", "allow", "deny", "deny", "allow", "deny"]],
  [EDIT, ["allow", "allow", "deny", "deny", "deny", "deny"]],
  [DELETE, ["allow", "deny", "deny", "deny", "deny", "deny"]],
  [EXPORT, ["allow", "allow", "allow", "allow", "deny", "deny"]],
  [NONDELEGATABLE_DELETE, ["allow", "deny", "deny", "deny", "deny", "deny"]],
  [SENSITIVE, ["allow", "deny", "deny", "deny", "deny", "deny"]],
  [SYSTEM, ["allow", "deny", "deny", "deny", "deny", "deny"]],
  [
    UNIMPLEMENTED,
    [
      "not_implemented",
      "not_implemented",
      "not_implemented",
      "not_implemented",
      "not_implemented",
      "not_implemented",
    ],
  ],
  [
    REVIEW,
    [
      "review_required",
      "review_required",
      "review_required",
      "review_required",
      "review_required",
      "review_required",
    ],
  ],
  [
    OUTSIDE,
    [
      "outside_scope",
      "outside_scope",
      "outside_scope",
      "outside_scope",
      "outside_scope",
      "outside_scope",
    ],
  ],
  [UNRESOLVED, ["allow", "review_required", "deny", "deny", "deny", "deny"]],
];

describe("synthetic permission-engine public contract", () => {
  it("exports the specified pure functions and six ordinary role identities", () => {
    expect(typeof validateCatalogue).toBe("function");
    expect(typeof validatePolicy).toBe("function");
    expect(typeof evaluatePermission).toBe("function");
    expect(PERMISSION_ROLES).toEqual(ROLES);
    expect(ORDINARY_ACTIONS).toEqual([
      "View",
      "Create",
      "Edit",
      "Delete",
      "Export",
    ]);
    expectValid(validateCatalogue(catalogue()));
  });
});

describe("independent baseline matrix: role gate only, no live integration", () => {
  for (const [key, expected] of EXPECTED_MATRIX) {
    ROLES.forEach((role, index) => {
      it(`${role} / ${key} retains ${expected[index]} without a draft`, () => {
        expectStatus(
          evaluatePermission(catalogue(), principal(role), key),
          expected[index],
          key
        );
      });
    });
  }

  it("does not replace an unresolved baseline with a saved false/Deny", () => {
    const cat = catalogue();
    const before = JSON.stringify(cat);
    expectValid(validateCatalogue(cat));
    expectStatus(
      evaluatePermission(cat, principal(), UNRESOLVED),
      "review_required",
      UNRESOLVED
    );
    expect(
      cat.capabilities.find(item => item.key === UNRESOLVED)?.baseline
        .farm_manager.allowed
    ).toBeNull();
    expect(JSON.stringify(cat)).toBe(before);
  });

  it("honours an explicit Admin deny instead of manufacturing universal Admin allow", () => {
    const cat = catalogue();
    cat.capabilities.find(item => item.key === EXPORT)!.baseline.admin.allowed =
      false;
    expectValid(validateCatalogue(cat));
    expectDenied(evaluatePermission(cat, principal("admin"), EXPORT), EXPORT);
    expectDenied(
      evaluatePermission(
        cat,
        principal("admin"),
        EXPORT,
        draft("production_worker", { [EXPORT]: true })
      ),
      EXPORT
    );
  });
});

describe("optional sparse non-Admin drafts", () => {
  for (const role of NON_ADMIN_ROLES) {
    it(`${role}: an empty sparse draft preserves every baseline`, () => {
      const cat = catalogue();
      const policy = draft(role);
      expectValid(validatePolicy(cat, policy));
      for (const [key, statuses] of EXPECTED_MATRIX) {
        expectStatus(
          evaluatePermission(cat, principal(role), key, policy),
          statuses[ROLES.indexOf(role)],
          key
        );
      }
    });

    for (const key of [VIEW, CREATE, EDIT, DELETE, EXPORT]) {
      for (const grant of [true, false]) {
        it(`${role}: explicit ${key}=${grant} overrides only that role and capability`, () => {
          const cat = catalogue();
          const policy = draft(role, { [key]: grant });
          expectValid(validatePolicy(cat, policy));
          expectStatus(
            evaluatePermission(cat, principal(role), key, policy),
            grant ? "allow" : "deny",
            key
          );
          for (const [otherKey, statuses] of EXPECTED_MATRIX) {
            if (otherKey !== key) {
              expectStatus(
                evaluatePermission(cat, principal(role), otherKey, policy),
                statuses[ROLES.indexOf(role)],
                otherKey
              );
            }
          }
          // Drafts for non-Admin roles cannot change the Admin reference.
          for (const [adminKey, statuses] of EXPECTED_MATRIX) {
            expectStatus(
              evaluatePermission(cat, principal("admin"), adminKey, policy),
              statuses[0],
              adminKey
            );
          }
        });
      }
    }
  }

  it("accepts several sparse entries without requiring a complete matrix", () => {
    const policy = draft("sales_staff", {
      [VIEW]: false,
      [CREATE]: true,
      [DELETE]: true,
    });
    const cat = catalogue();
    expectValid(validatePolicy(cat, policy));
    expectDenied(
      evaluatePermission(cat, principal("sales_staff"), VIEW, policy)
    );
    expectStatus(
      evaluatePermission(cat, principal("sales_staff"), CREATE, policy),
      "allow",
      CREATE
    );
    expectStatus(
      evaluatePermission(cat, principal("sales_staff"), DELETE, policy),
      "allow",
      DELETE
    );
    expectStatus(
      evaluatePermission(cat, principal("sales_staff"), EXPORT, policy),
      "allow",
      EXPORT
    );
    expectDenied(
      evaluatePermission(cat, principal("sales_staff"), EDIT, policy),
      EDIT
    );
  });

  it("explicitly delegates supported ordinary Admin-only Delete, not generic Edit", () => {
    const cat = catalogue();
    const editOnly = draft("accountant", { [EDIT]: true });
    expectValid(validatePolicy(cat, editOnly));
    expectDenied(
      evaluatePermission(cat, principal("accountant"), DELETE, editOnly),
      DELETE
    );
    const deleteDraft = draft("accountant", { [DELETE]: true });
    expectValid(validatePolicy(cat, deleteDraft));
    expectStatus(
      evaluatePermission(cat, principal("accountant"), DELETE, deleteDraft),
      "allow",
      DELETE
    );
  });

  it("does not infer Create, Edit or Export from View", () => {
    const cat = catalogue();
    const policy = draft("chicken_house_operator", { [VIEW]: true });
    expectValid(validatePolicy(cat, policy));
    expectStatus(
      evaluatePermission(
        cat,
        principal("chicken_house_operator"),
        VIEW,
        policy
      ),
      "allow",
      VIEW
    );
    for (const key of [CREATE, EDIT, EXPORT, DELETE, SENSITIVE, SYSTEM]) {
      expectDenied(
        evaluatePermission(
          cat,
          principal("chicken_house_operator"),
          key,
          policy
        ),
        key
      );
    }
  });

  it("a denied View does not silently revoke separately granted Edit or Export", () => {
    const cat = catalogue();
    const policy = draft("farm_manager", { [VIEW]: false });
    expectDenied(evaluatePermission(cat, principal(), VIEW, policy));
    expectStatus(
      evaluatePermission(cat, principal(), EDIT, policy),
      "allow",
      EDIT
    );
    expectStatus(
      evaluatePermission(cat, principal(), EXPORT, policy),
      "allow",
      EXPORT
    );
  });

  it("an allowed role gate retains all residual business-guard caveats", () => {
    const cat = catalogue();
    const policy = draft("accountant", { [DELETE]: true });
    const result = evaluatePermission(
      cat,
      principal("accountant"),
      DELETE,
      policy
    );
    expectStatus(result, "allow", DELETE);
    expect(result.residualGuards).toEqual(GUARDS);
    expect(result.residualGuards).not.toBe(
      cat.capabilities.find(item => item.key === DELETE)!.residualGuards
    );
  });
});

describe("fixed and unsupported capabilities cannot be edited or inferred", () => {
  for (const key of [
    NONDELEGATABLE_DELETE,
    SENSITIVE,
    SYSTEM,
    UNIMPLEMENTED,
    REVIEW,
    OUTSIDE,
  ]) {
    for (const grant of [true, false]) {
      it(`rejects a draft edit to ${key}=${grant}`, () => {
        const cat = catalogue();
        const policy = draft("production_worker", { [key]: grant });
        expectInvalid(validatePolicy(cat, policy));
        expectDenied(
          evaluatePermission(cat, principal("production_worker"), key, policy),
          key
        );
      });
    }
  }
  for (const role of NON_ADMIN_ROLES) {
    it(`${role}: generic Edit cannot grant fixed sensitive/system actions`, () => {
      const cat = catalogue();
      const policy = draft(role, { [EDIT]: true });
      expectValid(validatePolicy(cat, policy));
      expectStatus(
        evaluatePermission(cat, principal(role), EDIT, policy),
        "allow",
        EDIT
      );
      expectDenied(
        evaluatePermission(cat, principal(role), SENSITIVE, policy),
        SENSITIVE
      );
      expectDenied(
        evaluatePermission(cat, principal(role), SYSTEM, policy),
        SYSTEM
      );
    });
  }

  it("an unknown capability has a distinct explanatory fail-closed decision", () => {
    const key = "synthetic.missing.create";
    const result = evaluatePermission(catalogue(), principal("admin"), key);
    // The type contract does not prescribe which fail-closed status represents
    // an absent key; neither a baseline deny nor missing support may allow it.
    expect(["deny", "not_implemented"]).toContain(result.status);
    expect(result.roleGatePassed).toBe(false);
    expect(result.capabilityKey).toBe(key);
    expect(result.reason.trim().length).toBeGreaterThan(0);
  });
});

describe("invalid principals always fail closed", () => {
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ["absent", undefined],
    ["null", null],
    ["string", "admin"],
    ["array", []],
    ["empty object", {}],
    ["unauthenticated", { authenticated: false, active: true, role: "admin" }],
    ["inactive", { authenticated: true, active: false, role: "admin" }],
    ["unknown role", { authenticated: true, active: true, role: "owner" }],
    [
      "case-mismatched role",
      { authenticated: true, active: true, role: "Admin" },
    ],
    ["whitespace role", { authenticated: true, active: true, role: " admin " }],
    ["non-string role", { authenticated: true, active: true, role: 1 }],
    [
      "truthy authenticated",
      { authenticated: "true", active: true, role: "admin" },
    ],
    ["truthy active", { authenticated: true, active: 1, role: "admin" }],
    ["missing authenticated", { active: true, role: "admin" }],
    ["missing active", { authenticated: true, role: "admin" }],
    [
      "prototype role",
      { authenticated: true, active: true, role: "__proto__" },
    ],
    [
      "constructor role",
      { authenticated: true, active: true, role: "constructor" },
    ],
    [
      "inherited principal",
      Object.create({ authenticated: true, active: true, role: "admin" }),
    ],
  ];
  for (const [label, who] of cases) {
    it(label, () => {
      const cat = catalogue();
      for (const key of [
        VIEW,
        UNIMPLEMENTED,
        REVIEW,
        OUTSIDE,
        "synthetic.missing.view",
      ]) {
        expectDenied(decide(cat, who, key), key);
      }
    });
  }
});

describe("malformed, stale or mismatched drafts fail closed", () => {
  const cases: ReadonlyArray<readonly [string, () => unknown]> = [
    ["null", () => null],
    ["array", () => []],
    ["boolean", () => true],
    ["string", () => "draft"],
    ["empty", () => ({})],
    ["missing revision", () => ({ role: "farm_manager", grants: {} })],
    [
      "stale revision",
      () => ({ ...draft(), catalogueRevision: "synthetic-test-r0" }),
    ],
    ["non-string revision", () => ({ ...draft(), catalogueRevision: 1 })],
    ["missing role", () => ({ catalogueRevision: REVISION, grants: {} })],
    ["Admin policy", () => ({ ...draft(), role: "admin" })],
    ["unknown role", () => ({ ...draft(), role: "owner" })],
    [
      "role array / duplicate roles",
      () => ({ ...draft(), role: ["farm_manager", "farm_manager"] }),
    ],
    [
      "missing grants",
      () => ({ catalogueRevision: REVISION, role: "farm_manager" }),
    ],
    ["null grants", () => ({ ...draft(), grants: null })],
    [
      "array grants / duplicate keys",
      () => ({
        ...draft(),
        grants: [
          [VIEW, true],
          [VIEW, false],
        ],
      }),
    ],
    [
      "unknown capability",
      () => ({ ...draft(), grants: { "synthetic.unknown.view": true } }),
    ],
    [
      "action is not a capability key",
      () => ({ ...draft(), grants: { Edit: true } }),
    ],
    ["empty key", () => ({ ...draft(), grants: { "": true } })],
    [
      "case-mismatched key",
      () => ({ ...draft(), grants: { "Synthetic.records.view": true } }),
    ],
    ["string boolean", () => ({ ...draft(), grants: { [VIEW]: "true" } })],
    ["numeric boolean", () => ({ ...draft(), grants: { [VIEW]: 1 } })],
    ["null grant", () => ({ ...draft(), grants: { [VIEW]: null } })],
    ["undefined grant", () => ({ ...draft(), grants: { [VIEW]: undefined } })],
    [
      "boxed boolean",
      () => ({ ...draft(), grants: { [VIEW]: new Boolean(true) } }),
    ],
    [
      "object grant",
      () => ({ ...draft(), grants: { [VIEW]: { allowed: true } } }),
    ],
    ["inherited policy", () => Object.create(draft())],
    [
      "inherited grants",
      () => ({ ...draft(), grants: Object.create({ [VIEW]: true }) }),
    ],
    [
      "prototype key",
      () => ({ ...draft(), grants: JSON.parse('{"__proto__":true}') }),
    ],
    ["constructor key", () => ({ ...draft(), grants: { constructor: true } })],
    [
      "prototype key named prototype",
      () => ({ ...draft(), grants: { prototype: true } }),
    ],
  ];
  for (const [label, make] of cases) {
    it(label, () => {
      const cat = catalogue();
      const policy = make();
      expectInvalid(checkPolicy(cat, policy));
      // Even an unrelated baseline allow cannot bypass an invalid supplied draft.
      expectDenied(decide(cat, principal(), VIEW, policy));
    });
  }

  for (const role of NON_ADMIN_ROLES) {
    it(`${role}: a valid draft for a different non-Admin role cannot leak grants`, () => {
      const cat = catalogue();
      const otherRole = role === "farm_manager" ? "accountant" : "farm_manager";
      const policy = draft(otherRole, { [DELETE]: true });
      expectValid(validatePolicy(cat, policy));
      expectDenied(
        evaluatePermission(cat, principal(role), DELETE, policy),
        DELETE
      );
      expectDenied(evaluatePermission(cat, principal(role), VIEW, policy));
    });
  }

  it("one invalid entry poisons the draft rather than partially applying valid grants", () => {
    const cat = catalogue();
    const policy = draft("accountant", { [DELETE]: true, [SENSITIVE]: true });
    expectInvalid(validatePolicy(cat, policy));
    expectDenied(
      evaluatePermission(cat, principal("accountant"), DELETE, policy),
      DELETE
    );
  });
});

describe("catalogue validation rejects malformed capability and baseline data", () => {
  const cases: ReadonlyArray<
    readonly [string, (cat: PermissionCatalogue) => unknown]
  > = [
    ["null catalogue", () => null],
    ["array catalogue", () => []],
    ["empty catalogue", () => ({})],
    ["empty revision", cat => ({ ...cat, revision: "" })],
    ["non-string revision", cat => ({ ...cat, revision: 1 })],
    ["missing capabilities", cat => ({ revision: cat.revision })],
    ["non-array capabilities", cat => ({ ...cat, capabilities: {} })],
    [
      "null capability",
      cat => ({ ...cat, capabilities: [null, ...cat.capabilities] }),
    ],
    [
      "duplicate capability key",
      cat => ({
        ...cat,
        capabilities: [...cat.capabilities, { ...cat.capabilities[0] }],
      }),
    ],
    [
      "missing key",
      cat => {
        delete (cat.capabilities[0] as Partial<PermissionCapability>).key;
        return cat;
      },
    ],
    [
      "empty key",
      cat => {
        cat.capabilities[0].key = "";
        return cat;
      },
    ],
    [
      "unknown action",
      cat => {
        Object.assign(cat.capabilities[0], { action: "Publish" });
        return cat;
      },
    ],
    [
      "unknown support",
      cat => {
        Object.assign(cat.capabilities[0], { support: "supported" });
        return cat;
      },
    ],
    [
      "unknown control",
      cat => {
        Object.assign(cat.capabilities[0], { control: "editable_system" });
        return cat;
      },
    ],
    [
      "nonboolean delegation",
      cat => {
        Object.assign(cat.capabilities[0], {
          ordinaryDeleteDelegation: "true",
        });
        return cat;
      },
    ],
    [
      "missing baseline role",
      cat => {
        delete (
          cat.capabilities[0].baseline as Partial<
            PermissionCapability["baseline"]
          >
        ).accountant;
        return cat;
      },
    ],
    [
      "unknown baseline role",
      cat => {
        Object.assign(cat.capabilities[0].baseline, {
          owner: { allowed: true, evidence: [] },
        });
        return cat;
      },
    ],
    [
      "duplicated baseline role represented as array",
      cat => {
        Object.assign(cat.capabilities[0], {
          baseline: [
            ["admin", true],
            ["admin", false],
          ],
        });
        return cat;
      },
    ],
    [
      "nonboolean baseline",
      cat => {
        Object.assign(cat.capabilities[0].baseline.admin, { allowed: "true" });
        return cat;
      },
    ],
    [
      "numeric baseline",
      cat => {
        Object.assign(cat.capabilities[0].baseline.admin, { allowed: 1 });
        return cat;
      },
    ],
    [
      "missing allowed",
      cat => {
        delete (
          cat.capabilities[0].baseline.admin as Partial<
            PermissionCapability["baseline"]["admin"]
          >
        ).allowed;
        return cat;
      },
    ],
    [
      "null role baseline",
      cat => {
        Object.assign(cat.capabilities[0].baseline, { admin: null });
        return cat;
      },
    ],
    [
      "non-array evidence",
      cat => {
        Object.assign(cat.capabilities[0].baseline.admin, {
          evidence: "source",
        });
        return cat;
      },
    ],
    [
      "non-string evidence item",
      cat => {
        Object.assign(cat.capabilities[0].baseline.admin, { evidence: [1] });
        return cat;
      },
    ],
    [
      "non-array residual guards",
      cat => {
        Object.assign(cat.capabilities[0], { residualGuards: "ownership" });
        return cat;
      },
    ],
    [
      "non-string guard item",
      cat => {
        Object.assign(cat.capabilities[0], { residualGuards: [true] });
        return cat;
      },
    ],
    [
      "non-array endpoint references",
      cat => {
        Object.assign(cat.capabilities[0], { endpointRefs: {} });
        return cat;
      },
    ],
    [
      "non-string consumer reference",
      cat => {
        Object.assign(cat.capabilities[0], { consumerRefs: [null] });
        return cat;
      },
    ],
    [
      "non-array notes",
      cat => {
        Object.assign(cat.capabilities[0], { notes: false });
        return cat;
      },
    ],
    ["inherited catalogue", cat => Object.create(cat)],
    [
      "inherited capability",
      cat => {
        cat.capabilities[0] = Object.create(cat.capabilities[0]);
        return cat;
      },
    ],
    [
      "inherited baseline",
      cat => {
        cat.capabilities[0].baseline = Object.create(
          cat.capabilities[0].baseline
        );
        return cat;
      },
    ],
    [
      "inherited role baseline",
      cat => {
        cat.capabilities[0].baseline.admin = Object.create(
          cat.capabilities[0].baseline.admin
        );
        return cat;
      },
    ],
    [
      "prototype capability key",
      cat => {
        cat.capabilities[0].key = "__proto__";
        return cat;
      },
    ],
    [
      "constructor capability key",
      cat => {
        cat.capabilities[0].key = "constructor";
        return cat;
      },
    ],
    [
      "prototype baseline role",
      cat => {
        Object.defineProperty(cat.capabilities[0].baseline, "__proto__", {
          value: { allowed: true, evidence: [] },
          enumerable: true,
        });
        return cat;
      },
    ],
  ];
  for (const [label, corrupt] of cases) {
    it(label, () => {
      const cat = corrupt(catalogue());
      expectInvalid(checkCatalogue(cat));
      expectInvalid(checkPolicy(cat, draft()));
      expectDenied(decide(cat, principal("admin"), VIEW));
      expectDenied(decide(cat, principal(), VIEW, draft()));
    });
  }
});

describe("prototype and getter pollution are rejected without invoking accessors", () => {
  function accessor(target: object, key: string, value: unknown) {
    const getter = vi.fn(() => value);
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get: getter,
    });
    return getter;
  }

  const catalogueGetterCases: ReadonlyArray<
    readonly [string, (cat: PermissionCatalogue) => ReturnType<typeof vi.fn>]
  > = [
    ["revision", cat => accessor(cat, "revision", REVISION)],
    ["capabilities", cat => accessor(cat, "capabilities", cat.capabilities)],
    [
      "capability array index",
      cat => accessor(cat.capabilities, "0", cat.capabilities[0]),
    ],
    ["capability key", cat => accessor(cat.capabilities[0], "key", VIEW)],
    [
      "capability support",
      cat => accessor(cat.capabilities[0], "support", "implemented"),
    ],
    [
      "baseline",
      cat =>
        accessor(cat.capabilities[0], "baseline", cat.capabilities[0].baseline),
    ],
    [
      "role baseline",
      cat =>
        accessor(
          cat.capabilities[0].baseline,
          "admin",
          cat.capabilities[0].baseline.admin
        ),
    ],
    [
      "allowed",
      cat => accessor(cat.capabilities[0].baseline.admin, "allowed", true),
    ],
    [
      "evidence array index",
      cat =>
        accessor(cat.capabilities[0].baseline.admin.evidence, "0", "source"),
    ],
    [
      "guard array index",
      cat => accessor(cat.capabilities[0].residualGuards, "0", "ownership"),
    ],
  ];
  for (const [label, inject] of catalogueGetterCases) {
    it(`catalogue ${label}`, () => {
      const cat = catalogue();
      const getter = inject(cat);
      expectInvalid(validateCatalogue(cat));
      expectInvalid(validatePolicy(cat, draft()));
      expectDenied(evaluatePermission(cat, principal("admin"), VIEW));
      expect(getter).not.toHaveBeenCalled();
    });
  }

  for (const key of ["catalogueRevision", "role", "grants"]) {
    it(`policy ${key} getter`, () => {
      const cat = catalogue();
      const policy = draft();
      const getter = accessor(
        policy,
        key,
        policy[key as keyof PermissionPolicy]
      );
      expectInvalid(validatePolicy(cat, policy));
      expectDenied(evaluatePermission(cat, principal(), VIEW, policy));
      expect(getter).not.toHaveBeenCalled();
    });
  }

  it("grant getter", () => {
    const cat = catalogue();
    const policy = draft();
    const getter = accessor(policy.grants, VIEW, true);
    expectInvalid(validatePolicy(cat, policy));
    expectDenied(evaluatePermission(cat, principal(), VIEW, policy));
    expect(getter).not.toHaveBeenCalled();
  });

  for (const key of ["authenticated", "active", "role"] as const) {
    it(`principal ${key} getter`, () => {
      const who = principal("admin");
      const getter = accessor(who, key, who[key]);
      expectDenied(evaluatePermission(catalogue(), who, VIEW));
      expect(getter).not.toHaveBeenCalled();
    });
  }

  it("does not accept inherited grants alongside own entries", () => {
    const cat = catalogue();
    const grants = Object.assign(Object.create({ [SENSITIVE]: true }), {
      [DELETE]: true,
    });
    const policy = draft("accountant", grants);
    expectInvalid(validatePolicy(cat, policy));
    expectDenied(
      evaluatePermission(cat, principal("accountant"), DELETE, policy),
      DELETE
    );
  });

  it("reserved key lookups cannot resolve Object.prototype members", () => {
    const cat = catalogue();
    for (const key of [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "hasOwnProperty",
    ]) {
      const result = evaluatePermission(cat, principal("admin"), key);
      expect(["deny", "not_implemented"]).toContain(result.status);
      expect(result.roleGatePassed).toBe(false);
      expect(result.capabilityKey).toBe(key);
    }
    expect(Object.prototype).not.toHaveProperty(VIEW);
    expect(Object.prototype).not.toHaveProperty(DELETE);
  });
});

describe("input immutability and object-order independence", () => {
  it("validators and evaluations accept deeply frozen inputs without changing them", () => {
    const cat = deepFreeze(catalogue());
    const who = deepFreeze(principal("accountant"));
    const policy = deepFreeze(
      draft("accountant", { [DELETE]: true, [VIEW]: false })
    );
    const snapshot = JSON.stringify({ cat, who, policy });
    expectValid(validateCatalogue(cat));
    expectValid(validatePolicy(cat, policy));
    for (const [key] of EXPECTED_MATRIX) {
      evaluatePermission(cat, who, key);
      evaluatePermission(cat, who, key, policy);
      evaluatePermission(cat, principal("admin"), key, policy);
    }
    expect(JSON.stringify({ cat, who, policy })).toBe(snapshot);
  });

  it("invalid draft validation/evaluation does not mutate otherwise valid inputs", () => {
    const cat = deepFreeze(catalogue());
    const who = deepFreeze(principal());
    const policy = deepFreeze({
      ...draft(),
      catalogueRevision: "stale",
      grants: { [VIEW]: "true" },
    });
    const snapshot = JSON.stringify({ cat, who, policy });
    expectInvalid(checkPolicy(cat, policy));
    expectDenied(decide(cat, who, VIEW, policy));
    expect(JSON.stringify({ cat, who, policy })).toBe(snapshot);
  });

  it("editing a returned guard array cannot edit the catalogue or future decisions", () => {
    const cat = catalogue();
    const who = principal("accountant");
    const policy = draft("accountant", { [DELETE]: true });
    const result = evaluatePermission(cat, who, DELETE, policy);
    result.residualGuards.push("caller-injected guard");
    expect(
      cat.capabilities.find(item => item.key === DELETE)!.residualGuards
    ).toEqual(GUARDS);
    expect(evaluatePermission(cat, who, DELETE, policy).residualGuards).toEqual(
      GUARDS
    );
  });

  it("catalogue capability order and all object insertion orders are irrelevant", () => {
    const cat = catalogue();
    const reordered = reverseObjectOrder(cat) as PermissionCatalogue;
    reordered.capabilities.reverse();
    expectValid(validateCatalogue(reordered));
    for (const role of ROLES) {
      const who = principal(role);
      const reorderedWho = reverseObjectOrder(who) as PermissionPrincipal;
      for (const [key] of EXPECTED_MATRIX) {
        expect(evaluatePermission(reordered, reorderedWho, key)).toEqual(
          evaluatePermission(cat, who, key)
        );
      }
    }
    for (const role of NON_ADMIN_ROLES) {
      const policy = draft(role, {
        [VIEW]: false,
        [CREATE]: true,
        [DELETE]: true,
        [EXPORT]: false,
      });
      const reorderedPolicy = reverseObjectOrder(policy) as PermissionPolicy;
      expectValid(validatePolicy(reordered, reorderedPolicy));
      for (const [key] of EXPECTED_MATRIX) {
        expect(
          evaluatePermission(reordered, principal(role), key, reorderedPolicy)
        ).toEqual(evaluatePermission(cat, principal(role), key, policy));
      }
    }
  });
});

describe("additional runtime boundaries", () => {
  for (const grant of [true, false]) {
    it(`an unresolved same-role baseline cannot be saved as ${grant}`, () => {
      const cat = catalogue();
      const policy = draft("farm_manager", { [UNRESOLVED]: grant });
      expectInvalid(validatePolicy(cat, policy));
      expectDenied(
        evaluatePermission(cat, principal(), UNRESOLVED, policy),
        UNRESOLVED
      );
      expectStatus(
        evaluatePermission(cat, principal(), UNRESOLVED),
        "review_required",
        UNRESOLVED
      );
    });
  }

  it("Admin ignores malformed, stale and Admin-shaped drafts, keeping its immutable reference", () => {
    const cat = catalogue();
    const policies = [
      null,
      "malformed",
      {},
      { ...draft(), catalogueRevision: "stale", grants: { [VIEW]: false } },
      {
        ...draft(),
        role: "admin",
        grants: { [VIEW]: false, [SENSITIVE]: false },
      },
    ];
    for (const policy of policies) {
      for (const [key, statuses] of EXPECTED_MATRIX) {
        expectStatus(
          decide(cat, principal("admin"), key, policy),
          statuses[0],
          key
        );
      }
    }
  });

  it("Admin does not inspect a non-Admin draft getter at all", () => {
    const cat = catalogue();
    const policy = draft();
    const getter = vi.fn(() => {
      throw new Error("must not inspect Admin draft");
    });
    Object.defineProperty(policy, "grants", { enumerable: true, get: getter });
    for (const [key, statuses] of EXPECTED_MATRIX) {
      expectStatus(
        evaluatePermission(cat, principal("admin"), key, policy),
        statuses[0],
        key
      );
    }
    expect(getter).not.toHaveBeenCalled();
  });

  for (const [label, key] of [
    ["undefined", undefined],
    ["null", null],
    ["number", 1],
    ["object", {}],
    ["array", [VIEW]],
    ["empty string", ""],
    ["whitespace", ` ${VIEW} `],
    ["control character", `${VIEW}\u0000`],
  ] as const) {
    it(`invalid capability lookup: ${label}`, () => {
      const result = decide(catalogue(), principal("admin"), key);
      expectDenied(result, typeof key === "string" ? key : "");
    });
  }

  it("null-prototype records are safe dictionaries, not inherited grant sources", () => {
    const cat = catalogue();
    const safeCat = Object.assign(
      Object.create(null),
      cat
    ) as PermissionCatalogue;
    for (const item of safeCat.capabilities) {
      item.baseline = Object.assign(Object.create(null), item.baseline);
    }
    const policy = Object.assign(
      Object.create(null),
      draft(
        "accountant",
        Object.assign(Object.create(null), { [DELETE]: true })
      )
    );
    const who = Object.assign(Object.create(null), principal("accountant"));
    expectValid(validateCatalogue(safeCat));
    expectValid(validatePolicy(safeCat, policy));
    expectStatus(
      evaluatePermission(safeCat, who, DELETE, policy),
      "allow",
      DELETE
    );
  });

  it("throwing reflection traps return validation errors/deny rather than throwing", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile input");
        },
      }
    );
    const cat = catalogue();
    expectInvalid(checkCatalogue(hostile));
    expectInvalid(checkPolicy(cat, hostile));
    expectDenied(decide(hostile, principal("admin"), VIEW));
    expectDenied(decide(cat, hostile, VIEW));
    expectDenied(decide(cat, principal(), VIEW, hostile));
  });

  it("unknown schema fields cannot smuggle an alternate role or broad edit grant", () => {
    const cat = catalogue();
    const policy = { ...draft(), roles: ["admin"], allowAll: true };
    expectInvalid(checkPolicy(cat, policy));
    expectDenied(decide(cat, principal(), VIEW, policy));
    const who = { ...principal(), effectiveRole: "admin" };
    expectDenied(decide(cat, who, VIEW));
  });

  it("sparse capability arrays are invalid even if a present entry is valid", () => {
    const cat = catalogue();
    delete cat.capabilities[1];
    expectInvalid(validateCatalogue(cat));
    expectDenied(evaluatePermission(cat, principal("admin"), VIEW));
  });
});
