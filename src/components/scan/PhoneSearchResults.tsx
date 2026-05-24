import { useState, useMemo } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  CreditCard, Truck, FileText, AlertTriangle, Eye, Printer, Banknote,
} from "lucide-react";
import type { WorkflowOrder } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { updateOrderStatus } from "@/lib/supabase-queries";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import MultiOrderCheckoutModal from "@/components/payment/MultiOrderCheckoutModal";
import PaymentModal from "@/components/payment/PaymentModal";
import InvoiceViewModal from "@/components/scan/InvoiceViewModal";
import { printInvoices } from "@/lib/print-invoice";

interface PhoneSearchResultsProps {
  customerName: string;
  customerPhone: string;
  orders: WorkflowOrder[];
  onRefresh: () => void;
}

export default function PhoneSearchResults({
  customerName, customerPhone, orders, onRefresh,
}: PhoneSearchResultsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<WorkflowOrder | null>(null);
  const [payOrder, setPayOrder] = useState<WorkflowOrder | null>(null);

  const today = toLocalDateStr();

  const filteredOrders = useMemo(() => {
    if (showAll) return orders;
    return orders.filter((o) => o.currentStatus !== "delivered");
  }, [orders, showAll]);

  const selectedOrders = useMemo(
    () => filteredOrders.filter((o) => selectedIds.has(o.id)),
    [filteredOrders, selectedIds]
  );

  const summary = useMemo(() => ({
    count: selectedOrders.length,
    total: selectedOrders.reduce((s, o) => s + o.totalAmount, 0),
    paid: selectedOrders.reduce((s, o) => s + o.paidAmount, 0),
    remaining: selectedOrders.reduce((s, o) => s + o.remainingBalance, 0),
  }), [selectedOrders]);

  const allReadyForPickup = selectedOrders.length > 0 && selectedOrders.every((o) => o.currentStatus === "ready-for-pickup");
  const canDeliverDirectly = summary.count > 0 && summary.remaining <= 0 && allReadyForPickup;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleDeliverOnly = async () => {
    if (!canDeliverDirectly) {
      if (!allReadyForPickup) {
        toast.error("Only Ready for Pickup orders can be delivered.");
      } else {
        toast.error("Selected orders still have outstanding balance.");
      }
      return;
    }
    setDelivering(true);
    for (const order of selectedOrders) {
      await updateOrderStatus(order.id, order.currentStatus, "delivered");
    }
    setDelivering(false);
    toast.success(`${selectedOrders.length} order(s) successfully delivered.`);
    setSelectedIds(new Set());
    onRefresh();
  };

  const handlePaymentComplete = () => {
    setSelectedIds(new Set());
    setPayOrder(null);
    onRefresh();
  };

  const handlePrintSelected = async () => {
    if (selectedOrders.length === 0) {
      toast.error("Select at least one order to print.");
      return;
    }
    await printInvoices(selectedOrders);
  };

  return (
    <div className="space-y-3">
      {/* Customer header */}
      <div className="pos-section">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">{customerName}</h3>
            <p className="text-sm text-muted-foreground">{customerPhone}</p>
          </div>
          <Badge variant="outline" className="text-xs">{orders.length} order{orders.length !== 1 ? "s" : ""}</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between px-1">
        <button onClick={selectAll} className="text-xs text-primary font-medium hover:underline">
          {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? "Deselect All" : "Select All"}
        </button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showAll} onCheckedChange={setShowAll} className="scale-75" />
          Show all orders
        </label>
      </div>

      {/* Order list */}
      <div className="space-y-2">
        {filteredOrders.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No pickup-relevant orders found for this customer.
          </div>
        )}
        {filteredOrders.map((order) => {
          const isSelected = selectedIds.has(order.id);
          const isOverdue = order.deliveryDate < today && order.currentStatus !== "delivered";
          const isDueToday = order.deliveryDate === today;
          const isReady = order.currentStatus === "ready-for-pickup";
          const isDelivered = order.currentStatus === "delivered";
          const stageLabel = WORKFLOW_STAGES.find((s) => s.id === order.currentStatus)?.label || order.currentStatus;
          const hasBalance = order.remainingBalance > 0;

          return (
            <div
              key={order.id}
              className={`pos-section p-3 space-y-2 cursor-pointer transition-colors hover:border-primary/40 ${
                isSelected ? "ring-2 ring-primary/50 bg-primary/5" : ""
              } ${isDelivered ? "opacity-70" : ""}`}
              onClick={() => setInvoiceOrder(order)}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(order.id)}
                  className="mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{order.orderNumber}</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      <PaymentBadge status={order.paymentStatus} />
                      {isReady && <Badge className="bg-success/15 text-success text-[0.6rem] px-1.5 py-0">Ready</Badge>}
                      {isOverdue && <Badge variant="destructive" className="text-[0.6rem] px-1.5 py-0">Overdue</Badge>}
                      {isDueToday && !isOverdue && <Badge className="bg-warning/15 text-warning text-[0.6rem] px-1.5 py-0">Due Today</Badge>}
                      {isDelivered && <Badge variant="secondary" className="text-[0.6rem] px-1.5 py-0">Delivered</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 mt-1.5 text-xs text-muted-foreground">
                    <span>Status: <strong className="text-foreground capitalize">{stageLabel}</strong></span>
                    <span>Items: <strong className="text-foreground">{order.itemCount}</strong></span>
                    <span>Total: <strong className="text-foreground">{formatOMR(order.totalAmount)}</strong></span>
                  </div>
                  {hasBalance && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-destructive font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      Balance: {formatOMR(order.remainingBalance)}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex gap-1.5 pl-7" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[0.7rem] gap-1 px-2"
                  onClick={() => setInvoiceOrder(order)}
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[0.7rem] gap-1 px-2"
                  onClick={() => printInvoices([order])}
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                {hasBalance ? (
                  <Button
                    size="sm"
                    className="h-8 flex-1 text-[0.7rem] gap-1 px-2 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => setPayOrder(order)}
                  >
                    <Banknote className="h-3.5 w-3.5" /> Pay
                  </Button>
                ) : (
                  <Link to={`/order/${order.id}`} className="flex-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-8 w-full text-[0.7rem] gap-1 px-2">
                      <FileText className="h-3.5 w-3.5" /> Details
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection summary & actions */}
      {summary.count > 0 && (
        <div className="pos-section space-y-3 sticky bottom-0 bg-card border-t border-border shadow-lg">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <InfoCell label="Selected Orders" value={String(summary.count)} />
            <InfoCell label="Selected Total" value={formatOMR(summary.total)} />
            <InfoCell label="Selected Paid" value={formatOMR(summary.paid)} />
            <InfoCell label="Selected Remaining" value={formatOMR(summary.remaining)} highlight={summary.remaining > 0} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-10 text-xs gap-1.5 min-w-[140px]"
              onClick={handlePrintSelected}
            >
              <Printer className="h-3.5 w-3.5" /> Print Selected ({summary.count})
            </Button>
            {summary.remaining > 0 ? (
              <Button
                size="sm"
                className="flex-1 h-10 text-xs gap-1.5 min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => setCheckoutOpen(true)}
                disabled={!allReadyForPickup}
                title={!allReadyForPickup ? "Only Ready for Pickup orders can be processed" : ""}
              >
                <CreditCard className="h-3.5 w-3.5" /> Collect Payment & Deliver
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1 h-10 text-xs gap-1.5 min-w-[140px] bg-success hover:bg-success/90 text-success-foreground"
                onClick={handleDeliverOnly}
                disabled={!canDeliverDirectly || delivering}
                title={!allReadyForPickup ? "Only Ready for Pickup orders can be delivered" : ""}
              >
                <Truck className="h-3.5 w-3.5" />
                {delivering ? "Delivering..." : "Deliver Selected"}
              </Button>
            )}
          </div>

          {summary.remaining > 0 && !allReadyForPickup && (
            <p className="text-[0.65rem] text-destructive text-center">
              ⚠ Only Ready for Pickup orders can be processed for delivery.
            </p>
          )}
        </div>
      )}

      <MultiOrderCheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        orders={selectedOrders}
        customerName={customerName}
        customerPhone={customerPhone}
        onPaymentComplete={handlePaymentComplete}
        autoDeliver
      />

      <InvoiceViewModal
        open={!!invoiceOrder}
        onOpenChange={(o) => !o && setInvoiceOrder(null)}
        order={invoiceOrder}
      />

      {payOrder && (
        <PaymentModal
          open={!!payOrder}
          onOpenChange={(o) => !o && setPayOrder(null)}
          order={payOrder}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}

function InfoCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-semibold text-sm ${highlight ? "text-destructive" : ""}`}>{value}</p>
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
  return <span className={`text-[0.6rem] font-semibold px-1.5 py-0 rounded-full border ${info.className}`}>{info.label}</span>;
}
