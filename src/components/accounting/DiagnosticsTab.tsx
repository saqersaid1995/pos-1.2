import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Hammer } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import {
  type Account, type AccountBalance,
  buildBalanceSheet, isContraAsset,
  fetchUnbalancedEntries, type UnbalancedEntry,
  fetchLoansOutstandingTotal, fetchFixedAssetsTotals,
  fetchCustomersOutstandingTotal, fetchSuppliersOutstandingTotal,
  auditLoanJournalEntries, type LoanAuditRow,
  detectDuplicateLoanPostings, type DupLoanPosting,
  rebuildAccountingWithSummary,
} from "@/lib/accounting-queries";

interface Props {
  accounts: Account[];
  balances: AccountBalance[];
  cutoff: string;
}

interface ReconLine { label: string; gl: number; module: number; ok: boolean; }

export function DiagnosticsTab({ accounts, balances, cutoff }: Props) {
  const [loading, setLoading] = useState(true);
  const [unbalanced, setUnbalanced] = useState<UnbalancedEntry[]>([]);
  const [loanGL, setLoanGL] = useState(0);
  const [loanModule, setLoanModule] = useState(0);
  const [faCostGL, setFaCostGL] = useState(0);
  const [faAccumGL, setFaAccumGL] = useState(0);
  const [faCostMod, setFaCostMod] = useState(0);
  const [faAccumMod, setFaAccumMod] = useState(0);
  const [arGL, setArGL] = useState(0);
  const [arMod, setArMod] = useState(0);
  const [apGL, setApGL] = useState(0);
  const [apMod, setApMod] = useState(0);
  const [loanAudit, setLoanAudit] = useState<LoanAuditRow[]>([]);
  const [dupLoans, setDupLoans] = useState<DupLoanPosting[]>([]);
  const [rebuilding, setRebuilding] = useState(false);

  const reload = async () => {
    setLoading(true);
    const arAcct = balances.find((a) => a.code === "1100"); // AR (matches posting functions)
    const apAcct = balances.find((a) => a.code === "2010"); // AP
    const loanAcct = balances.find((a) => a.code === "2110"); // Bank Loan
    const faCostAcct = balances.find((a) => a.code === "1510"); // Fixed Asset cost
    const faAccumAcct = balances.find((a) => a.code === "1515"); // Accumulated Depreciation

    const [u, loanM, fa, arM, apM, audit, dup] = await Promise.all([
      fetchUnbalancedEntries(),
      fetchLoansOutstandingTotal(),
      fetchFixedAssetsTotals(),
      fetchCustomersOutstandingTotal(cutoff),
      fetchSuppliersOutstandingTotal(cutoff),
      auditLoanJournalEntries(),
      detectDuplicateLoanPostings(),
    ]);
    setUnbalanced(u);
    setLoanGL(loanAcct?.balance || 0);
    setLoanModule(loanM);
    setFaCostGL(faCostAcct?.balance || 0);
    setFaAccumGL(faAccumAcct?.balance || 0);
    setFaCostMod(fa.cost);
    setFaAccumMod(fa.accumDep);
    setArGL(arAcct?.balance || 0);
    setArMod(arM);
    setApGL(apAcct?.balance || 0);
    setApMod(apM);
    setLoanAudit(audit);
    setDupLoans(dup);
    setLoading(false);
  };

  const runRebuild = async () => {
    setRebuilding(true);
    const summary = await rebuildAccountingWithSummary();
    setRebuilding(false);
    if (!summary) { toast({ title: "Rebuild failed", variant: "destructive" }); return; }
    toast({
      title: "Rebuild complete",
      description: `Entries: ${summary.entries_before} → ${summary.entries_after}. Unbalanced: ${summary.unbalanced}.`,
    });
    reload();
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [cutoff]);

  const bs = buildBalanceSheet(balances);

  // ---- Chart of accounts issues ----
  const codeCounts = new Map<string, number>();
  for (const a of accounts) codeCounts.set(a.code, (codeCounts.get(a.code) || 0) + 1);
  const dupCodes = Array.from(codeCounts.entries()).filter(([, n]) => n > 1).map(([c]) => c);
  const missingType = accounts.filter((a) => !a.account_type);
  const missingNormal = accounts.filter((a) => !a.normal_balance);

  // ---- Contra asset validation ----
  const contraIssues = accounts.filter(
    (a) => (a.classification_type === "current_asset" || a.classification_type === "non_current_asset")
      && /accumulated|allowance|contra/i.test(a.account_name)
      && a.normal_balance !== "credit"
  );

  const contraOK = balances.filter(isContraAsset);

  const recon: ReconLine[] = [
    { label: "GL Balanced (Trial Balance)", gl: balances.reduce((s, a) => s + a.debit_total, 0), module: balances.reduce((s, a) => s + a.credit_total, 0), ok: Math.abs(balances.reduce((s, a) => s + a.debit_total - a.credit_total, 0)) < 0.01 },
    { label: "Balance Sheet (A = L + E)", gl: bs.totalAssets, module: bs.totalLiabilities + bs.totalEquity, ok: bs.isBalanced },
    { label: "Accounts Receivable", gl: arGL, module: arMod, ok: Math.abs(arGL - arMod) < 0.01 },
    { label: "Accounts Payable", gl: apGL, module: apMod, ok: Math.abs(apGL - apMod) < 0.01 },
    { label: "Loans Outstanding", gl: loanGL, module: loanModule, ok: Math.abs(loanGL - loanModule) < 0.01 },
    { label: "Fixed Assets — Cost", gl: faCostGL, module: faCostMod, ok: Math.abs(faCostGL - faCostMod) < 0.01 },
    { label: "Fixed Assets — Accum. Depreciation", gl: faAccumGL, module: faAccumMod, ok: Math.abs(faAccumGL - faAccumMod) < 0.01 },
  ];

  const allOK = recon.every((r) => r.ok) && unbalanced.length === 0 && dupCodes.length === 0 && missingType.length === 0 && missingNormal.length === 0 && contraIssues.length === 0;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Reconciliation Summary</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runRebuild} disabled={rebuilding} className="gap-1">
                {rebuilding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />} Rebuild Journal
              </Button>
              <Button size="sm" variant="outline" onClick={reload} className="gap-1"><RefreshCw className="h-3 w-3" /> Refresh</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recon.map((r) => (
              <ReconBadge key={r.label} line={r} />
            ))}
          </div>
          {allOK && (
            <div className="mt-4 p-3 rounded-md bg-success/10 border border-success/30 text-success text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> All reconciliations passed — books are clean.
            </div>
          )}
        </CardContent>
      </Card>

      {/* A. Journal Integrity */}
      <DiagSection title="Journal Integrity" ok={unbalanced.length === 0} okText="All journal entries are balanced.">
        {unbalanced.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Description</th><th className="text-right p-2">Debit</th><th className="text-right p-2">Credit</th><th className="text-right p-2">Δ</th></tr>
            </thead>
            <tbody>
              {unbalanced.slice(0, 50).map((e) => (
                <tr key={e.entry_id} className="border-b">
                  <td className="p-2 font-mono text-xs">{e.entry_date}</td>
                  <td className="p-2 text-xs">{e.description}</td>
                  <td className="p-2 text-right tabular-nums">{formatOMR(e.debit)}</td>
                  <td className="p-2 text-right tabular-nums">{formatOMR(e.credit)}</td>
                  <td className="p-2 text-right tabular-nums text-destructive">{formatOMR(e.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DiagSection>

      {/* B. Chart of Accounts Issues */}
      <DiagSection
        title="Chart of Accounts Integrity"
        ok={dupCodes.length === 0 && missingType.length === 0 && missingNormal.length === 0}
        okText="All accounts have unique codes, types, and normal balances."
      >
        <ul className="text-sm space-y-1">
          {dupCodes.length > 0 && <li className="text-destructive">Duplicate account codes: {dupCodes.join(", ")}</li>}
          {missingType.map((a) => <li key={a.id} className="text-destructive">Missing account_type: {a.code} {a.account_name}</li>)}
          {missingNormal.map((a) => <li key={a.id} className="text-destructive">Missing normal_balance: {a.code} {a.account_name}</li>)}
        </ul>
      </DiagSection>

      {/* C. Balance Sheet Validation */}
      <DiagSection title="Balance Sheet Validation" ok={bs.isBalanced} okText={`Assets ${formatOMR(bs.totalAssets)} = Liabilities + Equity ${formatOMR(bs.totalLiabilities + bs.totalEquity)}`}>
        <div className="text-sm grid grid-cols-2 gap-2">
          <div>Total Assets: <span className="tabular-nums font-medium">{formatOMR(bs.totalAssets)}</span></div>
          <div>Liabilities + Equity: <span className="tabular-nums font-medium">{formatOMR(bs.totalLiabilities + bs.totalEquity)}</span></div>
          <div className="col-span-2 text-destructive">Difference: {formatOMR(bs.difference)}</div>
        </div>
      </DiagSection>

      {/* D. Contra Asset Validation */}
      <DiagSection title="Contra Asset Validation" ok={contraIssues.length === 0} okText={`${contraOK.length} contra-asset account(s) correctly configured (credit normal balance).`}>
        <ul className="text-sm space-y-1">
          {contraIssues.map((a) => (
            <li key={a.id} className="text-destructive">{a.code} {a.account_name} should have normal_balance = credit (currently {a.normal_balance})</li>
          ))}
        </ul>
      </DiagSection>

      {/* E/F/G — recap details */}
      <DiagSection title="Module ↔ GL Reconciliation Details" ok={recon.slice(2).every((r) => r.ok)} okText="All module totals match the General Ledger.">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr><th className="text-left p-2">Account / Module</th><th className="text-right p-2">GL</th><th className="text-right p-2">Module</th><th className="text-right p-2">Difference</th><th className="text-center p-2">Status</th></tr>
          </thead>
          <tbody>
            {recon.slice(2).map((r) => (
              <tr key={r.label} className="border-b">
                <td className="p-2">{r.label}</td>
                <td className="p-2 text-right tabular-nums">{formatOMR(r.gl)}</td>
                <td className="p-2 text-right tabular-nums">{formatOMR(r.module)}</td>
                <td className={`p-2 text-right tabular-nums ${r.ok ? "" : "text-destructive font-medium"}`}>{formatOMR(r.gl - r.module)}</td>
                <td className="p-2 text-center">{r.ok ? <CheckCircle2 className="h-4 w-4 text-success inline" /> : <AlertCircle className="h-4 w-4 text-destructive inline" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DiagSection>

      {/* F. Loan Audit */}
      <DiagSection
        title="Loan Postings Audit"
        ok={dupLoans.length === 0}
        okText={`${loanAudit.length} loan-related journal entries posted. No duplicate disbursement+opening conflicts.`}
      >
        {dupLoans.length > 0 && (
          <div className="mb-3 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
            <div className="font-medium text-destructive mb-1">Loans with BOTH disbursement and opening entries (must be only one):</div>
            <ul className="list-disc pl-5">
              {dupLoans.map((d) => <li key={d.loan_id}>{d.loan_name}</li>)}
            </ul>
          </div>
        )}
        <div className="text-xs text-muted-foreground mb-2">All loan-related journal entries ({loanAudit.length}):</div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Loan</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2">Debit</th>
                <th className="text-right p-2">Credit</th>
              </tr>
            </thead>
            <tbody>
              {loanAudit.slice(0, 200).map((r) => (
                <tr key={r.entry_id} className="border-b">
                  <td className="p-2 font-mono text-xs">{r.entry_date}</td>
                  <td className="p-2 text-xs">{r.loan_name || "—"}</td>
                  <td className="p-2 text-xs"><Badge variant="outline" className="text-xs">{r.source_type}</Badge></td>
                  <td className="p-2 text-xs">{r.description}</td>
                  <td className="p-2 text-right tabular-nums">{formatOMR(r.debit_amount)}</td>
                  <td className="p-2 text-right tabular-nums">{formatOMR(r.credit_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DiagSection>
    </div>
  );
}

function ReconBadge({ line }: { line: ReconLine }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-md border ${line.ok ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"}`}>
      {line.ok ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{line.label}</div>
        {!line.ok && (
          <div className="text-xs text-muted-foreground">GL {formatOMR(line.gl)} ≠ {formatOMR(line.module)}</div>
        )}
      </div>
    </div>
  );
}

function DiagSection({ title, ok, okText, children }: { title: string; ok: boolean; okText: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
          <span>{title}</span>
          <Badge variant={ok ? "outline" : "destructive"} className="ml-auto">{ok ? "OK" : "Issues found"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ok ? <p className="text-sm text-muted-foreground">{okText}</p> : children}
      </CardContent>
    </Card>
  );
}
