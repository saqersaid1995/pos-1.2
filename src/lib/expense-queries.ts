import { supabase } from "@/integrations/supabase/client";
import { toLocalDateStr } from "@/lib/utils";

export interface Expense {
  id: string;
  expense_date: string;
  due_date: string | null;
  category: string;
  description: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  is_recurring: boolean;
  recurring_period: string | null;
  billing_day: number | null;
  next_run_date: string | null;
  last_run_date: string | null;
  expense_status: string; // 'accrued' | 'partial' | 'paid'
  is_auto_generated: boolean;
  parent_recurring_id: string | null;
  payment_source: string;
  cash_amount: number;
  bank_amount: number;
  income_category: IncomeCategory;
  pl_line: PLLine;
  created_at: string;
  updated_at: string;
}

export interface ExpensePayment {
  id: string;
  expense_id: string;
  amount: number;
  payment_date: string;
  payment_source: string; // cash | bank | mixed
  notes: string;
  created_at: string;
}

export const PAYMENT_SOURCES = ["cash", "bank", "mixed"] as const;

// Legacy income category type
export type IncomeCategory =
  | "cogs" | "salaries" | "rent" | "utilities" | "marketing"
  | "other_opex" | "depreciation" | "interest" | "non_operating";

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string; group: "cogs" | "opex" | "below_ebitda" | "non_op" }[] = [
  { value: "cogs", label: "COGS (Cost of Sales)", group: "cogs" },
  { value: "salaries", label: "Salaries (OPEX)", group: "opex" },
  { value: "rent", label: "Rent (OPEX)", group: "opex" },
  { value: "utilities", label: "Utilities (OPEX)", group: "opex" },
  { value: "marketing", label: "Marketing (OPEX)", group: "opex" },
  { value: "other_opex", label: "Other OPEX", group: "opex" },
  { value: "depreciation", label: "Depreciation", group: "below_ebitda" },
  { value: "interest", label: "Interest", group: "below_ebitda" },
  { value: "non_operating", label: "Non-operating Income/Expense", group: "non_op" },
];

export function autoMapIncomeCategory(category: string): IncomeCategory {
  switch (category) {
    case "Salaries": return "salaries";
    case "Rent": return "rent";
    case "Utilities": return "utilities";
    case "Marketing": return "marketing";
    case "Loan": return "interest";
    case "Supplies": return "cogs";
    default: return "other_opex";
  }
}

export type PLLine =
  | "revenue" | "cogs" | "sga_admin" | "other_operating_income"
  | "depreciation" | "interest_expense" | "interest_income" | "other_income" | "tax_provision";

export const PL_LINES: { value: PLLine; label: string; group: "revenue" | "cogs" | "opex" | "operating_income" | "below_ebitda" | "non_op" | "tax" }[] = [
  { value: "revenue", label: "Gross Sales / Revenue", group: "revenue" },
  { value: "cogs", label: "Cost of Goods Sold", group: "cogs" },
  { value: "sga_admin", label: "S, G & A including depreciation - admin", group: "opex" },
  { value: "other_operating_income", label: "Other Operating Income", group: "operating_income" },
  { value: "depreciation", label: "Depreciation / Amortization - total", group: "below_ebitda" },
  { value: "interest_expense", label: "Interest Expenses", group: "below_ebitda" },
  { value: "interest_income", label: "Interest Income", group: "non_op" },
  { value: "other_income", label: "Other Income", group: "non_op" },
  { value: "tax_provision", label: "Provision for Tax", group: "tax" },
];

export function suggestPLLine(category: string): PLLine {
  switch (category) {
    case "Loan": return "interest_expense";
    case "Supplies": return "cogs";
    default: return "sga_admin";
  }
}

export const EXPENSE_CATEGORIES = [
  "Rent", "Salaries", "Utilities", "Supplies", "Maintenance",
  "Marketing", "Fuel", "Loan", "Other",
] as const;

export const RECURRING_PERIODS = ["Weekly", "Monthly", "Yearly"] as const;
export const EXPENSE_STATUSES = ["accrued", "partial", "paid"] as const;

// ============= Lifecycle helpers =============

export type LifecycleStatus = "accrued" | "partial" | "paid" | "overdue";

/** Computes display status, factoring overdue logic. */
export function deriveLifecycleStatus(e: Expense, today = toLocalDateStr()): LifecycleStatus {
  if (e.expense_status === "paid") return "paid";
  const due = e.due_date || e.expense_date;
  if (due < today && e.remaining_amount > 0.001) return "overdue";
  if (e.expense_status === "partial") return "partial";
  return "accrued";
}

export function statusBadgeClass(status: LifecycleStatus): string {
  switch (status) {
    case "paid": return "bg-success/10 text-success border-success/30";
    case "partial": return "bg-primary/10 text-primary border-primary/30";
    case "overdue": return "bg-destructive/10 text-destructive border-destructive/30";
    case "accrued":
    default: return "bg-warning/10 text-warning border-warning/30";
  }
}

export function statusLabel(status: LifecycleStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ============= Queries =============

export async function fetchAllExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });

  if (error) {
    console.error("fetchAllExpenses error:", error);
    return [];
  }
  return (data || []).map(normalizeExpense);
}

