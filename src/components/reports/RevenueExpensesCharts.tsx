import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Legend, ReferenceLine, Tooltip,
} from "recharts";
import { formatOMR } from "@/lib/currency";
import { Filter, ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const FIXED_CATEGORIES = ["Rent", "Loan", "Salaries"];

interface Expense { expense_date: string; category: string; amount: number }
interface Order { orderDate: string; totalAmount: number }
interface Props {
  orders: Order[];
  expenses: Expense[];
  revenueVsExpenses: { date: string; revenue: number; expenses: number; profit: number }[];
}

function aggregateWeekly(data: { date: string; revenue: number; expenses: number; profit: number; orderCount: number }[]) {
  const weeks: Record<string, { revenue: number; expenses: number; profit: number; orderCount: number }> = {};
  data.forEach((d) => {
    const dt = new Date(d.date);
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dt.getDay());
    const key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
    if (!weeks[key]) weeks[key] = { revenue: 0, expenses: 0, profit: 0, orderCount: 0 };
    weeks[key].revenue += d.revenue;
    weeks[key].expenses += d.expenses;
    weeks[key].profit += d.profit;
    weeks[key].orderCount += d.orderCount;
  });
  return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date: `W ${date.slice(5)}`, ...v }));
}

function aggregateMonthly(data: { date: string; revenue: number; expenses: number; profit: number; orderCount: number }[]) {
  const months: Record<string, { revenue: number; expenses: number; profit: number; orderCount: number }> = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  data.forEach((d) => {
    const dt = new Date(d.date);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (!months[key]) months[key] = { revenue: 0, expenses: 0, profit: 0, orderCount: 0 };
    months[key].revenue += d.revenue;
    months[key].expenses += d.expenses;
    months[key].profit += d.profit;
    months[key].orderCount += d.orderCount;
  });
  return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => {
    const [y, m] = key.split("-");
    return { date: `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`, ...v };
  });
}

function ComboTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rev = payload.find((p: any) => p.dataKey === "revenue")?.value ?? 0;
  const expRaw = payload.find((p: any) => p.dataKey === "expenses")?.value ?? 0;
  const exp = Math.abs(expRaw);
  const profit = payload.find((p: any) => p.dataKey === "profit")?.value ?? 0;
  const orders = payload[0]?.payload?.orderCount ?? 0;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground text-sm">{label}</p>
      <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-medium text-[hsl(142,72%,40%)]">{formatOMR(rev)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Expenses</span><span className="font-medium text-destructive">-{formatOMR(exp)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className={`font-medium ${profit >= 0 ? "text-[hsl(230,60%,50%)]" : "text-destructive"}`}>{formatOMR(profit)}</span></div>
      <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted-foreground">Orders</span><span className="font-medium">{orders}</span></div>
    </div>
  );
}

