import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarClock, ArrowRight, Pencil, Trash2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import {
  type Expense,
  EXPENSE_CATEGORIES,
  RECURRING_PERIODS,
  updateExpense,
  deleteExpense,
} from "@/lib/expense-queries";

interface RecurringPreviewProps {
  templates: Expense[];
  onChanged?: () => Promise<void> | void;
  onGenerate?: () => Promise<void> | void;
  generating?: boolean;
}

const ordinalSuffix = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function RecurringPreview({ templates, onChanged, onGenerate, generating }: RecurringPreviewProps) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit form state
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recurringPeriod, setRecurringPeriod] = useState<string>("Monthly");
  const [billingDay, setBillingDay] = useState<string>("1");
  const [paymentSource, setPaymentSource] = useState<string>("cash");

  const openEdit = (t: Expense) => {
    setEditing(t);
    const isStandard = (EXPENSE_CATEGORIES as readonly string[]).includes(t.category);
    setCategory(isStandard ? t.category : "Custom");
    setCustomCategory(isStandard ? "" : t.category);
    setDescription(t.description || "");
    setAmount(String(t.amount));
    setRecurringPeriod(t.recurring_period || "Monthly");
    setBillingDay(String(t.billing_day || 1));
    setPaymentSource(t.payment_source || "cash");
  };

  const handleSave = async () => {
    if (!editing) return;
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const finalCategory = category === "Custom" ? customCategory.trim() : category;
    if (!finalCategory) { toast.error("Select or enter a category"); return; }
    const day = parseInt(billingDay);
    if (isNaN(day) || day < 1 || day > 31) { toast.error("Billing day must be 1–31"); return; }

    setSaving(true);
    const ok = await updateExpense(editing.id, {
      category: finalCategory,
      description: description.trim(),
      amount: amt,
      recurring_period: recurringPeriod,
      billing_day: day,
      payment_source: paymentSource,
      cash_amount: paymentSource === "cash" ? amt : 0,
      bank_amount: paymentSource === "bank" ? amt : 0,
    });
    setSaving(false);
    if (ok) {
      toast.success("Template updated");
      setEditing(null);
      await onChanged?.();
    } else {
      toast.error("Failed to update template");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    const ok = await deleteExpense(deletingId);
    setDeleting(false);
    if (ok) {
      toast.success("Template deleted");
      setDeletingId(null);
      await onChanged?.();
    } else {
      toast.error("Failed to delete template");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Recurring Expense Templates
          </CardTitle>
          {onGenerate && (
            <Button variant="outline" size="sm" onClick={() => onGenerate()} disabled={generating}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${generating ? "animate-spin" : ""}`} />
              Generate Missing Entries
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-accent/30 text-sm gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="secondary">{t.category}</Badge>
                  <span className="text-muted-foreground truncate">{t.description || t.category}</span>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-semibold">{formatOMR(t.amount)}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{t.recurring_period}</span>
                    {t.billing_day && (
                      <>
                        <ArrowRight className="h-3 w-3" />
                        <span>{ordinalSuffix(t.billing_day)} of month</span>
                      </>
                    )}
                  </div>
                  {t.next_run_date && (
                    <Badge variant="outline" className="text-xs">Next: {t.next_run_date}</Badge>
                  )}
                  {t.last_run_date && (
                    <span className="text-xs text-muted-foreground">Last: {t.last_run_date}</span>
                  )}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label="Edit template">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletingId(t.id)} aria-label="Delete template">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Recurring Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Amount (OMR)</Label>
                <Input type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Period</Label>
                <Select value={recurringPeriod} onValueChange={setRecurringPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRING_PERIODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Billing Day</Label>
                <Input type="number" min="1" max="31" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop future auto-generation for this template. Previously generated expense records will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
