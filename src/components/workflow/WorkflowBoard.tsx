import type { WorkflowOrder, WorkflowStatus } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import OrderCard from "./OrderCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, PackageCheck, Truck } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  inbox: Inbox, "package-check": PackageCheck, truck: Truck,
};

interface WorkflowBoardProps {
  ordersByStatus: Record<WorkflowStatus, WorkflowOrder[]>;
  onSelectOrder: (id: string) => void;
  onMoveNext: (id: string) => void;
  onMovePrev: (id: string) => void;
  onPaymentComplete?: () => void;
}

export default function WorkflowBoard({ ordersByStatus, onSelectOrder, onMoveNext, onMovePrev, onPaymentComplete }: WorkflowBoardProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-h-[400px]">
      {WORKFLOW_STAGES.map((stage) => {
        const Icon = iconMap[stage.icon] || Inbox;
        const orders = ordersByStatus[stage.id];
        return (
          <div key={stage.id} className="flex flex-col">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stage.label}</h3>
              <span className="ml-auto text-xs font-bold bg-secondary text-secondary-foreground rounded-full h-5 w-5 flex items-center justify-center">
                {orders.length}
              </span>
            </div>
            <ScrollArea className="flex-1 rounded-lg bg-secondary/30 p-2">
              <div className="space-y-2 min-h-[200px]">
                {orders.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No orders</p>
                )}
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onSelect={onSelectOrder}
                    onMoveNext={onMoveNext}
                    onMovePrev={onMovePrev}
                    onPaymentComplete={onPaymentComplete}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}
