import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { SupplierEditorClient } from "@shared/supplier-permission-editor-contract";

/** Uses the existing tRPC/session transport. No manual fetch, cookie, OAuth or
 * password method is added. Loads only when the accepted editor requests them.
 */
export function useSupplierRolePermissionsClient(): SupplierEditorClient {
  const utils = trpc.useUtils();
  const saveMutation = trpc.supplierPermissions.save.useMutation();
  const mutateAsync = saveMutation.mutateAsync;
  return useMemo(() => ({
    async load(role) {
      try { return await utils.client.supplierPermissions.load.query(role); }
      catch { return { ok: false as const, code: "POLICY_UNAVAILABLE" as const }; }
    },
    async save(request) {
      try { const result = await mutateAsync(request); if(result.ok){try{await utils.moduleViewAccess.invalidate();await utils.suppliers.list.reset();await utils.suppliers.getById.reset();}catch{/* acknowledged save remains acknowledged */}}return result; }
      catch { return { ok: false as const, code: "COMMIT_OUTCOME_UNKNOWN" as const }; }
    },
  }), [utils.client, mutateAsync]);
}
