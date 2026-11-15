/** MODULE4 PREPARATION ONLY: pure protocol, no auth, storage, network or live mounts. */
import type { SupplierGrants, SupplierPersistedPolicy, SupplierPolicySaveRequest } from './supplier-permission-policy-model';
export const SUPPLIER_EDITOR_ROLES = Object.freeze([
  'farm_manager','accountant','sales_staff','production_worker','chicken_house_operator','admin',
] as const);
export type SupplierEditorRole = typeof SUPPLIER_EDITOR_ROLES[number];
export type SupplierEditorAction = 'view' | 'create' | 'edit' | 'delete';
export type SupplierEditorChoice = 'default' | 'allow' | 'block';
export const SUPPLIER_EDITOR_ACTION_KEYS = Object.freeze({
 view: Object.freeze(['suppliers.records.view.list','suppliers.records.view.getbyid'] as const),
 create: Object.freeze(['suppliers.records.create.create'] as const),
 edit: Object.freeze(['suppliers.records.edit.update'] as const),
 delete: Object.freeze(['suppliers.records.delete.delete'] as const),
});
export const SUPPLIER_EDITOR_ROLE_LABELS = Object.freeze({
 farm_manager:'Farm Manager',accountant:'Accountant',sales_staff:'Sales Staff',
 production_worker:'Production Worker',chicken_house_operator:'Chicken House Operator',admin:'Admin',
});
export interface SupplierEditorSnapshot {
 readonly role: SupplierEditorRole;
 readonly scope: 'supplier_management';
 readonly catalogueRevision: string;
 readonly version: number;
 readonly grants: SupplierGrants;
 readonly defaults: Readonly<Record<string, boolean>>;
 readonly effective: Readonly<Record<string, boolean>>;
 readonly protectedAdmin: boolean;
}
/** Fixed public errors; no raw SQL/request/driver/reason or exception text. */
export type SupplierEditorErrorCode = 'UNAUTHENTICATED' | 'INACTIVE_ACTOR' | 'ADMIN_REQUIRED'
 | 'INVALID_INPUT' | 'POLICY_UNAVAILABLE' | 'STALE_VERSION' | 'CATALOGUE_MISMATCH'
 | 'ADMIN_PROTECTED' | 'SAVE_FAILED' | 'COMMIT_OUTCOME_UNKNOWN';
export type SupplierEditorLoadResult =
 | {readonly ok:true;readonly snapshot:SupplierEditorSnapshot}
 | {readonly ok:false;readonly code:SupplierEditorErrorCode};
export type SupplierEditorSaveResult =
 | {readonly ok:true;readonly changed:boolean;readonly snapshot:SupplierEditorSnapshot}
 | {readonly ok:false;readonly code:SupplierEditorErrorCode};
/** Injected by later typed tRPC query/mutation binding, never manual fetch/auth here. */
export interface SupplierEditorClient {
 load(role:SupplierEditorRole):Promise<SupplierEditorLoadResult>;
 save(request:SupplierPolicySaveRequest):Promise<SupplierEditorSaveResult>;
}
export interface SupplierEditorPendingChange {
 readonly action:SupplierEditorAction;
 readonly before:string;
 readonly after:string;
 readonly keys:readonly string[];
}
export type { SupplierGrants, SupplierPersistedPolicy, SupplierPolicySaveRequest };
