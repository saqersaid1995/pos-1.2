import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DollarSign, ShoppingCart, AlertTriangle, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { exportSalesCSV } from "@/lib/report-exports";
import type { WorkflowOrder } from "@/types/workflow";

const PAGE_SIZE = 15;

function paymentBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-[hsl(142,72%,40%)]/10 text-[hsl(142,72%,40%)] border-[hsl(142,72%,40%)]/20",
    "partially-paid": "bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/20",
    unpaid: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return <Badge variant="outline" className={`text-xs font-normal ${map[status] || ""}`}>{status.replace("-", " ")}</Badge>;
}

function statusBadge(status: string) {
  return <Badge variant="secondary" className="text-xs font-normal capitalize">{status.replace(/-/g, " ")}</Badge>;
}

interface SalesTabProps {
  orders: WorkflowOrder[];
  kpis: any;
}

export function SalesTab({ orders, kpis }: SalesTabProps) {
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = orders;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q)
      );
    }
    if (paymentFilter !== "all") list = list.filter((o) => o.paymentStatus === paymentFilter);
    if (statusFilter !== "all") list = list.filter((o) => o.currentStatus === statusFilter);
    if (typeFilter !== "all") list = list.filter((o) => o.orderType === typeFilter);
    return list;
  }, [orders, search, paymentFilter, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const paidSales = orders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0);
  const unpaidSales = orders.filter((o) => o.paymentStatus === "unpaid").reduce((s, o) => s + o.totalAmount, 0);
  const partialSales = orders.filter((o) => o.paymentStatus === "partially-paid").reduce((s, o) => s + o.totalAmount, 0);
  const urgentSales = orders.filter((o) => o.orderType === "urgent").reduce((s, o) => s + o.totalAmount, 0);

  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No sales data for selected period</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Sales", value: formatOMR(kpis.totalRevenue), accent: "text-[hsl(var(--success))]" },
          { label: "Paid Sales", value: formatOMR(paidSales), accent: "text-[hsl(var(--success))]" },
          { label: "Unpaid Sales", value: formatOMR(unpaidSales), accent: "text-destructive" },
          { label: "Partial Payments", value: formatOMR(partialSales), accent: "text-[hsl(var(--warning))]" },
          { label: "Avg Order Value", value: formatOMR(kpis.avgOrderValue), accent: "text-primary" },
          { label: "Urgent Sales", value: formatOMR(urgentSales), accent: "text-[hsl(var(--warning))]" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              <p className={`text-lg font-bold mt-1 ${kpi.accent}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search order, customer, phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially-paid">Partial</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="ready-for-pickup">Ready</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => exportSalesCSV(filtered)}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{o.orderDate}</TableCell>
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell className="font-medium">{o.customerName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.customerPhone}</TableCell>
                    <TableCell className="text-center">{o.itemCount}</TableCell>
                    <TableCell><Badge variant={o.orderType === "urgent" ? "destructive" : "secondary"} className="text-xs">{o.orderType}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{formatOMR(o.totalAmount)}</TableCell>
                    <TableCell className="text-right">{formatOMR(o.paidAmount)}</TableCell>
                    <TableCell className="text-right">{o.remainingBalance > 0 ? <span className="text-destructive">{formatOMR(o.remainingBalance)}</span> : formatOMR(0)}</TableCell>
                    <TableCell>{paymentBadge(o.paymentStatus)}</TableCell>
                    <TableCell>{statusBadge(o.currentStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
