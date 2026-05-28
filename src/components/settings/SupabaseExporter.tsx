import { useState } from "react";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";

const ALL_TABLES = [
  "customers", "orders", "order_items", "payments",
  "order_status_history", "internal_order_notes", "customer_notes",
  "items", "services", "service_pricing",
  "expenses", "expense_payments",
  "chart_of_accounts", "journal_entries", "journal_entry_lines",
  "fixed_assets", "loans", "loan_payments", "loan_installments",
  "cash_accounts", "cash_transactions", "cash_transfers",
  "loyalty_settings", "customer_loyalty", "loyalty_transactions",
  "profiles", "user_roles",
  "complaints",
  "business_settings",
];

type ExportFormat = "json" | "csv";

interface TableStatus {
  table: string;
  status: "idle" | "loading" | "done" | "error";
  count?: number;
  error?: string;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (typeof v === "object") {
      try { s = JSON.stringify(v); } catch { s = "[object]"; }
    } else {
      s = String(v);
    }
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];
  return lines.join("\n");
}

export default function SupabaseExporter() {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_TABLES));
  const [format, setFormat] = useState<ExportFormat>("json");
  const [exporting, setExporting] = useState(false);
  const [statuses, setStatuses] = useState<TableStatus[]>([]);

  const toggle = (table: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table); else next.add(table);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(selected.size === ALL_TABLES.length ? new Set() : new Set(ALL_TABLES));
  };

  const handleExport = async () => {
    const tables = ALL_TABLES.filter((t) => selected.has(t));
    if (tables.length === 0) { toast.error("اختر جدولاً واحداً على الأقل"); return; }

    setExporting(true);
    setStatuses(tables.map((t) => ({ table: t, status: "idle" })));

    const result: Record<string, unknown[]> = {};

    for (const table of tables) {
      setStatuses((prev) => prev.map((s) => s.table === table ? { ...s, status: "loading" } : s));
      try {
        const { data, error } = await supabase.from(table as any).select("*");
        if (error) throw new Error(error.message);
        result[table] = data || [];
        setStatuses((prev) => prev.map((s) => s.table === table ? { ...s, status: "done", count: (data || []).length } : s));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result[table] = [];
        setStatuses((prev) => prev.map((s) => s.table === table ? { ...s, status: "error", error: msg } : s));
      }
    }

    setExporting(false);
    const date = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const json = JSON.stringify({
        version: "1.0",
        exported_at: new Date().toISOString(),
        source: "supabase",
        tables: result,
      }, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drovo-backup-${date}.drovo.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV export — zip all tables
      const zip = new JSZip();
      for (const [table, rows] of Object.entries(result)) {
        if (rows.length > 0) {
          zip.file(`${table}.csv`, toCSV(rows as Record<string, unknown>[]));
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drovo-export-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }

    toast.success("تم التصدير بنجاح!");
  };

  return (
    <div className="ds-card flex flex-col gap-5" dir="rtl">
      <div>
        <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
          تصدير البيانات من Supabase
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
          صدّر بياناتك الحالية لاستيرادها في تطبيق Windows
        </p>
      </div>

      {/* Format selector */}
      <div>
        <p className="text-[11px] font-semibold mb-2 tracking-wide" style={{ color: "var(--text-tertiary)" }}>صيغة التصدير</p>
        <div className="flex gap-2">
          {([
            { id: "json" as ExportFormat, label: "JSON (.drovo.json)", desc: "للاستيراد في DROVO POS" },
            { id: "csv" as ExportFormat, label: "CSV (ZIP ملفات منفصلة)", desc: "للعرض في Excel أو Supabase" },
          ] as const).map((opt) => (
            <label key={opt.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer flex-1"
              style={{
                background: format === opt.id ? "var(--accent-subtle)" : "var(--bg-elevated)",
                border: "1px solid",
                borderColor: format === opt.id ? "var(--color-accent)" : "var(--border-default)",
              }}>
              <input type="radio" name="format" value={opt.id} checked={format === opt.id} onChange={() => setFormat(opt.id)} className="mt-0.5 accent-[var(--color-accent)]" />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Table selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--text-tertiary)" }}>الجداول</p>
          <button onClick={toggleAll} className="text-[11px]" style={{ color: "var(--color-accent)" }}>
            {selected.size === ALL_TABLES.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TABLES.map((t) => {
            const st = statuses.find((s) => s.table === t);
            return (
              <label key={t} className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[12px]"
                style={{ background: selected.has(t) ? "var(--accent-subtle)" : "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={selected.has(t)} onChange={() => toggle(t)} className="accent-[var(--color-accent)]" />
                <span className="font-mono flex-1 truncate">{t}</span>
                {st?.status === "loading" && <Loader2 size={11} className="animate-spin shrink-0" style={{ color: "var(--text-tertiary)" }} />}
                {st?.status === "done" && <CheckCircle size={11} className="shrink-0" style={{ color: "var(--color-success)" }} />}
                {st?.status === "error" && <AlertCircle size={11} className="shrink-0" style={{ color: "var(--color-danger)" }} />}
                {st?.count !== undefined && st.status === "done" && (
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{st.count}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={exporting || selected.size === 0}
        className="w-full h-10 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
        style={{ background: "var(--color-accent)", color: "#fff" }}
      >
        {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {exporting ? "جاري التصدير..." : format === "csv" ? "تصدير ZIP (CSV)" : "تصدير JSON"}
      </button>

      <div className="rounded-xl p-4 text-[12px]" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
        <p className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>الخطوات التالية:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>افتح تطبيق DROVO POS على Windows</li>
          <li>اذهب إلى الإعدادات ← استيراد البيانات</li>
          <li>اختر الملف الذي حمّلته للتو</li>
          <li>اضغط ابدأ الاستيراد</li>
        </ol>
      </div>
    </div>
  );
}
