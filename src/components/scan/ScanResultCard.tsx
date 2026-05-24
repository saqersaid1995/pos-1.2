import { useState } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight, FileText, Printer, AlertTriangle,
  CheckCircle2, Truck, CreditCard,
} from "lucide-react";
import type { WorkflowOrder } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { formatOMR } from "@/lib/currency";
import PaymentModal from "@/components/payment/PaymentModal";

interface ScanResultCardProps {
  order: WorkflowOrder;
  onMoveNext: () => void;
  onMarkDelivered: () => void;
  onPrint: () => void;
  onRefresh: () => void;
}

export default function ScanResultCard({ order, onMoveNext, onMarkDelivered, onPrint, onRefresh }: ScanResultCardProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);

  const today = toLocalDateStr();
  const isOverdue = order.deliveryDate < today && order.currentStatus !== "delivered";
  const isDueToday = order.deliveryDate === today && order.currentStatus !== "delivered";
  const stageIdx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
  const canNext = stageIdx < WORKFLOW_STAGES.length - 1;
  const isReady = order.currentStatus === "ready-for-pickup";
  const hasBalance = order.remainingBalance > 0;

  return (
    <>
      <div className="pos-section space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{order.orderNumber}</h3>
            <p className="text-sm text-muted-foreground">{order.customerName} • {order.customerPhone}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {order.orderType === "urgent" && <Badge className="bg-accent text-accent-foreground">Urgent</Badge>}
            <PaymentBadge status={order.paymentStatus} />
            {isOverdue && <Badge variant="destructive">Overdue</Badge>}
            {isDueToday && !isOverdue && <Badge className="bg-warning text-warning-foreground">Due Today</Badge>}
            {isReady && <Badge className="bg-success text-success-foreground">Ready for Pickup</Badge>}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <InfoCell label="Status" value={WORKFLOW_STAGES[stageIdx]?.label || order.currentStatus} />
          <InfoCell label="Delivery" value={order.deliveryDate} />
          <InfoCell label="Items" value={String(order.itemCount)} />
          <InfoCell label="Total" value={formatOMR(order.totalAmount)} />
        </div>

        {hasBalance && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Outstanding Balance: {formatOMR(order.remainingBalance)}
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Link to={`/order/${order.id}`} className="flex-1 min-w-[120px]">
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 w-full">
              <FileText className="h-3.5 w-3.5" /> View Details
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-1 min-w-[120px]" onClick={onPrint}>
            <Printer className="h-3.5 w-3.5" /> Print Invoice
          </Button>

          {hasBalance && (
            <Button
              size="sm"
              className="h-9 text-xs gap-1.5 flex-1 min-w-[120px] bg-warning hover:bg-warning/90 text-warning-foreground"
              onClick={() => setPaymentOpen(true)}
            >
              <CreditCard className="h-3.5 w-3.5" /> Collect Payment
            </Button>
          )}

          {canNext && !isReady && (
            <Button size="sm" className="h-9 text-xs gap-1.5 flex-1 min-w-[120px]" onClick={onMoveNext}>
              <ChevronRight className="h-3.5 w-3.5" /> {WORKFLOW_STAGES[stageIdx + 1]?.label}
            </Button>
          )}
          {isReady && (
            <Button
              size="sm"
              className="h-9 text-xs gap-1.5 flex-1 min-w-[120px] bg-success hover:bg-success/90 text-success-foreground"
              onClick={onMarkDelivered}
              disabled={hasBalance}
              title={hasBalance ? "Outstanding balance must be paid before delivery" : "Mark as delivered"}
            >
              <Truck className="h-3.5 w-3.5" /> Mark Delivered
            </Button>
          )}
        </div>

        {isReady && hasBalance && (
          <p className="text-xs text-destructive text-center">
            ⚠ Outstanding balance must be paid before delivery.
          </p>
        )}

        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {WORKFLOW_STAGES.map((stage, i) => {
            const isActive = i === stageIdx;
            const isDone = i < stageIdx;
            return (
              <div key={stage.id} className="flex items-center gap-1 shrink-0">
                {i > 0 && <div className={`w-3 h-0.5 ${isDone ? "bg-success" : "bg-border"}`} />}
                <div className={`px-1.5 py-0.5 rounded text-[0.6rem] font-medium ${
                  isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                }`}>
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PaymentModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        order={order}
        onPaymentComplete={onRefresh}
      />
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: "Paid", className: "bg-success/15 text-success border-success/20" },
    "partially-paid": { label: "Partial", className: "bg-warning/15 text-warning border-warning/20" },
    unpaid: { label: "Unpaid", className: "bg-destructive/15 text-destructive border-destructive/20" },
  };
  const info = map[status] || map.unpaid;
  return <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${info.className}`}>{info.label}</span>;
}
