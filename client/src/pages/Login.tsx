import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const utils = trpc.useUtils();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.mustChangePassword) {
        window.location.href = "/?changePassword=true";
        return;
      }

      // 🔐 Re-sync auth state so UI unlocks instantly
      await utils.auth.me.invalidate();
    },
    onError: (err) => {
      setError(err.message || "Invalid login credentials");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password.trim()) {
      setError("Please enter both username/email and password");
      return;
    }

    loginMutation.mutate({ identifier: identifier.trim(), password });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663029451273/oZXOcEyrNhCuGDCp.png"
              className="h-20"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Welcome to AFGRO</CardTitle>
            <CardDescription>Sign in to your Poultry Manager</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email or Username</Label>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={loginMutation.isPending}
              />
            </div>

            <div>
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginMutation.isPending}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full">
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="relative">
            <Separator />
            <span className="absolute inset-0 flex justify-center bg-card px-2 text-xs text-muted-foreground">
              OR
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => (window.location.href = "/api/oauth/login")}
          >
            Sign in with Manus
          </Button>
        </CardContent>

        <CardFooter className="text-center text-sm text-muted-foreground">
          Contact your administrator for access
        </CardFooter>
      </Card>
    </div>
  );
}
