import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { searchOrderByCode, updateOrderStatus } from "@/lib/supabase-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ScanBarcode, AlertCircle, CreditCard, Banknote, Building,
  Shuffle, CheckCircle2, PackageCheck, Clock, Truck,
} from "lucide-react";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import type { WorkflowOrder } from "@/types/workflow";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import LoyaltyRedemption from "@/components/pos/LoyaltyRedemption";
import { redeemLoyaltyPoints, awardLoyaltyPoints } from "@/lib/loyalty";
import { triggerLoyaltyWhatsApp } from "@/lib/loyalty-whatsapp";
import MixedPaymentInput, { getMixedTotal, getMixedPayments } from "@/components/payment/MixedPaymentInput";

interface ScanOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: string;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "bank-transfer", label: "Transfer", icon: Building },
  { id: "mixed", label: "Mixed", icon: Shuffle },
] as const;

type ModalView = "scan" | "payment" | "already-delivered" | "already-paid";

export default function ScanOrderModal({ open, onOpenChange, initialCode }: ScanOrderModalProps) {
  const [value, setValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ModalView>("scan");
  const [order, setOrder] = useState<WorkflowOrder | null>(null);

  // Payment state
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  // Mixed payment state
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");
  const [mixedTransfer, setMixedTransfer] = useState("");

  // Loyalty state
  const { settings: loyaltySettings, refetch: refetchLoyalty } = useLoyaltySettings();
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const resetToScan = useCallback(() => {
    setValue("");
    setError(null);
    setView("scan");
    setOrder(null);
    setAmount("");
    setMethod("cash");
    setSubmitting(false);
    setLoyaltyDiscount(0);
    setMixedCash(""); setMixedCard(""); setMixedTransfer("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSearch = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) { setError("Invalid barcode format"); return; }

    setSearching(true);
    setError(null);

    try {
      const found = await searchOrderByCode(trimmed);
      if (!found) {
        setError("Order not found");
        setValue("");
        setTimeout(() => inputRef.current?.focus(), 50);
        setSearching(false);
        return;
      }

      setOrder(found);

      if (found.currentStatus === "delivered") {
        setView("already-delivered");
      } else if (found.remainingBalance > 0) {
        setAmount(found.remainingBalance.toFixed(3));
        setView("payment");
      } else if (found.remainingBalance <= 0) {
        setView("already-paid");
      } else {
        setAmount(found.remainingBalance.toFixed(3));
        setView("payment");
      }
    } catch {
      setError("Search failed. Please try again.");
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refetchLoyalty();
      resetToScan();
      if (initialCode) {
        setValue(initialCode);
        setTimeout(() => handleSearch(initialCode), 50);
      }
    }
  }, [open, resetToScan, initialCode, handleSearch, refetchLoyalty]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleSearch(e.currentTarget.value);
  };

  const isMixed = method === "mixed";
  const effectiveRemaining = order ? Math.max(0, order.remainingBalance - loyaltyDiscount) : 0;
  const mixedTotal = getMixedTotal(mixedCash, mixedCard, mixedTransfer);
  const numericAmount = isMixed ? mixedTotal : (parseFloat(amount) || 0);
  const isValidPayment = order && numericAmount > 0 && numericAmount <= effectiveRemaining + 0.0005;

  const handlePayment = async () => {
    if (!order || !isValidPayment) return;
    setSubmitting(true);

    // Process loyalty redemption first
    if (loyaltyDiscount > 0 && order.customerId && loyaltySettings) {
      const pointsUsed = loyaltyDiscount * loyaltySettings.redeem_points_rate;
      await redeemLoyaltyPoints(order.customerId, order.id, pointsUsed, loyaltyDiscount);
    }

    const payments = isMixed
      ? getMixedPayments(mixedCash, mixedCard, mixedTransfer)
      : [{ method, amount: numericAmount }];

    const totalPaying = payments.reduce((s, p) => s + p.amount, 0);

    // Insert all payment records
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

    const newPaid = order.paidAmount + totalPaying + loyaltyDiscount;
    const newRemaining = Math.max(0, order.totalAmount - newPaid);
    const newPaymentStatus = newRemaining <= 0 ? "paid" : "partially-paid";

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        payment_status: newPaymentStatus,
      })
      .eq("id", order.id);

    if (updateError) {
      toast.error("Order update failed: " + updateError.message);
      setSubmitting(false);
      return;
    }

    // Award loyalty points
    if (totalPaying > 0 && order.customerId && loyaltySettings?.is_enabled) {
      await awardLoyaltyPoints(order.customerId, order.id, totalPaying);
    }

    // Auto-deliver if fully paid
    if (newRemaining <= 0 && order.currentStatus !== "delivered") {
      await updateOrderStatus(order.id, order.currentStatus, "delivered");
      toast.success(`Payment collected & order ${order.orderNumber} delivered!`);
    } else {
      toast.success(`Payment of ${formatOMR(totalPaying)} recorded for ${order.orderNumber}`);
    }

    // Send loyalty WhatsApp when fully paid
    if (newPaymentStatus === "paid" && order.customerId && order.customerPhone) {
      triggerLoyaltyWhatsApp(order.id, order.customerId, order.customerPhone, totalPaying);
    }

    setSubmitting(false);
    resetToScan();
  };

  const handleMarkDelivered = async () => {
    if (!order) return;
    setSubmitting(true);
    await updateOrderStatus(order.id, order.currentStatus, "delivered");
    toast.success(`Order ${order.orderNumber} marked as delivered!`);
    setSubmitting(false);
    resetToScan();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto" data-disable-global-barcode="true">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary" />
            Scan & Pay
          </DialogTitle>
          <DialogDescription>
            {view === "scan" ? "Scan a barcode to process pickup payment." : `Order ${order?.orderNumber || ""}`}
          </DialogDescription>
        </DialogHeader>

        {/* ── SCAN VIEW ── */}
        {view === "scan" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-4">
              {searching ? (
                <div className="text-center space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">Searching...</p>
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <ScanBarcode className="h-8 w-8 text-primary animate-pulse mx-auto" />
                  <p className="text-sm text-muted-foreground">Waiting for barcode scan...</p>
                </div>
              )}
            </div>
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. ORD-260324-6892"
              className="text-center text-lg font-mono tracking-wider"
              autoComplete="off"
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-1.5 text-destructive text-sm justify-center">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            )}
            <Button className="w-full" disabled={!value.trim() || searching} onClick={() => handleSearch(value)}>
              Search Order
            </Button>
          </div>
        )}

        {/* ── PAYMENT VIEW ── */}
        {view === "payment" && order && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
              <InfoRow label="Order" value={order.orderNumber} />
              <InfoRow label="Customer" value={order.customerName} />
              <InfoRow label="Phone" value={order.customerPhone || "—"} />
              <InfoRow label="Status" value={order.currentStatus === "ready-for-pickup" ? "Ready for Pickup" : order.currentStatus === "received" ? "Received" : order.currentStatus} icon={order.currentStatus === "ready-for-pickup" ? <PackageCheck className="h-3.5 w-3.5 text-primary" /> : <Clock className="h-3.5 w-3.5 text-warning" />} />
              <InfoRow label="Items" value={String(order.itemCount)} />
              <Separator className="my-2" />
              <InfoRow label="Total" value={formatOMR(order.totalAmount)} />
              <InfoRow label="Paid" value={formatOMR(order.paidAmount)} />
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-primary text-sm">
                  <span>Loyalty Discount</span>
                  <span>-{formatOMR(loyaltyDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-destructive">
                <span>Remaining</span>
                <span>{formatOMR(effectiveRemaining)}</span>
              </div>
            </div>

            {/* Loyalty Redemption */}
            {loyaltySettings?.is_enabled && order.customerId && (
              <LoyaltyRedemption
                customerId={order.customerId}
                orderTotal={order.remainingBalance}
                loyaltySettings={loyaltySettings}
                loyaltyDiscount={loyaltyDiscount}
                onLoyaltyDiscountChange={(val) => {
                  setLoyaltyDiscount(val);
                  const newEffective = Math.max(0, order.remainingBalance - val);
                  setAmount(newEffective.toFixed(3));
                }}
              />
            )}

            {/* Payment method */}
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((pm) => {
                const Icon = pm.icon;
                const active = method === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setMethod(pm.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {pm.label}
                  </button>
                );
              })}
            </div>

            {/* Payment input */}
            {isMixed ? (
              <MixedPaymentInput
                cashAmount={mixedCash} cardAmount={mixedCard} transferAmount={mixedTransfer}
                onCashChange={setMixedCash} onCardChange={setMixedCard} onTransferChange={setMixedTransfer}
                remainingBalance={effectiveRemaining}
              />
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">OMR</span>
                <Input
                  type="number" step="0.001" min="0.001" max={effectiveRemaining}
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="pl-12 text-lg font-semibold"
                />
              </div>
            )}

            {/* Action */}
            <Button
              className="w-full h-11 text-sm font-semibold gap-2"
              disabled={!isValidPayment || submitting}
              onClick={handlePayment}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {numericAmount >= effectiveRemaining
                ? `Collect Payment & Deliver — ${formatOMR(numericAmount)}`
                : `Collect Payment — ${formatOMR(numericAmount)}`}
            </Button>

            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetToScan}>
              ← Scan another order
            </Button>
          </div>
        )}

        {/* ── ALREADY PAID ── */}
        {view === "already-paid" && order && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
              <InfoRow label="Order" value={order.orderNumber} />
              <InfoRow label="Customer" value={order.customerName} />
              <InfoRow label="Status" value="Ready for Pickup" icon={<PackageCheck className="h-3.5 w-3.5 text-primary" />} />
              <InfoRow label="Total" value={formatOMR(order.totalAmount)} />
              <div className="flex justify-between font-semibold text-primary">
                <span>Fully Paid</span>
                <span><CheckCircle2 className="h-4 w-4 inline" /></span>
              </div>
            </div>
            <Button className="w-full h-11 gap-2" disabled={submitting} onClick={handleMarkDelivered}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Mark Delivered
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetToScan}>
              ← Scan another order
            </Button>
          </div>
        )}

        {/* ── ALREADY DELIVERED ── */}
        {view === "already-delivered" && order && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="font-medium">This order has already been delivered</p>
            <p className="text-sm text-muted-foreground">{order.orderNumber} • {order.customerName}</p>
            <Button variant="outline" className="w-full" onClick={resetToScan}>
              Scan Another Order
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium flex items-center gap-1">{icon}{value}</span>
    </div>
  );
}
