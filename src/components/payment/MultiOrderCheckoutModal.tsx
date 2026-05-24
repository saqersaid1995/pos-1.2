import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Banknote, Building, Shuffle, Loader2, Printer, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateOrderStatus } from "@/lib/supabase-queries";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import type { WorkflowOrder } from "@/types/workflow";

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "bank-transfer", label: "Bank Transfer", icon: Building },
  { id: "mixed", label: "Mixed", icon: Shuffle },
] as const;

const QUICK_DISCOUNTS = [
  { label: "10%", value: 10 },
  { label: "20%", value: 20 },
];

interface MultiOrderCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: WorkflowOrder[];
  customerName: string;
  customerPhone: string;
  onPaymentComplete: () => void;
  autoDeliver?: boolean;
}

export default function MultiOrderCheckoutModal({
  open, onOpenChange, orders, customerName, customerPhone, onPaymentComplete, autoDeliver = false,
}: MultiOrderCheckoutModalProps) {
  const combinedSubtotal = orders.reduce((s, o) => s + o.subtotal, 0);
  const combinedExistingDiscount = orders.reduce((s, o) => s + o.discount, 0);
  const combinedTotal = orders.reduce((s, o) => s + o.totalAmount, 0);
  const combinedPaid = orders.reduce((s, o) => s + o.paidAmount, 0);
  const combinedRemaining = orders.reduce((s, o) => s + o.remainingBalance, 0);

  const [discountOMR, setDiscountOMR] = useState("0.000");
  const [discountPct, setDiscountPct] = useState("");
  const [amount, setAmount] = useState("0.000");
  const [method, setMethod] = useState<string>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ amount: number; method: string; date: string; delivered: boolean; discount: number } | null>(null);

  const numericDiscount = parseFloat(discountOMR) || 0;
  const effectiveDiscount = Math.min(numericDiscount, combinedRemaining);
  const finalRemaining = Math.max(0, combinedRemaining - effectiveDiscount);

  // Sync amount with final remaining whenever discount or modal state changes
  useEffect(() => {
    if (open && !receipt) {
      setAmount(finalRemaining.toFixed(3));
    }
  }, [open, finalRemaining, receipt]);

  // Reset discount when modal opens
  useEffect(() => {
    if (open) {
      setDiscountOMR("0.000");
      setDiscountPct("");
      setMethod("cash");
      setReceipt(null);
    }
  }, [open]);

  const numericAmount = parseFloat(amount) || 0;
  const isValid = (numericAmount > 0 && numericAmount <= finalRemaining) || (effectiveDiscount > 0 && numericAmount === 0 && finalRemaining === 0);
  const isFullPayment = Math.abs(numericAmount - finalRemaining) < 0.01;
  const allReadyForPickup = orders.every((o) => o.currentStatus === "ready-for-pickup");
  const willAutoDeliver = autoDeliver && isFullPayment && allReadyForPickup;

  const handleDiscountPctChange = (pctStr: string) => {
    setDiscountPct(pctStr);
    const pct = parseFloat(pctStr) || 0;
    const discountValue = (combinedRemaining * pct) / 100;
    setDiscountOMR(discountValue.toFixed(3));
  };

  const handleDiscountOMRChange = (omrStr: string) => {
    setDiscountOMR(omrStr);
    if (combinedRemaining > 0) {
      const pct = ((parseFloat(omrStr) || 0) / combinedRemaining) * 100;
      setDiscountPct(pct > 0 ? pct.toFixed(1) : "");
    }
  };

  const applyQuickDiscount = (pct: number) => {
    handleDiscountPctChange(String(pct));
  };

  const handleConfirm = async () => {
    if (!isValid) return;
    setSubmitting(true);

    // Apply discount proportionally across orders
    if (effectiveDiscount > 0) {
      let discountLeft = effectiveDiscount;
      for (const order of orders) {
        if (discountLeft <= 0) break;
        const proportion = order.remainingBalance / combinedRemaining;
        const orderDiscount = Math.min(discountLeft, +(proportion * effectiveDiscount).toFixed(3));
        const newDiscount = order.discount + orderDiscount;
        const newTotal = Math.max(0, order.subtotal - newDiscount);
        const newRemaining = Math.max(0, newTotal - order.paidAmount);

        const { error } = await supabase
          .from("orders")
          .update({
            discount: newDiscount,
            total_amount: newTotal,
            remaining_amount: newRemaining,
            payment_status: newRemaining <= 0 ? "paid" : order.paymentStatus,
          })
          .eq("id", order.id);

        if (error) {
          toast.error(`Discount update failed for ${order.orderNumber}: ${error.message}`);
          setSubmitting(false);
          return;
        }
        discountLeft -= orderDiscount;
      }
    }

    // Process payment
    if (numericAmount > 0) {
      let remaining = numericAmount;
      for (const order of orders) {
        if (remaining <= 0) break;
        const orderEffRemaining = Math.max(0, order.remainingBalance - (order.remainingBalance / combinedRemaining) * effectiveDiscount);
        const payForThis = Math.min(remaining, orderEffRemaining);
        if (payForThis <= 0) continue;

        const { error: payError } = await supabase.from("payments").insert({
          order_id: order.id,
          payment_method: method,
          amount: payForThis,
        });

        if (payError) {
          toast.error(`Payment failed for ${order.orderNumber}: ${payError.message}`);
          setSubmitting(false);
          return;
        }

        const orderDiscount = (order.remainingBalance / combinedRemaining) * effectiveDiscount;
        const newPaid = order.paidAmount + payForThis;
        const newTotal = Math.max(0, order.subtotal - (order.discount + orderDiscount));
        const newRemaining = Math.max(0, newTotal - newPaid);
        const newPaymentStatus = newRemaining <= 0 ? "paid" : "partially-paid";

        const { error: updateError } = await supabase
          .from("orders")
          .update({
            paid_amount: newPaid,
            remaining_amount: Math.max(0, newRemaining),
            payment_status: newPaymentStatus,
          })
          .eq("id", order.id);

        if (updateError) {
          toast.error(`Order update failed for ${order.orderNumber}: ${updateError.message}`);
          setSubmitting(false);
          return;
        }

        remaining -= payForThis;
      }
    }

    let delivered = false;
    if (willAutoDeliver) {
      for (const order of orders) {
        await updateOrderStatus(order.id, order.currentStatus, "delivered");
      }
      delivered = true;
    }

    setSubmitting(false);
    setReceipt({ amount: numericAmount, method, date: new Date().toLocaleString(), delivered, discount: effectiveDiscount });

    if (delivered) {
      toast.success("Payment collected and orders delivered successfully.");
    } else if (!isFullPayment) {
      toast.success("Payment recorded. Orders remain Ready for Pickup until full balance is paid.");
    } else {
      toast.success("Payment recorded for selected orders.");
    }

    onPaymentComplete();
  };

  const handleClose = () => {
    setReceipt(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Pickup Checkout
          </DialogTitle>
          <DialogDescription>
            {autoDeliver
              ? `Collect payment and deliver ${orders.length} selected order${orders.length !== 1 ? "s" : ""}.`
              : `Collect payment for ${orders.length} selected order${orders.length !== 1 ? "s" : ""}.`}
          </DialogDescription>
        </DialogHeader>

        {receipt ? (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4 space-y-3 text-sm receipt-print">
              <h4 className="font-bold text-center">Payment Receipt</h4>
              <Separator />
              <InfoRow label="Customer" value={customerName} />
              <InfoRow label="Phone" value={customerPhone} />
              <InfoRow label="Orders" value={orders.map(o => o.orderNumber).join(", ")} />
              {receipt.discount > 0 && <InfoRow label="Discount" value={`-${formatOMR(receipt.discount)}`} className="text-destructive" />}
              <InfoRow label="Amount Paid" value={formatOMR(receipt.amount)} />
              <InfoRow label="Method" value={receipt.method} />
              <InfoRow label="Date" value={receipt.date} />
              {receipt.delivered && <InfoRow label="Status" value="✅ Delivered" />}
              <Separator />
              <p className="text-center text-xs text-muted-foreground">Thank you!</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print Receipt
              </Button>
              <Button size="sm" className="flex-1" onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Order Summary */}
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2 text-sm">
              <InfoRow label="Customer" value={customerName} />
              <InfoRow label="Phone" value={customerPhone} />
              <Separator className="my-2" />
              {orders.map(o => (
                <div key={o.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <span className="font-medium">{o.orderNumber}</span>
                  <span className="text-destructive font-semibold">{formatOMR(o.remainingBalance)}</span>
                </div>
              ))}
              <Separator className="my-2" />
              <InfoRow label="Combined Subtotal" value={formatOMR(combinedSubtotal)} />
              {combinedExistingDiscount > 0 && <InfoRow label="Previous Discount" value={`-${formatOMR(combinedExistingDiscount)}`} className="text-destructive" />}
              <InfoRow label="Combined Paid" value={formatOMR(combinedPaid)} />
              <div className="flex justify-between font-semibold text-destructive">
                <span>Combined Remaining</span>
                <span>{formatOMR(combinedRemaining)}</span>
              </div>
            </div>

            {/* Discount Section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Percent className="h-3 w-3" /> Discount
              </label>
              <div className="flex gap-2">
                {QUICK_DISCOUNTS.map((qd) => (
                  <Button
                    key={qd.value}
                    type="button"
                    variant={discountPct === String(qd.value) ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => applyQuickDiscount(qd.value)}
                  >
                    {qd.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={discountPct && ![10, 20].includes(parseFloat(discountPct)) ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => {
                    setDiscountPct("");
                    setDiscountOMR("0.000");
                  }}
                >
                  Custom
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">OMR</span>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    max={combinedRemaining}
                    value={discountOMR}
                    onChange={(e) => handleDiscountOMRChange(e.target.value)}
                    className="pl-11 text-sm"
                    placeholder="0.000"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={discountPct}
                    onChange={(e) => handleDiscountPctChange(e.target.value)}
                    className="pl-8 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
              {effectiveDiscount > 0 && (
                <div className="bg-destructive/5 rounded-md p-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Before Discount</span>
                    <span>{formatOMR(combinedRemaining)}</span>
                  </div>
                  <div className="flex justify-between text-destructive font-medium">
                    <span>Discount</span>
                    <span>-{formatOMR(effectiveDiscount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Final Remaining</span>
                    <span>{formatOMR(finalRemaining)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((pm) => {
                  const Icon = pm.icon;
                  const isActive = method === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setMethod(pm.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Amount */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">OMR</span>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  max={finalRemaining}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-12 text-lg font-semibold"
                />
              </div>
              {numericAmount > finalRemaining && (
                <p className="text-xs text-destructive">Amount exceeds remaining balance</p>
              )}
              {numericAmount > 0 && numericAmount < finalRemaining && autoDeliver && (
                <p className="text-xs text-warning">Partial payment — orders will remain Ready for Pickup until fully paid.</p>
              )}
            </div>

            <Button
              className="w-full h-11 text-sm font-semibold gap-2"
              disabled={!isValid || submitting}
              onClick={handleConfirm}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {willAutoDeliver
                ? `Pay & Deliver — ${formatOMR(numericAmount)}`
                : `Confirm Payment — ${formatOMR(numericAmount)}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between text-sm ${className || ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
