import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import { toLocalDateStr } from "@/lib/utils";
import {
  type Expense,
  type ExpensePayment,
  fetchExpensePayments,
  addExpensePayment,
  deleteExpensePayment,
} from "@/lib/expense-queries";

interface PaymentDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void> | void;
}

export function ExpensePaymentDialog({ expense, open, onOpenChange, onChanged }: PaymentDialogProps) {
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => toLocalDateStr());
  const [source, setSource] = useState<string>("cash");
  const [notes, setNotes] = useState("");

  const remaining = expense ? expense.remaining_amount : 0;

  const load = async () => {
    if (!expense) return;
    setLoading(true);
    setPayments(await fetchExpensePayments(expense.id));
    setLoading(false);
  };

  useEffect(() => {
    if (open && expense) {
      setAmount(remaining > 0 ? remaining.toFixed(3) : "");
      setDate(toLocalDateStr());
      setSource(expense.payment_source || "cash");
      setNotes("");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  if (!expense) return null;

  const handleAdd = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid payment amount"); return; }
    if (amt > remaining + 0.001) {
      toast.error(`Payment cannot exceed remaining balance of ${formatOMR(remaining)}`);
      return;
    }
    setSaving(true);
    const ok = await addExpensePayment({
      expense_id: expense.id,
      amount: amt,
      payment_date: date,
      payment_source: source,
      notes: notes.trim(),
    });
    setSaving(false);
    if (!ok) { toast.error("Failed to add payment"); return; }
    toast.success("Payment recorded");
    setAmount("");
    setNotes("");
    await load();
    await onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    const ok = await deleteExpensePayment(id);
    if (!ok) { toast.error("Failed to delete"); return; }
    toast.success("Payment removed");
    await load();
    await onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payments — {expense.description || expense.category}</DialogTitle>
          <DialogDescription>
            Total {formatOMR(expense.amount)} • Paid {formatOMR(expense.paid_amount)} •{" "}
            <span className={remaining > 0.001 ? "text-destructive font-medium" : "text-success font-medium"}>
              Remaining {formatOMR(remaining)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Add payment form */}
        {remaining > 0.001 && (
          <div className="rounded-lg border border-border p-3 space-y-3 bg-accent/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Payment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount (OMR)</Label>
                <Input type="number" step="0.001" min="0" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0.000" />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAmount(remaining.toFixed(3))}>
                Pay full ({formatOMR(remaining)})
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Add Payment
              </Button>
            </div>
          </div>
        )}

        {/* Payment history */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment History
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
            </p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">No payments yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatOMR(p.amount)}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{p.payment_source}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{p.payment_date}{p.notes ? ` • ${p.notes}` : ""}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(p.id)} title="Delete payment">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
