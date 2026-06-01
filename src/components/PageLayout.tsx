import { ReactNode } from "react";
import { motion } from "framer-motion";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
}

export default function PageLayout({ title, subtitle, actions, children, noPadding }: PageLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col min-h-full"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Page Header */}
      <div
        className="flex items-center justify-between px-8 py-5"
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
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className={noPadding ? "flex-1" : "flex-1 p-8 pt-6"}>
        {children}
      </div>
    </motion.div>
  );
}
