import { useState, useMemo, useEffect, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wallet, Banknote, Building2, ArrowDownCircle, ArrowUpCircle,
  Scale, CalendarClock, TrendingUp, TrendingDown, Save, Pencil, CalendarIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { formatOMR } from "@/lib/currency";
import { cn, toLocalDateStr } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllExpenses, fetchAllExpensePayments, type Expense, type ExpensePayment } from "@/lib/expense-queries";
import { toast } from "sonner";
import { MonthlyCashMovementCard } from "@/components/cash/MonthlyCashMovementCard";
import { CashTransferCard } from "@/components/cash/CashTransferCard";

interface OpeningBalance {
  id?: string;
  account_type: "cash" | "bank";
  amount: number;
  as_of_date: string;
  notes?: string;
}

type RangePreset = "this-month" | "last-month" | "last-3-months" | "this-year" | "all" | "custom";

interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
}

const toDateStr = (d: Date) => toLocalDateStr(d);

function getRangeBounds(preset: RangePreset): [string, string] | null {
  const today = toDateStr(new Date());
  const d = new Date();
  switch (preset) {
    case "this-month": { const s = new Date(); s.setDate(1); return [toDateStr(s), today]; }
    case "last-month": {
      const s = new Date(); s.setMonth(s.getMonth() - 1, 1);
      const e = new Date(); e.setDate(0);
      return [toDateStr(s), toDateStr(e)];
    }
    case "last-3-months": { const s = new Date(); s.setMonth(s.getMonth() - 3); return [toDateStr(s), today]; }
    case "this-year": return [`${d.getFullYear()}-01-01`, today];
    case "all": return null;
  }
}

