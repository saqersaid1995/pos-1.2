import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Receipt, Download } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { exportExpensesCSV } from "@/lib/report-exports";
import type { Expense } from "@/lib/expense-queries";

const PIE_COLORS = [
  "hsl(0, 72%, 51%)", "hsl(38, 92%, 50%)", "hsl(230, 60%, 50%)",
  "hsl(142, 72%, 40%)", "hsl(280, 50%, 55%)", "hsl(200, 70%, 50%)",
  "hsl(15, 80%, 55%)", "hsl(170, 60%, 45%)",
];

interface ExpensesTabProps {
  expenses: Expense[];
  expensesByCategory: { name: string; value: number }[];
}

export function ExpensesTab({ expenses, expensesByCategory }: ExpensesTabProps) {
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const fixedExpenses = expenses.filter((e) => e.is_recurring).reduce((s, e) => s + e.amount, 0);
  const variableExpenses = totalExpenses - fixedExpenses;
  const largestCategory = expensesByCategory.length > 0 ? expensesByCategory[0].name : "—";

  if (expenses.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No expense records for selected period</p>
      </div>
    );
  }

  // Monthly trend
  const monthlyMap: Record<string, number> = {};
  expenses.forEach((e) => {
    const month = e.expense_date.slice(0, 7);
    monthlyMap[month] = (monthlyMap[month] || 0) + e.amount;
  });
  const monthlyTrend = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Expenses", value: formatOMR(totalExpenses), accent: "text-destructive" },
          { label: "Fixed Expenses", value: formatOMR(fixedExpenses), accent: "text-[hsl(var(--warning))]" },
          { label: "Variable Expenses", value: formatOMR(variableExpenses), accent: "text-primary" },
          { label: "Largest Category", value: largestCategory, accent: "text-muted-foreground" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              <p className={`text-lg font-bold mt-1 ${kpi.accent}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-4">Expense Breakdown by Category</h3>
            <ChartContainer config={{ value: { label: "Amount" } }} className="h-[260px] w-full">
              <PieChart>
                <Pie data={expensesByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2}
                  label={({ name, value }) => `${name}: ${formatOMR(value)}`}>
                  {expensesByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        {monthlyTrend.length > 1 && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold mb-4">Monthly Expense Trend</h3>
              <ChartContainer config={{ amount: { label: "Expenses", color: "hsl(0, 72%, 51%)" } }} className="h-[260px] w-full">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="amount" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Expense Records</h3>
            <Button variant="outline" size="sm" onClick={() => exportExpensesCSV(expenses)}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{e.expense_date}</TableCell>
                    <TableCell className="font-medium">{e.category}</TableCell>
                    <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{formatOMR(e.amount)}</TableCell>
                    <TableCell className="text-xs capitalize">{e.payment_source || "cash"}</TableCell>
                    <TableCell className="text-xs">
                      <span className={e.expense_status === "paid" ? "text-[hsl(142,72%,40%)]" : "text-destructive"}>
                        {e.expense_status === "paid" ? "Paid" : "Accrued"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{e.is_auto_generated ? "Auto" : "Manual"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