function normalizeExpense(r: any): Expense {
  return {
    ...r,
    amount: Number(r.amount),
    paid_amount: Number(r.paid_amount || 0),
    remaining_amount: Number(r.remaining_amount ?? r.amount),
    cash_amount: Number(r.cash_amount || 0),
    bank_amount: Number(r.bank_amount || 0),
    due_date: r.due_date || r.expense_date,
  };
}

export async function fetchRecurringTemplates(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("is_recurring", true)
    .eq("is_auto_generated", false)
    .order("category", { ascending: true });

  if (error) {
    console.error("fetchRecurringTemplates error:", error);
    return [];
  }
  return (data || []).map(normalizeExpense);
}

export async function fetchExpensePayments(expenseId: string): Promise<ExpensePayment[]> {
  const { data, error } = await supabase
    .from("expense_payments" as any)
    .select("*")
    .eq("expense_id", expenseId)
    .order("payment_date", { ascending: false });
  if (error) { console.error("fetchExpensePayments error:", error); return []; }
  return (data as any[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function fetchAllExpensePayments(): Promise<ExpensePayment[]> {
  const { data, error } = await supabase
    .from("expense_payments" as any)
    .select("*")
    .order("payment_date", { ascending: false });
  if (error) { console.error("fetchAllExpensePayments error:", error); return []; }
  return (data as any[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function addExpensePayment(params: {
  expense_id: string;
  amount: number;
  payment_date: string;
  payment_source: string;
  notes?: string;
}) {
  const { error } = await supabase.from("expense_payments" as any).insert({
    expense_id: params.expense_id,
    amount: params.amount,
    payment_date: params.payment_date,
    payment_source: params.payment_source,
    notes: params.notes || "",
  });
  if (error) console.error("addExpensePayment error:", error);
  return !error;
}

export async function deleteExpensePayment(id: string) {
  const { error } = await supabase.from("expense_payments" as any).delete().eq("id", id);
  if (error) console.error("deleteExpensePayment error:", error);
  return !error;
}

export async function createExpense(params: {
  expense_date: string;
  due_date?: string | null;
  category: string;
  description: string;
  amount: number;
  is_recurring: boolean;
  recurring_period: string | null;
  billing_day?: number | null;
  next_run_date?: string | null;
  expense_status?: string;
  payment_source: string;
  cash_amount: number;
  bank_amount: number;
  income_category?: IncomeCategory;
  pl_line: PLLine;
  initialPaid?: number; // if >0 we'll create a payment record after insert
}) {
  const { initialPaid, ...rest } = params;
  const insertData: any = { ...rest };
  insertData.due_date = params.due_date || params.expense_date;
  // remaining/paid initialised; trigger will overwrite when payments are added
  insertData.paid_amount = 0;
  insertData.remaining_amount = params.amount;
  insertData.expense_status = "accrued";

  if (params.is_recurring && params.billing_day) {
    const today = new Date();
    const maxDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayThisMonth = Math.min(params.billing_day, maxDayThisMonth);
    const thisMonthBilling = new Date(today.getFullYear(), today.getMonth(), dayThisMonth);
    insertData.next_run_date = (thisMonthBilling <= today ? today : thisMonthBilling).toISOString().split("T")[0];
  }

  const { data, error } = await supabase.from("expenses").insert(insertData).select("id").single();
  if (error) { console.error("createExpense error:", error); return false; }

  // If user marked it as fully paid up-front, create the payment immediately.
  // (Recurring templates don't get an initial payment — they're definitions.)
  if (!params.is_recurring && initialPaid && initialPaid > 0 && data?.id) {
    await addExpensePayment({
      expense_id: data.id,
      amount: Math.min(initialPaid, params.amount),
      payment_date: params.expense_date,
      payment_source: params.payment_source,
      notes: "Initial payment",
    });
  }
  return true;
}

export async function updateExpense(id: string, updates: Partial<{
  expense_date: string;
  due_date: string | null;
  category: string;
  description: string;
  amount: number;
  is_recurring: boolean;
  recurring_period: string | null;
  billing_day: number | null;
  next_run_date: string | null;
  expense_status: string;
  payment_source: string;
  cash_amount: number;
  bank_amount: number;
  income_category: IncomeCategory;
  pl_line: PLLine;
}>) {
  const patch: any = { ...updates };
  if (updates.billing_day) {
    const today = new Date();
    const maxDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayThisMonth = Math.min(updates.billing_day, maxDayThisMonth);
    const thisMonthBilling = new Date(today.getFullYear(), today.getMonth(), dayThisMonth);
    patch.next_run_date = (thisMonthBilling <= today ? today : thisMonthBilling).toISOString().split("T")[0];
  }
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) { console.error("updateExpense error:", error); return false; }

  // If amount changed, recompute lifecycle via a no-op payment touch
  if (updates.amount !== undefined) {
    await supabase.rpc("recompute_expense_lifecycle" as any, { _expense_id: id } as any);
  }
  return true;
}

export async function updateExpenseStatus(id: string, status: string) {
  // Manual override (rarely needed — payments drive status). Kept for compat.
  const { error } = await supabase.from("expenses").update({ expense_status: status }).eq("id", id);
  if (error) console.error("updateExpenseStatus error:", error);
  return !error;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) console.error("deleteExpense error:", error);
  return !error;
}

export async function triggerRecurringGeneration() {
  const { data, error } = await supabase.functions.invoke("generate-recurring-expenses", {
    body: { backfill: true },
  });
  if (error) console.error("triggerRecurringGeneration error:", error);
  return data;
}
