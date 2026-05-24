import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { calcInstallment, createLoan } from "@/lib/loans-queries";
import { formatOMR } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

const today = () => new Date().toISOString().split("T")[0];
const addMonthsISO = (iso: string, months: number) => {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
};

export function NewLoanDialog({ open, onOpenChange, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [loanType, setLoanType] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("0");
  const [start, setStart] = useState(today());
  const [term, setTerm] = useState("12");
  const [installment, setInstallment] = useState("");
  const [notes, setNotes] = useState("");

  // Existing-loan fields
  const [originalPrincipal, setOriginalPrincipal] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [firstDisbursement, setFirstDisbursement] = useState("");
  const [nextPayment, setNextPayment] = useState(addMonthsISO(today(), 1));
  const [attachmentUrl, setAttachmentUrl] = useState("");

  useEffect(() => {
    if (!open) {
      setLoanType("new");
      setName(""); setBank(""); setPrincipal(""); setRate("0"); setTerm("12");
      setInstallment(""); setNotes(""); setStart(today());
      setOriginalPrincipal(""); setOutstanding(""); setFirstDisbursement("");
      setNextPayment(addMonthsISO(today(), 1)); setAttachmentUrl("");
    }
  }, [open]);

  // Effective principal used for schedule = outstanding (existing) or principal (new)
  const effectivePrincipal = useMemo(() => {
    return loanType === "existing"
      ? parseFloat(outstanding) || 0
      : parseFloat(principal) || 0;
  }, [loanType, outstanding, principal]);

  const suggested = calcInstallment(effectivePrincipal, parseFloat(rate) || 0, parseInt(term) || 0);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Loan name is required");
    if (!bank.trim()) return toast.error("Bank name is required");
    const r = parseFloat(rate);
    const t = parseInt(term);
    if (!(r >= 0)) return toast.error("Interest rate must be ≥ 0");
    if (!(t > 0)) return toast.error("Remaining term must be ≥ 1 month");

    let p: number;
    let payload: Parameters<typeof createLoan>[0];

    if (loanType === "existing") {
      p = parseFloat(outstanding);
      if (!(p > 0)) return toast.error("Outstanding balance must be positive");
      const orig = parseFloat(originalPrincipal) || p;
      if (!nextPayment) return toast.error("Next payment date is required");
      payload = {
        loan_name: name.trim(),
        bank_name: bank.trim(),
        principal: p, // outstanding becomes the schedule basis
        annual_interest_rate: r,
        start_date: firstDisbursement || start,
        term_months: t,
        installment_amount: installment ? parseFloat(installment) : 0,
        notes: notes.trim(),
        loan_type: "existing",
        original_principal: orig,
        outstanding_balance: p,
        first_disbursement_date: firstDisbursement || null,
        next_payment_date: nextPayment,
        attachment_url: attachmentUrl.trim(),
      };
    } else {
      p = parseFloat(principal);
      if (!(p > 0)) return toast.error("Principal must be positive");
      payload = {
        loan_name: name.trim(),
        bank_name: bank.trim(),
        principal: p,
        annual_interest_rate: r,
        start_date: start,
        term_months: t,
        installment_amount: installment ? parseFloat(installment) : 0,
        notes: notes.trim(),
        loan_type: "new",
        original_principal: p,
        outstanding_balance: p,
      };
    }

    setSaving(true);
    const { id, error } = await createLoan(payload);
    setSaving(false);
    if (!id) return toast.error(error || "Failed to create loan");
    toast.success(loanType === "existing" ? "Existing loan recorded as opening balance" : "Loan created and journal posted");
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Loan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">Loan Type</Label>
            <RadioGroup value={loanType} onValueChange={(v) => setLoanType(v as any)} className="grid grid-cols-2 gap-2">
              <label className={`flex items-start gap-2 border rounded-md p-3 cursor-pointer ${loanType === "new" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="new" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">New Loan</div>
                  <div className="text-xs text-muted-foreground">Disbursed now. Posts Dr Bank / Cr Loan.</div>
                </div>
              </label>
              <label className={`flex items-start gap-2 border rounded-md p-3 cursor-pointer ${loanType === "existing" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="existing" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Existing Loan</div>
                  <div className="text-xs text-muted-foreground">Opening balance. No bank inflow.</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Loan Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Bank Name *</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} /></div>
          </div>

          {loanType === "new" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Principal (OMR) *</Label><Input type="number" step="0.001" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
                <div><Label>Interest % / yr</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
                <div><Label>Term (months) *</Label><Input type="number" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div>
                  <Label>Installment (optional)</Label>
                  <Input type="number" step="0.001" value={installment} placeholder={suggested ? suggested.toFixed(3) : "auto"} onChange={(e) => setInstallment(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Original Loan Amount</Label>
                  <Input type="number" step="0.001" value={originalPrincipal} onChange={(e) => setOriginalPrincipal(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Outstanding @ Cutoff *</Label>
                  <Input type="number" step="0.001" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Interest % / yr</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
                <div><Label>Remaining Term (months) *</Label><Input type="number" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
                <div>
                  <Label>Installment (optional)</Label>
                  <Input type="number" step="0.001" value={installment} placeholder={suggested ? suggested.toFixed(3) : "auto"} onChange={(e) => setInstallment(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Disbursement Date</Label>
                  <Input type="date" value={firstDisbursement} onChange={(e) => setFirstDisbursement(e.target.value)} />
                </div>
                <div>
                  <Label>Next Payment Date *</Label>
                  <Input type="date" value={nextPayment} onChange={(e) => setNextPayment(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Loan Schedule URL (optional)</Label>
                <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="Link to PDF/image" />
              </div>
            </>
          )}

          {suggested > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
              Suggested monthly installment: <span className="font-semibold text-foreground">{formatOMR(suggested)}</span>
            </div>
          )}
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            {loanType === "new" ? (
              <>On save: <b>Dr Bank (1020) / Cr Bank Loan (2110)</b> for {principal ? formatOMR(parseFloat(principal)) : "—"}</>
            ) : (
              <>On save: <b>Dr Owner's Equity (3010) / Cr Bank Loan (2110)</b> for {outstanding ? formatOMR(parseFloat(outstanding)) : "—"} (no cash inflow)</>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create Loan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
