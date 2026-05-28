import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingCart, Users, MessageCircle,
  Wallet, Receipt, CreditCard, BookOpen, BarChart3,
  Tag, Star, UserCog, Database, Printer, Key,
  ChevronLeft, ChevronRight, LogOut, LayoutDashboard,
  TrendingUp, FileInput, FileOutput,
} from "lucide-react";

const isElectron =
  typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

type AppRole = "admin" | "cashier";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  roles: AppRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const P = { size: 16, strokeWidth: 1.5 } as const;

const BASE_GROUPS: NavGroup[] = [
  {
    label: "العمليات",
    items: [
      { to: "/",          label: "نقطة البيع",     icon: <ShoppingCart   {...P} />, roles: ["admin", "cashier"] },
      { to: "/workflow",  label: "لوحة العمليات",  icon: <LayoutDashboard {...P} />, roles: ["admin", "cashier"] },
      { to: "/customers", label: "العملاء",         icon: <Users           {...P} />, roles: ["admin", "cashier"] },
      { to: "/complaints",label: "الشكاوى",         icon: <MessageCircle   {...P} />, roles: ["admin"] },
    ],
  },
  {
    label: "المالية",
    items: [
      { to: "/cash-management", label: "النقدية",    icon: <Wallet    {...P} />, roles: ["admin"] },
      { to: "/expenses",        label: "المصاريف",   icon: <Receipt   {...P} />, roles: ["admin"] },
      { to: "/cashflow",        label: "التدفق النقدي", icon: <TrendingUp {...P} />, roles: ["admin"] },
      { to: "/loans",           label: "القروض",     icon: <CreditCard {...P} />, roles: ["admin"] },
      { to: "/accounting",      label: "المحاسبة",   icon: <BookOpen  {...P} />, roles: ["admin"] },
      { to: "/reports",         label: "التقارير",   icon: <BarChart3 {...P} />, roles: ["admin"] },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      { to: "/services", label: "الأسعار والخدمات", icon: <Tag     {...P} />, roles: ["admin"] },
      { to: "/loyalty",  label: "الولاء",           icon: <Star    {...P} />, roles: ["admin"] },
      { to: "/staff",    label: "الموظفون",         icon: <UserCog    {...P} />, roles: ["admin"] },
      { to: "/import",   label: "استيراد البيانات",  icon: <FileInput  {...P} />, roles: ["admin"] as AppRole[] },
      { to: "/export",   label: "تصدير البيانات",    icon: <FileOutput {...P} />, roles: ["admin"] as AppRole[] },
      ...(isElectron
        ? [
            { to: "/backup",  label: "النسخ الاحتياطي", icon: <Database {...P} />, roles: ["admin"] as AppRole[] },
            { to: "/printer", label: "الطابعة",          icon: <Printer  {...P} />, roles: ["admin"] as AppRole[] },
            { to: "/license", label: "الترخيص",          icon: <Key      {...P} />, roles: ["admin"] as AppRole[] },
          ]
        : []),
    ],
  },
];

function matchActive(to: string, pathname: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

interface NavRowProps {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
}

function NavRow({ item, collapsed, pathname }: NavRowProps) {
  const active = matchActive(item.to, pathname);
  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-[10px] h-9 rounded-lg text-[14px] transition-all duration-150 select-none",
        collapsed ? "justify-center px-0 w-9 mx-auto" : "px-3",
        active
          ? "text-[var(--color-accent)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      )}
      style={{
        background: active ? "var(--accent-subtle)" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "";
      }}
    >
      {/* Active bar */}
      {active && !collapsed && (
        <span
          className="absolute left-0 inset-y-2 w-0.5 rounded-r-full"
          style={{ background: "var(--color-accent)" }}
        />
      )}

      <span className="shrink-0">{item.icon}</span>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden whitespace-nowrap leading-none"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Tooltip when collapsed */}
      {collapsed && (
        <span
          className="pointer-events-none absolute left-full ml-3 px-2 py-1.5 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 border"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--text-primary)",
            borderColor: "var(--border-default)",
          }}
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const { pathname } = useLocation();
  const { profile, role, signOut } = useAuth();

  const visibleGroups = BASE_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !role || item.roles.includes(role as AppRole)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col print:hidden"
      style={{
        width: collapsed ? "64px" : "240px",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
        transition: "width 200ms ease-out",
      }}
    >
      {/* ── Logo ─────────────────────────────────────────── */}
      <div
        className="flex items-center h-14 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)", padding: collapsed ? "0" : "0 16px" }}
      >
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="wordmark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 flex-1 min-w-0"
            >
              <span
                className="font-bold text-[18px] tracking-tight leading-none"
                style={{ color: "var(--text-primary)" }}
              >
                DROVO
              </span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none"
                style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
              >
                POS
              </span>
            </motion.div>
          )}
          {collapsed && (
            <motion.span
              key="icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex justify-center font-bold text-[15px]"
              style={{ color: "var(--color-accent)" }}
            >
              D
            </motion.span>
          )}
        </AnimatePresence>

        <button
          onClick={onToggle}
          className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center transition-colors duration-150"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
            (e.currentTarget as HTMLElement).style.background = "";
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* ── Navigation ───────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1 px-2">
        {visibleGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "pt-3" : ""}>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.p
                  key="label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="section-label px-3 mb-1"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>
            {collapsed && gi > 0 && (
              <div
                className="mx-auto mb-2"
                style={{
                  width: "24px",
                  height: "1px",
                  background: "var(--border-subtle)",
                }}
              />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom ───────────────────────────────────────── */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {/* License status */}
        {!collapsed && (
          <div className="px-3 py-1.5 mb-1">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-success)" }}
              />
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                مفعّل
              </span>
            </div>
          </div>
        )}

        {/* User info */}
        {!collapsed && profile && (
          <div className="px-3 py-1 mb-1">
            <p
              className="text-[13px] font-medium leading-tight truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {profile.full_name || profile.username}
            </p>
            <p
              className="text-[11px] mt-0.5 capitalize"
              style={{ color: "var(--text-tertiary)" }}
            >
              {role}
            </p>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={() => signOut()}
          title={collapsed ? "تسجيل الخروج" : undefined}
          className={cn(
            "group flex items-center gap-[10px] w-full h-9 rounded-lg text-[14px] transition-all duration-150",
            collapsed ? "justify-center px-0 w-9 mx-auto" : "px-3"
          )}
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-danger)";
            (e.currentTarget as HTMLElement).style.background = "var(--danger-subtle)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
            (e.currentTarget as HTMLElement).style.background = "";
          }}
        >
          <LogOut size={16} strokeWidth={1.5} className="shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden whitespace-nowrap leading-none"
              >
                تسجيل الخروج
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </aside>
  );
}
