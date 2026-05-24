import { WORKFLOW_STAGES } from "@/types/workflow";
import { Inbox, PackageCheck, Truck, AlertTriangle, ClipboardList } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  inbox: Inbox, "package-check": PackageCheck, truck: Truck,
};

interface SummaryCardsProps {
  counts: Record<string, number>;
}

export default function SummaryCards({ counts }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <SummaryCard label="Total Active" value={counts.total} icon={ClipboardList} variant="default" />
      {WORKFLOW_STAGES.map((stage) => {
        const Icon = iconMap[stage.icon] || Inbox;
        return (
          <SummaryCard key={stage.id} label={stage.label} value={counts[stage.id] || 0} icon={Icon} variant="default" />
        );
      })}
      <SummaryCard label="Urgent" value={counts.urgent} icon={AlertTriangle} variant="urgent" />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, variant }: { label: string; value: number; icon: React.ElementType; variant: "default" | "urgent" }) {
  return (
    <div className={`pos-section flex flex-col items-center justify-center py-3 gap-1 ${variant === "urgent" ? "border-accent/40 bg-accent/5" : ""}`}>
      <Icon className={`h-4 w-4 ${variant === "urgent" ? "text-accent" : "text-muted-foreground"}`} />
      <span className="text-xl font-bold">{value}</span>
      <span className="text-[0.65rem] font-medium text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}
