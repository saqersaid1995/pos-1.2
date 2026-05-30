import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export interface SelectOption {
  id: string;
  label: string;
  color?: string;
}

interface SettingsRowProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  isUrgent?: boolean;
}

// Compact clickable row that opens a fixed-position dropdown.
// Uses position:fixed so the dropdown escapes any overflow:auto ancestor.
export function SettingsRow({ label, options, value, onChange, isUrgent }: SettingsRowProps) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen((p) => !p);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inBtn = btnRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inBtn && !inMenu) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: 36,
          borderRadius: 8,
          background: isUrgent ? "rgba(245,158,11,0.08)" : "var(--bg-elevated)",
          border: `1px solid ${isUrgent ? "rgba(245,158,11,0.45)" : "var(--border-default)"}`,
          cursor: "pointer",
          transition: "border-color 120ms, background 120ms",
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: selected?.color ?? "var(--text-primary)" }}>
            {selected?.label ?? "—"}
          </span>
          <ChevronDown
            size={11}
            style={{
              color: "var(--text-tertiary)",
              flexShrink: 0,
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 120ms",
            }}
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.13 }}
            style={{
              position: "fixed",
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
              zIndex: 9999,
              background: "var(--bg-elevated)",
              border: "0.5px solid var(--border-subtle)",
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
              padding: 4,
            }}
          >
            {options.map((opt) => {
              const isActive = opt.id === value;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 32,
                    padding: "0 10px",
                    fontSize: 12,
                    fontWeight: isActive ? 500 : 400,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: isActive ? "rgba(99,102,241,0.12)" : "transparent",
                    color: isActive ? "var(--color-accent, #6366F1)" : (opt.color ?? "var(--text-primary)"),
                    transition: "background 80ms",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--bg-overlay, rgba(255,255,255,0.05))";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span>{opt.label}</span>
                  {isActive && <Check size={12} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Inline-editable discount / amount row — click to reveal an input
interface DiscountRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export function DiscountRow({ label, value, onChange }: DiscountRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(value > 0 ? String(value) : "");
    setEditing(true);
  };

  const commit = () => {
    const n = parseFloat(draft);
    onChange(!isNaN(n) && n >= 0 ? n : 0);
    setEditing(false);
  };

  return (
    <div
      onClick={!editing ? startEdit : undefined}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        height: 36,
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        cursor: editing ? "default" : "pointer",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {editing ? (
          <>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>OMR</span>
            <input
              autoFocus
              type="number"
              min={0}
              step={0.5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              style={{
                width: 72,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                fontFamily: "monospace",
                color: "var(--text-primary)",
              }}
            />
          </>
        ) : (
          <>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "monospace",
                color:
                  value > 0
                    ? "var(--color-success, #10B981)"
                    : "var(--text-secondary)",
              }}
            >
              {value.toFixed(3)} OMR
            </span>
            <Pencil size={11} style={{ color: "var(--text-tertiary)" }} />
          </>
        )}
      </div>
    </div>
  );
}
