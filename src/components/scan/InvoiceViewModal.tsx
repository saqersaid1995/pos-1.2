import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer, X } from "lucide-react";
import type { WorkflowOrder } from "@/types/workflow";
import { formatOMR } from "@/lib/currency";
import { BUSINESS } from "@/lib/business-config";
import { printInvoices } from "@/lib/print-invoice";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: WorkflowOrder | null;
}

export default function InvoiceViewModal({ open, onOpenChange, order }: Props) {
  if (!order) return null;

  const statusInfo = paymentBadgeInfo(order.paymentStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Invoice — {order.orderNumber}</span>
            <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-3 space-y-3 text-sm">
          {/* Business header */}
          <div className="flex items-center gap-2 justify-center">
            <img src={BUSINESS.logo} alt={BUSINESS.name} className="h-9 w-9 object-contain" />
            <div className="text-center">
              <p className="font-bold leading-tight">{BUSINESS.name}</p>
              <p className="text-[10px] text-muted-foreground">{BUSINESS.tagline}</p>
            </div>
          </div>

          <Separator />

          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Field label="Order" value={order.orderNumber} />
            <Field label="Date" value={order.orderDate} />
            <Field label="Customer" value={order.customerName || "Walk-in"} />
            <Field label="Phone" value={order.customerPhone || "—"} />
            {order.deliveryDate && <Field label="Delivery" value={order.deliveryDate} />}
            <Field label="Status" value={order.currentStatus.replace(/-/g, " ")} />
          </div>

          <Separator />

          {/* Items */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="pb-1">Item</th>
                <th className="pb-1">Service</th>
                <th className="pb-1 text-center">Qty</th>
                <th className="pb-1 text-right">Price</th>
                <th className="pb-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="py-1">{it.itemType || "—"}</td>
                  <td className="py-1">{it.service || "—"}</td>
                  <td className="py-1 text-center">{it.quantity}</td>
                  <td className="py-1 text-right">{formatOMR(it.unitPrice)}</td>
                  <td className="py-1 text-right">{formatOMR(it.unitPrice * it.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Separator />

          {/* Totals */}
          <div className="space-y-1 text-xs">
            <Row label="Subtotal" value={formatOMR(order.subtotal)} />
            {order.discount > 0 && (
              <Row label="Discount" value={`-${formatOMR(order.discount)}`} className="text-destructive" />
            )}
            <Row label="Total" value={formatOMR(order.totalAmount)} bold />
            <Row label="Paid" value={formatOMR(order.paidAmount)} />
            {order.remainingBalance > 0 && (
              <Row
                label="Remaining"
                value={formatOMR(order.remainingBalance)}
                className="text-destructive font-semibold"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-3 border-t border-border bg-card">
          <Button
            className="flex-1 gap-2"
            onClick={() => printInvoices([order])}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

function Row({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-sm" : ""} ${className || ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function paymentBadgeInfo(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: "Paid", className: "bg-success/15 text-success border-success/20" },
    "partially-paid": { label: "Partial", className: "bg-warning/15 text-warning border-warning/20" },
    unpaid: { label: "Unpaid", className: "bg-destructive/15 text-destructive border-destructive/20" },
  };
  return map[status] || map.unpaid;
}
