/** Frontend-only scoped protocol. No authentication, transport, persistence or clock. */
import type { BusinessScope } from "./business-permission-definitions";
import type { PermissionCatalogue } from "./role-permission-types";
import {
  SUPPLIER_EDITOR_ROLES,
  SUPPLIER_EDITOR_ROLE_LABELS,
} from "./supplier-permission-editor-contract";
import type {
  SupplierEditorRole,
  SupplierEditorErrorCode,
} from "./supplier-permission-editor-contract";
export const BUSINESS_EDITOR_ROLES = SUPPLIER_EDITOR_ROLES;
export const BUSINESS_EDITOR_ROLE_LABELS = SUPPLIER_EDITOR_ROLE_LABELS;
export type BusinessEditorRole = SupplierEditorRole;
export type BusinessEditorErrorCode = SupplierEditorErrorCode;
export type BusinessEditorAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export";
export type BusinessEditorChoice = "default" | "allow" | "block";
export type BusinessGrants = Readonly<Record<string, boolean>>;
/** Trusted static definition only; never supplied by a load/save response. */
export interface BusinessEditorDefinition {
  readonly scope: string;
  readonly label: string;
  readonly catalogue: PermissionCatalogue;
  readonly actions: Readonly<Record<BusinessEditorAction, readonly string[]>>;
  readonly notes: readonly string[];
  /** Nondelegable source rule, independent of editable grants. */
  readonly financialRestrictedRoles?: readonly string[];
}
export interface BusinessEditorSnapshot {
  readonly role: BusinessEditorRole;
  readonly scope: BusinessScope;
  readonly catalogueRevision: string;
  readonly version: number;
  readonly grants: BusinessGrants;
  readonly defaults: Readonly<Record<string, boolean>>;
  readonly effective: Readonly<Record<string, boolean>>;
  readonly protectedAdmin: boolean;
}
/** Scope is closed over by the trusted adapter, never selected in a save request. */
export interface BusinessPolicySaveRequest {
  readonly role: Exclude<BusinessEditorRole, "admin">;
  readonly catalogueRevision: string;
  readonly expectedVersion: number;
  readonly grants: BusinessGrants;
  readonly reason: string;
}
export type BusinessEditorLoadResult =
  | { readonly ok: true; readonly snapshot: BusinessEditorSnapshot }
  | { readonly ok: false; readonly code: BusinessEditorErrorCode };
export type BusinessEditorSaveResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly snapshot: BusinessEditorSnapshot;
    }
  | { readonly ok: false; readonly code: BusinessEditorErrorCode };
export interface BusinessEditorClient {
  load(role: BusinessEditorRole): Promise<BusinessEditorLoadResult>;
  save(request: BusinessPolicySaveRequest): Promise<BusinessEditorSaveResult>;
}
export type BusinessEditorClients = Record<BusinessScope, BusinessEditorClient>;
export interface BusinessEditorPendingChange {
  readonly action: BusinessEditorAction;
  readonly before: string;
  readonly after: string;
  readonly keys: readonly string[];
}
export type { BusinessScope };
