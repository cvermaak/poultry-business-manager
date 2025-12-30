import { trpc } from "@/lib/trpc";

export function useAuth() {
  const me = trpc.auth.me.useQuery();
  const login = trpc.auth.login.useMutation();
  const logout = trpc.auth.logout.useMutation();

  return {
    user: me.data,
    loading: me.isLoading,
    login,
    logout,
    refetch: me.refetch,
  };
}
