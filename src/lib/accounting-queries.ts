import { supabase } from "@/integrations/supabase/client";

// ============= Types =============
export type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
export type NormalBalance = "debit" | "credit";
export type ClassificationType =
  | "current_asset"
  | "non_current_asset"
  | "current_liability"
  | "non_current_liability"
  | "equity"
  | "revenue"
  | "expense";

export interface Account {
  id: string;
  code: string;
  account_name: string;
  account_type: AccountType;
  sub_type: string;
  normal_balance: NormalBalance;
  classification_type: ClassificationType;
  is_system: boolean;
  is_active: boolean;
  description?: string;
}

export interface AccountBalance extends Account {
  debit_total: number;
  credit_total: number;
  balance: number;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  source_type: "manual" | "order" | "payment" | "expense" | "expense_payment" | "opening";
  source_id: string | null;
  description: string;
  is_system: boolean;
  created_at: string;
}

export interface JournalEntryLine {
  id: string;
  entry_id: string;
  debit_account_id: string | null;
  credit_account_id: string | null;
  amount: number;
  line_description: string;
}

export interface AccountingSettings {
  id: string;
  accounting_start_date: string;
}

// ============= Settings =============
export async function fetchAccountingSettings(): Promise<AccountingSettings | null> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data as any;
}

export async function updateAccountingStartDate(id: string, date: string) {
  const { error } = await supabase
    .from("accounting_settings" as any)
    .update({ accounting_start_date: date })
    .eq("id", id);
  if (error) console.error(error);
  return !error;
}

export async function rebuildAccounting() {
  const { error } = await supabase.rpc("rebuild_accounting_from_cutoff" as any);
  if (error) console.error(error);
  return !error;
}

export interface RebuildSummary { entries_before: number; entries_after: number; unbalanced: number }
export async function rebuildAccountingWithSummary(): Promise<RebuildSummary | null> {
  const { data, error } = await supabase.rpc("rebuild_accounting_with_summary" as any);
  if (error) { console.error(error); return null; }
  return data as any;
}

// ============= Loan Audit =============
export interface LoanAuditRow {
  loan_id: string; loan_name: string; source_type: string;
  entry_id: string; entry_date: string; description: string;
  debit_amount: number; credit_amount: number;
}
export async function auditLoanJournalEntries(): Promise<LoanAuditRow[]> {
  const { data, error } = await supabase.rpc("audit_loan_journal_entries" as any);
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({
    ...r,
    debit_amount: Number(r.debit_amount || 0),
    credit_amount: Number(r.credit_amount || 0),
  }));
}

export interface DupLoanPosting { loan_id: string; loan_name: string; has_disbursement: boolean; has_opening: boolean }
export async function detectDuplicateLoanPostings(): Promise<DupLoanPosting[]> {
  const { data, error } = await supabase.rpc("detect_duplicate_loan_postings" as any);
  if (error) { console.error(error); return []; }
  return (data || []) as any;
}

// ============= Opening Balances =============
export interface OpeningBalanceLine { account_id: string; amount: number }

export async function fetchOpeningBalances(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("get_opening_balances" as any);
  if (error) { console.error(error); return {}; }
  const map: Record<string, number> = {};
  for (const r of (data || []) as any[]) {
    map[r.account_id] = Number(r.amount);
  }
  return map;
}

export async function postOpeningBalances(lines: OpeningBalanceLine[], equityAccountId: string) {
  const { error } = await supabase.rpc("post_opening_balances" as any, {
    _payload: { lines, equity_account_id: equityAccountId } as any,
  });
  if (error) console.error(error);
  return !error;
}

// ============= Chart of Accounts =============
export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts" as any)
    .select("*")
    .order("code", { ascending: true });
  if (error) { console.error(error); return []; }
  return (data || []) as any;
}

export async function fetchAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from("account_balances" as any)
    .select("*")
    .order("code", { ascending: true });
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({
    ...r,
    debit_total: Number(r.debit_total),
    credit_total: Number(r.credit_total),
    balance: Number(r.balance),
  }));
}

