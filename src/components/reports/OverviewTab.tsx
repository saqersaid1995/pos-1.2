import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { DollarSign, ShoppingCart, Clock, Package, Truck, TrendingUp, TrendingDown, Percent, Receipt, Star, Shirt, ArrowUpRight, ArrowDownRight, AlertCircle } from "lucide-react";
import { RevenueExpensesCharts } from "./RevenueExpensesCharts";
import { DonutCard } from "./DonutCard";
import { formatOMR, formatOMRCompact } from "@/lib/currency";

const PIE_COLORS = [
  "hsl(230, 60%, 50%)", "hsl(142, 72%, 40%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(200, 70%, 50%)", "hsl(280, 50%, 55%)",
  "hsl(170, 60%, 45%)", "hsl(15, 80%, 55%)",
];

const STATUS_COLORS: Record<string, string> = {
  "Received": "hsl(200, 70%, 50%)",
  "Ready for Pickup": "hsl(38, 92%, 50%)",
  "Delivered": "hsl(142, 72%, 40%)",
};

const PAYMENT_COLORS: Record<string, string> = {
  "Paid": "hsl(142, 72%, 40%)",
  "Partial": "hsl(38, 92%, 50%)",
  "Unpaid": "hsl(0, 72%, 51%)",
};

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const change = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const isUp = change >= 0;
  return (
    <span className={`inline-flex items-center text-xs font-medium gap-0.5 ${isUp ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

// Hero KPI card — large, strong visual weight
function HeroKpi({ label, value, icon: Icon, accent, change, sub }: { label: string; value: string; icon: any; accent: string; change?: React.ReactNode; sub?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-muted ${accent}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          {change}
        </div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// Compact KPI card for ops & insights rows
function MiniKpi({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: any; accent: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-3.5 w-3.5 ${accent}`} />
          <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
        </div>
        <p className="text-lg font-bold tracking-tight truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

interface OverviewTabProps {
  kpis: any;
  orders: any[];
  expenses: any[];
  revenueVsExpenses: any[];
  expensesByCategory: { name: string; value: number }[];
  statusDistribution: { name: string; value: number }[];
  paymentDistribution: { name: string; value: number }[];
  serviceStats: { name: string; revenue: number; count: number }[];
  mostProfitableService: { name: string; revenue: number } | null;
  mostPopularGarment: { name: string; count: number } | null;
}

export function OverviewTab({ kpis, orders, expenses, revenueVsExpenses, expensesByCategory, statusDistribution, paymentDistribution, serviceStats, mostProfitableService, mostPopularGarment }: OverviewTabProps) {
  const hasData = kpis.totalOrders > 0 || kpis.totalExpenses > 0;

  if (!hasData) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No analytics data yet</p>
        <p className="text-sm mt-1">Create orders or record expenses to see reports</p>
      </div>
    );
  }

  // Compute insight summary text for chart
  const FIXED_CATEGORIES = ["Rent", "Loan", "Salaries"];
  const fixedTotal = expenses.filter((e: any) => FIXED_CATEGORIES.includes(e.category)).reduce((s: number, e: any) => s + e.amount, 0);
  const avgDailyProfit = revenueVsExpenses.length > 0
    ? revenueVsExpenses.reduce((s: number, d: any) => s + d.profit, 0) / revenueVsExpenses.length
    : 0;

  let insightText = "";
  if (kpis.netProfit < 0) {
    insightText = `Net loss of ${formatOMR(Math.abs(kpis.netProfit))} — expenses exceeded revenue.`;
  } else if (fixedTotal > kpis.totalRevenue * 0.5 && fixedTotal > 0) {
    insightText = `Profit is impacted by high fixed expenses (${formatOMR(fixedTotal)}).`;
  } else if (kpis.profitMargin > 30) {
    insightText = `Strong margin of ${kpis.profitMargin.toFixed(1)}% — profitable period.`;
  } else if (kpis.profitMargin > 0) {
    insightText = `Net profit ${formatOMR(kpis.netProfit)} at ${kpis.profitMargin.toFixed(1)}% margin.`;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      {/* SECTION 1 — Main KPIs (Hero) */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Financial Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroKpi
            label="Total Revenue"
            value={formatOMR(kpis.totalRevenue)}
            icon={DollarSign}
            accent="text-[hsl(var(--success))]"
            change={<ChangeIndicator current={kpis.totalRevenue} previous={kpis.prevRevenue} />}
          />
          <HeroKpi
            label="Total Expenses"
            value={formatOMR(kpis.totalExpenses)}
            icon={Receipt}
            accent="text-destructive"
            change={<ChangeIndicator current={kpis.totalExpenses} previous={kpis.prevTotalExpenses} />}
          />
          <HeroKpi
            label={kpis.netProfit >= 0 ? "Net Profit" : "Net Loss"}
            value={formatOMR(kpis.netProfit)}
            icon={kpis.netProfit >= 0 ? TrendingUp : TrendingDown}
            accent={kpis.netProfit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}
            change={<ChangeIndicator current={kpis.netProfit} previous={kpis.prevNetProfit} />}
          />
          <HeroKpi
            label="Profit Margin"
            value={`${kpis.profitMargin.toFixed(1)}%`}
            icon={Percent}
            accent={kpis.profitMargin >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}
          />
        </div>
      </section>

      {/* SECTION 2 — Operations */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Operations</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MiniKpi label="Total Orders" value={kpis.totalOrders} icon={ShoppingCart} accent="text-primary" />
          <MiniKpi label="Active Orders" value={kpis.activeOrders} icon={Clock} accent="text-[hsl(var(--warning))]" />
          <MiniKpi label="Ready for Pickup" value={kpis.readyForPickup} icon={Package} accent="text-primary" />
          <MiniKpi label="Delivered" value={kpis.deliveredOrders} icon={Truck} accent="text-[hsl(var(--success))]" />
          <MiniKpi label="Outstanding" value={formatOMR(kpis.outstanding)} icon={DollarSign} accent="text-[hsl(var(--warning))]" />
        </div>
      </section>

      {/* SECTION 3 — Financial Performance (Main focus) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financial Performance</h2>
        </div>
        {insightText && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-sm text-foreground">{insightText}</p>
          </div>
        )}
        <RevenueExpensesCharts orders={orders} expenses={expenses} revenueVsExpenses={revenueVsExpenses} />
      </section>

      {/* SECTION 4 — Insights Grid */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Insights</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MiniKpi label="Avg Order Value" value={formatOMR(kpis.avgOrderValue)} icon={ShoppingCart} accent="text-primary" />
          <MiniKpi label="Cost per Order" value={formatOMR(kpis.costPerOrder)} icon={Receipt} accent="text-muted-foreground" />
          <MiniKpi label="Avg Daily Profit" value={formatOMR(avgDailyProfit)} icon={TrendingUp} accent={avgDailyProfit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"} />
          <MiniKpi label="Top Service" value={mostProfitableService?.name || "—"} icon={Star} accent="text-[hsl(var(--warning))]" />
          <MiniKpi label="Top Garment" value={mostPopularGarment?.name || "—"} icon={Shirt} accent="text-primary" />
        </div>
      </section>

      {/* Supporting breakdowns */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DonutCard
          title="Expense Breakdown"
          data={expensesByCategory}
          centerValue={formatOMRCompact(kpis.totalExpenses)}
          centerLabel="Total Expenses"
          formatValue={formatOMRCompact}
          emptyMessage="No expenses recorded"
          colors={PIE_COLORS}
        />

        <DonutCard
          title="Workflow Pipeline"
          data={[
            ...statusDistribution.map((s) => ({ name: s.name, color: STATUS_COLORS[s.name] })).map((s, i) => ({
              ...s,
              value: statusDistribution[i].value,
            })),
            { name: "Overdue", value: kpis.overdueOrders || 0, color: "hsl(0, 72%, 51%)" },
          ]}
          centerValue={kpis.totalOrders}
          centerLabel="Total Orders"
          emptyMessage="No orders yet"
          colors={PIE_COLORS}
        />

        <DonutCard
          title="Payment Status"
          data={paymentDistribution.map((p) => ({ ...p, color: PAYMENT_COLORS[p.name] }))}
          centerValue={kpis.totalOrders}
          centerLabel="Total Orders"
          emptyMessage="No orders yet"
          colors={PIE_COLORS}
        />
      </section>

      {/* Outstanding summary row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Paid</span>
            <span className="font-semibold text-[hsl(var(--success))]">{formatOMR(kpis.totalPaid)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Outstanding</span>
            <span className="font-semibold text-destructive">{formatOMR(kpis.outstanding)}</span>
          </CardContent>
        </Card>
      </section>

      {serviceStats.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-4">Top Services by Revenue</h3>
            <ChartContainer config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" } }} className="h-[220px] w-full">
              <BarChart data={serviceStats.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
