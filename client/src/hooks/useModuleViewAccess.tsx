import {useEffect,useRef,type ReactNode} from 'react';
import {useAuth} from '@/_core/hooks/useAuth';
import {trpc} from '@/lib/trpc';
export type ModuleViewScope='customers'|'suppliers'|'feed_management';
export function useModuleViewAccess(){
 const {user,loading:authLoading}=useAuth();const utils=trpc.useUtils();
 const boundary=useRef({id:user?.id,role:user?.role,startedAt:Date.now()});
 if(boundary.current.id!==user?.id||boundary.current.role!==user?.role)boundary.current={id:user?.id,role:user?.role,startedAt:Date.now()};
 const query=trpc.moduleViewAccess.get.useQuery({viewerId:user?.id??0},{enabled:!!user,retry:false,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnWindowFocus:'always',refetchInterval:5000});
 const fresh=!!user&&!query.isError&&query.data?.viewerId===user.id&&query.dataUpdatedAt>=boundary.current.startedAt;
 const access={customers:fresh&&query.data?.customers===true,suppliers:fresh&&query.data?.suppliers===true,feed_management:fresh&&query.data?.feed_management===true};
 const settled=!!user&&(fresh||query.isError);
 // Reset removes retained successful data after a denied refetch. This is not
 // authorization: the server independently checks every protected request.
 useEffect(()=>{if(!settled)return;if(!access.customers){void utils.customers.list.reset();void utils.customers.getById.reset();void utils.customers.getAddresses.reset();}if(!access.suppliers){void utils.suppliers.list.reset();void utils.suppliers.getById.reset();}if(!access.feed_management){void utils.invoices.list.reset();void utils.invoices.getById.reset();void utils.invoices.getItems.reset();void utils.invoices.getInvoiceAgingSummary.reset();}},[settled,access.customers,access.suppliers,access.feed_management,utils]);
 return {...access,loading:authLoading||!!user&&!settled};
}
export function ModuleViewAccessGuard({scope,children}:{scope:ModuleViewScope;children:ReactNode}){
 const access=useModuleViewAccess();
 if(access.loading)return <p role="status" className="p-6 text-muted-foreground">Checking module access…</p>;
 if(!access[scope])return <section role="alert" className="p-6"><h1 className="text-xl font-semibold">Module access restricted</h1><p className="mt-2 text-muted-foreground">Your role is not allowed to access this module. Contact an administrator if access is required.</p></section>;
 return <>{children}</>;
}
