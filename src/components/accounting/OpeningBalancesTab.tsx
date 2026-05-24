import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import {
  type Account, type AccountingSettings,
  fetchOpeningBalances, postOpeningBalances, rebuildAccounting,
} from "@/lib/accounting-queries";

interface Props {
  accounts: Account[];
  settings: AccountingSettings | null;
  onChanged: () => void;
}

const SECTIONS: { key: string; label: string; classification: string; type: "Asset" | "Liability" }[] = [
  { key: "ca",  label: "Current Assets",        classification: "current_asset",        type: "Asset" },
  { key: "nca", label: "Non-Current Assets",    classification: "non_current_asset",    type: "Asset" },
  { key: "cl",  label: "Current Liabilities",   classification: "current_liability",    type: "Liability" },
  { key: "ncl", label: "Non-Current Liabilities", classification: "non_current_liability", type: "Liability" },
];

export function OpeningBalancesTab({ accounts, settings, onChanged }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const equityAccount = useMemo(
    () => accounts.find((a) => a.code === "3010") || accounts.find((a) => a.account_type === "Equity"),
    [accounts]
  );

  const editableAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "Asset" || a.account_type === "Liability"),
    [accounts]
  );

  useEffect(() => {
    (async () => {
      const map = await fetchOpeningBalances();
      const v: Record<string, string> = {};
      for (const a of editableAccounts) {
        if (map[a.id]) v[a.id] = String(map[a.id]);
      }
      setValues(v);
      setLoaded(true);
    })();
  }, [editableAccounts.length]);

  const num = (id: string) => Number(values[id] || 0) || 0;

  const totals = useMemo(() => {
    let assets = 0, liabilities = 0;
    for (const a of editableAccounts) {
      const v = num(a.id);
      if (a.account_type === "Asset") assets += v;
      else if (a.account_type === "Liability") liabilities += v;
    }
    const equity = assets - liabilities;
    return { assets, liabilities, equity };
  }, [values, editableAccounts]);

  const handleSave = async () => {
    if (!equityAccount) { toast.error("No equity account found"); return; }
    setBusy(true);
    const lines = editableAccounts
      .map((a) => ({ account_id: a.id, amount: num(a.id) }))
      .filter((l) => l.amount > 0);
    const ok = await postOpeningBalances(lines, equityAccount.id);
    if (!ok) { toast.error("Failed to save opening balances"); setBusy(false); return; }
    await rebuildAccounting();
    toast.success("Opening balances saved and journal rebuilt");
    onChanged();
    setBusy(false);
  };

  const renderRow = (a: Account) => (
    <div key={a.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-muted/40">
      <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
        <span className="font-mono text-xs text-muted-foreground w-12">{a.code}</span>
        <span className="truncate">{a.account_name}</span>
      </div>
      <Input
        type="number" inputMode="decimal" step="0.001" min="0"
        value={values[a.id] ?? ""} placeholder="0.000"
        onChange={(e) => setValues((s) => ({ ...s, [a.id]: e.target.value }))}
        className="w-32 h-8 text-right tabular-nums"
      />
    </div>
  );

  const renderSection = (key: string) => {
    const sec = SECTIONS.find((s) => s.key === key)!;
    const list = editableAccounts.filter((a) => a.classification_type === sec.classification);
    const total = list.reduce((s, a) => s + num(a.id), 0);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
          <span>{sec.label}</span>
          <span className="tabular-nums">{formatOMR(total)}</span>
        </div>
        <div className="border-l-2 border-muted pl-1">
          {list.length === 0
            ? <div className="text-xs text-muted-foreground italic px-3 py-1">No accounts</div>
            : list.map(renderRow)}
        </div>
      </div>
    );
  };

  const cutoff = settings?.accounting_start_date || "—";
  const balanced = Math.abs(totals.assets - (totals.liabilities + totals.equity)) < 0.001;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Enter balances <strong className="text-foreground">as of {cutoff}</strong>. They will be posted as a single journal dated one day before the cutoff. Owner's Equity is computed automatically as the balancing figure (Assets − Liabilities).
            </div>
          </div>
          <div className="flex items-center gap-2">
            {balanced ? (
              <Badge className="bg-success/10 text-success border-success/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Balanced
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Off
              </Badge>
            )}
            <Button onClick={handleSave} disabled={busy || !loaded} size="sm">
              <Save className="h-4 w-4 mr-1" /> Save Opening Balances
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assets</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {renderSection("ca")}
            {renderSection("nca")}
            <div className="flex justify-between border-t-2 border-foreground/30 pt-2 px-2 font-bold">
              <span>Total Assets</span>
              <span className="tabular-nums">{formatOMR(totals.assets)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Liabilities &amp; Equity</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {renderSection("cl")}
            {renderSection("ncl")}
            <div className="flex justify-between border-t border-foreground/15 pt-2 px-2 font-semibold">
              <span>Total Liabilities</span>
              <span className="tabular-nums">{formatOMR(totals.liabilities)}</span>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Equity (auto-balanced)</div>
              <div className="border-l-2 border-muted pl-1">
                <div className="flex items-center justify-between px-2 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground w-12">{equityAccount?.code || "3010"}</span>
                    <span>{equityAccount?.account_name || "Owner's Equity"}</span>
                  </span>
                  <span className="tabular-nums font-medium">{formatOMR(totals.equity)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between border-t-2 border-foreground/30 pt-2 px-2 font-bold">
              <span>Total Liabilities + Equity</span>
              <span className="tabular-nums">{formatOMR(totals.liabilities + totals.equity)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
