import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatOMR } from "@/lib/currency";
import { buildBalanceSheet, buildIncomeStatement, type AccountBalance } from "@/lib/accounting-queries";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

function AccountRow({ a }: { a: AccountBalance }) {
  return (
    <div className="flex justify-between items-center px-4 py-1.5 rounded hover:bg-muted/40 text-sm">
      <span className="text-muted-foreground">
        <span className="font-mono text-xs mr-2 text-muted-foreground/70">{a.code}</span>
        {a.account_name}
      </span>
      <span className="font-medium tabular-nums">{formatOMR(a.balance)}</span>
    </div>
  );
}

function SubGroup({
  title, accounts, total, defaultOpen = true,
}: { title: string; accounts: AccountBalance[]; total: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const visible = accounts.filter((a) => Math.abs(a.balance) > 0.001);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-l-2 border-muted pl-2">
      <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 rounded text-sm font-medium">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {title}
        </span>
        <span className="tabular-nums">{formatOMR(total)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="py-1">
          {visible.length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-4 py-1">No balances</div>
          ) : (
            visible.map((a) => <AccountRow key={a.id} a={a} />)
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-xs font-bold tracking-wider uppercase text-foreground/80 mt-1 mb-1">{title}</h3>;
}

/** Contra-asset group: shows balances as negative (parenthesized) and reduces the asset section. */
function ContraGroup({ title, accounts, total }: { title: string; accounts: AccountBalance[]; total: number }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-l-2 border-muted pl-2">
      <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 rounded text-sm font-medium">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {title}
        </span>
        <span className="tabular-nums text-destructive">({formatOMR(Math.abs(total))})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="py-1">
          {accounts.map((a) => (
            <div key={a.id} className="flex justify-between items-center px-4 py-1.5 rounded hover:bg-muted/40 text-sm">
              <span className="text-muted-foreground">
                <span className="font-mono text-xs mr-2 text-muted-foreground/70">{a.code}</span>
                {a.account_name}
              </span>
              <span className="font-medium tabular-nums text-destructive">({formatOMR(Math.abs(a.balance))})</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SubTotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center px-2 py-1.5 ml-2 border-t border-foreground/10 text-sm font-semibold">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatOMR(value)}</span>
    </div>
  );
}

function GrandTotal({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`flex justify-between items-center px-2 py-2 mt-1 border-t-2 ${accent ? "border-foreground/30 text-base font-bold" : "border-foreground/15 font-semibold"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatOMR(value)}</span>
    </div>
  );
}

export function BalanceSheetTab({ balances }: { balances: AccountBalance[] }) {
  const bs = useMemo(() => buildBalanceSheet(balances), [balances]);
  const is = useMemo(() => buildIncomeStatement(balances), [balances]);

  // Equity broken down: Owner's capital, Retained Earnings, Net Income (current period)
  const ownerEquity = bs.equity.filter((a) => /capital|owner/i.test(a.account_name) || a.code === "3010");
  const retained = bs.equity.filter((a) => /retain/i.test(a.account_name) || a.code === "3020");
  const otherEquity = bs.equity.filter((a) => !ownerEquity.includes(a) && !retained.includes(a));
  const ownerTotal = ownerEquity.reduce((s, a) => s + a.balance, 0);
  const retainedTotal = retained.reduce((s, a) => s + a.balance, 0);
  const otherTotal = otherEquity.reduce((s, a) => s + a.balance, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Balance Sheet</span>
          {bs.isBalanced ? (
            <Badge className="bg-success/10 text-success border-success/30 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Balanced
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Off by {formatOMR(Math.abs(bs.difference))}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ===== ASSETS ===== */}
        <div className="space-y-1">
          <SectionHeader title="Assets" />

          {/* Current Assets (gross + contra) */}
          <SubGroup title="Current Assets" accounts={bs.currentAssets} total={bs.totalCurrentAssetsGross} />
          {bs.contraCurrentAssets.length > 0 && Math.abs(bs.totalContraCurrentAssets) > 0.001 && (
            <ContraGroup title="Less: Contra Current Assets" accounts={bs.contraCurrentAssets} total={bs.totalContraCurrentAssets} />
          )}
          {Math.abs(bs.totalContraCurrentAssets) > 0.001 && (
            <SubTotalRow label="Net Current Assets" value={bs.totalCurrentAssets} />
          )}

          {/* Non-Current Assets (gross + accumulated depreciation) */}
          <SubGroup title="Non-Current Assets" accounts={bs.nonCurrentAssets} total={bs.totalNonCurrentAssetsGross} />
          {bs.contraNonCurrentAssets.length > 0 && Math.abs(bs.totalContraNonCurrentAssets) > 0.001 && (
            <ContraGroup title="Less: Accumulated Depreciation" accounts={bs.contraNonCurrentAssets} total={bs.totalContraNonCurrentAssets} />
          )}
          {Math.abs(bs.totalContraNonCurrentAssets) > 0.001 && (
            <SubTotalRow label="Net Non-Current Assets" value={bs.totalNonCurrentAssets} />
          )}

          <GrandTotal label="Total Assets" value={bs.totalAssets} accent />
        </div>

        {/* ===== LIABILITIES + EQUITY ===== */}
        <div className="space-y-4">
          <div className="space-y-1">
            <SectionHeader title="Liabilities" />
            <SubGroup title="Current Liabilities" accounts={bs.currentLiabilities} total={bs.totalCurrentLiabilities} />
            <SubGroup title="Non-Current Liabilities" accounts={bs.nonCurrentLiabilities} total={bs.totalNonCurrentLiabilities} />
            <GrandTotal label="Total Liabilities" value={bs.totalLiabilities} />
          </div>

          <div className="space-y-1">
            <SectionHeader title="Equity" />
            <div className="border-l-2 border-muted pl-2">
              {ownerEquity.length > 0 && (
                <div className="py-1">
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Owner's Equity</div>
                  {ownerEquity.map((a) => <AccountRow key={a.id} a={a} />)}
                </div>
              )}
              {(retained.length > 0 || Math.abs(retainedTotal) > 0.001) && (
                <div className="py-1">
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Retained Earnings</div>
                  {retained.length > 0
                    ? retained.map((a) => <AccountRow key={a.id} a={a} />)
                    : <div className="text-xs text-muted-foreground italic px-4 py-1">—</div>}
                </div>
              )}
              {otherEquity.length > 0 && (
                <div className="py-1">
                  {otherEquity.map((a) => <AccountRow key={a.id} a={a} />)}
                </div>
              )}
              <div className="py-1">
                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Net Income (current period)</div>
                <div className="flex justify-between items-center px-4 py-1.5 text-sm">
                  <span className="text-muted-foreground italic">From Income Statement</span>
                  <span className="font-medium tabular-nums">{formatOMR(is.netIncome)}</span>
                </div>
              </div>
            </div>
            <GrandTotal label="Total Equity" value={bs.totalEquity} />
          </div>

          <GrandTotal label="Total Liabilities + Equity" value={bs.totalLiabilities + bs.totalEquity} accent />
        </div>
      </CardContent>
    </Card>
  );
}
