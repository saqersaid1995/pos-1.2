import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ShoppingCart, Package, Truck, AlertTriangle, Clock, Zap } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import type { WorkflowOrder } from "@/types/workflow";
import { ServiceIntelligence } from "./ServiceIntelligence";

interface OrdersTabProps {
  orders: WorkflowOrder[];
  kpis: any;
  statusDistribution: { name: string; value: number }[];
  ordersByDay: { date: string; count: number }[];
  overdueOrders: WorkflowOrder[];
  readyForPickupOrders: WorkflowOrder[];
  itemTypeStats: { name: string; count: number }[];
  serviceStats: { name: string; revenue: number; count: number }[];
}

export function OrdersTab({ orders, kpis, statusDistribution, ordersByDay, overdueOrders, readyForPickupOrders, itemTypeStats, serviceStats }: OrdersTabProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No orders for selected period</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Orders", value: kpis.totalOrders, icon: ShoppingCart, accent: "text-primary" },
          { label: "Received", value: statusDistribution.find((s) => s.name === "Received")?.value || 0, icon: Clock, accent: "text-[hsl(var(--warning))]" },
          { label: "Ready for Pickup", value: kpis.readyForPickup, icon: Package, accent: "text-primary" },
          { label: "Delivered", value: kpis.deliveredOrders, icon: Truck, accent: "text-[hsl(var(--success))]" },
          { label: "Overdue", value: kpis.overdueOrders, icon: AlertTriangle, accent: "text-destructive" },
          { label: "Urgent Orders", value: kpis.urgentOrders, icon: Zap, accent: "text-[hsl(var(--warning))]" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
                <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Orders by Day */}
        {ordersByDay.length > 1 && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold mb-4">Orders by Day</h3>
              <ChartContainer config={{ count: { label: "Orders", color: "hsl(var(--primary))" } }} className="h-[220px] w-full">
                <BarChart data={ordersByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Status Breakdown */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-4">Orders by Status</h3>
            <div className="space-y-3">
              {statusDistribution.map((s) => {
                const pct = kpis.totalOrders > 0 ? (s.value / kpis.totalOrders) * 100 : 0;
                return (
                  <div key={s.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{s.name}</span>
                      <span className="font-medium">{s.value} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Intelligence */}
      <ServiceIntelligence orders={orders} />

      {/* Overdue / Ready */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {overdueOrders.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold">Overdue Orders ({overdueOrders.length})</h3>
              </div>
              <Table>
                <TableBody>
                  {overdueOrders.slice(0, 5).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                      <TableCell>{o.customerName}</TableCell>
                      <TableCell className="text-xs text-destructive">Due: {o.deliveryDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {readyForPickupOrders.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Ready for Pickup ({readyForPickupOrders.length})</h3>
              </div>
              <Table>
                <TableBody>
                  {readyForPickupOrders.slice(0, 5).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                      <TableCell>{o.customerName}</TableCell>
                      <TableCell className="text-right">{formatOMR(o.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
