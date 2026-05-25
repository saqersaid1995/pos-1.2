import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const isElectron = typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

type AppRole = "admin" | "cashier";

interface SubItem {
  to: string;
  label: string;
  roles: AppRole[];
}

interface NavSection {
  key: string;
  label: string;
  roles: AppRole[];
  items: SubItem[];
}

const NAV_SECTIONS_WEB: NavSection[] = [
  {
    key: "operations",
    label: "العمليات",
    roles: ["admin", "cashier"],
    items: [
      { to: "/", label: "طلب جديد", roles: ["admin", "cashier"] },
      { to: "/workflow", label: "لوحة الطلبات", roles: ["admin", "cashier"] },
    ],
  },
  {
    key: "customers",
    label: "العملاء",
    roles: ["admin", "cashier"],
    items: [
      { to: "/customers", label: "العملاء", roles: ["admin", "cashier"] },
      { to: "/loyalty", label: "نقاط الولاء", roles: ["admin"] },
      { to: "/complaints", label: "الشكاوى", roles: ["admin"] },
    ],
  },
  {
    key: "finance",
    label: "المالية",
    roles: ["admin"],
    items: [
      { to: "/reports", label: "التقارير", roles: ["admin"] },
      { to: "/cashflow", label: "التدفق النقدي", roles: ["admin"] },
      { to: "/cash-management", label: "الصندوق", roles: ["admin"] },
      { to: "/accounting", label: "المحاسبة", roles: ["admin"] },
      { to: "/loans", label: "القروض", roles: ["admin"] },
      { to: "/expenses", label: "المصروفات", roles: ["admin"] },
      { to: "/services", label: "الأسعار", roles: ["admin"] },
    ],
  },
  {
    key: "system",
    label: "النظام",
    roles: ["admin"],
    items: [
      { to: "/staff", label: "الموظفون", roles: ["admin"] },
    ],
  },
];

const NAV_SECTIONS_ELECTRON: NavSection[] = [
  {
    key: "operations",
    label: "العمليات",
    roles: ["admin", "cashier"],
    items: [
      { to: "/", label: "طلب جديد", roles: ["admin", "cashier"] },
      { to: "/workflow", label: "لوحة الطلبات", roles: ["admin", "cashier"] },
    ],
  },
  {
    key: "customers",
    label: "العملاء",
    roles: ["admin", "cashier"],
    items: [
      { to: "/customers", label: "العملاء", roles: ["admin", "cashier"] },
      { to: "/loyalty", label: "نقاط الولاء", roles: ["admin"] },
      { to: "/complaints", label: "الشكاوى", roles: ["admin"] },
    ],
  },
  {
    key: "finance",
    label: "المالية",
    roles: ["admin"],
    items: [
      { to: "/reports", label: "التقارير", roles: ["admin"] },
      { to: "/cashflow", label: "التدفق النقدي", roles: ["admin"] },
      { to: "/cash-management", label: "الصندوق", roles: ["admin"] },
      { to: "/accounting", label: "المحاسبة", roles: ["admin"] },
      { to: "/loans", label: "القروض", roles: ["admin"] },
      { to: "/expenses", label: "المصروفات", roles: ["admin"] },
      { to: "/services", label: "الأسعار", roles: ["admin"] },
    ],
  },
  {
    key: "settings",
    label: "الإعدادات",
    roles: ["admin"],
    items: [
      { to: "/staff", label: "الموظفون", roles: ["admin"] },
      { to: "/printer", label: "الطابعة", roles: ["admin"] },
      { to: "/backup", label: "النسخ الاحتياطي", roles: ["admin"] },
      { to: "/license", label: "الترخيص", roles: ["admin"] },
    ],
  },
];

const NAV_SECTIONS = isElectron ? NAV_SECTIONS_ELECTRON : NAV_SECTIONS_WEB;

