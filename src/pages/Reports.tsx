import { useState } from "react";
import { useReportsData, type DateRange } from "@/hooks/useReportsData";
import { OverviewTab } from "@/components/reports/OverviewTab";
import { SalesTab } from "@/components/reports/SalesTab";
import { ExpensesTab } from "@/components/reports/ExpensesTab";
import { IncomeStatementTab } from "@/components/reports/IncomeStatementTab";
import { OrdersTab } from "@/components/reports/OrdersTab";
import { CustomersTab } from "@/components/reports/CustomersTab";
import { exportSalesCSV, printReport } from "@/lib/report-exports";
import { Loader2, Download, Printer, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "today",          label: "اليوم" },
  { value: "yesterday",      label: "أمس" },
  { value: "this-week",      label: "هذا الأسبوع" },
  { value: "this-month",     label: "هذا الشهر" },
  { value: "last-month",     label: "الشهر الماضي" },
  { value: "last-3-months",  label: "آخر 3 أشهر" },
  { value: "last-6-months",  label: "آخر 6 أشهر" },
  { value: "this-year",      label: "هذا العام" },
  { value: "all",            label: "كل الوقت" },
  { value: "custom",         label: "نطاق مخصص" },
];

const TABS = [
  { id: "overview",          label: "نظرة عامة" },
  { id: "sales",             label: "المبيعات" },
  { id: "expenses",          label: "المصروفات" },
  { id: "income-statement",  label: "قائمة الدخل" },
  { id: "orders",            label: "الطلبات" },
  { id: "customers",         label: "العملاء" },
];

const ctrlBtn: React.CSSProperties = {
  height: 32, padding: "0 10px", borderRadius: 6, fontSize: 12,
  background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
  color: "var(--text-secondary)", cursor: "pointer",
  display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
};

export default function Reports() {
  const data = useReportsData();
  const [activeTab, setActiveTab] = useState("overview");

  if (data.loading) {
    return (
      <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
        <Loader2 style={{ width: 32, height: 32, color: "var(--text-tertiary)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  const dateRangeLabel = DATE_OPTIONS.find((o) => o.value === data.dateRange)?.label || data.dateRange;

  return (
    <div className="page-layout" style={{ background: "var(--bg-base)", padding: 0 }}>
      {/* Header */}
      <div className="page-header" style={{ padding: "14px 24px" }}>
        <div>
          <h1 className="page-title">التقارير والتحليلات</h1>
          <p className="page-subtitle">تقارير الأداء والمبيعات</p>
        </div>
      </div>

      {/* Controls bar */}
      <div style={{ padding: "0 24px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} dir="rtl">
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>الفترة:</span>

        <select
          value={data.dateRange}
          onChange={(e) => data.setDateRange(e.target.value as DateRange)}
          dir="rtl"
          style={{
            height: 32, padding: "0 8px", fontSize: 12, borderRadius: 6,
            background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
            color: "var(--text-primary)", outline: "none", cursor: "pointer",
          }}
        >
          {DATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {data.dateRange === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs", !data.customStart && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {data.customStart || "البداية"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={data.customStart ? new Date(data.customStart) : undefined}
                  onSelect={(d) => d && data.setCustomStart(format(d, "yyyy-MM-dd"))} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs", !data.customEnd && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {data.customEnd || "النهاية"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={data.customEnd ? new Date(data.customEnd) : undefined}
                  onSelect={(d) => d && data.setCustomEnd(format(d, "yyyy-MM-dd"))} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div style={{ marginRight: "auto", display: "flex", gap: 6 }}>
          <button style={ctrlBtn} onClick={() => exportSalesCSV(data.orders)}>
            <Download size={12} /> CSV
          </button>
          <button style={ctrlBtn} onClick={() => printReport("report-content")}>
            <Printer size={12} /> طباعة
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ padding: "0 24px", borderBottom: "1px solid var(--border-subtle)" }} dir="rtl">
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 16px", fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? "var(--color-accent, #6366F1)" : "var(--text-secondary)",
                background: "transparent", border: "none", cursor: "pointer",
                whiteSpace: "nowrap",
                borderBottom: activeTab === tab.id
                  ? "2px solid var(--color-accent, #6366F1)"
                  : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div id="report-content" style={{ padding: "20px 24px 32px", overflow: "auto", flex: 1 }}>
        {activeTab === "overview" && (
          <OverviewTab
            kpis={data.kpis}
            orders={data.orders}
            expenses={data.expenses}
            revenueVsExpenses={data.revenueVsExpenses}
            expensesByCategory={data.expensesByCategory}
            statusDistribution={data.statusDistribution}
            paymentDistribution={data.paymentDistribution}
            serviceStats={data.serviceStats}
            mostProfitableService={data.mostProfitableService}
            mostPopularGarment={data.mostPopularGarment}
          />
        )}
        {activeTab === "sales" && (
          <SalesTab orders={data.orders} kpis={data.kpis} />
        )}
        {activeTab === "expenses" && (
          <ExpensesTab expenses={data.expenses} expensesByCategory={data.expensesByCategory} />
        )}
        {activeTab === "income-statement" && (
          <IncomeStatementTab data={data.incomeStatement} dateRangeLabel={dateRangeLabel} expenses={data.expenses} />
        )}
        {activeTab === "orders" && (
          <OrdersTab
            orders={data.orders}
            kpis={data.kpis}
            statusDistribution={data.statusDistribution}
            ordersByDay={data.ordersByDay}
            overdueOrders={data.overdueOrders}
            readyForPickupOrders={data.readyForPickupOrders}
            itemTypeStats={data.itemTypeStats}
            serviceStats={data.serviceStats}
          />
        )}
        {activeTab === "customers" && (
          <CustomersTab
            allCustomers={data.allCustomers}
            newCustomers={data.newCustomers}
            topCustomers={data.topCustomers}
          />
        )}
      </div>
    </div>
  );
}
