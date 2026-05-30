import { Printer, ArrowLeft, Save, X, RotateCcw, Loader2, Check } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onSave: () => void;
  onSaveAndPrint: () => void;
  onSaveAndProcess: () => void;
  onCancel: () => void;
  onClear: () => void;
  disabled?: boolean;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface BtnProps {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  variant?: Variant;
  disabled?: boolean;
  height?: number;
}

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--color-accent, #6366F1)",
    color: "#fff",
    border: "1px solid var(--color-accent, #6366F1)",
    fontWeight: 600,
  },
  secondary: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    fontWeight: 500,
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    fontWeight: 400,
  },
  danger: {
    background: "transparent",
    color: "var(--color-danger, #EF4444)",
    border: "1px solid var(--border-subtle)",
    fontWeight: 400,
  },
};

function Btn({ onClick, icon: Icon, label, variant = "ghost", disabled, height = 34 }: BtnProps) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handle = async () => {
    if (state !== "idle" || disabled) return;
    if (variant === "danger") { onClick(); return; }
    setState("loading");
    await new Promise((r) => setTimeout(r, 500));
    onClick();
    setState("done");
    setTimeout(() => setState("idle"), 1000);
  };

  return (
    <button
      onClick={handle}
      disabled={disabled || state !== "idle"}
      style={{
        ...VARIANT_STYLES[variant],
        width: "100%",
        height,
        borderRadius: 8,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 120ms, background 120ms",
        opacity: disabled ? 0.45 : 1,
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        if (!disabled && state === "idle") {
          if (variant === "primary") (e.currentTarget as HTMLElement).style.opacity = "0.88";
          else if (variant === "secondary") (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = disabled ? "0.45" : "1";
        if (variant === "secondary") (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
      }}
    >
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Icon size={13} />
            {label}
          </motion.span>
        )}
        {state === "loading" && (
          <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 size={14} className="animate-spin" />
          </motion.span>
        )}
        {state === "done" && (
          <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }}>
            <Check size={14} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default function ActionButtons({
  onSave,
  onSaveAndPrint,
  onSaveAndProcess,
  onCancel,
  onClear,
  disabled,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Btn onClick={onSaveAndPrint} icon={Printer} label="حفظ وطباعة" variant="primary" disabled={disabled} height={36} />
      <Btn onClick={onSaveAndProcess} icon={ArrowLeft} label="حفظ ومعالجة" variant="secondary" disabled={disabled} height={30} />
      <Btn onClick={onSave} icon={Save} label="حفظ فقط" variant="ghost" disabled={disabled} height={28} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Btn onClick={onCancel} icon={X} label="إلغاء" variant="danger" height={26} />
        <Btn onClick={onClear} icon={RotateCcw} label="مسح" variant="ghost" height={26} />
      </div>
    </div>
  );
}
