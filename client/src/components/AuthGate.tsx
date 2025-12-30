import { trpc } from "@/lib/trpc";
import LoginPage from "@/pages/Login";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg">
        Loading…
      </div>
    );
  }

  if (error || !user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
