/** PREPARATION ONLY. Not imported by any live route, middleware, UI or database. */
export const PERMISSION_ROLES = [
  "admin", "farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator",
] as const;
export type PermissionRole = (typeof PERMISSION_ROLES)[number];
export const ORDINARY_ACTIONS = ["View", "Create", "Edit", "Delete", "Export"] as const;
export type OrdinaryAction = (typeof ORDINARY_ACTIONS)[number];

/** Principal validity is supplied by a future trusted server adapter, not client input. */
export interface PermissionPrincipal {
  authenticated: boolean;
  active: boolean;
  role: string;
}

export type CapabilitySupport = "implemented" | "not_implemented" | "review_required" | "outside_scope";
export type PolicyControl = "editable_ordinary" | "fixed_sensitive" | "fixed_system";
export interface RoleBaseline {
  /** null means unresolved; it must never be presented as a saved Deny. */
  allowed: boolean | null;
  evidence: string[];
}
export interface PermissionCapability {
  key: string;
  module: string;
  resource: string;
  action: OrdinaryAction | "Sensitive";
  support: CapabilitySupport;
  control: PolicyControl;
  baseline: Record<PermissionRole, RoleBaseline>;
  /** Ordinary Delete delegation requires an explicit supported resource mapping. */
  ordinaryDeleteDelegation: boolean;
  /** Role grant does not satisfy ownership, period, stock or other business guards. */
  residualGuards: string[];
  notes: string[];
  endpointRefs: string[];
  consumerRefs: string[];
}

/** In-memory draft only. No save/persistence mechanism exists in Module 1. */
export interface PermissionPolicy {
  catalogueRevision: string;
  role: Exclude<PermissionRole, "admin">;
  grants: Record<string, boolean>;
}
export interface PermissionCatalogue {
  revision: string;
  capabilities: PermissionCapability[];
}
export type PermissionDecisionStatus = "allow" | "deny" | "review_required" | "not_implemented" | "outside_scope";
export interface PermissionDecision {
  status: PermissionDecisionStatus;
  reason: string;
  capabilityKey: string;
  /** true only means the role gate passes; original residual guards still apply. */
  roleGatePassed: boolean;
  residualGuards: string[];
}
export interface PolicyValidation {
  valid: boolean;
  errors: string[];
}
