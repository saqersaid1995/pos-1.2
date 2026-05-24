import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatOMR } from "@/lib/currency";
import { type APRow } from "@/lib/accounting-queries";
import { deriveLifecycleStatus, statusBadgeClass, statusLabel } from "@/lib/expense-queries";
import { Link } from "react-router-dom";

export function PayablesTab({ rows }: { rows: APRow[] }) {
  const total = rows.reduce((s, r) => s + r.remaining, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Accounts Payable</span>
          <span className="text-sm font-normal text-muted-foreground">Total owed: <span className="text-warning font-semibold">{formatOMR(total)}</span></span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">No outstanding payables 🎉</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr><th className="text-left py-2 px-3">Date</th><th className="text-left py-2 px-3">Due</th><th className="text-left py-2 px-3">Category</th><th className="text-left py-2 px-3">Description</th><th className="text-right py-2 px-3">Amount</th><th className="text-right py-2 px-3">Paid</th><th className="text-right py-2 px-3">Remaining</th><th className="text-center py-2 px-3">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const status = deriveLifecycleStatus({
                    expense_status: r.status, due_date: r.due_date, expense_date: r.expense_date,
                    remaining_amount: r.remaining,
                  } as any);
                  return (
                    <tr key={r.expense_id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3">{r.expense_date}</td>
                      <td className="py-2 px-3">{r.due_date}</td>
                      <td className="py-2 px-3">{r.category}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.description || "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatOMR(r.amount)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatOMR(r.paid)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatOMR(r.remaining)}</td>
                      <td className="py-2 px-3 text-center"><Badge className={statusBadgeClass(status)}>{statusLabel(status)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground pt-3">Settle payables from the <Link className="text-primary hover:underline" to="/expenses">Expenses page</Link>.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
