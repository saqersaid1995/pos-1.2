import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, AlertCircle, Sparkles, UserCheck, ExternalLink, Loader2, Clock } from "lucide-react";
import { fetchCustomerSnapshot, type CustomerSnapshot as Snapshot } from "@/lib/supabase-queries";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import { formatOMR } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface Props {
  customerId: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "No previous visits";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: Snapshot["status"] }) {
  const map = {
    new: { label: "New", icon: Sparkles, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    regular: { label: "Regular", icon: UserCheck, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    vip: { label: "VIP", icon: Crown, className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    at_risk: { label: "At Risk", icon: AlertCircle, className: "bg-red-500/10 text-red-600 border-red-500/20" },
  } as const;
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold", cfg.className)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function CustomerSnapshot({ customerId }: Props) {
  const { settings: loyaltySettings } = useLoyaltySettings();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCustomerSnapshot(customerId)
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!customerId) return null;

  if (loading && !snapshot) {
    return (
      <div className="rounded-md border border-border bg-card/50 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading customer history...
      </div>
    );
  }

  if (!snapshot) return null;

  const isNew = snapshot.totalOrders === 0;
  const loyaltyEnabled = !!loyaltySettings?.is_enabled;

  return (
    <div className="rounded-md border border-border bg-card/50 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Customer Snapshot</span>
          <StatusBadge status={snapshot.status} />
        </div>
        <Link
          to={`/customer/${snapshot.customerId}`}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          View Profile <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {isNew ? (
        <p className="text-xs text-muted-foreground italic">New customer — no history yet</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <KPI label="Last Visit" value={formatDate(snapshot.lastOrderDate)} />
          <KPI label="Total Orders" value={String(snapshot.totalOrders)} />
          <KPI
            label="Outstanding"
            value={formatOMR(snapshot.outstandingBalance)}
            tone={snapshot.outstandingBalance > 0 ? "danger" : "muted"}
          />
          <KPI label="Total Paid" value={formatOMR(snapshot.totalPaid)} tone="success" />
          <KPI label="Lifetime" value={formatOMR(snapshot.totalSpent)} />
          {loyaltyEnabled && (
            <KPI
              label="Loyalty Points"
              value={snapshot.loyaltyPoints.toFixed(0)}
              tone="info"
            />
          )}
        </div>
      )}

      {!isNew && loyaltyEnabled && snapshot.loyaltyExpiringSoon > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
          <Clock className="w-3 h-3" />
          <span>
            {snapshot.loyaltyExpiringSoon.toFixed(0)} pts expire in {snapshot.loyaltyExpiringSoonDays} days
          </span>
        </div>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "info" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600",
    danger: "text-red-600",
    info: "text-blue-600",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums truncate", toneClass)}>{value}</div>
    </div>
  );
}
