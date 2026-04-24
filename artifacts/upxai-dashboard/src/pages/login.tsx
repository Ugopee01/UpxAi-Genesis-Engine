import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetCurrentUserQueryKey,
  useLogin,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";

export default function LoginPage() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async () => {
        setError(null);
        await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          const data = err.data as { error?: string } | null;
          setError(data?.error || "Sign-in failed. Please try again.");
        } else {
          setError("Sign-in failed. Please try again.");
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setError(null);
    loginMutation.mutate({ data: { username: username.trim(), password } });
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-4 dark font-sans relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      <div className="relative w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2.5">
          <img
            src="/logo.png"
            alt="UPXAI Logo"
            className="h-12 w-12 rounded-full border border-primary/50 shadow-[0_0_18px_rgba(0,240,255,0.4)] animate-pulse-fast"
          />
          <div className="text-center">
            <div className="font-bold text-xl tracking-tight text-primary">UPXAI</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              Genesis Engine
            </div>
          </div>
        </div>

        <Card className="w-full bg-card border-primary/20 shadow-[0_0_32px_rgba(0,240,255,0.05)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 font-mono uppercase tracking-widest">
              <KeyRound className="h-4 w-4 text-primary" />
              Operator Sign-in
            </CardTitle>
            <CardDescription className="text-xs">
              Authenticate to access the Genesis Engine console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
              <div className="space-y-1.5">
                <Label className="text-[10px] tracking-widest uppercase text-muted-foreground">
                  Username
                </Label>
                <Input
                  data-testid="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="owner"
                  className="font-mono bg-black/40 border-border/50 h-11"
                  autoComplete="username"
                  spellCheck={false}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] tracking-widest uppercase text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    data-testid="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="font-mono bg-black/40 border-border/50 h-11 pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  data-testid="login-error"
                  className="flex items-start gap-2 p-3 rounded text-xs font-mono bg-rose-500/10 border border-rose-500/30 text-rose-300"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                data-testid="login-submit"
                className="w-full h-11 font-mono uppercase tracking-widest text-xs shadow-[0_0_18px_rgba(0,240,255,0.2)]"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "AUTHENTICATING..." : "SIGN IN"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-[10px] font-mono text-muted-foreground/70 text-center max-w-xs leading-relaxed">
          Authorized access only. All actions are logged to the Engine.
        </p>
      </div>
    </div>
  );
}
