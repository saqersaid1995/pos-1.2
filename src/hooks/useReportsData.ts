import { useMemo, useState, useEffect, useCallback } from "react";
import type { WorkflowOrder, WorkflowStatus } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import type { CustomerRecord } from "@/types/customer";
import { fetchAllOrders, fetchAllCustomers } from "@/lib/supabase-queries";
import { fetchAllExpenses, type Expense } from "@/lib/expense-queries";

export type DateRange =
  | "today" | "yesterday" | "this-week" | "this-month" | "last-month"
  | "last-3-months" | "last-6-months" | "this-year" | "all" | "custom";

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => toDateStr(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return toDateStr(d); };

function startOfWeek() { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return toDateStr(d); }
function startOfMonth() { const d = new Date(); d.setDate(1); return toDateStr(d); }
function startOfLastMonth() { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return toDateStr(d); }
function endOfLastMonth() { const d = new Date(); d.setDate(0); return toDateStr(d); }
function monthsAgo(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); return toDateStr(d); }
function startOfYear() { return `${new Date().getFullYear()}-01-01`; }

function getDateBounds(range: DateRange, customStart?: string, customEnd?: string): [string, string] | null {
  if (range === "all") return null;
  const today = todayStr();
  switch (range) {
    case "today": return [today, today];
    case "yesterday": { const y = yesterdayStr(); return [y, y]; }
    case "this-week": return [startOfWeek(), today];
    case "this-month": return [startOfMonth(), today];
    case "last-month": return [startOfLastMonth(), endOfLastMonth()];
    case "last-3-months": return [monthsAgo(3), today];
    case "last-6-months": return [monthsAgo(6), today];
    case "this-year": return [startOfYear(), today];
    case "custom": return customStart && customEnd ? [customStart, customEnd] : null;
    default: return null;
  }
}

function filterByBounds<T>(items: T[], getDate: (i: T) => string, bounds: [string, string] | null): T[] {
  if (!bounds) return items;
  return items.filter((i) => { const d = getDate(i); return d >= bounds[0] && d <= bounds[1]; });
}

function getPreviousBounds(bounds: [string, string] | null): [string, string] | null {
  if (!bounds) return null;
  const start = new Date(bounds[0]);
  const end = new Date(bounds[1]);
  const diff = end.getTime() - start.getTime() + 86400000;
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - diff + 86400000);
  return [toDateStr(prevStart), toDateStr(prevEnd)];
}