export async function createAccount(p: {
  code: string;
  account_name: string;
  account_type: AccountType;
  sub_type?: string;
  normal_balance: NormalBalance;
  classification_type: ClassificationType;
  description?: string;
}) {
  const { error } = await supabase.from("chart_of_accounts" as any).insert(p);
  if (error) console.error(error);
  return !error;
}

export async function updateAccount(id: string, patch: Partial<Account>) {
  const { error } = await supabase.from("chart_of_accounts" as any).update(patch).eq("id", id);
  if (error) console.error(error);
  return !error;
}

export async function deleteAccount(id: string) {
  const { error } = await supabase.from("chart_of_accounts" as any).delete().eq("id", id);
  if (error) console.error(error);
  return !error;
}

// ============= Journal =============
export async function fetchJournalEntries(limit = 200): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from("journal_entries" as any)
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error(error); return []; }
  return (data || []) as any;
}

export async function fetchJournalLines(entryIds: string[]): Promise<JournalEntryLine[]> {
  if (entryIds.length === 0) return [];
  const { data, error } = await supabase
    .from("journal_entry_lines" as any)
    .select("*")
    .in("entry_id", entryIds);
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

// ============= AR / AP =============
export interface ARRow {
  customer_id: string;
  full_name: string;
  phone_number: string;
  invoiced: number;
  paid: number;
  outstanding: number;
}

export async function fetchAccountsReceivable(cutoff: string): Promise<ARRow[]> {
  // Pull customers + their orders (after cutoff) and remaining_amount
  const { data: orders, error } = await supabase
    .from("orders")
    .select("customer_id, total_amount, paid_amount, remaining_amount, order_date, is_draft, is_deleted, customers(full_name, phone_number)")
    .eq("is_draft", false)
    .eq("is_deleted", false)
    .gte("order_date", cutoff);
  if (error) { console.error(error); return []; }

  const map = new Map<string, ARRow>();
  for (const o of (orders || []) as any[]) {
    if (!o.customer_id) continue;
    const r = map.get(o.customer_id) || {
      customer_id: o.customer_id,
      full_name: o.customers?.full_name || "—",
      phone_number: o.customers?.phone_number || "",
      invoiced: 0, paid: 0, outstanding: 0,
    };
    r.invoiced += Number(o.total_amount || 0);
    r.paid += Number(o.paid_amount || 0);
    r.outstanding += Number(o.remaining_amount || 0);
    map.set(o.customer_id, r);
  }
  return Array.from(map.values())
    .filter((r) => r.outstanding > 0.001)
    .sort((a, b) => b.outstanding - a.outstanding);
}

export interface APRow {
  expense_id: string;
  expense_date: string;
  due_date: string;
  category: string;
  description: string;
  amount: number;
  paid: number;
  remaining: number;
  status: string;
}

// ============= Account Ledger (drill-down) =============
export interface LedgerRow {
  entry_id: string;
  entry_date: string;
  source_type: string;
  description: string;
  line_description: string;
  debit: number;
  credit: number;
}

export async function fetchAccountLedger(accountId: string): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from("journal_entry_lines" as any)
    .select("id, amount, line_description, debit_account_id, credit_account_id, journal_entries!inner(id, entry_date, description, source_type)")
    .or(`debit_account_id.eq.${accountId},credit_account_id.eq.${accountId}`);
  if (error) { console.error(error); return []; }
  const rows = ((data || []) as any[]).map((r) => {
    const isDebit = r.debit_account_id === accountId;
    return {
      entry_id: r.journal_entries.id,
      entry_date: r.journal_entries.entry_date,
      source_type: r.journal_entries.source_type,
      description: r.journal_entries.description,
      line_description: r.line_description || "",
      debit: isDebit ? Number(r.amount) : 0,
      credit: isDebit ? 0 : Number(r.amount),
    } as LedgerRow;
  });
  rows.sort((a, b) =>
    a.entry_date === b.entry_date ? a.entry_id.localeCompare(b.entry_id) : a.entry_date.localeCompare(b.entry_date)
  );
  return rows;
}

// ============= Reconciliation helpers (Diagnostics) =============
export interface ReconRow {
  label: string;
  glAmount: number;
  moduleAmount: number;
  difference: number;
  ok: boolean;
}

