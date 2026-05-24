import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatOMR } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Filter = "all" | "cash" | "bank";

interface MonthRow {
  month_start: string;
  inflows: number;
  outflows: number;
  cash_inflows: number;
  cash_outflows: number;
  bank_inflows: number;
  bank_outflows: number;
}

interface BreakdownRow {
  entry_id: string;
  entry_date: string;
  source_type: string;
  description: string;
  line_description: string | null;
  debit: number;
  credit: number;
  account_code: string;
}

interface ComputedRow {
  monthLabel: string;
  monthKey: string;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  change: number;
}

const sourceLabel = (s: string) => {
  switch (s) {
    case "payment": return "Customer Payment";
    case "expense_payment": return "Expense Payment";
    case "loan_disbursement": return "Loan Disbursement";
    case "loan_opening": return "Loan Opening";
    case "loan_payment": return "Loan Payment";
    case "fixed_asset_purchase": return "Asset Purchase";
    case "opening": return "Opening Balance";
    case "order": return "Order";
    case "expense": return "Expense Accrual";
    case "manual": return "Manual";
    default: return s;
  }
};

const sourceVariant = (s: string): "default" | "secondary" | "outline" => {
  if (["payment", "loan_disbursement", "opening"].includes(s)) return "default";
  if (["expense_payment", "loan_payment", "fixed_asset_purchase"].includes(s)) return "secondary";
  return "outline";
};