export default function CashManagement() {
  const [preset, setPreset] = useState<RangePreset>("this-month");
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensePayments, setExpensePayments] = useState<ExpensePayment[]>([]);
  const [transfers, setTransfers] = useState<{ id: string; transfer_date: string; from_account: "cash"|"bank"; to_account: "cash"|"bank"; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actualBank, setActualBank] = useState<string>("");

  const bounds = useMemo(() => {
    if (preset === "custom") {
      if (customStart && customEnd) return [toDateStr(customStart), toDateStr(customEnd)] as [string, string];
      return null;
    }
    return getRangeBounds(preset);
  }, [preset, customStart, customEnd]);

  const [openingCash, setOpeningCash] = useState<OpeningBalance>({ account_type: "cash", amount: 0, as_of_date: toDateStr(new Date()) });
  const [openingBank, setOpeningBank] = useState<OpeningBalance>({ account_type: "bank", amount: 0, as_of_date: toDateStr(new Date()) });
  const [editingOpening, setEditingOpening] = useState(false);
  const [savingOpening, setSavingOpening] = useState(false);

  // Index expense payment_source split (mixed → keep full split via expense link)
  const expenseSourceMap = useMemo(() => {
    const m = new Map<string, Expense>();
    expenses.forEach((e) => m.set(e.id, e));
    return m;
  }, [expenses]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: payData }, allExpenses, allExpensePayments, { data: openingData }, { data: transferData }] = await Promise.all([
      supabase.from("payments").select("id, amount, payment_date, payment_method").order("payment_date", { ascending: false }),
      fetchAllExpenses(),
      fetchAllExpensePayments(),
      supabase.from("opening_balances" as any).select("*"),
      supabase.from("cash_transfers" as any).select("id, transfer_date, from_account, to_account, amount"),
    ]);
    const mapped: PaymentRow[] = (payData || []).map((p: any) => ({
      id: p.id,
      amount: Number(p.amount),
      payment_date: p.payment_date,
      payment_method: p.payment_method,
    }));
    setPayments(mapped);
    setExpenses(allExpenses);
    setExpensePayments(allExpensePayments);
    setTransfers(((transferData || []) as any[]).map((t) => ({ ...t, amount: Number(t.amount) })));
    const cash = (openingData as any[])?.find((o) => o.account_type === "cash");
    const bank = (openingData as any[])?.find((o) => o.account_type === "bank");
    if (cash) setOpeningCash({ id: cash.id, account_type: "cash", amount: Number(cash.amount), as_of_date: cash.as_of_date, notes: cash.notes });
    if (bank) setOpeningBank({ id: bank.id, account_type: "bank", amount: Number(bank.amount), as_of_date: bank.as_of_date, notes: bank.notes });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveOpeningBalances = async () => {
    setSavingOpening(true);
    try {
      for (const ob of [openingCash, openingBank]) {
        const payload = { account_type: ob.account_type, amount: ob.amount, as_of_date: ob.as_of_date, notes: ob.notes || "" };
        if (ob.id) {
          const { error } = await supabase.from("opening_balances" as any).update(payload).eq("id", ob.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("opening_balances" as any).insert(payload);
          if (error) throw error;
        }
      }
      toast.success("Opening balances saved");
      setEditingOpening(false);
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingOpening(false);
    }
  };

  // Real expenses only — exclude recurring templates (they only define schedule,
  // their auto-generated children are the actual transactions).
  const realExpenses = useMemo(
    () => expenses.filter((e) => !e.is_recurring || e.is_auto_generated),
    [expenses]
  );

  // Helper: split a payment row into cash/bank using its source (and parent expense for 'mixed')
  function splitPayment(amt: number, source: string, parentExpenseId?: string): { cash: number; bank: number } {
    if (source === "cash") return { cash: amt, bank: 0 };
    if (source === "bank") return { cash: 0, bank: amt };
    // mixed → use parent expense ratio if available
    const parent = parentExpenseId ? expenseSourceMap.get(parentExpenseId) : null;
    if (parent && parent.amount > 0) {
      const ratio = Number(parent.cash_amount || 0) / parent.amount;
      return { cash: amt * ratio, bank: amt * (1 - ratio) };
    }
    return { cash: amt, bank: 0 };
  }

  // ========== CASH POSITION (lifetime) ==========
  const cashPosition = useMemo(() => {
    let cashIn = 0, bankIn = 0;
    payments.forEach((p) => {
      if (p.payment_method === "cash") cashIn += p.amount;
      else bankIn += p.amount;
    });
    let cashOut = 0, bankOut = 0;
    expensePayments.forEach((p) => {
      const { cash, bank } = splitPayment(p.amount, p.payment_source, p.expense_id);
      cashOut += cash; bankOut += bank;
    });
    transfers.forEach((t) => {
      if (t.from_account === "cash") cashOut += t.amount; else bankOut += t.amount;
      if (t.to_account === "cash") cashIn += t.amount; else bankIn += t.amount;
    });
    const cashBalance = openingCash.amount + cashIn - cashOut;
    const bankBalance = openingBank.amount + bankIn - bankOut;
    return {
      openingCash: openingCash.amount, openingBank: openingBank.amount,
      cashIn, bankIn, cashOut, bankOut,
      cashBalance, bankBalance, total: cashBalance + bankBalance,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, expensePayments, transfers, expenseSourceMap, openingCash.amount, openingBank.amount]);

  // ========== PERIOD-FILTERED INFLOWS / OUTFLOWS ==========
  const periodPayments = useMemo(() => {
    if (!bounds) return payments;
    return payments.filter((p) => {
      const d = p.payment_date.slice(0, 10);
      return d >= bounds[0] && d <= bounds[1];
    });
  }, [payments, bounds]);

  const periodExpensePayments = useMemo(() => {
    if (!bounds) return expensePayments;
    return expensePayments.filter((p) => p.payment_date >= bounds[0] && p.payment_date <= bounds[1]);
  }, [expensePayments, bounds]);

  const periodTransfers = useMemo(() => {
    if (!bounds) return transfers;
    return transfers.filter((t) => t.transfer_date >= bounds[0] && t.transfer_date <= bounds[1]);
  }, [transfers, bounds]);

  // Dynamic opening balance for the selected period
  const periodOpening = useMemo(() => {
    if (!bounds) return { cash: openingCash.amount, bank: openingBank.amount };
    const start = bounds[0];
    let cash = openingCash.amount;
    let bank = openingBank.amount;
    payments.forEach((p) => {
      if (p.payment_date.slice(0, 10) < start) {
        if (p.payment_method === "cash") cash += p.amount;
        else bank += p.amount;
      }
    });
    expensePayments.forEach((p) => {
      if (p.payment_date < start) {
        const s = splitPayment(p.amount, p.payment_source, p.expense_id);
        cash -= s.cash; bank -= s.bank;
      }
    });
    transfers.forEach((t) => {
      if (t.transfer_date < start) {
        if (t.from_account === "cash") cash -= t.amount; else bank -= t.amount;
        if (t.to_account === "cash") cash += t.amount; else bank += t.amount;
      }
    });
    return { cash, bank };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, payments, expensePayments, transfers, expenseSourceMap, openingCash.amount, openingBank.amount]);

  const summary = useMemo(() => {
    const inflows = periodPayments.reduce((s, p) => s + p.amount, 0);
    const outflows = periodExpensePayments.reduce((s, p) => s + p.amount, 0);
    return { inflows, outflows, net: inflows - outflows };
  }, [periodPayments, periodExpensePayments]);

  // ========== DAILY MOVEMENT TABLE ==========
  const dailyMovements = useMemo(() => {
    const map: Record<string, { cashIn: number; cashOut: number; bankIn: number; bankOut: number }> = {};
    const ensure = (d: string) => {
      if (!map[d]) map[d] = { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 };
      return map[d];
    };
    periodPayments.forEach((p) => {
      const d = p.payment_date.slice(0, 10);
      const row = ensure(d);
      if (p.payment_method === "cash") row.cashIn += p.amount;
      else row.bankIn += p.amount;
    });
    periodExpensePayments.forEach((p) => {
      const row = ensure(p.payment_date);
      const s = splitPayment(p.amount, p.payment_source, p.expense_id);
      row.cashOut += s.cash; row.bankOut += s.bank;
    });
    periodTransfers.forEach((t) => {
      const row = ensure(t.transfer_date);
      if (t.from_account === "cash") row.cashOut += t.amount; else row.bankOut += t.amount;
      if (t.to_account === "cash") row.cashIn += t.amount; else row.bankIn += t.amount;
    });
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    let runningCash = periodOpening.cash, runningBank = periodOpening.bank;
    return sorted.map(([date, v]) => {
      runningCash += v.cashIn - v.cashOut;
      runningBank += v.bankIn - v.bankOut;
      return { date, ...v, runningCash, runningBank, runningTotal: runningCash + runningBank };
    }).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodPayments, periodExpensePayments, periodTransfers, periodOpening.cash, periodOpening.bank]);

  // ========== RECONCILIATION ==========
  const reconciliation = useMemo(() => {
    const actual = parseFloat(actualBank);
    if (isNaN(actual)) return null;
    const diff = actual - cashPosition.bankBalance;
    return { actual, system: cashPosition.bankBalance, diff };
  }, [actualBank, cashPosition.bankBalance]);

  // ========== FUTURE PAYMENTS ==========
  // Only count REAL outstanding obligations (accrued/partial expenses with remaining balance).
  // Recurring TEMPLATES are excluded — they only define a schedule and have not yet generated
  // an actual liability. Once "Generate Missing Entries" runs, the resulting accrued instance
  // will appear here automatically.
  const futurePayments = useMemo(() => {
    const upcoming = expenses
      .filter((e) => {
        // Skip recurring templates entirely
        if (e.is_recurring && !e.is_auto_generated) return false;
        // Outstanding (accrued/partial) expenses still owe money
        return e.remaining_amount > 0.001;
      })
      .map((e) => ({
        id: e.id,
        date: e.due_date || e.expense_date,
        description: e.description || e.category,
        category: e.category,
        amount: e.remaining_amount,
        recurring: false,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalUpcoming = upcoming.reduce((s, x) => s + x.amount, 0);
    const remainingAfter = cashPosition.total - totalUpcoming;
    return { list: upcoming, totalUpcoming, remainingAfter };
  }, [expenses, cashPosition.total]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Cash Management" subtitle="Cash position, movement & reconciliation" />

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 space-y-6">
        {/* Range filter */}
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-xs text-muted-foreground">Period for movements & summary:</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="last-3-months">Last 3 Months</SelectItem>
              <SelectItem value="this-year">This Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] text-xs", !customStart && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {customStart ? format(customStart, "dd/MM/yyyy") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customStart} onSelect={setCustomStart} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-xs">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] text-xs", !customEnd && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {customEnd ? format(customEnd, "dd/MM/yyyy") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {(!customStart || !customEnd) && (
                <span className="text-xs text-warning">Select both dates</span>
              )}
            </div>
          )}

          {bounds && (
            <Badge variant="outline" className="text-[10px]">
              {bounds[0]} → {bounds[1]}
            </Badge>
          )}
        </div>

        {/* Opening Balances */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Opening Balances
              <span className="text-xs text-muted-foreground font-normal">(starting point — not counted as income/expense)</span>
            </CardTitle>
            {!editingOpening ? (
              <Button size="sm" variant="outline" onClick={() => setEditingOpening(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditingOpening(false); loadData(); }}>Cancel</Button>
                <Button size="sm" onClick={saveOpeningBalances} disabled={savingOpening}>
                  <Save className="h-3.5 w-3.5 mr-1" /> {savingOpening ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OpeningBalanceField
                label="Opening Cash Balance"
                icon={<Banknote className="h-4 w-4" />}
                value={openingCash}
                editing={editingOpening}
                onChange={setOpeningCash}
              />
              <OpeningBalanceField
                label="Opening Bank Balance"
                icon={<Building2 className="h-4 w-4" />}
                value={openingBank}
                editing={editingOpening}
                onChange={setOpeningBank}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Formula: <span className="font-mono">Opening Balance + Inflows − Outflows = Current Balance</span>
            </p>
          </CardContent>
        </Card>

        {/* 1. Cash Position (lifetime) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" /> Cash Position <span className="text-xs text-muted-foreground font-normal">(lifetime)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PositionCard
                label="Cash Balance"
                value={cashPosition.cashBalance}
                icon={<Banknote className="h-5 w-5" />}
                tone="success"
                subtitle={`Opening ${formatOMR(cashPosition.openingCash)} + In ${formatOMR(cashPosition.cashIn)} − Out ${formatOMR(cashPosition.cashOut)}`}
              />
              <PositionCard
                label="Bank Balance"
                value={cashPosition.bankBalance}
                icon={<Building2 className="h-5 w-5" />}
                tone="primary"
                subtitle={`Opening ${formatOMR(cashPosition.openingBank)} + In ${formatOMR(cashPosition.bankIn)} − Out ${formatOMR(cashPosition.bankOut)}`}
              />
              <PositionCard
                label="Total Balance"
                value={cashPosition.total}
                icon={<Wallet className="h-5 w-5" />}
                tone="accent"
                highlight
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Cashflow Summary (period) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Cashflow Summary <span className="text-xs text-muted-foreground font-normal">(selected period)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Period Opening Cash</p>
                <p className="text-lg font-bold">{formatOMR(periodOpening.cash)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Balance before period start</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Period Opening Bank</p>
                <p className="text-lg font-bold">{formatOMR(periodOpening.bank)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Balance before period start</p>
              </div>
              <div className="rounded-lg border bg-primary/5 border-primary/20 p-3">
                <p className="text-xs text-muted-foreground">Period Opening Total</p>
                <p className="text-lg font-bold text-primary">{formatOMR(periodOpening.cash + periodOpening.bank)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Dynamic — updates with date range</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard
                label="Total Inflows (Sales)"
                value={summary.inflows}
                icon={<ArrowDownCircle className="h-5 w-5" />}
                tone="success"
              />
              <SummaryCard
                label="Total Outflows (Expenses)"
                value={summary.outflows}
                icon={<ArrowUpCircle className="h-5 w-5" />}
                tone="destructive"
              />
              <SummaryCard
                label="Net Cashflow"
                value={summary.net}
                icon={summary.net >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                tone={summary.net >= 0 ? "success" : "destructive"}
                highlight
              />
            </div>
          </CardContent>
        </Card>

        {/* 3. Daily Movement Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daily Movement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right text-success">Cash In</TableHead>
                    <TableHead className="text-right text-destructive">Cash Out</TableHead>
                    <TableHead className="text-right text-success">Bank In</TableHead>
                    <TableHead className="text-right text-destructive">Bank Out</TableHead>
                    <TableHead className="text-right font-bold">Running Cash</TableHead>
                    <TableHead className="text-right font-bold">Running Bank</TableHead>
                    <TableHead className="text-right font-bold">Running Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                  )}
                  {!loading && dailyMovements.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No movements in this period</TableCell></TableRow>
                  )}
                  {dailyMovements.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium">{row.date}</TableCell>
                      <TableCell className="text-right text-success">{row.cashIn > 0 ? formatOMR(row.cashIn) : "—"}</TableCell>
                      <TableCell className="text-right text-destructive">{row.cashOut > 0 ? formatOMR(row.cashOut) : "—"}</TableCell>
                      <TableCell className="text-right text-success">{row.bankIn > 0 ? formatOMR(row.bankIn) : "—"}</TableCell>
                      <TableCell className="text-right text-destructive">{row.bankOut > 0 ? formatOMR(row.bankOut) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatOMR(row.runningCash)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatOMR(row.runningBank)}</TableCell>
                      <TableCell className={cn("text-right font-bold", row.runningTotal >= 0 ? "text-foreground" : "text-destructive")}>
                        {formatOMR(row.runningTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 4. Reconciliation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" /> Bank Reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Actual Bank Balance</Label>
                <Input
                  type="number"
                  step="0.001"
                  placeholder="Enter your bank statement balance"
                  value={actualBank}
                  onChange={(e) => setActualBank(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">System Bank Balance</Label>
                <div className="mt-1 h-10 flex items-center px-3 rounded-md border bg-muted/30 font-semibold">
                  {formatOMR(cashPosition.bankBalance)}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Difference</Label>
                <div className={cn(
                  "mt-1 h-10 flex items-center px-3 rounded-md border font-bold",
                  reconciliation
                    ? Math.abs(reconciliation.diff) < 0.001
                      ? "bg-success/10 border-success/30 text-success"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-muted/30 text-muted-foreground"
                )}>
                  {reconciliation ? (
                    <>
                      {reconciliation.diff >= 0 ? "+" : ""}{formatOMR(reconciliation.diff)}
                      {Math.abs(reconciliation.diff) < 0.001 && (
                        <Badge variant="outline" className="ml-2 bg-success/10 text-success border-success/30">Reconciled ✓</Badge>
                      )}
                    </>
                  ) : "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cash ↔ Bank Transfers */}
        <CashTransferCard onChanged={loadData} />

        {/* Monthly Cash Movement (from GL) */}
        <MonthlyCashMovementCard />

        {/* 5. Future Payments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Future Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Current Total Balance</p>
                <p className="text-lg font-bold">{formatOMR(cashPosition.total)}</p>
              </div>
              <div className="rounded-lg border bg-warning/10 border-warning/30 p-3">
                <p className="text-xs text-muted-foreground">Total Upcoming Outflows</p>
                <p className="text-lg font-bold text-warning">{formatOMR(futurePayments.totalUpcoming)}</p>
              </div>
              <div className={cn(
                "rounded-lg border p-3",
                futurePayments.remainingAfter >= 0
                  ? "bg-success/10 border-success/30"
                  : "bg-destructive/10 border-destructive/30"
              )}>
                <p className="text-xs text-muted-foreground">Remaining After Payments</p>
                <p className={cn("text-lg font-bold", futurePayments.remainingAfter >= 0 ? "text-success" : "text-destructive")}>
                  {formatOMR(futurePayments.remainingAfter)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {futurePayments.list.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No upcoming payments scheduled</TableCell></TableRow>
                  )}
                  {futurePayments.list.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.date}</TableCell>
                      <TableCell>{p.description || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                      <TableCell>
                        {p.recurring
                          ? <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Recurring</Badge>
                          : <Badge variant="outline">One-off</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatOMR(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PositionCard({ label, value, icon, tone, highlight, subtitle }: {
  label: string; value: number; icon: React.ReactNode;
  tone: "success" | "primary" | "accent"; highlight?: boolean; subtitle?: string;
}) {
  const toneClasses = {
    success: "bg-success/10 text-success border-success/30",
    primary: "bg-primary/10 text-primary border-primary/30",
    accent: "bg-accent/20 text-foreground border-accent/40",
  }[tone];
  const negative = value < 0;
  return (
    <div className={cn("rounded-lg border p-4 flex items-start justify-between gap-3", highlight && "ring-2 ring-primary/20", toneClasses)}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium opacity-80">{label}</p>
        <p className={cn("text-2xl font-bold mt-1", negative && "text-destructive")}>{formatOMR(value)}</p>
        {subtitle && <p className="text-[10px] opacity-70 mt-1 truncate">{subtitle}</p>}
      </div>
      <div className="opacity-70 shrink-0">{icon}</div>
    </div>
  );
}

function OpeningBalanceField({ label, icon, value, editing, onChange }: {
  label: string; icon: React.ReactNode;
  value: OpeningBalance; editing: boolean;
  onChange: (v: OpeningBalance) => void;
}) {
  return (
    <div className="rounded-lg border p-4 bg-muted/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <Label className="text-xs font-medium">{label}</Label>
        <Badge variant="outline" className="ml-auto text-[10px]">Opening Balance</Badge>
      </div>
      {editing ? (
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Amount (OMR)</Label>
            <Input
              type="number"
              step="0.001"
              value={value.amount}
              onChange={(e) => onChange({ ...value, amount: parseFloat(e.target.value) || 0 })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">As of date</Label>
            <Input
              type="date"
              value={value.as_of_date}
              onChange={(e) => onChange({ ...value, as_of_date: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold">{formatOMR(value.amount)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">As of {value.as_of_date}</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, tone, highlight }: {
  label: string; value: number; icon: React.ReactNode;
  tone: "success" | "destructive"; highlight?: boolean;
}) {
  const toneClasses = {
    success: "bg-success/10 text-success border-success/30",
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-4 flex items-center justify-between", highlight && "ring-2 ring-primary/20", toneClasses)}>
      <div>
        <p className="text-xs font-medium opacity-80">{label}</p>
        <p className="text-2xl font-bold mt-1">{formatOMR(value)}</p>
      </div>
      <div className="opacity-70">{icon}</div>
    </div>
  );
}
