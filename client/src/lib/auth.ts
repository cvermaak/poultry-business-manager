import { trpc } from "@/lib/trpc";
import { clearJWTToken } from "./jwt";

export function useAuth() {
  const me = trpc.auth.me.useQuery();
  const login = trpc.auth.login.useMutation();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Clear JWT token from localStorage
      clearJWTToken();
      // Redirect to login
      window.location.href = "/login";
    },
  });

  return {
    user: me.data,
    loading: me.isLoading,
    login,
    logout,
    refetch: me.refetch,
  };
}
