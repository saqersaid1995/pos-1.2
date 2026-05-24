import { useState } from "react";
import { toLocalDateStr } from "@/lib/utils";
import type { WorkflowOrder, WorkflowStatus } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Clock, CreditCard, ExternalLink, Package, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { formatOMR } from "@/lib/currency";
import PaymentModal from "@/components/payment/PaymentModal";

interface OrderCardProps {
  order: WorkflowOrder;
  onSelect: (id: string) => void;
  onMoveNext: (id: string) => void;
  onMovePrev: (id: string) => void;
  onPaymentComplete?: () => void;
}

export default function OrderCard({ order, onSelect, onMoveNext, onMovePrev, onPaymentComplete }: OrderCardProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const today = toLocalDateStr();
  const isOverdue = order.deliveryDate && order.deliveryDate < today && order.currentStatus !== "delivered";
  const isDueToday = order.deliveryDate === today && order.currentStatus !== "delivered";
  const stageIdx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
  const canMoveNext = stageIdx < WORKFLOW_STAGES.length - 1;
  const canMovePrev = stageIdx > 0;
  const isReadyForPickup = order.currentStatus === "ready-for-pickup";

  // Color coding
  const borderColor = isOverdue
    ? "border-destructive/50 ring-1 ring-destructive/30"
    : order.orderType === "urgent"
    ? "border-accent/40"
    : isDueToday
    ? "border-warning/40"
    : "border-border";

  const bgColor = isOverdue
    ? "bg-destructive/5"
    : order.orderType === "urgent"
    ? "bg-accent/5"
    : "";

  return (
    <>
      <div
        className={`pos-section p-3 space-y-2 cursor-pointer hover:border-primary/30 transition-colors ${borderColor} ${bgColor}`}
        onClick={() => onSelect(order.id)}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-mono font-semibold truncate">{order.orderNumber}</span>
          <div className="flex gap-1 shrink-0">
            {order.id.startsWith("local-") && (
              <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0 border-warning text-warning">Pending Sync</Badge>
            )}
            {order.orderType === "urgent" && (
              <Badge className="bg-accent text-accent-foreground text-[0.6rem] px-1.5 py-0">Urgent</Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive" className="text-[0.6rem] px-1.5 py-0">Overdue</Badge>
            )}
            {isDueToday && !isOverdue && (
              <Badge className="bg-warning text-warning-foreground text-[0.6rem] px-1.5 py-0">Due Today</Badge>
            )}
          </div>
        </div>

        {/* Customer */}
        <p className="text-sm font-bold truncate tracking-wide">{order.customerPhone}</p>
        <p className="text-[0.65rem] text-muted-foreground truncate">{order.customerName}</p>

        {/* Items + delivery */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {order.itemCount} items
          </span>
          {order.deliveryDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {order.deliveryDate}
            </span>
          )}
        </div>

        {/* Payment + total */}
        <div className="flex items-center gap-1.5">
          <PaymentBadge status={order.paymentStatus} />
          <span className="text-sm font-bold ml-auto">{formatOMR(order.totalAmount)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
          {isReadyForPickup && order.remainingBalance > 0 ? (
            <Button
              size="sm"
              className="h-8 px-3 text-xs flex-1 gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setPaymentOpen(true)}
            >
              <Banknote className="h-3.5 w-3.5" />
              Collect & Pay — {formatOMR(order.remainingBalance)}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs flex-1"
                disabled={!canMovePrev}
                onClick={() => onMovePrev(order.id)}
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs flex-1"
                disabled={!canMoveNext}
                onClick={() => onMoveNext(order.id)}
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <Link to={`/order/${order.id}`} className="text-[0.65rem] text-primary hover:underline flex items-center gap-0.5">
            <ExternalLink className="h-2.5 w-2.5" /> View Details
          </Link>
        </div>
      </div>

      {paymentOpen && (
        <PaymentModal
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          order={order}
          onPaymentComplete={() => {
            setPaymentOpen(false);
            onPaymentComplete?.();
          }}
        />
      )}
    </>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: "Paid", className: "bg-success/15 text-success border-success/20" },
    "partially-paid": { label: "Partial", className: "bg-warning/15 text-warning border-warning/20" },
    unpaid: { label: "Unpaid", className: "bg-destructive/15 text-destructive border-destructive/20" },
  };
  const info = map[status] || map.unpaid;
  return <span className={`text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full border ${info.className}`}>{info.label}</span>;
}
