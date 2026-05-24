import { supabase } from "@/integrations/supabase/client";

export interface Loan {
  id: string;
  loan_name: string;
  bank_name: string;
  principal: number;
  annual_interest_rate: number;
  start_date: string;
  term_months: number;
  installment_amount: number;
  payment_frequency: string;
  disbursement_account_code: string;
  liability_account_code: string;
  interest_expense_code: string;
  notes: string;
  status: "active" | "closed";
  is_deleted: boolean;
  loan_type: "new" | "existing";
  original_principal: number;
  outstanding_balance: number;
  first_disbursement_date: string | null;
  next_payment_date: string | null;
  attachment_url: string;
}

export interface LoanInstallment {
  id: string;
  loan_id: string;
  installment_no: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  remaining_balance: number;
  is_paid: boolean;
  paid_amount: number;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  installment_id: string | null;
  payment_date: string;
  amount: number;
  principal_portion: number;
  interest_portion: number;
  payment_source: "cash" | "bank";
  notes: string;
}

const num = (v: any) => Number(v || 0);

export async function fetchLoans(): Promise<Loan[]> {
  const { data, error } = await supabase
    .from("loans" as any)
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((l) => ({
    ...l,
    principal: num(l.principal),
    annual_interest_rate: num(l.annual_interest_rate),
    installment_amount: num(l.installment_amount),
  }));
}

export async function fetchInstallments(loanId: string): Promise<LoanInstallment[]> {
  const { data, error } = await supabase
    .from("loan_installments" as any)
    .select("*")
    .eq("loan_id", loanId)
    .order("installment_no", { ascending: true });
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({
    ...r,
    principal_amount: num(r.principal_amount),
    interest_amount: num(r.interest_amount),
    total_amount: num(r.total_amount),
    remaining_balance: num(r.remaining_balance),
    paid_amount: num(r.paid_amount),
  }));
}

export async function fetchLoanPayments(loanId: string): Promise<LoanPayment[]> {
  const { data, error } = await supabase
    .from("loan_payments" as any)
    .select("*")
    .eq("loan_id", loanId)
    .order("payment_date", { ascending: false });
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({
    ...r,
    amount: num(r.amount),
    principal_portion: num(r.principal_portion),
    interest_portion: num(r.interest_portion),
  }));
}

export async function createLoan(p: {
  loan_name: string;
  bank_name: string;
  principal: number;
  annual_interest_rate: number;
  start_date: string;
  term_months: number;
  installment_amount?: number;
  disbursement_account_code?: string;
  notes?: string;
  loan_type?: "new" | "existing";
  original_principal?: number;
  outstanding_balance?: number;
  first_disbursement_date?: string | null;
  next_payment_date?: string | null;
  attachment_url?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const payload = {
    ...p,
    installment_amount: p.installment_amount ?? 0,
    disbursement_account_code: p.disbursement_account_code ?? "1020",
    loan_type: p.loan_type ?? "new",
  };
  console.log("[createLoan] payload:", payload);
  const { data, error } = await supabase.from("loans" as any).insert(payload).select("id").single();
  if (error) {
    console.error("[createLoan] error:", error);
    const msg = [error.message, (error as any).details, (error as any).hint].filter(Boolean).join(" — ");
    return { id: null, error: msg || "Unknown error" };
  }
  return { id: (data as any)?.id as string, error: null };
}

export async function updateLoan(id: string, patch: Partial<Loan>) {
  const { error } = await supabase.from("loans" as any).update(patch).eq("id", id);
  if (error) console.error(error);
  return !error;
}

export async function softDeleteLoan(id: string) {
  const { error } = await supabase.from("loans" as any).update({ is_deleted: true, status: "closed" }).eq("id", id);
  if (error) console.error(error);
  return !error;
}

export async function recordLoanPayment(p: {
  loan_id: string;
  installment_id?: string | null;
  payment_date: string;
  amount: number;
  principal_portion: number;
  interest_portion: number;
  payment_source: "cash" | "bank";
  notes?: string;
}) {
  const { error } = await supabase.from("loan_payments" as any).insert(p);
  if (error) console.error(error);
  return !error;
}

export async function deleteLoanPayment(id: string) {
  const { error } = await supabase.from("loan_payments" as any).delete().eq("id", id);
  if (error) console.error(error);
  return !error;
}

export interface LoanSummary {
  total_outstanding: number;
  current_portion: number;
  non_current_portion: number;
}

export async function fetchLoanSplitSummary(): Promise<LoanSummary> {
  const { data, error } = await supabase.rpc("get_loan_split_summary" as any);
  if (error) { console.error(error); return { total_outstanding: 0, current_portion: 0, non_current_portion: 0 }; }
  const row = (data as any[])?.[0];
  return {
    total_outstanding: num(row?.total_outstanding),
    current_portion: num(row?.current_portion),
    non_current_portion: num(row?.non_current_portion),
  };
}

export function calcInstallment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round((principal / months) * 1000) / 1000;
  const pmt = (principal * r) / (1 - Math.pow(1 + r, -months));
  return Math.round(pmt * 1000) / 1000;
}
