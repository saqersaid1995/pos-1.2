import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { fetchAccountLedger, type AccountBalance, type LedgerRow } from "@/lib/accounting-queries";

export function TrialBalanceTab({ balances }: { balances: AccountBalance[] }) {
  const [search, setSearch] = useState("");
  const [drillAccount, setDrillAccount] = useState<AccountBalance | null>(null);

  const rows = useMemo(() => {
    return balances
      .filter((a) => a.is_active)
      .filter((a) =>
        !search ||
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.account_name.toLowerCase().includes(search.toLowerCase()) ||
        a.account_type.toLowerCase().includes(search.toLowerCase())
      )
      .filter((a) => a.debit_total !== 0 || a.credit_total !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [balances, search]);

  const totalDebits = rows.reduce((s, a) => s + a.debit_total, 0);
  const totalCredits = rows.reduce((s, a) => s + a.credit_total, 0);
  const diff = Number((totalDebits - totalCredits).toFixed(3));
  const balanced = Math.abs(diff) < 0.01;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span>Trial Balance</span>
            {balanced ? (
              <Badge className="bg-success/10 text-success border-success/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Balanced
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" /> Unbalanced — diff {formatOMR(diff)}
              </Badge>
            )}
          </div>
          <Input
            className="max-w-xs"
            placeholder="Search code, name, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!balanced && (
          <div className="mb-3 p-3 rounded-md border border-destructive/40 bg-destructive/5 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Unbalanced books — total debits and credits differ by {formatOMR(diff)}.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2 w-20">Code</th>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2 w-28">Type</th>
                <th className="text-center p-2 w-20">Normal</th>
                <th className="text-right p-2 w-32">Debit</th>
                <th className="text-right p-2 w-32">Credit</th>
                <th className="text-right p-2 w-32">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const bal = a.normal_balance === "debit"
                  ? a.debit_total - a.credit_total
                  : a.credit_total - a.debit_total;
                return (
                  <tr
                    key={a.id}
                    className="border-b hover:bg-muted/40 cursor-pointer"
                    onClick={() => setDrillAccount(a)}
                  >
                    <td className="p-2 font-mono text-xs">{a.code}</td>
                    <td className="p-2">{a.account_name}</td>
                    <td className="p-2 text-xs text-muted-foreground">{a.account_type}</td>
                    <td className="p-2 text-center text-xs uppercase">{a.normal_balance}</td>
                    <td className="p-2 text-right tabular-nums">{a.debit_total > 0 ? formatOMR(a.debit_total) : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{a.credit_total > 0 ? formatOMR(a.credit_total) : "—"}</td>
                    <td className={`p-2 text-right tabular-nums font-medium ${bal < 0 ? "text-destructive" : ""}`}>
                      {formatOMR(bal)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No accounts with activity.</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 font-semibold">
              <tr>
                <td colSpan={4} className="p-2 text-right">Totals</td>
                <td className="p-2 text-right tabular-nums">{formatOMR(totalDebits)}</td>
                <td className="p-2 text-right tabular-nums">{formatOMR(totalCredits)}</td>
                <td className={`p-2 text-right tabular-nums ${balanced ? "text-success" : "text-destructive"}`}>
                  {balanced ? "Balanced" : `Δ ${formatOMR(diff)}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>

      <LedgerDialog account={drillAccount} onClose={() => setDrillAccount(null)} />
    </Card>
  );
}

function LedgerDialog({ account, onClose }: { account: AccountBalance | null; onClose: () => void }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    fetchAccountLedger(account.id).then((r) => { setRows(r); setLoading(false); });
  }, [account]);

  if (!account) return null;
  const sign = account.normal_balance === "debit" ? 1 : -1;
  let running = 0;

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{account.code}</span>
            <span>{account.account_name}</span>
            <Badge variant="outline" className="ml-2">{account.account_type}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No transactions for this account.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
                <tr>
                  <th className="text-left p-2 w-24">Date</th>
                  <th className="text-left p-2 w-24">Source</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2 w-28">Debit</th>
                  <th className="text-right p-2 w-28">Credit</th>
                  <th className="text-right p-2 w-32">Running</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  running += sign * (r.debit - r.credit);
                  return (
                    <tr key={r.entry_id + r.debit + r.credit + Math.random()} className="border-b">
                      <td className="p-2 font-mono text-xs">{r.entry_date}</td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{r.source_type}</Badge></td>
                      <td className="p-2 text-xs">
                        {r.description}
                        {r.line_description && <span className="text-muted-foreground italic"> — {r.line_description}</span>}
                      </td>
                      <td className="p-2 text-right tabular-nums">{r.debit > 0 ? formatOMR(r.debit) : ""}</td>
                      <td className="p-2 text-right tabular-nums">{r.credit > 0 ? formatOMR(r.credit) : ""}</td>
                      <td className="p-2 text-right tabular-nums font-medium">{formatOMR(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
