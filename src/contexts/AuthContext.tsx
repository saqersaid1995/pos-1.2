import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// Detect Electron environment (window.drovo is injected by the preload script)
const isElectron =
  typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

type AppRole = "admin" | "cashier";

interface Profile {
  id: string;
  full_name: string;
  username: string;
  phone: string;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Electron-only helpers
// ---------------------------------------------------------------------------

const ELECTRON_SESSION_KEY = "drovo_session";

interface ElectronStoredSession {
  user: { id: string; email: string };
  profile: Profile;
  role: AppRole;
}

async function hashPin(pin: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pin)
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // ===========================================================================
  // ELECTRON PATH — PIN-based offline auth
  // ===========================================================================

  const electronSignIn = useCallback(async (username: string, password: string) => {
    try {
      // drovo.db.query returns { data: rows[], error: string | null }
      const result = await (window as any).drovo.db.query(
        `SELECT p.id, p.full_name, p.username, p.phone, p.is_active, p.pin_hash,
                ur.role
         FROM profiles p
         LEFT JOIN user_roles ur ON ur.user_id = p.id
         WHERE LOWER(p.username) = LOWER(?) AND p.is_active = 1`,
        [username]
      ) as { data: any[] | null; error: string | null };

      if (result.error || !result.data || result.data.length === 0) {
        return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
      }

      const row = result.data[0];
      if (!row || !row.pin_hash) {
        return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
      }

      const inputHash = await hashPin(password);

      if (inputHash !== row.pin_hash) {
        return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
      }

      const newUser = { id: row.id, email: `${row.username}@local` } as unknown as User;

      const newProfile: Profile = {
        id: row.id,
        full_name: row.full_name,
        username: row.username,
        phone: row.phone || "",
        is_active: Boolean(row.is_active),
      };

      const newRole: AppRole = (row.role as AppRole) ?? "cashier";

      const session: ElectronStoredSession = {
        user: { id: row.id, email: `${row.username}@local` },
        profile: newProfile,
        role: newRole,
      };

      sessionStorage.setItem(ELECTRON_SESSION_KEY, JSON.stringify(session));

      setUser(newUser);
      setProfile(newProfile);
      setRole(newRole);

      return { error: null };
    } catch (err) {
      console.error("Electron signIn error:", err);
      return { error: "حدث خطأ أثناء تسجيل الدخول" };
    }
  }, []);

  const electronSignOut = useCallback(async () => {
    sessionStorage.removeItem(ELECTRON_SESSION_KEY);
    setUser(null);
    setProfile(null);
    setRole(null);
  }, []);

  // ===========================================================================
  // SUPABASE PATH — standard web auth
  // ===========================================================================

  const loadProfile = useCallback(async (userId: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);

    if (profileRes.data) {
      setProfile({
        id: profileRes.data.id,
        full_name: profileRes.data.full_name,
        username: profileRes.data.username,
        phone: profileRes.data.phone || "",
        is_active: profileRes.data.is_active,
      });
    }

    if (roleRes.data) {
      setRole(roleRes.data.role as AppRole);
    }
  }, []);

  const supabaseSignIn = useCallback(async (username: string, password: string) => {
    const email = `${username.toLowerCase()}@lavinderia.pos`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return { error: "Invalid username or password" };

    // Check if account is active
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (prof && !prof.is_active) {
      await supabase.auth.signOut();
      return { error: "Your account is inactive. Please contact the administrator." };
    }

    return { error: null };
  }, []);

  const supabaseSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ===========================================================================
  // Bootstrap on mount
  // ===========================================================================

  useEffect(() => {
    if (isElectron) {
      // Restore Electron session from sessionStorage
      try {
        const raw = sessionStorage.getItem(ELECTRON_SESSION_KEY);
        if (raw) {
          const stored: ElectronStoredSession = JSON.parse(raw);
          setUser(stored.user as unknown as User);
          setProfile(stored.profile);
          setRole(stored.role);
        }
      } catch {
        sessionStorage.removeItem(ELECTRON_SESSION_KEY);
      } finally {
        setLoading(false);
      }
      return; // skip Supabase subscription
    }

    // Supabase auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        // Use setTimeout to avoid Supabase deadlock
        setTimeout(() => loadProfile(session.user.id), 0);
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // ===========================================================================
  // Render
  // ===========================================================================

  const signIn = isElectron ? electronSignIn : supabaseSignIn;
  const signOut = isElectron ? electronSignOut : supabaseSignOut;

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