export function RevenueExpensesCharts({ orders, expenses }: Props) {
  const [view, setView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [includeFixed, setIncludeFixed] = useState(false);
  const viewLabel = view === "daily" ? "Daily" : view === "weekly" ? "Weekly" : "Monthly";

  const { dailyData, fixedTotal, fixedByCategory } = useMemo(() => {
    const fixedExps = expenses.filter((e) => FIXED_CATEGORIES.includes(e.category));
    const varExps = includeFixed ? expenses : expenses.filter((e) => !FIXED_CATEGORIES.includes(e.category));
    const fixedTotal = fixedExps.reduce((s, e) => s + e.amount, 0);
    const fixedByCategory: Record<string, number> = {};
    fixedExps.forEach((e) => { fixedByCategory[e.category] = (fixedByCategory[e.category] || 0) + e.amount; });

    const dateSet = new Set<string>();
    orders.forEach((o) => dateSet.add(o.orderDate));
    varExps.forEach((e) => dateSet.add(e.expense_date));

    const revMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};
    const ordCountMap: Record<string, number> = {};
    orders.forEach((o) => {
      revMap[o.orderDate] = (revMap[o.orderDate] || 0) + o.totalAmount;
      ordCountMap[o.orderDate] = (ordCountMap[o.orderDate] || 0) + 1;
    });
    varExps.forEach((e) => { expMap[e.expense_date] = (expMap[e.expense_date] || 0) + e.amount; });

    const dailyData = Array.from(dateSet).sort().map((date) => {
      const revenue = revMap[date] || 0;
      const exp = expMap[date] || 0;
      return { date, revenue, expenses: exp, profit: revenue - exp, orderCount: ordCountMap[date] || 0 };
    });

    return { dailyData, fixedTotal, fixedByCategory };
  }, [orders, expenses, includeFixed]);

  const chartData = useMemo(() => {
    if (view === "weekly") return aggregateWeekly(dailyData);
    if (view === "monthly") return aggregateMonthly(dailyData);
    return dailyData.map((d) => ({ ...d, date: d.date.slice(5) }));
  }, [dailyData, view]);

  const avgRevenue = chartData.length > 0 ? chartData.reduce((s, d) => s + d.revenue, 0) / chartData.length : 0;
  const avgExpenses = chartData.length > 0 ? chartData.reduce((s, d) => s + d.expenses, 0) / chartData.length : 0;
  const avgProfit = chartData.length > 0 ? chartData.reduce((s, d) => s + d.profit, 0) / chartData.length : 0;

  if (chartData.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Fixed Expenses — collapsible */}
      {!includeFixed && fixedTotal > 0 && (
        <Collapsible>
          <Card className="border-dashed">
            <CollapsibleTrigger asChild>
              <button className="w-full text-left">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Fixed Expenses (excluded from chart)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{formatOMR(fixedTotal)}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                  </div>
                </CardContent>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-3 px-3 space-y-1">
                {Object.entries(fixedByCategory).map(([cat, amt]) => (
                  <div key={cat} className="text-xs flex justify-between">
                    <span className="text-muted-foreground">{cat}</span>
                    <span className="font-medium">{formatOMR(amt)}</span>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">View:</span>
          <div className="flex gap-1">
            <Button variant={view === "daily" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setView("daily")}>Daily</Button>
            <Button variant={view === "weekly" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setView("weekly")}>Weekly</Button>
            <Button variant={view === "monthly" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setView("monthly")}>Monthly</Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch id="include-fixed" checked={includeFixed} onCheckedChange={setIncludeFixed} />
          <Label htmlFor="include-fixed" className="text-xs text-muted-foreground cursor-pointer">Include fixed expenses</Label>
        </div>
      </div>

      {/* Combo Chart */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-4">Revenue vs Expenses & Profit Trend</h3>
          <ChartContainer config={{
            revenue: { label: "Revenue", color: "hsl(142, 72%, 40%)" },
            expenses: { label: "Expenses", color: "hsl(0, 72%, 51%)" },
            profit: { label: "Profit", color: "hsl(230, 60%, 50%)" },
          }} className="h-[320px] w-full">
            <ComposedChart data={chartData.map((d) => ({ ...d, expenses: -d.expenses }))} barGap={4} barCategoryGap="20%" stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => { const a = Math.abs(v); return a >= 1000 ? `${(a / 1000).toFixed(1)}k` : `${a}`; }} />
              <Tooltip content={<ComboTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <ReferenceLine y={avgRevenue} stroke="hsl(142, 72%, 40%)" strokeDasharray="6 3" strokeOpacity={0.4} label={{ value: `Avg Rev ${formatOMR(avgRevenue)}`, fontSize: 9, fill: "hsl(142, 72%, 40%)", position: "insideTopRight" }} />
              <ReferenceLine y={-avgExpenses} stroke="hsl(0, 72%, 51%)" strokeDasharray="6 3" strokeOpacity={0.4} label={{ value: `Avg Exp ${formatOMR(avgExpenses)}`, fontSize: 9, fill: "hsl(0, 72%, 51%)", position: "insideBottomRight" }} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.4} />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(142, 72%, 40%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="expenses" name="Expenses" fill="hsl(0, 72%, 51%)" radius={[0, 0, 4, 4]} maxBarSize={40} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(230, 60%, 50%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(230, 60%, 50%)" }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}