function findActiveSection(pathname: string): string | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)) {
        return section.key;
      }
    }
  }
  return null;
}

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  let profile: any = null;
  let role: AppRole | null = null;
  let signOut: (() => Promise<void>) | null = null;

  try {
    const auth = useAuth();
    profile = auth.profile;
    role = auth.role;
    signOut = auth.signOut;
  } catch {
    // Auth context not available
  }

  const activeSection = findActiveSection(location.pathname);
  const [selectedSection, setSelectedSection] = useState<string | null>(activeSection);

  // Sync when route changes
  useEffect(() => {
    const s = findActiveSection(location.pathname);
    if (s) setSelectedSection(s);
  }, [location.pathname]);

  const visibleSections = NAV_SECTIONS.filter(
    (s) => !role || s.roles.includes(role)
  ).map((s) => ({
    ...s,
    items: s.items.filter((item) => !role || item.roles.includes(role)),
  })).filter((s) => s.items.length > 0);

  const currentSection = visibleSections.find((s) => s.key === selectedSection);

  const getLabel = (item: SubItem) => {
    if (item.to === "/inbox" && 0 > 0) {
      return (
        <span className="flex items-center gap-1.5">
          {item.label}
          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 min-w-[16px] flex items-center justify-center">
            {0}
          </Badge>
        </span>
      );
    }
    return item.label;
  };

  const handleSectionClick = (sectionKey: string) => {
    setSelectedSection(sectionKey);
    // Navigate to first item in section
    const section = visibleSections.find((s) => s.key === sectionKey);
    if (section && section.items.length > 0) {
      const currentlyInSection = section.items.some((item) =>
        item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
      );
      if (!currentlyInSection) {
        navigate(section.items[0].to);
      }
    }
  };

  // Mobile: hamburger dropdown with all sections and items
  if (isMobile) {
    return (
      <>
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm print:hidden">
          <div className="flex items-center justify-between px-3 h-12">
            <div className="flex items-center gap-2 min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {visibleSections.map((section, idx) => (
                    <div key={section.key}>
                      {idx > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {section.label}
                      </DropdownMenuLabel>
                      {section.items.map((item) => {
                        const isActive = item.to === "/"
                          ? location.pathname === "/"
                          : location.pathname.startsWith(item.to);
                        return (
                          <DropdownMenuItem
                            key={item.to}
                            className={cn(isActive && "bg-accent font-medium")}
                            onClick={() => navigate(item.to)}
                          >
                            {getLabel(item)}
                          </DropdownMenuItem>
                        );
                      })}
                    </div>
                  ))}
                  {signOut && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={signOut} className="text-destructive">
                        <LogOut className="h-3.5 w-3.5 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <h1 className="text-sm font-bold tracking-tight truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-1.5">
              {actions}
              {profile && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                  {role}
                </Badge>
              )}
            </div>
          </div>

          {/* Mobile sub-tabs */}
          {currentSection && (
            <div className="flex items-center gap-0.5 px-3 pb-2 overflow-x-auto scrollbar-none">
              {currentSection.items.map((item) => {
                const isActive = item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {getLabel(item)}
                  </NavLink>
                );
              })}
            </div>
          )}
        </header>
      </>
    );
  }

  // Desktop
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm print:hidden">
        {/* Primary row: sections + user */}
        <div className="flex items-center justify-between px-4 sm:px-6 h-12 max-w-[1800px] mx-auto">
          <nav className="flex items-center gap-0.5">
            {visibleSections.map((section) => {
              const isActive = section.key === selectedSection;
              return (
                <button
                  key={section.key}
                  onClick={() => handleSectionClick(section.key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors relative",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {actions}
            {profile && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{profile.username}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {role}
                </Badge>
                {signOut && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={signOut} title="Logout">
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Secondary row: sub-tabs for active section */}
        {currentSection && (
          <div className="border-t border-border/50 bg-muted/30">
            <div className="flex items-center gap-1 px-4 sm:px-6 py-1.5 max-w-[1800px] mx-auto">
              {currentSection.items.map((item) => {
                const isActive = item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-background text-foreground shadow-sm border border-border"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    {getLabel(item)}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
