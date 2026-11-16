import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { BusinessEditorClients } from '@shared/business-permission-editor-contract';
import { BUSINESS_PERMISSION_DEFINITIONS, type BusinessScope } from '@shared/business-permission-definitions';
export function useBusinessRolePermissionsClients():BusinessEditorClients{
 const utils=trpc.useUtils();const mutation=trpc.businessPermissions.save.useMutation();const mutateAsync=mutation.mutateAsync;
 return useMemo(()=>{
  const clients={} as BusinessEditorClients;
  for(const scope of Object.keys(BUSINESS_PERMISSION_DEFINITIONS) as BusinessScope[])clients[scope]={
   async load(role){try{return await utils.client.businessPermissions.load.query({scope,role});}catch{return {ok:false,code:'POLICY_UNAVAILABLE'};}},
   async save(request){try{const result=await mutateAsync({scope,request});if(result.ok){try{await utils.moduleViewAccess.invalidate();await utils.customers.list.reset();await utils.customers.getById.reset();await utils.customers.getAddresses.reset();await utils.suppliers.list.reset();await utils.suppliers.getById.reset();}catch{/* acknowledged save remains acknowledged */}}if(result.ok&&scope==='feed_management'){try{await utils.invoices.list.reset();await utils.invoices.getById.reset();await utils.invoices.getItems.reset();await utils.invoices.getInvoiceAgingSummary.reset();}catch{/* acknowledged save remains acknowledged */}}if(result.ok&&scope==='financial_data'){try{await utils.financialVisibility.invalidate();}catch{/* acknowledged commit stays acknowledged; subsequent reads fail closed */}}return result;}catch{return {ok:false,code:'COMMIT_OUTCOME_UNKNOWN'};}},
  };
  return clients;
 },[utils.client,mutateAsync]);
}
