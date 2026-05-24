import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import AppHeader from "@/components/AppHeader";
import { Receipt, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import {
  type Expense,
  fetchAllExpenses,
  deleteExpense,
  triggerRecurringGeneration,
  deriveLifecycleStatus,
} from "@/lib/expense-queries";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { ExpenseTable } from "@/components/expenses/ExpenseTable";
import { EditExpenseDialog } from "@/components/expenses/EditExpenseDialog";
import { RecurringPreview } from "@/components/expenses/RecurringPreview";
import { ExpensePaymentDialog } from "@/components/expenses/ExpensePaymentDialog";

function monthKey(date: string) {
  return date.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const Expenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [payingExpense, setPayingExpense] = useState<Expense | null>(null);

  const [activeMonth, setActiveMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setExpenses(await fetchAllExpenses());
    setLoading(false);
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleGenerate = async () => {
    setGenerating(true);
    const result = await triggerRecurringGeneration();
    setGenerating(false);
    if (result?.generated > 0) {
      toast.success(`Generated ${result.generated} recurring expense entr${result.generated > 1 ? "ies" : "y"}`);
      await loadExpenses();
    } else {
      toast.info("All recurring expenses are already up to date");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteExpense(id);
    if (ok) { toast.success("Expense deleted"); await loadExpenses(); }
  };

  // Real expenses (exclude recurring templates)
  const realExpenses = useMemo(
    () => expenses.filter(e => !e.is_recurring || e.is_auto_generated),
    [expenses]
  );

  const recurringTemplates = useMemo(
    () => expenses.filter(e => e.is_recurring && !e.is_auto_generated),
    [expenses]
  );

  // Group by month
  const monthGroups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    realExpenses.forEach(e => {
      const k = monthKey(e.due_date || e.expense_date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return map;
  }, [realExpenses]);

  // Available months (sorted desc) — always include current month
  const availableMonths = useMemo(() => {
    const set = new Set(monthGroups.keys());
    const current = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    set.add(current);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [monthGroups]);

  const monthExpenses = monthGroups.get(activeMonth) || [];

  // Stats for active month
  const monthStats = useMemo(() => {
    const total = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const paid = monthExpenses.reduce((s, e) => s + e.paid_amount, 0);
    const remaining = monthExpenses.reduce((s, e) => s + e.remaining_amount, 0);
    let overdueCount = 0;
    monthExpenses.forEach(e => {
      if (deriveLifecycleStatus(e) === "overdue") overdueCount++;
    });
    return { total, paid, remaining, overdueCount, count: monthExpenses.length };
  }, [monthExpenses]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Expenses" subtitle="Monthly accounting & lifecycle tracking" />

      <div className="p-4 max-w-[1300px] mx-auto space-y-6">
        {/* Add Expense Form */}
        <ExpenseForm onSaved={loadExpenses} />

        {/* Recurring Templates */}
        {recurringTemplates.length > 0 && (
          <RecurringPreview
            templates={recurringTemplates}
            onChanged={loadExpenses}
            onGenerate={handleGenerate}
            generating={generating}
          />
        )}

        {/* Month tabs */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Expense History
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setActiveMonth(shiftMonth(activeMonth, -1))} title="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setActiveMonth(shiftMonth(activeMonth, 1))} title="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating} className="ml-2">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${generating ? "animate-spin" : ""}`} />
                  Generate Missing
                </Button>
              </div>
            </div>

            <Tabs value={activeMonth} onValueChange={setActiveMonth} className="mt-3">
              <TabsList className="flex-wrap h-auto justify-start">
                {availableMonths.slice(0, 8).map((m) => {
                  const count = monthGroups.get(m)?.length || 0;
                  return (
                    <TabsTrigger key={m} value={m} className="text-xs gap-1.5">
                      {monthLabel(m)}
                      {count > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{count}</Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Month KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Total" value={formatOMR(monthStats.total)} />
              <StatTile label="Paid" value={formatOMR(monthStats.paid)} accent="text-success" />
              <StatTile label="Outstanding" value={formatOMR(monthStats.remaining)}
                accent={monthStats.remaining > 0 ? "text-destructive" : "text-muted-foreground"} />
              <StatTile label="Overdue" value={String(monthStats.overdueCount)}
                accent={monthStats.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"} />
            </div>

            <ExpenseTable
              expenses={monthExpenses}
              loading={loading}
              onDelete={handleDelete}
              onEdit={(exp) => setEditingExpense(exp)}
              onPay={(exp) => setPayingExpense(exp)}
            />
          </CardContent>
        </Card>
      </div>

      <EditExpenseDialog
        expense={editingExpense}
        open={!!editingExpense}
        onOpenChange={(open) => { if (!open) setEditingExpense(null); }}
        onSaved={loadExpenses}
      />

      <ExpensePaymentDialog
        expense={payingExpense}
        open={!!payingExpense}
        onOpenChange={(open) => { if (!open) setPayingExpense(null); }}
        onChanged={loadExpenses}
      />
    </div>
  );
};

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-1 ${accent || "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default Expenses;
