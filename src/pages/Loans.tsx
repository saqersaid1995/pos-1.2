import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  fetchLoans, fetchInstallments, fetchLoanPayments, softDeleteLoan, fetchLoanSplitSummary,
  type Loan, type LoanInstallment, type LoanPayment, type LoanSummary,
} from "@/lib/loans-queries";
import { formatOMR } from "@/lib/currency";
import { NewLoanDialog } from "@/components/loans/NewLoanDialog";
import { RecordPaymentDialog } from "@/components/loans/RecordPaymentDialog";

export default function Loans() {
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<LoanSummary>({ total_outstanding: 0, current_portion: 0, non_current_portion: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Record<string, LoanInstallment[]>>({});
  const [payments, setPayments] = useState<Record<string, LoanPayment[]>>({});
  const [showNew, setShowNew] = useState(false);
  const [payTarget, setPayTarget] = useState<{ loanId: string; inst: LoanInstallment | null } | null>(null);

  const reload = async () => {
    setLoading(true);
    const [ls, sm] = await Promise.all([fetchLoans(), fetchLoanSplitSummary()]);
    setLoans(ls);
    setSummary(sm);
    setLoading(false);
    if (expanded) await loadDetails(expanded);
  };

  const loadDetails = async (loanId: string) => {
    const [inst, pays] = await Promise.all([fetchInstallments(loanId), fetchLoanPayments(loanId)]);
    setInstallments((m) => ({ ...m, [loanId]: inst }));
    setPayments((m) => ({ ...m, [loanId]: pays }));
  };

  useEffect(() => { reload(); }, []);

  const totalLoans = useMemo(() => loans.reduce((s, l) => s + l.principal, 0), [loans]);

  const handleDelete = async (l: Loan) => {
    if (!confirm(`Delete loan "${l.loan_name}"? This will reverse the disbursement journal entry.`)) return;
    const ok = await softDeleteLoan(l.id);
    if (!ok) return toast.error("Failed to delete");
    toast.success("Loan deleted");
    reload();
  };

  const toggle = async (loanId: string) => {
    if (expanded === loanId) { setExpanded(null); return; }
    setExpanded(loanId);
    if (!installments[loanId]) await loadDetails(loanId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Loans" />
      <div className="p-4 max-w-[1600px] mx-auto space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryCard label="Total Loans (Principal)" value={formatOMR(totalLoans)} />
          <SummaryCard label="Total Outstanding" value={formatOMR(summary.total_outstanding)} accent />
          <SummaryCard label="Current Portion (≤12mo)" value={formatOMR(summary.current_portion)} />
          <SummaryCard label="Non-Current Portion" value={formatOMR(summary.non_current_portion)} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>All Loans</CardTitle>
            <Button onClick={() => setShowNew(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Loan
            </Button>
          </CardHeader>
          <CardContent>
            {loans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No loans yet. Click "New Loan" to add one.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Loan</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Term</TableHead>
                    <TableHead className="text-right">Installment</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((l) => {
                    const inst = installments[l.id] || [];
                    const next = inst.find((i) => !i.is_paid);
                    const outstanding = inst.filter((i) => !i.is_paid).reduce((s, i) => s + i.principal_amount, 0);
                    const isExpanded = expanded === l.id;
                    return (
                      <>
                        <TableRow key={l.id} className="cursor-pointer" onClick={() => toggle(l.id)}>
                          <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {l.loan_name}
                              {l.loan_type === "existing" && <Badge variant="outline" className="text-[10px]">Opening</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>{l.bank_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatOMR(l.principal)}</TableCell>
                          <TableCell className="text-right">{l.annual_interest_rate}%</TableCell>
                          <TableCell className="text-right">{l.term_months}m</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatOMR(l.installment_amount)}</TableCell>
                          <TableCell className="text-sm">{next ? next.due_date : <Badge variant="secondary">Closed</Badge>}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {inst.length > 0 ? formatOMR(outstanding) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(l); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 p-4">
                              <ScheduleView
                                loan={l}
                                installments={inst}
                                payments={payments[l.id] || []}
                                onPay={(i) => setPayTarget({ loanId: l.id, inst: i })}
                                onPartial={() => setPayTarget({ loanId: l.id, inst: null })}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <NewLoanDialog open={showNew} onOpenChange={setShowNew} onCreated={reload} />
      <RecordPaymentDialog
        open={!!payTarget}
        onOpenChange={(v) => !v && setPayTarget(null)}
        loanId={payTarget?.loanId || ""}
        installment={payTarget?.inst ?? null}
        onSaved={reload}
      />
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ScheduleView({
  loan, installments, payments, onPay, onPartial,
}: {
  loan: Loan;
  installments: LoanInstallment[];
  payments: LoanPayment[];
  onPay: (i: LoanInstallment) => void;
  onPartial: () => void;
}) {
  const totalInterest = installments.reduce((s, i) => s + i.interest_amount, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">Total interest over life:</span>{" "}
          <span className="font-semibold">{formatOMR(totalInterest)}</span>
          <span className="text-muted-foreground ml-3">Total to repay:</span>{" "}
          <span className="font-semibold">{formatOMR(loan.principal + totalInterest)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={onPartial}>+ Early/Partial Payment</Button>
      </div>
      <div className="rounded border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {installments.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.installment_no}</TableCell>
                <TableCell className="text-sm">{i.due_date}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatOMR(i.interest_amount)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatOMR(i.principal_amount)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatOMR(i.total_amount)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatOMR(i.remaining_balance)}</TableCell>
                <TableCell>
                  {i.is_paid ? <Badge variant="secondary">Paid</Badge>
                    : i.paid_amount > 0 ? <Badge>Partial</Badge>
                    : <Badge variant="outline">Pending</Badge>}
                </TableCell>
                <TableCell>
                  {!i.is_paid && (
                    <Button size="sm" variant="outline" onClick={() => onPay(i)}>Pay</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {payments.length > 0 && (
        <div className="rounded border bg-background">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Payment History</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.payment_date}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatOMR(p.amount)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatOMR(p.interest_portion)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatOMR(p.principal_portion)}</TableCell>
                  <TableCell className="capitalize text-sm">{p.payment_source}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