export function MonthlyCashMovementCard() {
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Record<string, BreakdownRow[]>>({});

  const codes = useMemo(() => {
    if (filter === "cash") return ["1010"];
    if (filter === "bank") return ["1020"];
    return ["1010", "1020"];
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOpenMonth(null);
    setBreakdown({});
    (async () => {
      const { data, error } = await supabase.rpc("get_monthly_cash_movements" as any, {
        _account_codes: codes,
      });
      if (error) console.error(error);
      if (cancelled) return;
      setRows(((data || []) as any[]).map((r) => ({
        month_start: r.month_start,
        inflows: Number(r.inflows || 0),
        outflows: Number(r.outflows || 0),
        cash_inflows: Number(r.cash_inflows || 0),
        cash_outflows: Number(r.cash_outflows || 0),
        bank_inflows: Number(r.bank_inflows || 0),
        bank_outflows: Number(r.bank_outflows || 0),
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [codes]);

  const computed: ComputedRow[] = useMemo(() => {
    const out: ComputedRow[] = [];
    let running = 0;
    for (const r of rows) {
      const opening = running;
      const inf = filter === "cash" ? r.cash_inflows : filter === "bank" ? r.bank_inflows : r.inflows;
      const outf = filter === "cash" ? r.cash_outflows : filter === "bank" ? r.bank_outflows : r.outflows;
      const change = inf - outf;
      const closing = opening + change;
      const d = new Date(r.month_start + "T00:00:00");
      out.push({
        monthKey: r.month_start,
        monthLabel: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
        opening, inflows: inf, outflows: outf, closing, change,
      });
      running = closing;
    }
    return out;
  }, [rows, filter]);

  const chartData = useMemo(() => computed.map((r) => ({
    month: r.monthLabel, closing: Number(r.closing.toFixed(3)),
  })), [computed]);

  const toggleMonth = async (monthKey: string) => {
    if (openMonth === monthKey) { setOpenMonth(null); return; }
    setOpenMonth(monthKey);
    if (!breakdown[monthKey]) {
      const { data, error } = await supabase.rpc("get_monthly_cash_breakdown" as any, {
        _month_start: monthKey, _account_codes: codes,
      });
      if (error) { console.error(error); return; }
      setBreakdown((prev) => ({
        ...prev,
        [monthKey]: ((data || []) as any[]).map((r) => ({
          entry_id: r.entry_id,
          entry_date: r.entry_date,
          source_type: r.source_type,
          description: r.description,
          line_description: r.line_description,
          debit: Number(r.debit || 0),
          credit: Number(r.credit || 0),
          account_code: r.account_code,
        })),
      }));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Monthly Cash Movement
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Reconciled directly from the General Ledger ({filter === "all" ? "Cash + Bank" : filter === "cash" ? "Cash on Hand" : "Bank"}).
            </p>
          </div>
          <div className="flex gap-1 rounded-md border p-0.5 bg-muted/30">
            {(["all", "cash", "bank"] as Filter[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs capitalize"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "cash" ? "Cash Only" : "Bank Only"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart */}
        <div className="h-56 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "No movements found in the General Ledger"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={70}
                  tickFormatter={(v) => formatOMR(Number(v))} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => [formatOMR(Number(v)), "Closing"]}
                />
                <Line type="monotone" dataKey="closing" stroke="hsl(var(--primary))" strokeWidth={2}
                  dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Inflows</TableHead>
                <TableHead className="text-right">Outflows</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No data
                  </TableCell>
                </TableRow>
              )}
              {computed.map((r) => {
                const isOpen = openMonth === r.monthKey;
                const positive = r.change >= 0;
                return (
                  <>
                    <TableRow key={r.monthKey} className="cursor-pointer" onClick={() => toggleMonth(r.monthKey)}>
                      <TableCell className="px-2">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </TableCell>
                      <TableCell className="font-medium">{r.monthLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatOMR(r.opening)}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">+ {formatOMR(r.inflows)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">- {formatOMR(r.outflows)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatOMR(r.closing)}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "inline-flex items-center gap-1 font-medium tabular-nums",
                          positive ? "text-success" : "text-destructive"
                        )}>
                          {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {positive ? "+" : ""}{formatOMR(r.change)}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={r.monthKey + "-detail"} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7} className="p-0">
                          <BreakdownTable rows={breakdown[r.monthKey]} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] | undefined }) {
  if (!rows) {
    return <div className="p-4 text-xs text-muted-foreground">Loading transactions…</div>;
  }
  if (rows.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground">No transactions in this month.</div>;
  }
  // Group by source_type for a quick summary
  const groups = new Map<string, { inflow: number; outflow: number; count: number }>();
  for (const r of rows) {
    const g = groups.get(r.source_type) || { inflow: 0, outflow: 0, count: 0 };
    g.inflow += r.debit;
    g.outflow += r.credit;
    g.count += 1;
    groups.set(r.source_type, g);
  }
  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {Array.from(groups.entries()).map(([t, g]) => (
          <div key={t} className="rounded-md border bg-card px-2.5 py-1.5 text-[11px] flex items-center gap-2">
            <Badge variant={sourceVariant(t)} className="text-[10px]">{sourceLabel(t)}</Badge>
            <span className="text-muted-foreground">{g.count}×</span>
            {g.inflow > 0 && <span className="text-success tabular-nums">+{formatOMR(g.inflow)}</span>}
            {g.outflow > 0 && <span className="text-destructive tabular-nums">-{formatOMR(g.outflow)}</span>}
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-9">Date</TableHead>
              <TableHead className="h-9">Type</TableHead>
              <TableHead className="h-9">Description</TableHead>
              <TableHead className="h-9">Acct</TableHead>
              <TableHead className="h-9 text-right">In</TableHead>
              <TableHead className="h-9 text-right">Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.entry_id + r.account_code + r.debit + r.credit}>
                <TableCell className="py-2 text-xs">{r.entry_date}</TableCell>
                <TableCell className="py-2"><Badge variant={sourceVariant(r.source_type)} className="text-[10px]">{sourceLabel(r.source_type)}</Badge></TableCell>
                <TableCell className="py-2 text-xs">{r.line_description || r.description}</TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">{r.account_code === "1010" ? "Cash" : "Bank"}</TableCell>
                <TableCell className="py-2 text-right text-xs tabular-nums text-success">{r.debit > 0 ? "+" + formatOMR(r.debit) : ""}</TableCell>
                <TableCell className="py-2 text-right text-xs tabular-nums text-destructive">{r.credit > 0 ? "-" + formatOMR(r.credit) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
