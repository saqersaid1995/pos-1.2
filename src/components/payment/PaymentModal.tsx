import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Banknote, Building, Shuffle, Loader2, Printer, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { triggerLoyaltyWhatsApp } from "@/lib/loyalty-whatsapp";
import type { WorkflowOrder } from "@/types/workflow";
import MixedPaymentInput, { getMixedTotal, getMixedPayments } from "./MixedPaymentInput";

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

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: WorkflowOrder;
  onPaymentComplete: () => void;
}

export default function PaymentModal({ open, onOpenChange, order, onPaymentComplete }: PaymentModalProps) {
  const [amount, setAmount] = useState(String(order.remainingBalance.toFixed(3)));
  const [method, setMethod] = useState<string>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ amount: number; method: string; date: string; discount: number } | null>(null);

  // Discount state
  const [discountOMR, setDiscountOMR] = useState("0.000");
  const [discountPct, setDiscountPct] = useState("");

  // Mixed payment state
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");
  const [mixedTransfer, setMixedTransfer] = useState("");

  const numericDiscount = parseFloat(discountOMR) || 0;
  const effectiveDiscount = Math.min(numericDiscount, order.remainingBalance);
  const finalRemaining = Math.max(0, order.remainingBalance - effectiveDiscount);

  const isMixed = method === "mixed";
  const mixedTotal = getMixedTotal(mixedCash, mixedCard, mixedTransfer);
  const numericAmount = isMixed ? mixedTotal : (parseFloat(amount) || 0);
  const isValid = (numericAmount > 0 && numericAmount <= finalRemaining + 0.0005) || (effectiveDiscount > 0 && numericAmount === 0 && finalRemaining === 0);

  // Sync payment amount when discount changes
  useEffect(() => {
    if (open && !receipt && !isMixed) {
      setAmount(finalRemaining.toFixed(3));
    }
  }, [open, finalRemaining, receipt, isMixed]);

  const handleDiscountPctChange = (pctStr: string) => {
    setDiscountPct(pctStr);
    const pct = parseFloat(pctStr) || 0;
    const discountValue = (order.remainingBalance * pct) / 100;
    setDiscountOMR(discountValue.toFixed(3));
  };

  const handleDiscountOMRChange = (omrStr: string) => {
    setDiscountOMR(omrStr);
    if (order.remainingBalance > 0) {
      const pct = ((parseFloat(omrStr) || 0) / order.remainingBalance) * 100;
      setDiscountPct(pct > 0 ? pct.toFixed(1) : "");
    }
  };

  const applyQuickDiscount = (pct: number) => {
    handleDiscountPctChange(String(pct));
  };

  const handleConfirm = async () => {
    if (!isValid) return;
    setSubmitting(true);

    // Apply discount to order if any
    if (effectiveDiscount > 0) {
      const newDiscount = order.discount + effectiveDiscount;
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
        toast.error("Discount update failed: " + error.message);
        setSubmitting(false);
        return;
      }
    }

    // Process payment
    if (numericAmount > 0) {
      const payments = isMixed
        ? getMixedPayments(mixedCash, mixedCard, mixedTransfer)
        : [{ method, amount: numericAmount }];

      const totalPaying = payments.reduce((s, p) => s + p.amount, 0);

      for (const p of payments) {
        const { error } = await supabase.from("payments").insert({
          order_id: order.id,
          payment_method: p.method,
          amount: p.amount,
        });
        if (error) {
          toast.error("Payment failed: " + error.message);
          setSubmitting(false);
          return;
        }
      }

      const newPaid = order.paidAmount + totalPaying;
      const adjustedTotal = Math.max(0, order.subtotal - (order.discount + effectiveDiscount));
      const newRemaining = Math.max(0, adjustedTotal - newPaid);
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
        toast.error("Order update failed: " + updateError.message);
        setSubmitting(false);
        return;
      }

      if (newRemaining <= 0 && order.currentStatus === "ready-for-pickup") {
        const { updateOrderStatus } = await import("@/lib/supabase-queries");
        await updateOrderStatus(order.id, "ready-for-pickup", "delivered");
      }

      if (order.customerId) {
        await awardLoyaltyPoints(order.customerId, order.id, totalPaying);
      }

      if (newPaymentStatus === "paid" && order.customerId && order.customerPhone) {
        triggerLoyaltyWhatsApp(order.id, order.customerId, order.customerPhone, totalPaying);
      }
    } else if (effectiveDiscount > 0 && finalRemaining === 0) {
      // Discount covered full remaining — mark as paid and deliver
      if (order.currentStatus === "ready-for-pickup") {
        const { updateOrderStatus } = await import("@/lib/supabase-queries");
        await updateOrderStatus(order.id, "ready-for-pickup", "delivered");
      }
    }

    setSubmitting(false);
    const methodLabel = isMixed ? "Mixed" : method;
    setReceipt({ amount: numericAmount, method: methodLabel, date: new Date().toLocaleString(), discount: effectiveDiscount });
    toast.success("Payment recorded successfully");
    onPaymentComplete();
  };

  const handleClose = () => {
    setReceipt(null);
    setAmount(String(order.remainingBalance.toFixed(3)));
    setMethod("cash");
    setDiscountOMR("0.000");
    setDiscountPct("");
    setMixedCash(""); setMixedCard(""); setMixedTransfer("");
    onOpenChange(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setAmount(String(order.remainingBalance.toFixed(3)));
      setMethod("cash");
      setReceipt(null);
      setDiscountOMR("0.000");
      setDiscountPct("");
      setMixedCash(""); setMixedCard(""); setMixedTransfer("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Pickup Payment
          </DialogTitle>
          <DialogDescription>Collect payment before delivering the order.</DialogDescription>
        </DialogHeader>

        {receipt ? (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4 space-y-3 text-sm receipt-print">
              <h4 className="font-bold text-center">Payment Receipt</h4>
              <Separator />
              <InfoRow label="Order" value={order.orderNumber} />
              <InfoRow label="Customer" value={order.customerName} />
              {receipt.discount > 0 && <InfoRow label="Discount" value={`-${formatOMR(receipt.discount)}`} className="text-destructive" />}
              <InfoRow label="Amount Paid" value={formatOMR(receipt.amount)} />
              <InfoRow label="Method" value={receipt.method} />
              <InfoRow label="Date" value={receipt.date} />
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
            <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
              <InfoRow label="Order" value={order.orderNumber} />
              <InfoRow label="Customer" value={order.customerName} />
              <Separator className="my-2" />
              <InfoRow label="Subtotal" value={formatOMR(order.subtotal)} />
              {order.discount > 0 && <InfoRow label="Existing Discount" value={`-${formatOMR(order.discount)}`} className="text-destructive" />}
              <InfoRow label="Total" value={formatOMR(order.totalAmount)} />
              <InfoRow label="Paid" value={formatOMR(order.paidAmount)} />
              <div className="flex justify-between font-semibold text-destructive">
                <span>Remaining</span>
                <span>{formatOMR(order.remainingBalance)}</span>
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
                  onClick={() => { setDiscountPct(""); setDiscountOMR("0.000"); }}
                >
                  Custom
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">OMR</span>
                  <Input
                    type="number" step="0.001" min="0" max={order.remainingBalance}
                    value={discountOMR}
                    onChange={(e) => handleDiscountOMRChange(e.target.value)}
                    className="pl-11 text-sm" placeholder="0.000"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={discountPct}
                    onChange={(e) => handleDiscountPctChange(e.target.value)}
                    className="pl-8 text-sm" placeholder="0"
                  />
                </div>
              </div>
              {effectiveDiscount > 0 && (
                <div className="bg-destructive/5 rounded-md p-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Before Discount</span>
                    <span>{formatOMR(order.remainingBalance)}</span>
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
                        isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Amount */}
            {isMixed ? (
              <MixedPaymentInput
                cashAmount={mixedCash} cardAmount={mixedCard} transferAmount={mixedTransfer}
                onCashChange={setMixedCash} onCardChange={setMixedCard} onTransferChange={setMixedTransfer}
                remainingBalance={finalRemaining}
              />
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">OMR</span>
                  <Input
                    type="number" step="0.001" min="0" max={finalRemaining}
                    value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="pl-12 text-lg font-semibold"
                  />
                </div>
                {numericAmount > finalRemaining && (
                  <p className="text-xs text-destructive">Amount exceeds remaining balance</p>
                )}
                {numericAmount > 0 && numericAmount < finalRemaining && (
                  <p className="text-xs text-warning">Partial payment — balance will remain</p>
                )}
              </div>
            )}

            <Button
              className="w-full h-11 text-sm font-semibold gap-2"
              disabled={!isValid || submitting}
              onClick={handleConfirm}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Confirm Payment — {formatOMR(numericAmount)}
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
