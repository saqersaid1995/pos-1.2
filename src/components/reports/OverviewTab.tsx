import { ArrowUpRight, ArrowDownRight, ShoppingCart, AlertCircle } from "lucide-react";
import { RevenueExpensesCharts } from "./RevenueExpensesCharts";
import { DonutCard } from "./DonutCard";
import { formatOMR, formatOMRCompact } from "@/lib/currency";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

// ─── Color palette ────────────────────────────────────────────────────────────

const PIE_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#F97316", "#64748B"];
const STATUS_COLORS: Record<string, string> = {
  "مستلمة":           "#3B82F6",
  "جاهزة للاستلام":   "#10B981",
  "مسلمة":            "#64748B",
};
const PAYMENT_COLORS: Record<string, string> = {
  "مدفوع":      "#10B981",
  "جزئي":       "#F59E0B",
  "غير مدفوع":  "#EF4444",
};

// ─── Change indicator ─────────────────────────────────────────────────────────

function ChangeChip({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const change = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const up = change >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      fontSize: 10, fontWeight: 700, padding: "2px 5px", borderRadius: 99,
      background: up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
      color: up ? "#10B981" : "#EF4444",
    }}>
      {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

// ─── Stats bar (horizontal row of KPI cells) ─────────────────────────────────

function StatsBar({ cells }: { cells: { label: string; value: string | number; color?: string; chip?: React.ReactNode }[] }) {
  return (
    <div style={{
      display: "flex", borderRadius: 10,
      border: "0.5px solid var(--border-subtle)",
      background: "var(--bg-elevated)", overflow: "hidden",
    }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ display: "flex", flex: 1 }}>
          {i > 0 && <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch" }} />}
          <div style={{ flex: 1, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 3 }}>
              <span style={{
                fontSize: 22, fontWeight: 600, fontFamily: "monospace", lineHeight: 1,
                color: c.color || "var(--text-primary)",
              }}>
                {c.value}
              </span>
              {c.chip}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OverviewTabProps {
  kpis: any;
  orders: any[];
  expenses: any[];
  revenueVsExpenses: any[];
  expensesByCategory: { name: string; value: number }[];
  statusDistribution: { name: string; value: number; id: string }[];
  paymentDistribution: { name: string; value: number }[];
  serviceStats: { name: string; revenue: number; count: number }[];
  mostProfitableService: { name: string; revenue: number } | null;
  mostPopularGarment: { name: string; count: number } | null;
}

export function OverviewTab({
  kpis, orders, expenses, revenueVsExpenses,
  expensesByCategory, statusDistribution, paymentDistribution,
  serviceStats, mostProfitableService, mostPopularGarment,
}: OverviewTabProps) {
  const hasData = kpis.totalOrders > 0 || kpis.totalExpenses > 0;

  if (!hasData) {
    return (
      <div style={{ textAlign: "center", padding: "80px 32px", color: "var(--text-tertiary)" }}>
        <ShoppingCart style={{ width: 48, height: 48, margin: "0 auto 12px", opacity: 0.25 }} />
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" }}>لا توجد بيانات بعد</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>أنشئ طلبات أو سجّل مصروفات لعرض التقارير</p>
      </div>
    );
  }

  // Insight text
  const FIXED_CATEGORIES = ["Rent", "Loan", "Salaries"];
  const fixedTotal = expenses.filter((e: any) => FIXED_CATEGORIES.includes(e.category)).reduce((s: number, e: any) => s + e.amount, 0);
  const avgDailyProfit = revenueVsExpenses.length > 0
    ? revenueVsExpenses.reduce((s: number, d: any) => s + d.profit, 0) / revenueVsExpenses.length
    : 0;

  let insightText = "";
  if (kpis.netProfit < 0) {
    insightText = `خسارة صافية بقيمة ${formatOMR(Math.abs(kpis.netProfit))} — المصروفات تجاوزت الإيرادات.`;
  } else if (fixedTotal > kpis.totalRevenue * 0.5 && fixedTotal > 0) {
    insightText = `الربح متأثر بالمصروفات الثابتة المرتفعة (${formatOMR(fixedTotal)}).`;
  } else if (kpis.profitMargin > 30) {
    insightText = `هامش قوي ${kpis.profitMargin.toFixed(1)}% — فترة مربحة.`;
  } else if (kpis.profitMargin > 0) {
    insightText = `صافي ربح ${formatOMR(kpis.netProfit)} بهامش ${kpis.profitMargin.toFixed(1)}%.`;
  }

  // Translated status distribution for donuts
  const statusLabels: Record<string, string> = {
    "received":          "مستلمة",
    "ready-for-pickup":  "جاهزة للاستلام",
    "delivered":         "مسلمة",
  };
  const translatedStatus = statusDistribution.map((s) => ({
    name: statusLabels[s.id] || s.name,
    value: s.value,
    color: STATUS_COLORS[statusLabels[s.id] || s.name],
  }));

  const translatedPayment = paymentDistribution.map((p) => {
    const nameMap: Record<string, string> = { "Paid": "مدفوع", "Partial": "جزئي", "Unpaid": "غير مدفوع" };
    const ar = nameMap[p.name] || p.name;
    return { name: ar, value: p.value, color: PAYMENT_COLORS[ar] };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1400, margin: "0 auto" }}>

      {/* ── FINANCIAL KPIs ── */}
      <StatsBar cells={[
        {
          label: "إجمالي الإيرادات",
          value: formatOMR(kpis.totalRevenue),
          color: "#10B981",
          chip: <ChangeChip current={kpis.totalRevenue} previous={kpis.prevRevenue} />,
        },
        {
          label: "إجمالي المصروفات",
          value: formatOMR(kpis.totalExpenses),
          color: "#EF4444",
          chip: <ChangeChip current={kpis.totalExpenses} previous={kpis.prevTotalExpenses} />,
        },
        {
          label: kpis.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة",
          value: formatOMR(kpis.netProfit),
          color: kpis.netProfit >= 0 ? "#10B981" : "#EF4444",
          chip: <ChangeChip current={kpis.netProfit} previous={kpis.prevNetProfit} />,
        },
        {
          label: "هامش الربح",
          value: `${kpis.profitMargin.toFixed(1)}%`,
          color: kpis.profitMargin >= 20 ? "#10B981" : kpis.profitMargin >= 0 ? "#F59E0B" : "#EF4444",
        },
        {
          label: "الرصيد المعلق",
          value: formatOMR(kpis.outstanding),
          color: kpis.outstanding > 0 ? "#F59E0B" : undefined,
        },
      ]} />

      {/* ── OPERATIONS KPIs ── */}
      <StatsBar cells={[
        { label: "إجمالي الطلبات",    value: kpis.totalOrders },
        { label: "نشطة",              value: kpis.activeOrders },
        { label: "جاهزة للاستلام",   value: kpis.readyForPickup, color: kpis.readyForPickup > 0 ? "#10B981" : undefined },
        { label: "مسلمة",             value: kpis.deliveredOrders },
        { label: "متأخرة",            value: kpis.overdueOrders, color: kpis.overdueOrders > 0 ? "#EF4444" : undefined },
        { label: "عاجلة",             value: kpis.urgentOrders, color: kpis.urgentOrders > 0 ? "#F59E0B" : undefined },
      ]} />

      {/* ── INSIGHT ALERT ── */}
      {insightText && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
          borderRadius: 8, background: "var(--bg-elevated)", border: "0.5px solid var(--border-subtle)",
        }}>
          <AlertCircle size={14} style={{ color: "var(--text-tertiary)", marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{insightText}</p>
        </div>
      )}

      {/* ── PERFORMANCE CHART ── */}
      <RevenueExpensesCharts orders={orders} expenses={expenses} revenueVsExpenses={revenueVsExpenses} />

      {/* ── INSIGHTS ROW ── */}
      <div style={{
        display: "flex", borderRadius: 10,
        border: "0.5px solid var(--border-subtle)",
        background: "var(--bg-elevated)", overflow: "hidden",
      }}>
        {[
          { label: "متوسط قيمة الطلب",  value: formatOMR(kpis.avgOrderValue) },
          { label: "تكلفة لكل طلب",     value: formatOMR(kpis.costPerOrder) },
          { label: "متوسط الربح اليومي", value: formatOMR(avgDailyProfit), color: avgDailyProfit >= 0 ? "#10B981" : "#EF4444" },
          { label: "أعلى خدمة",         value: mostProfitableService?.name || "—" },
          { label: "أكثر قطعة",         value: mostPopularGarment?.name || "—" },
          { label: "إجمالي مدفوع",      value: formatOMR(kpis.totalPaid), color: "#10B981" },
        ].map((c, i) => (
          <div key={c.label} style={{ display: "flex", flex: 1 }}>
            {i > 0 && <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch" }} />}
            <div style={{ flex: 1, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace", lineHeight: 1, marginBottom: 3, color: (c as any).color || "var(--text-primary)" }}>
                {c.value}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── DISTRIBUTION DONUTS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <DonutCard
          title="توزيع المصروفات"
          data={expensesByCategory}
          centerValue={formatOMRCompact(kpis.totalExpenses)}
          centerLabel="إجمالي المصروفات"
          formatValue={formatOMRCompact}
          emptyMessage="لا توجد مصروفات"
          colors={PIE_COLORS}
        />
        <DonutCard
          title="حالة الطلبات"
          data={[
            ...translatedStatus,
            { name: "متأخرة", value: kpis.overdueOrders || 0, color: "#EF4444" },
          ]}
          centerValue={kpis.totalOrders}
          centerLabel="إجمالي الطلبات"
          emptyMessage="لا توجد طلبات"
          colors={PIE_COLORS}
        />
        <DonutCard
          title="حالة الدفع"
          data={translatedPayment}
          centerValue={kpis.totalOrders}
          centerLabel="إجمالي الطلبات"
          emptyMessage="لا توجد طلبات"
          colors={PIE_COLORS}
        />
      </div>

      {/* ── TOP SERVICES CHART ── */}
      {serviceStats.length > 0 && (
        <div style={{ background: "var(--bg-elevated)", border: "0.5px solid var(--border-subtle)", borderRadius: 10, padding: "16px 16px 8px" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>أعلى الخدمات إيراداً</p>
          <ChartContainer
            config={{ revenue: { label: "الإيرادات", color: "hsl(var(--primary))" } }}
            className="h-[200px] w-full"
          >
            <BarChart data={serviceStats.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
