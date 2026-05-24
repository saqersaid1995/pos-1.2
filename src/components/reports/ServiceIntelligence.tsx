import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, TrendingUp, TrendingDown, BarChart3, Layers } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import type { WorkflowOrder } from "@/types/workflow";

interface ServiceIntelligenceProps {
  orders: WorkflowOrder[];
}

type SortKey = "revenue" | "orders" | "revenueContrib" | "orderContrib" | "avgPrice" | "name";

interface ServiceRow {
  name: string;
  totalOrders: number;
  totalRevenue: number;
  avgPrice: number;
  revenueContrib: number;
  orderContrib: number;
  ordersPerCustomer: number;
  spendPerCustomer: number;
  classification: string;
}

interface ComboRow {
  garment: string;
  service: string;
  quantity: number;
  revenue: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 50%))",
  "hsl(var(--chart-3, 340 75% 55%))",
  "hsl(var(--chart-4, 160 60% 45%))",
  "hsl(var(--chart-5, 30 80% 55%))",
  "hsl(280 65% 55%)",
  "hsl(200 70% 50%)",
  "hsl(50 80% 50%)",
];

function classifyService(revenueContrib: number, orderContrib: number, avgRevContrib: number, avgOrdContrib: number): string {
  const highRev = revenueContrib >= avgRevContrib;
  const highOrd = orderContrib >= avgOrdContrib;
  if (highRev && highOrd) return "Star";
  if (highRev && !highOrd) return "High Revenue / Low Volume";
  if (!highRev && highOrd) return "High Volume / Low Revenue";
  return "Low / Low";
}

function classColor(c: string) {
  if (c === "Star") return "bg-primary text-primary-foreground";
  if (c.startsWith("High Revenue")) return "bg-[hsl(var(--chart-4,160_60%_45%))] text-white";
  if (c.startsWith("High Volume")) return "bg-[hsl(var(--warning))] text-white";
  return "bg-muted text-muted-foreground";
}

