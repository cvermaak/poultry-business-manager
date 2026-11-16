import type { ReactNode } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
/** Financial visibility is a server-checked role permission, not a role-name assumption. */
export function useFinancialVisibility(){
 const { user,loading:authLoading }=useAuth();
 const query=trpc.financialVisibility.get.useQuery({viewerId:user?.id??0},{enabled:!!user,retry:false,staleTime:0,refetchOnWindowFocus:true});
 return {allowed:!!user&&!query.isError&&query.data?.allowed===true,loading:authLoading||(!!user&&query.isLoading)};
}
export function FinancialAccessGuard({children}:{children:ReactNode}){
 const {allowed,loading}=useFinancialVisibility();
 if(loading)return <p role="status" className="p-6 text-muted-foreground">Checking access…</p>;
 if(!allowed)return <section className="p-6"><h1 className="text-xl font-semibold">Financial access restricted</h1><p className="mt-2 text-muted-foreground">Your role is not allowed to view financial data. Contact an administrator if access is required.</p></section>;
 return <>{children}</>;
}
