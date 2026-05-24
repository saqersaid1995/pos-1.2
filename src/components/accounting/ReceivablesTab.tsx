import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatOMR } from "@/lib/currency";
import { type ARRow } from "@/lib/accounting-queries";
import { Link } from "react-router-dom";

export function ReceivablesTab({ rows }: { rows: ARRow[] }) {
  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Accounts Receivable</span>
          <span className="text-sm font-normal text-muted-foreground">Total outstanding: <span className="text-destructive font-semibold">{formatOMR(total)}</span></span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">All customer balances settled 🎉</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr><th className="text-left py-2 px-3">Customer</th><th className="text-left py-2 px-3">Phone</th><th className="text-right py-2 px-3">Invoiced</th><th className="text-right py-2 px-3">Paid</th><th className="text-right py-2 px-3">Outstanding</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3"><Link to={`/customer/${r.customer_id}`} className="text-primary hover:underline">{r.full_name}</Link></td>
                    <td className="py-2 px-3 text-muted-foreground">{r.phone_number}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatOMR(r.invoiced)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatOMR(r.paid)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-destructive">{formatOMR(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
