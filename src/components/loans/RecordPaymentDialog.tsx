import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { recordLoanPayment, type LoanInstallment } from "@/lib/loans-queries";
import { formatOMR } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  installment: LoanInstallment | null;
  onSaved: () => void;
}

export function RecordPaymentDialog({ open, onOpenChange, loanId, installment, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [interest, setInterest] = useState("");
  const [principal, setPrincipal] = useState("");
  const [source, setSource] = useState<"cash" | "bank">("bank");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && installment) {
      const remaining = Math.max(installment.total_amount - installment.paid_amount, 0);
      setAmount(remaining.toFixed(3));
      setInterest(installment.interest_amount.toFixed(3));
      setPrincipal((remaining - installment.interest_amount).toFixed(3));
      setDate(new Date().toISOString().split("T")[0]);
      setSource("bank");
      setNotes("");
    }
  }, [open, installment]);

  const handleSave = async () => {
    const a = parseFloat(amount);
    const i = parseFloat(interest || "0");
    const p = parseFloat(principal || "0");
    if (!(a > 0)) return toast.error("Amount must be positive");
    if (Math.abs(a - (i + p)) > 0.01) return toast.error("Interest + Principal must equal Amount");
    setSaving(true);
    const ok = await recordLoanPayment({
      loan_id: loanId,
      installment_id: installment?.id ?? null,
      payment_date: date,
      amount: a,
      principal_portion: p,
      interest_portion: i,
      payment_source: source,
      notes: notes.trim(),
    });
    setSaving(false);
    if (!ok) return toast.error("Failed to record payment");
    toast.success("Payment recorded");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Loan Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {installment && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
              Installment #{installment.installment_no} due {installment.due_date} — {formatOMR(installment.total_amount)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div>
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Amount</Label><Input type="number" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Interest</Label><Input type="number" step="0.001" value={interest} onChange={(e) => setInterest(e.target.value)} /></div>
            <div><Label>Principal</Label><Input type="number" step="0.001" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="text-xs text-muted-foreground">
            JE: Dr Interest 5090 ({formatOMR(parseFloat(interest || "0"))}) + Dr Bank Loan 2110 ({formatOMR(parseFloat(principal || "0"))}) / Cr {source === "bank" ? "Bank 1020" : "Cash 1010"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