export async function fetchLoansOutstandingTotal(): Promise<number> {
  const { data, error } = await supabase
    .from("loans" as any)
    .select("outstanding_balance, is_deleted, status")
    .eq("is_deleted", false);
  if (error) { console.error(error); return 0; }
  return ((data || []) as any[])
    .filter((l) => l.status !== "closed")
    .reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);
}

export async function fetchFixedAssetsTotals(): Promise<{ cost: number; accumDep: number }> {
  const [{ data: assets }, { data: deps }] = await Promise.all([
    supabase.from("fixed_assets" as any).select("cost, is_deleted, status"),
    supabase.from("depreciation_entries" as any).select("amount"),
  ]);
  const cost = ((assets || []) as any[])
    .filter((a) => !a.is_deleted && a.status !== "disposed")
    .reduce((s, a) => s + Number(a.cost || 0), 0);
  const accumDep = ((deps || []) as any[]).reduce((s, d) => s + Number(d.amount || 0), 0);
  return { cost, accumDep };
}

export async function fetchCustomersOutstandingTotal(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from("orders")
    .select("remaining_amount, is_draft, is_deleted, order_date")
    .eq("is_draft", false)
    .eq("is_deleted", false)
    .gte("order_date", cutoff);
  if (error) { console.error(error); return 0; }
  return ((data || []) as any[]).reduce((s, o) => s + Number(o.remaining_amount || 0), 0);
}

export async function fetchSuppliersOutstandingTotal(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from("expenses")
    .select("remaining_amount, expense_date, is_recurring, is_auto_generated")
    .gte("expense_date", cutoff);
  if (error) { console.error(error); return 0; }
  return ((data || []) as any[])
    .filter((e) => !(e.is_recurring && !e.is_auto_generated))
    .reduce((s, e) => s + Number(e.remaining_amount || 0), 0);
}

// ============= Journal integrity =============
export interface UnbalancedEntry { entry_id: string; entry_date: string; description: string; debit: number; credit: number; diff: number }

export async function fetchUnbalancedEntries(): Promise<UnbalancedEntry[]> {
  const [{ data: entries }, { data: lines }] = await Promise.all([
    supabase.from("journal_entries" as any).select("id, entry_date, description").order("entry_date", { ascending: false }).limit(2000),
    supabase.from("journal_entry_lines" as any).select("entry_id, amount, debit_account_id, credit_account_id").limit(20000),
  ]);
  const totals = new Map<string, { d: number; c: number; bad: boolean }>();
  for (const ln of (lines || []) as any[]) {
    const t = totals.get(ln.entry_id) || { d: 0, c: 0, bad: false };
    if (ln.debit_account_id) t.d += Number(ln.amount);
    if (ln.credit_account_id) t.c += Number(ln.amount);
    if (!ln.debit_account_id && !ln.credit_account_id) t.bad = true;
    if (Number(ln.amount) === 0) t.bad = true;
    totals.set(ln.entry_id, t);
  }
  const out: UnbalancedEntry[] = [];
  for (const e of (entries || []) as any[]) {
    const t = totals.get(e.id);
    if (!t) continue;
    const diff = Number((t.d - t.c).toFixed(3));
    if (Math.abs(diff) > 0.001 || t.bad) {
      out.push({ entry_id: e.id, entry_date: e.entry_date, description: e.description, debit: t.d, credit: t.c, diff });
    }
  }
  return out;
}

export async function fetchAccountsPayable(cutoff: string): Promise<APRow[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", cutoff)
    .order("due_date", { ascending: true });
  if (error) { console.error(error); return []; }
  return ((data || []) as any[])
    .filter((e) => !(e.is_recurring && !e.is_auto_generated))
    .filter((e) => Number(e.remaining_amount) > 0.001)
    .map((e) => ({
      expense_id: e.id,
      expense_date: e.expense_date,
      due_date: e.due_date || e.expense_date,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      paid: Number(e.paid_amount),
      remaining: Number(e.remaining_amount),
      status: e.expense_status,
    }));
}

