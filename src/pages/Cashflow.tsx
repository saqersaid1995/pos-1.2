import { useState, useMemo, useCallback, useEffect } from "react";
import { toLocalDateStr } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, Download, Printer, Search, DollarSign, CreditCard, Building2, TrendingUp, Hash, BarChart3, ArrowUpRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOMR } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type DatePreset = "today" | "yesterday" | "this-week" | "this-month" | "custom";

interface PaymentRow {
  id: string;
  order_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string | null;
  order_number?: string;
  customer_name?: string;
  payment_status?: string;
}

const toDateStr = (d: Date) => toLocalDateStr(d);

function getPresetBounds(preset: DatePreset): [string, string] | null {
  const now = new Date();
  const today = toDateStr(now);
  switch (preset) {
    case "today": return [today, today];
    case "yesterday": { const y = new Date(Date.now() - 86400000); return [toDateStr(y), toDateStr(y)]; }
    case "this-week": { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return [toDateStr(d), today]; }
    case "this-month": { const d = new Date(); d.setDate(1); return [toDateStr(d), today]; }
    default: return null;
  }
}

export default function Cashflow() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const bounds = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) {
      return [toDateStr(customStart), toDateStr(customEnd)] as [string, string];
    }
    return getPresetBounds(preset);
  }, [preset, customStart, customEnd]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("payments")
      .select("*, orders!inner(order_number, customer_id, payment_status, customers(full_name))")
      .order("payment_date", { ascending: false });

    if (bounds) {
      // Use Asia/Muscat timezone (UTC+4) for date filtering to match local business day
      const offsetStart = bounds[0] + "T00:00:00+04:00";
      const offsetEnd = bounds[1] + "T23:59:59+04:00";
      query = query.gte("payment_date", offsetStart).lte("payment_date", offsetEnd);
    }

    const { data } = await query;
    const mapped: PaymentRow[] = (data || []).map((p: any) => ({
      id: p.id,
      order_id: p.order_id,
      amount: Number(p.amount),
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      notes: p.notes,
      order_number: p.orders?.order_number || "",
      customer_name: p.orders?.customers?.full_name || "Walk-in",
      payment_status: p.orders?.payment_status || "unknown",
    }));
    setPayments(mapped);
    setLoading(false);
  }, [bounds]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const filtered = useMemo(() => {
    let list = payments;
    if (methodFilter !== "all") list = list.filter((p) => p.payment_method === methodFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.order_number?.toLowerCase().includes(q) ||
        p.customer_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, methodFilter, search]);

  // Summary
  const summary = useMemo(() => {
    const cash = filtered.filter((p) => p.payment_method === "cash").reduce((s, p) => s + p.amount, 0);
    const card = filtered.filter((p) => p.payment_method === "card").reduce((s, p) => s + p.amount, 0);
    const transfer = filtered.filter((p) => p.payment_method === "bank-transfer").reduce((s, p) => s + p.amount, 0);
    const total = cash + card + transfer;
    const avg = filtered.length > 0 ? total / filtered.length : 0;
    const cashPct = total > 0 ? (cash / total) * 100 : 0;
    const cardPct = total > 0 ? (card / total) * 100 : 0;

    // Highest day
    const dayMap: Record<string, number> = {};
    filtered.forEach((p) => { const d = new Date(p.payment_date).toLocaleDateString('en-CA'); dayMap[d] = (dayMap[d] || 0) + p.amount; });
    const highestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];

    return { cash, card, transfer, total, count: filtered.length, avg, cashPct, cardPct, highestDay };
  }, [filtered]);

  // Daily breakdown
  const dailyBreakdown = useMemo(() => {
    const map: Record<string, { cash: number; card: number; transfer: number }> = {};
    filtered.forEach((p) => {
      const d = new Date(p.payment_date).toLocaleDateString('en-CA');
      if (!map[d]) map[d] = { cash: 0, card: 0, transfer: 0 };
      if (p.payment_method === "cash") map[d].cash += p.amount;
      else if (p.payment_method === "card") map[d].card += p.amount;
      else map[d].transfer += p.amount;
    });
    return Object.entries(map)
      .map(([date, v]) => ({ date, ...v, total: v.cash + v.card + v.transfer }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const exportCSV = () => {
    const header = "Payment Date,Order #,Customer,Method,Amount,Status\n";
    const rows = filtered.map((p) =>
      `${p.payment_date},${p.order_number},${p.customer_name},${p.payment_method},${p.amount.toFixed(3)},${p.payment_status}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashflow-${bounds?.[0] || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const todayStr = toDateStr(new Date());

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  const someVisibleSelected = filtered.some((p) => selectedIds.has(p.id));
  const toggleAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) filtered.forEach((p) => next.add(p.id));
      else filtered.forEach((p) => next.delete(p.id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const toDelete = payments.filter((p) => ids.includes(p.id));
      const affectedOrderIds = Array.from(new Set(toDelete.map((p) => p.order_id)));

      const { error: delErr } = await supabase.from("payments").delete().in("id", ids);
      if (delErr) throw delErr;

      for (const orderId of affectedOrderIds) {
        const { data: order } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("id", orderId)
          .maybeSingle();
        if (!order) continue;
        const { data: remainingPayments } = await supabase
          .from("payments")
          .select("amount")
          .eq("order_id", orderId);
        const paid = (remainingPayments || []).reduce((s, p: any) => s + Number(p.amount), 0);
        const total = Number(order.total_amount) || 0;
        const remaining = Math.max(0, total - paid);
        const status = paid <= 0 ? "unpaid" : remaining <= 0.001 ? "paid" : "partial";
        await supabase
          .from("orders")
          .update({ paid_amount: paid, remaining_amount: remaining, payment_status: status })
          .eq("id", orderId);
      }

      toast.success(`Deleted ${ids.length} payment${ids.length > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setConfirmOpen(false);
      await loadPayments();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete payments");
    } finally {
      setDeleting(false);
    }
  };

  const methodBadge = (m: string) => {
    switch (m) {
      case "cash": return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Cash</Badge>;
      case "card": return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Card</Badge>;
      case "bank-transfer": return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Transfer</Badge>;
      default: return <Badge variant="outline">{m}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Cashflow" subtitle="Payment tracking & daily reconciliation" />

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] text-xs", !customStart && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {customStart ? format(customStart, "dd/MM/yyyy") : "Start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customStart} onSelect={setCustomStart} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] text-xs", !customEnd && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {customEnd ? format(customEnd, "dd/MM/yyyy") : "End"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank-transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search order or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Cash</p>
                  <p className="text-xl font-bold text-foreground">{formatOMR(summary.cash)}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Card</p>
                  <p className="text-xl font-bold text-foreground">{formatOMR(summary.card)}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Transfer</p>
                  <p className="text-xl font-bold text-foreground">{formatOMR(summary.transfer)}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Collected</p>
                  <p className="text-xl font-bold text-primary">{formatOMR(summary.total)}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-lg font-bold">{summary.count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Avg Transaction</p>
              <p className="text-lg font-bold">{formatOMR(summary.avg)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Cash vs Card</p>
              <p className="text-lg font-bold">{summary.cashPct.toFixed(0)}% / {summary.cardPct.toFixed(0)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Highest Day</p>
              <p className="text-lg font-bold">{summary.highestDay ? formatOMR(summary.highestDay[1]) : "—"}</p>
              {summary.highestDay && <p className="text-[10px] text-muted-foreground">{summary.highestDay[0]}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Daily Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Daily Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Cash</TableHead>
                    <TableHead className="text-right">Card</TableHead>
                    <TableHead className="text-right">Transfer</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyBreakdown.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payments found</TableCell></TableRow>
                  )}
                  {dailyBreakdown.map((row) => (
                    <TableRow key={row.date} className={cn(row.date === todayStr && "bg-primary/5")}>
                      <TableCell className="font-medium">{row.date}{row.date === todayStr && <Badge variant="secondary" className="ml-2 text-[10px]">Today</Badge>}</TableCell>
                      <TableCell className="text-right">{formatOMR(row.cash)}</TableCell>
                      <TableCell className="text-right">{formatOMR(row.card)}</TableCell>
                      <TableCell className="text-right">{formatOMR(row.transfer)}</TableCell>
                      <TableCell className="text-right font-bold">{formatOMR(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Hash className="h-4 w-4" />Transactions ({filtered.length})</CardTitle>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={(c) => toggleAll(!!c)}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                  )}
                  {!loading && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No transactions found</TableCell></TableRow>
                  )}
                  {filtered.map((p) => (
                    <TableRow key={p.id} className={cn("hover:bg-muted/50", p.payment_date.split("T")[0] === todayStr && "bg-primary/5", selectedIds.has(p.id) && "bg-muted/60")}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={(c) => toggleOne(p.id, !!c)}
                          aria-label="Select payment"
                        />
                      </TableCell>
                      <TableCell className="text-sm cursor-pointer" onClick={() => navigate(`/order/${p.order_id}`)}>{format(new Date(p.payment_date), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="font-mono text-sm font-medium cursor-pointer" onClick={() => navigate(`/order/${p.order_id}`)}>{p.order_number}</TableCell>
                      <TableCell className="text-sm cursor-pointer" onClick={() => navigate(`/order/${p.order_id}`)}>{p.customer_name}</TableCell>
                      <TableCell className="cursor-pointer" onClick={() => navigate(`/order/${p.order_id}`)}>{methodBadge(p.payment_method)}</TableCell>
                      <TableCell className="text-right font-medium cursor-pointer" onClick={() => navigate(`/order/${p.order_id}`)}>{formatOMR(p.amount)}</TableCell>
                      <TableCell className="cursor-pointer" onClick={() => navigate(`/order/${p.order_id}`)}>
                        <Badge variant={p.payment_status === "paid" ? "default" : "secondary"} className="text-[10px]">
                          {p.payment_status === "paid" ? "Paid" : "Partial"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} payment{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the selected payment transactions and recalculate the related orders' paid and remaining amounts. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}
