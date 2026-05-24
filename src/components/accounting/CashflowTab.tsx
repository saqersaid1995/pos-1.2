import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatOMR } from "@/lib/currency";
import { type AccountBalance } from "@/lib/accounting-queries";

export function CashflowTab({ balances }: { balances: AccountBalance[] }) {
  const cash = balances.find((a) => a.code === "1010");
  const bank = balances.find((a) => a.code === "1020");

  const cashIn = (cash?.debit_total || 0) + (bank?.debit_total || 0);
  const cashOut = (cash?.credit_total || 0) + (bank?.credit_total || 0);
  const net = cashIn - cashOut;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Cash on Hand</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-bold tabular-nums">{formatOMR(cash?.balance || 0)}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Bank Account</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-bold tabular-nums">{formatOMR(bank?.balance || 0)}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Combined Cash Position</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-bold tabular-nums text-primary">{formatOMR((cash?.balance || 0) + (bank?.balance || 0))}</div></CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader><CardTitle className="text-base">Cashflow Summary (since cutoff)</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-w-xl">
          <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Total Cash In</span><span className="font-medium text-success tabular-nums">+ {formatOMR(cashIn)}</span></div>
          <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Total Cash Out</span><span className="font-medium text-destructive tabular-nums">- {formatOMR(cashOut)}</span></div>
          <div className="flex justify-between py-2 border-t font-semibold"><span>Net Cashflow</span><span className={`tabular-nums ${net >= 0 ? "text-success" : "text-destructive"}`}>{formatOMR(net)}</span></div>
          <p className="text-xs text-muted-foreground pt-2">For richer cashflow analytics, see the dedicated Cashflow page under Finance.</p>
        </CardContent>
      </Card>
    </div>
  );
}
