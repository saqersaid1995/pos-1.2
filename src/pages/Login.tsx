import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, LogIn } from "lucide-react";
import { useStandaloneAppMeta } from "@/hooks/useStandaloneAppMeta";

export default function Login() {
  const RETURN_TO_STORAGE_KEY = "lavinderia:returnTo";
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")
    ?? (typeof window !== "undefined" ? window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY) : null)
    ?? "/";
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";
  const isScanLiteFlow = safeReturnTo === "/scan-lite" || safeReturnTo.startsWith("/scan-lite?");
  const isSupportLiteFlow = safeReturnTo === "/support-lite" || safeReturnTo.startsWith("/support-lite?");
  const isStandaloneFlow = isScanLiteFlow || isSupportLiteFlow;
  const hasRedirectedRef = useRef(false);

  const redirectToTarget = useCallback(() => {
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
      window.location.replace(safeReturnTo);
      return;
    }

    navigate(safeReturnTo, { replace: true });
  }, [navigate, safeReturnTo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, safeReturnTo);
  }, [safeReturnTo]);

  useEffect(() => {
    if (user && !authLoading) {
      redirectToTarget();
    }
  }, [authLoading, redirectToTarget, user]);

  useStandaloneAppMeta(
    isScanLiteFlow
      ? {
          title: "Quick Scan",
          description: "Lavinderia Scan - Quick Order Lookup",
          applicationName: "Quick Scan",
          appleMobileWebAppTitle: "Quick Scan",
          themeColor: "#0f172a",
          manifestHref: "/scan-lite-manifest.json",
          faviconHref: "/scan-favicon.png",
          appleTouchIconHref: "/scan-apple-touch-icon.png",
        }
      : isSupportLiteFlow
      ? {
          title: "Lavinderia Support",
          description: "Lavinderia Support - Customer Messages & Complaints",
          applicationName: "Lavinderia Support",
          appleMobileWebAppTitle: "Lavinderia Support",
          themeColor: "#0f172a",
          manifestHref: "/support-lite-manifest.json",
          faviconHref: "/support-favicon.png",
          appleTouchIconHref: "/support-apple-touch-icon.png",
        }
      : null,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }
    setError("");
    setLoading(true);
    const result = await signIn(username.trim(), password);
    if (result.error) {
      setError(result.error);
    } else {
      redirectToTarget();
    }
    setLoading(false);
  };

  // Redirect if already authenticated
  if (user && !authLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold">Lavinderia POS</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3 border border-destructive/20">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(!!checked)}
              />
              <Label htmlFor="remember" className="text-sm cursor-pointer">
                Remember me
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
