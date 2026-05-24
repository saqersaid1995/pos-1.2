import { supabase } from "@/integrations/supabase/client";

export type FixedAssetCategory = "Equipment" | "Furniture" | "Other";
export type FundingSource = "equity" | "cash" | "bank" | "loan";
export type AssetStatus = "active" | "disposed";

export interface FixedAsset {
  id: string;
  asset_name: string;
  category: FixedAssetCategory;
  purchase_date: string;
  cost: number;
  useful_life_years: number;
  residual_value: number;
  depreciation_method: string;
  funding_source: FundingSource;
  asset_account_code: string;
  contra_account_code: string;
  expense_account_code: string;
  invoice_url: string;
  notes: string;
  status: AssetStatus;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepreciationEntry {
  id: string;
  asset_id: string;
  period_month: string;
  amount: number;
  journal_entry_id: string | null;
  created_at: string;
}

export interface FixedAssetWithDepreciation extends FixedAsset {
  accumulated_depreciation: number;
  net_book_value: number;
  months_posted: number;
  total_months: number;
}

export const CATEGORY_TO_CODES: Record<FixedAssetCategory, { asset: string; contra: string }> = {
  Equipment: { asset: "1510", contra: "1515" },
  Furniture: { asset: "1520", contra: "1525" },
  Other: { asset: "1590", contra: "1595" },
};

export async function fetchFixedAssets(): Promise<FixedAsset[]> {
  const { data, error } = await supabase
    .from("fixed_assets" as any)
    .select("*")
    .eq("is_deleted", false)
    .order("purchase_date", { ascending: false });
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({
    ...r,
    cost: Number(r.cost),
    useful_life_years: Number(r.useful_life_years),
    residual_value: Number(r.residual_value),
  }));
}

export async function fetchDepreciationEntries(): Promise<DepreciationEntry[]> {
  const { data, error } = await supabase
    .from("depreciation_entries" as any)
    .select("*");
  if (error) { console.error(error); return []; }
  return ((data || []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export function enrichAssets(assets: FixedAsset[], depEntries: DepreciationEntry[]): FixedAssetWithDepreciation[] {
  const byAsset = new Map<string, { sum: number; count: number }>();
  for (const d of depEntries) {
    const e = byAsset.get(d.asset_id) || { sum: 0, count: 0 };
    e.sum += d.amount;
    e.count += 1;
    byAsset.set(d.asset_id, e);
  }
  return assets.map((a) => {
    const e = byAsset.get(a.id) || { sum: 0, count: 0 };
    return {
      ...a,
      accumulated_depreciation: e.sum,
      net_book_value: Math.max(a.cost - e.sum, 0),
      months_posted: e.count,
      total_months: Math.max(Math.round(a.useful_life_years * 12), 1),
    };
  });
}

export interface CreateAssetPayload {
  asset_name: string;
  category: FixedAssetCategory;
  purchase_date: string;
  cost: number;
  useful_life_years: number;
  residual_value: number;
  funding_source: FundingSource;
  notes?: string;
  invoice_url?: string;
}

export async function createFixedAsset(p: CreateAssetPayload): Promise<string | null> {
  const codes = CATEGORY_TO_CODES[p.category];
  const { data, error } = await supabase
    .from("fixed_assets" as any)
    .insert({
      asset_name: p.asset_name,
      category: p.category,
      purchase_date: p.purchase_date,
      cost: p.cost,
      useful_life_years: p.useful_life_years,
      residual_value: p.residual_value,
      depreciation_method: "straight_line",
      funding_source: p.funding_source,
      asset_account_code: codes.asset,
      contra_account_code: codes.contra,
      expense_account_code: "5110",
      invoice_url: p.invoice_url || "",
      notes: p.notes || "",
    } as any)
    .select("id")
    .single();
  if (error) { console.error(error); return null; }
  const newId = (data as any).id as string;

  // Defensive: ensure the purchase journal entry exists even if the
  // database trigger somehow didn't fire (e.g. mid-migration state).
  try {
    await supabase.rpc("post_fixed_asset_purchase_je" as any, { _asset_id: newId });
  } catch (e) {
    console.warn("post_fixed_asset_purchase_je fallback failed:", e);
  }

  return newId;
}

export async function updateFixedAsset(id: string, patch: Partial<FixedAsset> & { category?: FixedAssetCategory }) {
  const next: any = { ...patch };
  if (patch.category) {
    const codes = CATEGORY_TO_CODES[patch.category as FixedAssetCategory];
    next.asset_account_code = codes.asset;
    next.contra_account_code = codes.contra;
  }
  const { error } = await supabase.from("fixed_assets" as any).update(next).eq("id", id);
  if (error) console.error(error);
  return !error;
}

export async function recalculateAssetDepreciation(assetId: string, upToMonth?: string) {
  const { data, error } = await supabase.rpc("recalculate_asset_depreciation" as any, {
    _asset_id: assetId,
    _up_to_month: upToMonth || new Date().toISOString().split("T")[0],
  });
  if (error) { console.error(error); return null; }
  return (data as any[])?.[0] || { posted_count: 0, total_amount: 0 };
}

export async function softDeleteFixedAsset(id: string) {
  const { error } = await supabase.from("fixed_assets" as any).update({ is_deleted: true } as any).eq("id", id);
  if (error) console.error(error);
  return !error;
}

export async function runDepreciation(upToMonth?: string) {
  const { data, error } = await supabase.rpc("run_depreciation" as any, {
    _up_to_month: upToMonth || new Date().toISOString().split("T")[0],
  });
  if (error) { console.error(error); return null; }
  return data as any[];
}

export async function uploadInvoice(file: File, assetIdHint: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${assetIdHint}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("fixed-asset-invoices").upload(path, file, { upsert: false });
  if (error) { console.error(error); return null; }
  return path;
}

export async function getInvoiceSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("fixed-asset-invoices").createSignedUrl(path, 3600);
  if (error) { console.error(error); return null; }
  return data.signedUrl;
}