export function ServiceIntelligence({ orders }: ServiceIntelligenceProps) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"services" | "combos">("services");

  const { serviceRows, totalRevenue, totalOrders } = useMemo(() => {
    const svcMap: Record<string, { orders: Set<string>; revenue: number; qty: number; customers: Set<string> }> = {};

    orders.forEach((o) =>
      o.items.forEach((item) => {
        const key = item.service || "Unknown";
        if (!svcMap[key]) svcMap[key] = { orders: new Set(), revenue: 0, qty: 0, customers: new Set() };
        svcMap[key].orders.add(o.id);
        svcMap[key].revenue += item.unitPrice * item.quantity;
        svcMap[key].qty += item.quantity;
        svcMap[key].customers.add(o.customerName);
      })
    );

    const totalRevenue = Object.values(svcMap).reduce((s, v) => s + v.revenue, 0);
    const totalOrders = Object.values(svcMap).reduce((s, v) => s + v.orders.size, 0);
    const count = Object.keys(svcMap).length;
    const avgRevContrib = count > 0 ? 100 / count : 0;
    const avgOrdContrib = count > 0 ? 100 / count : 0;

    const rows: ServiceRow[] = Object.entries(svcMap).map(([name, data]) => {
      const revenueContrib = totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0;
      const orderContrib = totalOrders > 0 ? (data.orders.size / totalOrders) * 100 : 0;
      const custCount = data.customers.size || 1;
      return {
        name,
        totalOrders: data.orders.size,
        totalRevenue: data.revenue,
        avgPrice: data.orders.size > 0 ? data.revenue / data.orders.size : 0,
        revenueContrib,
        orderContrib,
        ordersPerCustomer: data.orders.size / custCount,
        spendPerCustomer: data.revenue / custCount,
        classification: classifyService(revenueContrib, orderContrib, avgRevContrib, avgOrdContrib),
      };
    });

    return { serviceRows: rows, totalRevenue, totalOrders };
  }, [orders]);

  const comboRows = useMemo(() => {
    const map: Record<string, ComboRow> = {};
    orders.forEach((o) =>
      o.items.forEach((item) => {
        const key = `${item.itemType}|||${item.service}`;
        if (!map[key]) map[key] = { garment: item.itemType, service: item.service || "Unknown", quantity: 0, revenue: 0 };
        map[key].quantity += item.quantity;
        map[key].revenue += item.unitPrice * item.quantity;
      })
    );
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const sorted = useMemo(() => {
    const arr = [...serviceRows];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "desc" ? -diff : diff;
    });
    return arr;
  }, [serviceRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "text-primary" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  const chartConfig: Record<string, { label: string; color: string }> = {};
  sorted.forEach((s, i) => { chartConfig[s.name] = { label: s.name, color: COLORS[i % COLORS.length] }; });

  if (orders.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Service Intelligence</h3>
        </div>
        <Select value={view} onValueChange={(v) => setView(v as any)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="services">Service Breakdown</SelectItem>
            <SelectItem value="combos">Garment × Service</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === "services" && (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Revenue by Service */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-semibold mb-3">Revenue by Service</h4>
                <ChartContainer config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" } }} className="h-[220px] w-full">
                  <BarChart data={sorted.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1).toFixed(1)}`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatOMR(Number(v))} />} />
                    <Bar dataKey="totalRevenue" name="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Orders by Service */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-semibold mb-3">Orders by Service</h4>
                <ChartContainer config={{ orders: { label: "Orders", color: "hsl(var(--chart-2, 220 70% 50%))" } }} className="h-[220px] w-full">
                  <BarChart data={sorted.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="totalOrders" name="orders" fill="hsl(var(--chart-2, 220 70% 50%))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Revenue Contribution Pie */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-semibold mb-3">Revenue Contribution</h4>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sorted} dataKey="totalRevenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, revenueContrib }) => `${name} ${revenueContrib.toFixed(0)}%`} labelLine={false} fontSize={9}>
                        {sorted.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(v) => formatOMR(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Full Service Table */}
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">All Services — Full Breakdown</h4>
                <span className="text-xs text-muted-foreground ml-auto">{sorted.length} services</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader label="Service" field="name" />
                      <SortHeader label="Orders" field="orders" />
                      <SortHeader label="Revenue" field="revenue" />
                      <SortHeader label="Avg Price" field="avgPrice" />
                      <SortHeader label="Rev %" field="revenueContrib" />
                      <SortHeader label="Ord %" field="orderContrib" />
                      <TableHead className="whitespace-nowrap">Ord/Cust</TableHead>
                      <TableHead className="whitespace-nowrap">Spend/Cust</TableHead>
                      <TableHead>Classification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.totalOrders}</TableCell>
                        <TableCell className="font-mono text-xs">{formatOMR(row.totalRevenue)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatOMR(row.avgPrice)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(row.revenueContrib, 100)}%` }} />
                            </div>
                            <span className="text-xs">{row.revenueContrib.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-[hsl(var(--chart-2,220_70%_50%))] rounded-full" style={{ width: `${Math.min(row.orderContrib, 100)}%` }} />
                            </div>
                            <span className="text-xs">{row.orderContrib.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{row.ordersPerCustomer.toFixed(1)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatOMR(row.spendPerCustomer)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] ${classColor(row.classification)}`}>
                            {row.classification}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell>{totalOrders}</TableCell>
                      <TableCell className="font-mono text-xs">{formatOMR(totalRevenue)}</TableCell>
                      <TableCell className="font-mono text-xs">{totalOrders > 0 ? formatOMR(totalRevenue / totalOrders) : "—"}</TableCell>
                      <TableCell>100%</TableCell>
                      <TableCell>100%</TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Customer Behavior Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sorted.slice(0, 4).map((s) => (
              <Card key={s.name}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{s.name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold">{s.ordersPerCustomer.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground">ord/cust</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatOMR(s.spendPerCustomer)} avg spend</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {view === "combos" && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border">
              <h4 className="text-sm font-semibold">Garment × Service Combinations</h4>
              <p className="text-xs text-muted-foreground">{comboRows.length} combinations found</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Garment</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Revenue %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comboRows.map((row, i) => {
                    const pct = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.garment}</TableCell>
                        <TableCell>{row.service}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell className="font-mono text-xs">{formatOMR(row.revenue)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs">{pct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell>{comboRows.reduce((s, r) => s + r.quantity, 0)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatOMR(totalRevenue)}</TableCell>
                    <TableCell>100%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
