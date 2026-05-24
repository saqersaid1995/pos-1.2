import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatOMR } from "@/lib/currency";
import { buildIncomeStatement, type AccountBalance } from "@/lib/accounting-queries";

export function IncomeStatementTab({ balances }: { balances: AccountBalance[] }) {
  const is = useMemo(() => buildIncomeStatement(balances), [balances]);

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Income Statement</CardTitle></CardHeader>
      <CardContent className="space-y-4 max-w-2xl">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Revenue</h3>
          {is.revenue.filter((a) => Math.abs(a.balance) > 0.001).map((a) => {
            const display = a.normal_balance === "credit" ? a.balance : -a.balance;
            return (
              <div key={a.id} className="flex justify-between py-1.5 text-sm">
                <span className="text-muted-foreground"><span className="font-mono text-xs mr-2">{a.code}</span>{a.account_name}</span>
                <span className={`tabular-nums ${display < 0 ? "text-destructive" : ""}`}>{formatOMR(display)}</span>
              </div>
            );
          })}
          <div className="flex justify-between py-2 border-t font-semibold">
            <span>Total Revenue</span><span className="tabular-nums">{formatOMR(is.totalRevenue)}</span>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Expenses</h3>
          {is.expenses.filter((a) => Math.abs(a.balance) > 0.001).map((a) => (
            <div key={a.id} className="flex justify-between py-1.5 text-sm">
              <span className="text-muted-foreground"><span className="font-mono text-xs mr-2">{a.code}</span>{a.account_name}</span>
              <span className="tabular-nums">{formatOMR(a.balance)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t font-semibold">
            <span>Total Expenses</span><span className="tabular-nums">{formatOMR(is.totalExpenses)}</span>
          </div>
        </div>
        <div className={`flex justify-between py-3 border-t-2 border-foreground/20 font-bold text-base ${is.netIncome >= 0 ? "text-success" : "text-destructive"}`}>
          <span>Net Income</span>
          <span className="tabular-nums">{formatOMR(is.netIncome)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