export function useReportsData() {
  const [dateRange, setDateRange] = useState<DateRange>("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [allOrders, setAllOrders] = useState<WorkflowOrder[]>([]);
  const [allCustomers, setAllCustomers] = useState<CustomerRecord[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ords, custs, exps] = await Promise.all([fetchAllOrders(), fetchAllCustomers(), fetchAllExpenses()]);
    setAllOrders(ords);
    setAllCustomers(custs);
    setAllExpenses(exps);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const bounds = useMemo(() => getDateBounds(dateRange, customStart, customEnd), [dateRange, customStart, customEnd]);
  const prevBounds = useMemo(() => getPreviousBounds(bounds), [bounds]);

  // Exclude recurring templates (only count real entries: manual + auto-generated instances)
  const realExpenses = useMemo(
    () => allExpenses.filter((e) => !e.is_recurring || e.is_auto_generated),
    [allExpenses]
  );

  const orders = useMemo(() => filterByBounds(allOrders, (o) => o.orderDate, bounds), [allOrders, bounds]);
  const expenses = useMemo(() => filterByBounds(realExpenses, (e) => e.expense_date, bounds), [realExpenses, bounds]);
  const prevOrders = useMemo(() => filterByBounds(allOrders, (o) => o.orderDate, prevBounds), [allOrders, prevBounds]);
  const prevExpenses = useMemo(() => filterByBounds(realExpenses, (e) => e.expense_date, prevBounds), [realExpenses, prevBounds]);

  const today = todayStr();

  const kpis = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
    const totalPaid = orders.reduce((s, o) => s + o.paidAmount, 0);
    const outstanding = orders.reduce((s, o) => s + o.remainingBalance, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const active = orders.filter((o) => o.currentStatus !== "delivered");
    const delivered = orders.filter((o) => o.currentStatus === "delivered");
    const readyForPickup = orders.filter((o) => o.currentStatus === "ready-for-pickup");
    const overdue = orders.filter((o) => o.deliveryDate && o.deliveryDate < today && o.currentStatus !== "delivered");
    const urgent = orders.filter((o) => o.orderType === "urgent");
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const costPerOrder = orders.length > 0 ? totalExpenses / orders.length : 0;
    const profitPerOrder = orders.length > 0 ? netProfit / orders.length : 0;
    const avgGarmentsPerOrder = orders.length > 0 ? orders.reduce((s, o) => s + o.itemCount, 0) / orders.length : 0;

    // Previous period
    const prevRevenue = prevOrders.reduce((s, o) => s + o.totalAmount, 0);
    const prevTotalExpenses = prevExpenses.reduce((s, e) => s + e.amount, 0);
    const prevNetProfit = prevRevenue - prevTotalExpenses;
    const prevOrderCount = prevOrders.length;

    return {
      totalRevenue, totalPaid, outstanding, totalExpenses, netProfit, profitMargin,
      totalOrders: orders.length, activeOrders: active.length, deliveredOrders: delivered.length,
      readyForPickup: readyForPickup.length, overdueOrders: overdue.length, urgentOrders: urgent.length,
      totalCustomers: allCustomers.length, avgOrderValue, costPerOrder, profitPerOrder, avgGarmentsPerOrder,
      // Previous period for comparison
      prevRevenue, prevTotalExpenses, prevNetProfit, prevOrderCount,
    };
  }, [orders, expenses, prevOrders, prevExpenses, allCustomers, today]);

  const statusDistribution = useMemo(() =>
    WORKFLOW_STAGES.map((stage) => ({
      name: stage.label, value: orders.filter((o) => o.currentStatus === stage.id).length, id: stage.id,
    })), [orders]);

  const paymentDistribution = useMemo(() => [
    { name: "Paid", value: orders.filter((o) => o.paymentStatus === "paid").length },
    { name: "Partial", value: orders.filter((o) => o.paymentStatus === "partially-paid").length },
    { name: "Unpaid", value: orders.filter((o) => o.paymentStatus === "unpaid").length },
  ], [orders]);

  const serviceStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    orders.forEach((o) => o.items.forEach((item) => {
      if (!map[item.service]) map[item.service] = { count: 0, revenue: 0 };
      map[item.service].count += item.quantity;
      map[item.service].revenue += item.unitPrice * item.quantity;
    }));
    return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const itemTypeStats = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => o.items.forEach((item) => { map[item.itemType] = (map[item.itemType] || 0) + item.quantity; }));
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [orders]);

  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; phone: string; spent: number; orders: number; balance: number; lastDate: string }> = {};
    orders.forEach((o) => {
      const key = o.customerName;
      if (!map[key]) map[key] = { name: key, phone: o.customerPhone, spent: 0, orders: 0, balance: 0, lastDate: "" };
      map[key].spent += o.totalAmount;
      map[key].orders += 1;
      map[key].balance += o.remainingBalance;
      if (o.orderDate > map[key].lastDate) map[key].lastDate = o.orderDate;
    });
    return Object.values(map).sort((a, b) => b.spent - a.spent);
  }, [orders]);

  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const revenueVsExpenses = useMemo(() => {
    const dateSet = new Set<string>();
    orders.forEach((o) => dateSet.add(o.orderDate));
    expenses.forEach((e) => dateSet.add(e.expense_date));
    const revMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};
    orders.forEach((o) => { revMap[o.orderDate] = (revMap[o.orderDate] || 0) + o.totalAmount; });
    expenses.forEach((e) => { expMap[e.expense_date] = (expMap[e.expense_date] || 0) + e.amount; });
    return Array.from(dateSet).sort().map((date) => ({
      date, revenue: revMap[date] || 0, expenses: expMap[date] || 0, profit: (revMap[date] || 0) - (expMap[date] || 0),
    }));
  }, [orders, expenses]);

  const incomeStatement = useMemo(() => {
    const grossSales = orders.reduce((s, o) => s + o.subtotal, 0);
    const totalDiscounts = orders.reduce((s, o) => s + o.discount, 0);
    const netRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

    // Sum expenses by the new pl_line buckets (exact Income Statement line items)
    const sumByPLLine = (exps: Expense[]) => {
      const m: Record<string, number> = {
        revenue: 0,
        cogs: 0,
        sga_admin: 0,
        other_operating_income: 0,
        depreciation: 0,
        interest_expense: 0,
        interest_income: 0,
        other_income: 0,
        tax_provision: 0,
      };
      exps.forEach((e) => {
        const k = (e as any).pl_line || "sga_admin";
        m[k] = (m[k] || 0) + e.amount;
      });
      return m;
    };

    const cur = sumByPLLine(expenses);
    const prev = sumByPLLine(prevExpenses);

    // Revenue = order revenue + any expenses tagged 'revenue' (manual additions)
    const revenue = netRevenue + cur.revenue;
    const prevRevenue = prevOrders.reduce((s, o) => s + o.totalAmount, 0) + prev.revenue;

    // Calculated rows (exact Excel format)
    const grossProfit = revenue - cur.cogs;
    const grossProfitPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const ebitda = grossProfit - cur.sga_admin + cur.other_operating_income;
    const ebitdaPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;
    const ebit = ebitda - cur.depreciation - cur.interest_expense;
    const nonOperatingIncome = cur.interest_income + cur.other_income;
    const profitBeforeTax = ebit + nonOperatingIncome;
    const netProfit = profitBeforeTax - cur.tax_provision;
    const netProfitPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const cashProfit = netProfit + cur.depreciation;

    // Previous period
    const prevGrossProfit = prevRevenue - prev.cogs;
    const prevEbitda = prevGrossProfit - prev.sga_admin + prev.other_operating_income;
    const prevEbit = prevEbitda - prev.depreciation - prev.interest_expense;
    const prevPbt = prevEbit + prev.interest_income + prev.other_income;
    const prevNetProfit = prevPbt - prev.tax_provision;
    const prevCashProfit = prevNetProfit + prev.depreciation;

    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const prevTotalExp = prevExpenses.reduce((s, e) => s + e.amount, 0);

    // Legacy keys
    const catMap: Record<string, number> = {};
    expenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
    const prevCatMap: Record<string, number> = {};
    prevExpenses.forEach((e) => { prevCatMap[e.category] = (prevCatMap[e.category] || 0) + e.amount; });

    return {
      grossSales, totalDiscounts, laundrySales: netRevenue, totalRevenue: netRevenue,
      expensesByCategory: catMap, totalExpenses,
      netProfit, profitMargin: netProfitPct,
      prevGrossSales: prevOrders.reduce((s, o) => s + o.subtotal, 0),
      prevTotalDiscounts: prevOrders.reduce((s, o) => s + o.discount, 0),
      prevRevenue,
      prevExpensesByCategory: prevCatMap, prevTotalExpenses: prevTotalExp, prevNetProfit,
      structured: {
        revenue,
        cogs: cur.cogs,
        grossProfit, grossProfitPct,
        sgaAdmin: cur.sga_admin,
        otherOperatingIncome: cur.other_operating_income,
        ebitda, ebitdaPct,
        depreciation: cur.depreciation,
        interestExpense: cur.interest_expense,
        ebit,
        interestIncome: cur.interest_income,
        otherIncome: cur.other_income,
        nonOperatingIncome,
        profitBeforeTax,
        taxProvision: cur.tax_provision,
        netProfit, netProfitPct,
        cashProfit,
        prev: {
          revenue: prevRevenue,
          cogs: prev.cogs,
          grossProfit: prevGrossProfit,
          sgaAdmin: prev.sga_admin,
          otherOperatingIncome: prev.other_operating_income,
          ebitda: prevEbitda,
          depreciation: prev.depreciation,
          interestExpense: prev.interest_expense,
          ebit: prevEbit,
          interestIncome: prev.interest_income,
          otherIncome: prev.other_income,
          nonOperatingIncome: prev.interest_income + prev.other_income,
          profitBeforeTax: prevPbt,
          taxProvision: prev.tax_provision,
          netProfit: prevNetProfit,
          cashProfit: prevCashProfit,
        },
      },
    };
  }, [orders, expenses, prevOrders, prevExpenses]);

  const ordersByDay = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => { map[o.orderDate] = (map[o.orderDate] || 0) + 1; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  }, [orders]);

  const overdueOrders = useMemo(() =>
    orders.filter((o) => o.deliveryDate && o.deliveryDate < today && o.currentStatus !== "delivered"), [orders, today]);

  const readyForPickupOrders = useMemo(() =>
    orders.filter((o) => o.currentStatus === "ready-for-pickup"), [orders]);

  const mostProfitableService = useMemo(() => serviceStats.length > 0 ? serviceStats[0] : null, [serviceStats]);
  const mostPopularGarment = useMemo(() => itemTypeStats.length > 0 ? itemTypeStats[0] : null, [itemTypeStats]);

  const recentActivity = useMemo(() => {
    const activities: { id: string; orderNumber: string; customer: string; action: string; time: string; status: WorkflowStatus }[] = [];
    allOrders.forEach((o) => {
      o.statusHistory.forEach((sh) => {
        activities.push({
          id: sh.id, orderNumber: o.orderNumber, customer: o.customerName,
          action: sh.fromStatus ? `${capitalize(sh.fromStatus)} → ${capitalize(sh.toStatus)}` : `Created as ${capitalize(sh.toStatus)}`,
          time: sh.changedAt, status: sh.toStatus,
        });
      });
    });
    return activities.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 10);
  }, [allOrders]);

  const newCustomers = useMemo(() => {
    if (!bounds) return allCustomers;
    return allCustomers.filter((c) => { const d = c.createdAt?.split("T")[0] || ""; return d >= bounds[0] && d <= bounds[1]; });
  }, [allCustomers, bounds]);

  return {
    dateRange, setDateRange, customStart, setCustomStart, customEnd, setCustomEnd,
    orders, expenses, allOrders, allCustomers, loading, kpis,
    statusDistribution, paymentDistribution, serviceStats, itemTypeStats,
    topCustomers, recentActivity, expensesByCategory, revenueVsExpenses,
    mostProfitableService, mostPopularGarment, incomeStatement,
    ordersByDay, overdueOrders, readyForPickupOrders, newCustomers,
  };
}

function capitalize(s: string) { return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
