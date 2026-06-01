import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type AppRole = "admin" | "cashier";

// Local User type — not Supabase User
interface User {
  id: string;
  email: string;
}

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

const SESSION_KEY = "drovo_session";

interface StoredSession {
  user: User;
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const session: StoredSession = JSON.parse(raw);
        setUser(session.user);
        setProfile(session.profile);
        setRole(session.role);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    try {
      const rows = await (window as any).drovo.db.query(
        `SELECT p.id, p.full_name, p.username, p.phone, p.is_active, p.pin_hash,
                ur.role
         FROM profiles p
         LEFT JOIN user_roles ur ON ur.user_id = p.id
         WHERE p.username = ? AND p.is_active = 1`,
        [username]
      );

      if (!rows || rows.length === 0) {
        return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
      }

      const row = rows[0];
      const inputHash = await hashPin(password);

      if (inputHash !== row.pin_hash) {
        return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
      }

      const newUser: User = {
        id: row.id,
        email: `${row.username}@local`,
      };

      const newProfile: Profile = {
        id: row.id,
        full_name: row.full_name,
        username: row.username,
        phone: row.phone || "",
        is_active: Boolean(row.is_active),
      };

      const newRole: AppRole = (row.role as AppRole) ?? "cashier";

      const session: StoredSession = {
        user: newUser,
        profile: newProfile,
        role: newRole,
      };

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

      setUser(newUser);
      setProfile(newProfile);
      setRole(newRole);

      return { error: null };
    } catch (err) {
      console.error("Electron signIn error:", err);
      return { error: "حدث خطأ أثناء تسجيل الدخول" };
    }
  }, []);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setProfile(null);
    setRole(null);
  }, []);

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
