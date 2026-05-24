import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  type Expense,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  PAYMENT_SOURCES,
  PL_LINES,
  type PLLine,
  updateExpense,
} from "@/lib/expense-queries";

interface EditExpenseDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditExpenseDialog({ expense, open, onOpenChange, onSaved }: EditExpenseDialogProps) {
  const [form, setForm] = useState<Expense | null>(expense);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(expense);
  }, [expense]);

  if (!form) return null;

  const update = <K extends keyof Expense>(key: K, value: Expense[K]) =>
    setForm({ ...form, [key]: value });

  const handlePaymentSourceChange = (src: string) => {
    if (src === "cash") {
      setForm({ ...form, payment_source: src, cash_amount: form.amount, bank_amount: 0 });
    } else if (src === "bank") {
      setForm({ ...form, payment_source: src, cash_amount: 0, bank_amount: form.amount });
    } else {
      setForm({ ...form, payment_source: src });
    }
  };

  const handleAmountChange = (val: string) => {
    const amt = parseFloat(val) || 0;
    if (form.payment_source === "cash") {
      setForm({ ...form, amount: amt, cash_amount: amt, bank_amount: 0 });
    } else if (form.payment_source === "bank") {
      setForm({ ...form, amount: amt, cash_amount: 0, bank_amount: amt });
    } else {
      setForm({ ...form, amount: amt });
    }
  };

  const handleSave = async () => {
    if (!form.pl_line) {
      toast.error("Please select Income Statement mapping");
      return;
    }
    if (form.amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (form.payment_source === "mixed") {
      const sum = Number(form.cash_amount) + Number(form.bank_amount);
      if (Math.abs(sum - form.amount) > 0.001) {
        toast.error("Cash + Bank amounts must equal total amount");
        return;
      }
    }

    setSaving(true);
    const ok = await updateExpense(form.id, {
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
      amount: form.amount,
      expense_status: form.expense_status,
      payment_source: form.payment_source,
      cash_amount: form.cash_amount,
      bank_amount: form.bank_amount,
      pl_line: form.pl_line,
    });
    setSaving(false);

    if (ok) {
      toast.success("Expense updated");
      onSaved();
      onOpenChange(false);
    } else {
      toast.error("Failed to update expense");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.expense_date} onChange={(e) => update("expense_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount (OMR)</Label>
              <Input type="number" step="0.001" min="0" value={form.amount} onChange={(e) => handleAmountChange(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Category (internal)</Label>
            <Select value={form.category} onValueChange={(v) => update("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">
              Map to Income Statement <span className="text-destructive">*</span>
            </Label>
            <Select value={form.pl_line} onValueChange={(v) => update("pl_line", v as PLLine)}>
              <SelectTrigger><SelectValue placeholder="Select line item..." /></SelectTrigger>
              <SelectContent>
                {PL_LINES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Determines where this expense appears in the Income Statement.
            </p>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Optional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Payment Source</Label>
              <Select value={form.payment_source} onValueChange={handlePaymentSourceChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_SOURCES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.expense_status} onValueChange={(v) => update("expense_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.payment_source === "mixed" && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted/30 border border-border">
              <div>
                <Label className="text-xs">Cash Amount</Label>
                <Input type="number" step="0.001" min="0" value={form.cash_amount}
                  onChange={(e) => update("cash_amount", parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Bank Amount</Label>
                <Input type="number" step="0.001" min="0" value={form.bank_amount}
                  onChange={(e) => update("bank_amount", parseFloat(e.target.value) || 0)} />
              </div>
              <p className="col-span-2 text-[10px] text-muted-foreground">
                Cash + Bank must equal total amount ({form.amount.toFixed(3)} OMR)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
