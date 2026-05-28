import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, Loader2 } from "lucide-react";

export default function Login() {
  const RETURN_TO_KEY = "lavinderia:returnTo";
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const redirectedRef = useRef(false);

  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")
    ?? (typeof window !== "undefined" ? sessionStorage.getItem(RETURN_TO_KEY) : null)
    ?? "/";
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";

  const redirectToTarget = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    sessionStorage.removeItem(RETURN_TO_KEY);
    navigate(safeReturnTo, { replace: true });
  }, [navigate, safeReturnTo]);

  useEffect(() => {
    sessionStorage.setItem(RETURN_TO_KEY, safeReturnTo);
  }, [safeReturnTo]);

  useEffect(() => {
    if (user && !authLoading) redirectToTarget();
  }, [authLoading, redirectToTarget, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    setError("");
    setLoading(true);
    const result = await signIn(username.trim(), password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      redirectToTarget();
    }
  };

  if (user && !authLoading) return null;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-1">
            <span
              className="font-bold text-[28px] tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              DROVO
            </span>
            <span
              className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
            >
              POS
            </span>
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            نظام إدارة المغسلة
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h2
            className="text-[16px] font-medium mb-5"
            style={{ color: "var(--text-primary)" }}
          >
            تسجيل الدخول
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            {error && (
              <div
                className="text-[13px] rounded-lg px-3 py-2.5"
                style={{
                  background: "var(--danger-subtle)",
                  color: "var(--color-danger)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="text-[13px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                اسم المستخدم
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: ADMIN"
                autoComplete="username"
                autoFocus
                className="ds-input"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-[13px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                كلمة المرور / الرقم السري
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                className="ds-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 rounded-lg text-[14px] font-medium flex items-center justify-center gap-2 transition-all duration-150 mt-2"
              style={{
                background: loading ? "rgba(99,102,241,0.6)" : "var(--color-accent)",
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  (e.currentTarget as HTMLElement).style.background = "var(--color-accent-hover)";
              }}
              onMouseLeave={(e) => {
                if (!loading)
                  (e.currentTarget as HTMLElement).style.background = "var(--color-accent)";
              }}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? "جاري تسجيل الدخول…" : "دخول"}
            </button>
          </form>
        </div>

        <p
          className="text-center text-[12px] mt-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          الدخول الافتراضي: ADMIN / ADMIN
        </p>
      </div>
    </div>
  );
}
