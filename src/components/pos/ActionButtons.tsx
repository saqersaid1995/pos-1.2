import { Save, Printer, ArrowRight, X, RotateCcw, Loader2, Check } from "lucide-react";
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

function ActionButton({ onClick, icon: Icon, label, variant = "default", disabled }: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  variant?: "primary" | "default" | "destructive";
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleClick = async () => {
    if (state !== "idle" || disabled) return;
    if (variant === "destructive") {
      onClick();
      return;
    }
    setState("loading");
    await new Promise((r) => setTimeout(r, 600));
    onClick();
    setState("done");
    setTimeout(() => setState("idle"), 1200);
  };

  const base = "flex items-center justify-center gap-2 h-11 rounded-md text-sm font-medium transition-all duration-[120ms] w-full border";
  const variants = {
    primary: "bg-primary text-primary-foreground border-primary hover:opacity-90",
    default: "bg-background border-border text-foreground hover:bg-secondary",
    destructive: "bg-background border-border text-destructive hover:bg-destructive/10",
  };

  return (
    <button onClick={handleClick} disabled={disabled || state !== "idle"} className={`${base} ${variants[variant]} disabled:opacity-50`}>
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <Icon className="w-4 h-4" /> {label}
          </motion.span>
        )}
        {state === "loading" && (
          <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 className="w-4 h-4 animate-spin" />
          </motion.span>
        )}
        {state === "done" && (
          <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }}>
            <Check className="w-4 h-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default function ActionButtons({ onSave, onSaveAndPrint, onSaveAndProcess, onCancel, onClear, disabled }: Props) {
  return (
    <div className="pos-section space-y-2">
      <ActionButton onClick={onSave} icon={Save} label="Save Order" variant="primary" disabled={disabled} />
      <ActionButton onClick={onSaveAndPrint} icon={Printer} label="Save & Print" disabled={disabled} />
      <ActionButton onClick={onSaveAndProcess} icon={ArrowRight} label="Save & Process" disabled={disabled} />
      <div className="h-px bg-border my-1" />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton onClick={onCancel} icon={X} label="Cancel" variant="destructive" />
        <ActionButton onClick={onClear} icon={RotateCcw} label="Clear" variant="destructive" />
      </div>
    </div>
  );
}
