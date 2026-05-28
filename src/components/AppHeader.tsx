/**
 * AppHeader — page-level header (title + subtitle + actions).
 * Navigation is now handled by AppSidebar in App.tsx.
 */
import type { ReactNode } from "react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-8 py-5 print:hidden"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div>
        <h1
          className="text-[20px] font-medium leading-tight"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.3px" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