// ============= Reports =============
export interface IncomeStatement {
  revenue: AccountBalance[];
  expenses: AccountBalance[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export function buildIncomeStatement(balances: AccountBalance[]): IncomeStatement {
  const revenue = balances.filter((a) => a.account_type === "Revenue");
  const expenses = balances.filter((a) => a.account_type === "Expense");
  // Revenue accounts have credit normal balance; contra-revenue (Discounts) is debit normal — its `balance` already reduces revenue when summed
  const totalRevenue = revenue.reduce((s, a) => s + (a.normal_balance === "credit" ? a.balance : -a.balance), 0);
  const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0);
  return { revenue, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
}

export function isContraAsset(a: AccountBalance | Account): boolean {
  // Contra-assets are classified under assets but have a credit normal balance
  // (e.g. Accumulated Depreciation). They REDUCE asset value on the Balance Sheet.
  return (
    (a.classification_type === "non_current_asset" || a.classification_type === "current_asset") &&
    a.normal_balance === "credit"
  );
}

export interface BalanceSheet {
  currentAssets: AccountBalance[];          // gross (debit-normal) current assets
  nonCurrentAssets: AccountBalance[];       // gross (debit-normal) non-current assets
  contraCurrentAssets: AccountBalance[];    // credit-normal classified as current asset
  contraNonCurrentAssets: AccountBalance[]; // e.g. Accumulated Depreciation
  currentLiabilities: AccountBalance[];
  nonCurrentLiabilities: AccountBalance[];
  equity: AccountBalance[];
  totalCurrentAssetsGross: number;
  totalNonCurrentAssetsGross: number;
  totalContraCurrentAssets: number;     // positive number, displayed as (x)
  totalContraNonCurrentAssets: number;  // positive number, displayed as (x)
  totalCurrentAssets: number;     // net (gross - contra)
  totalNonCurrentAssets: number;  // net (gross - contra)
  totalAssets: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarningsCalc: number;
  isBalanced: boolean;
  difference: number;
}

export function buildBalanceSheet(balances: AccountBalance[]): BalanceSheet {
  const sum = (arr: AccountBalance[]) => arr.reduce((s, a) => s + a.balance, 0);

  const allCurrent = balances.filter((a) => a.classification_type === "current_asset");
  const allNonCurrent = balances.filter((a) => a.classification_type === "non_current_asset");

  const currentAssets = allCurrent.filter((a) => !isContraAsset(a));
  const contraCurrentAssets = allCurrent.filter((a) => isContraAsset(a));
  const nonCurrentAssets = allNonCurrent.filter((a) => !isContraAsset(a));
  const contraNonCurrentAssets = allNonCurrent.filter((a) => isContraAsset(a));

  const currentLiabilities = balances.filter((a) => a.classification_type === "current_liability");
  const nonCurrentLiabilities = balances.filter((a) => a.classification_type === "non_current_liability");
  const equity = balances.filter((a) => a.account_type === "Equity");

  const totalCurrentAssetsGross = sum(currentAssets);
  const totalNonCurrentAssetsGross = sum(nonCurrentAssets);
  const totalContraCurrentAssets = sum(contraCurrentAssets);       // positive
  const totalContraNonCurrentAssets = sum(contraNonCurrentAssets); // positive
  const totalCurrentAssets = totalCurrentAssetsGross - totalContraCurrentAssets;
  const totalNonCurrentAssets = totalNonCurrentAssetsGross - totalContraNonCurrentAssets;
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const totalCurrentLiabilities = sum(currentLiabilities);
  const totalNonCurrentLiabilities = sum(nonCurrentLiabilities);
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
  const equityFromAccounts = sum(equity);
  const is = buildIncomeStatement(balances);
  const totalEquity = equityFromAccounts + is.netIncome;
  const difference = totalAssets - (totalLiabilities + totalEquity);

  return {
    currentAssets, nonCurrentAssets,
    contraCurrentAssets, contraNonCurrentAssets,
    currentLiabilities, nonCurrentLiabilities, equity,
    totalCurrentAssetsGross, totalNonCurrentAssetsGross,
    totalContraCurrentAssets, totalContraNonCurrentAssets,
    totalCurrentAssets, totalNonCurrentAssets, totalAssets,
    totalCurrentLiabilities, totalNonCurrentLiabilities, totalLiabilities,
    totalEquity, retainedEarningsCalc: is.netIncome,
    isBalanced: Math.abs(difference) < 0.01,
    difference,
  };
}
