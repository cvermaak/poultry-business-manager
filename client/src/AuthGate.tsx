import { trpc } from "@/lib/trpc";
import LoginPage from "@/pages/Login";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) return null;

  if (!user) return <LoginPage />;

  return <div key={user.id}>{children}</div>;
}
