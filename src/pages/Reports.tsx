import { useReportsData, type DateRange } from "@/hooks/useReportsData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import AppHeader from "@/components/AppHeader";
import { OverviewTab } from "@/components/reports/OverviewTab";
import { SalesTab } from "@/components/reports/SalesTab";
import { ExpensesTab } from "@/components/reports/ExpensesTab";
import { IncomeStatementTab } from "@/components/reports/IncomeStatementTab";
import { OrdersTab } from "@/components/reports/OrdersTab";
import { CustomersTab } from "@/components/reports/CustomersTab";

import { exportSalesCSV, exportExpensesCSV, exportCustomersCSV, printReport } from "@/lib/report-exports";
import {
  Loader2, BarChart3, Download, Printer, CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "this-year", label: "This Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

const Reports = () => {
  const data = useReportsData();

  if (data.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const dateRangeLabel = DATE_OPTIONS.find((o) => o.value === data.dateRange)?.label || data.dateRange;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Reports & Analytics" />

      <div className="p-4 max-w-[1600px] mx-auto space-y-4">
        {/* Period Selector & Export Row */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          <Select value={data.dateRange} onValueChange={(v) => data.setDateRange(v as DateRange)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {data.dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] text-left", !data.customStart && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {data.customStart || "Start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={data.customStart ? new Date(data.customStart) : undefined}
                    onSelect={(d) => d && data.setCustomStart(format(d, "yyyy-MM-dd"))} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">–</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] text-left", !data.customEnd && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {data.customEnd || "End"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={data.customEnd ? new Date(data.customEnd) : undefined}
                    onSelect={(d) => d && data.setCustomEnd(format(d, "yyyy-MM-dd"))} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportSalesCSV(data.orders)}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => printReport("report-content")}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div id="report-content">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
              {["overview", "sales", "expenses", "income-statement", "orders", "customers"].map((tab) => (
                <TabsTrigger key={tab} value={tab}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-4 py-2 text-sm capitalize">
                  {tab.replace("-", " ")}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
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
            </TabsContent>

            <TabsContent value="sales">
              <SalesTab orders={data.orders} kpis={data.kpis} />
            </TabsContent>

            <TabsContent value="expenses">
              <ExpensesTab expenses={data.expenses} expensesByCategory={data.expensesByCategory} />
            </TabsContent>

            <TabsContent value="income-statement">
              <IncomeStatementTab data={data.incomeStatement} dateRangeLabel={dateRangeLabel} expenses={data.expenses} />
            </TabsContent>

            <TabsContent value="orders">
              <OrdersTab
                orders={data.orders} kpis={data.kpis}
                statusDistribution={data.statusDistribution}
                ordersByDay={data.ordersByDay}
                overdueOrders={data.overdueOrders}
                readyForPickupOrders={data.readyForPickupOrders}
                itemTypeStats={data.itemTypeStats}
                serviceStats={data.serviceStats}
              />
            </TabsContent>

            <TabsContent value="customers">
              <CustomersTab
                allCustomers={data.allCustomers}
                newCustomers={data.newCustomers}
                topCustomers={data.topCustomers}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Reports;
