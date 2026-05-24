import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import MixedPaymentInput from "./MixedPaymentInput";
import { AlertTriangle } from "lucide-react";

interface PaymentRecord {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: PaymentRecord | null;
  onSaved: () => void;
}

const METHODS = ["cash", "card", "bank-transfer", "mixed"] as const;
type Method = typeof METHODS[number];

const normalizeMethod = (m: string): Method => {
  const v = m.toLowerCase();
  if (v === "card") return "card";
  if (v === "bank" || v === "bank-transfer" || v === "transfer") return "bank-transfer";
  if (v === "mixed" || v === "partial") return "mixed";
  return "cash";
};

export default function EditPaymentModal({ open, onOpenChange, payment, onSaved }: Props) {
  const { profile, role } = useAuth();
  const isAdmin = role === "admin";

  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [transfer, setTransfer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    const m = normalizeMethod(payment.paymentMethod);
    setMethod(m);
    setAmount(payment.amount.toFixed(3));
    // Convert to local datetime-local format
    const d = new Date(payment.paymentDate);
    const pad = (n: number) => String(n).padStart(2, "0");
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setReason("");
    setCash(""); setCard(""); setTransfer("");
  }, [payment]);

  if (!payment) return null;

  const amt = parseFloat(amount) || 0;
  const splitTotal = (parseFloat(cash) || 0) + (parseFloat(card) || 0) + (parseFloat(transfer) || 0);
  const splitMismatch = method === "mixed" && Math.abs(splitTotal - amt) > 0.0005;

  const methodToDb = (m: Method) => (m === "bank-transfer" ? "bank" : m);

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error("Only admins can edit payments.");
      return;
    }
    if (amt <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    if (splitMismatch) {
      toast.error("Split total must equal payment amount.");
      return;
    }
    if (!confirm("This will update cash/bank balances and accounting journals. Continue?")) return;

    setSaving(true);
    const payload: any = {
      method: methodToDb(method),
      amount: amt,
      payment_date: new Date(date).toISOString(),
      reason: reason.trim(),
      changed_by: profile?.full_name || profile?.username || "admin",
    };

    if (method === "mixed") {
      payload.splits = [
        { method: "cash", amount: parseFloat(cash) || 0 },
        { method: "card", amount: parseFloat(card) || 0 },
        { method: "bank", amount: parseFloat(transfer) || 0 },
      ].filter((s) => s.amount > 0);
    }

    const { error } = await supabase.rpc("correct_payment", {
      _payment_id: payment.id,
      _payload: payload,
    });
    setSaving(false);
    if (error) {
      toast.error(`Failed to update payment: ${error.message}`);
      return;
    }
    toast.success("Payment updated. Cash/Bank and journals re-posted.");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
        </DialogHeader>

        {!isAdmin && (
          <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-md p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Only admins can edit payments.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Original</Label>
            <p className="text-sm text-muted-foreground">
              {formatOMR(payment.amount)} • {payment.paymentMethod} •{" "}
              {new Date(payment.paymentDate).toLocaleString()}
            </p>
          </div>

          <div>
            <Label className="text-xs">Payment Method</Label>
            <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="cash" className="text-xs">Cash</TabsTrigger>
                <TabsTrigger value="card" className="text-xs">Card</TabsTrigger>
                <TabsTrigger value="bank-transfer" className="text-xs">Bank</TabsTrigger>
                <TabsTrigger value="mixed" className="text-xs">Mixed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div>
            <Label className="text-xs">Amount (OMR)</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {method === "mixed" && (
            <MixedPaymentInput
              cashAmount={cash}
              cardAmount={card}
              transferAmount={transfer}
              onCashChange={setCash}
              onCardChange={setCard}
              onTransferChange={setTransfer}
              remainingBalance={amt}
            />
          )}

          <div>
            <Label className="text-xs">Payment Date / Time</Label>
            <Input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Correction Reason</Label>
            <Textarea
              placeholder="e.g. cashier selected wrong method"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!isAdmin || saving || splitMismatch}>
            {saving ? "Saving..." : "Save Correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
