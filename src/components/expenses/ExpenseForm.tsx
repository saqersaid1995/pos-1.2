import { useState, useEffect } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  EXPENSE_CATEGORIES,
  RECURRING_PERIODS,
  PL_LINES,
  autoMapIncomeCategory,
  suggestPLLine,
  createExpense,
  type PLLine,
} from "@/lib/expense-queries";
import { formatOMR } from "@/lib/currency";

interface ExpenseFormProps {
  onSaved: () => Promise<void>;
}

export function ExpenseForm({ onSaved }: ExpenseFormProps) {
  const [date, setDate] = useState(() => toLocalDateStr());
  const [category, setCategory] = useState("Other");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState<string>("Monthly");
  const [billingDay, setBillingDay] = useState<string>("1");
  const [expenseStatus, setExpenseStatus] = useState<string>("paid");
  const [saving, setSaving] = useState(false);
  const [paymentSource, setPaymentSource] = useState<string>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [bankAmount, setBankAmount] = useState("");
  const [plLine, setPlLine] = useState<PLLine | "">("");
  const [plLineTouched, setPlLineTouched] = useState(false);

  // Auto-suggest pl_line when category changes (only if user hasn't manually overridden it)
  useEffect(() => {
    if (!plLineTouched) {
      const finalCategory = category === "Custom" ? customCategory.trim() : category;
      if (finalCategory) setPlLine(suggestPLLine(finalCategory));
    }
  }, [category, customCategory, plLineTouched]);

  const amt = parseFloat(amount) || 0;

  // Auto-fill cash/bank amounts when source or total changes
  useEffect(() => {
    if (paymentSource === "cash") {
      setCashAmount(amt > 0 ? amt.toFixed(3) : "");
      setBankAmount("0");
    } else if (paymentSource === "bank") {
      setCashAmount("0");
      setBankAmount(amt > 0 ? amt.toFixed(3) : "");
    }
  }, [paymentSource, amt]);

  const mixedTotal = (parseFloat(cashAmount) || 0) + (parseFloat(bankAmount) || 0);
  const mixedDiff = amt - mixedTotal;
  const mixedValid = paymentSource !== "mixed" || Math.abs(mixedDiff) < 0.001;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const finalCategory = category === "Custom" ? customCategory.trim() : category;
    if (!finalCategory) { toast.error("Select or enter a category"); return; }
    if (!plLine) { toast.error("Please map this expense to an Income Statement line"); return; }

    if (isRecurring && recurringPeriod === "Monthly") {
      const day = parseInt(billingDay);
      if (isNaN(day) || day < 1 || day > 31) {
        toast.error("Billing day must be between 1 and 31");
        return;
      }
    }

    if (!mixedValid) {
      toast.error(`Cash + Bank must equal ${formatOMR(amt)}. Difference: ${formatOMR(Math.abs(mixedDiff))}`);
      return;
    }

    const finalCash = paymentSource === "cash" ? amt : paymentSource === "bank" ? 0 : parseFloat(cashAmount) || 0;
    const finalBank = paymentSource === "bank" ? amt : paymentSource === "cash" ? 0 : parseFloat(bankAmount) || 0;

    setSaving(true);
    const ok = await createExpense({
      expense_date: date,
      due_date: date,
      category: finalCategory,
      description: description.trim(),
      amount: amt,
      is_recurring: isRecurring,
      recurring_period: isRecurring ? recurringPeriod : null,
      billing_day: isRecurring ? parseInt(billingDay) || 1 : null,
      payment_source: paymentSource,
      cash_amount: finalCash,
      bank_amount: finalBank,
      income_category: autoMapIncomeCategory(finalCategory),
      pl_line: plLine,
      // If user marks it Paid, create an initial payment record for the full amount
      initialPaid: !isRecurring && expenseStatus === "paid" ? amt : 0,
    });
    setSaving(false);

    if (ok) {
      toast.success("Expense recorded");
      setDescription("");
      setAmount("");
      setIsRecurring(false);
      setExpenseStatus("paid");
      setPaymentSource("cash");
      setCashAmount("");
      setBankAmount("");
      setPlLine("");
      setPlLineTouched(false);
      await onSaved();
    } else {
      toast.error("Failed to save expense");
    }
  };

  const ordinalSuffix = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" /> Record Expense
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="Custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {category === "Custom" && (
                <Input placeholder="Custom category" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="mt-1.5" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="e.g. Monthly rent" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (OMR)</Label>
              <Input type="number" step="0.001" min="0" placeholder="0.000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Map to Income Statement <span className="text-destructive">*</span>
            </Label>
            <Select
              value={plLine}
              onValueChange={(v) => { setPlLine(v as PLLine); setPlLineTouched(true); }}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select an Income Statement line…" />
              </SelectTrigger>
              <SelectContent>
                {PL_LINES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Required. Determines where this expense appears on the Income Statement.
              {!plLineTouched && plLine && <> Auto-suggested from category — you can change it.</>}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={expenseStatus} onValueChange={setExpenseStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="accrued">Accrued (Due, not paid)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Payment Source</Label>
              <Select value={paymentSource} onValueChange={setPaymentSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
              <Label>Recurring</Label>
              {isRecurring && (
                <Select value={recurringPeriod} onValueChange={setRecurringPeriod}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRING_PERIODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {isRecurring && (
              <div className="space-y-1.5">
                <Label>Billing Day (1–31)</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value)}
                  placeholder="1"
                />
              </div>
            )}
          </div>

          {/* Mixed payment split fields */}
          {paymentSource === "mixed" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end p-3 rounded-lg bg-accent/50">
              <div className="space-y-1.5">
                <Label>Cash Amount (OMR)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bank Amount (OMR)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={bankAmount}
                  onChange={(e) => setBankAmount(e.target.value)}
                />
              </div>
              <div className="text-sm">
                {amt > 0 && (
                  <p className={`font-medium ${mixedValid ? "text-[hsl(142,72%,40%)]" : "text-destructive"}`}>
                    {mixedValid
                      ? `✓ Total: ${formatOMR(mixedTotal)}`
                      : `Difference: ${formatOMR(Math.abs(mixedDiff))} ${mixedDiff > 0 ? "remaining" : "over"}`
                    }
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-end">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Expense
            </Button>
          </div>

          {/* Recurring preview */}
          {isRecurring && billingDay && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span>
                This expense will be generated every <strong>{ordinalSuffix(parseInt(billingDay) || 1)}</strong> day of the {recurringPeriod === "Weekly" ? "week" : recurringPeriod === "Yearly" ? "year" : "month"} as an accrued expense.
              </span>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
