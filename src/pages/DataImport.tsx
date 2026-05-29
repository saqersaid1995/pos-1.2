import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Upload, FileJson, Database, AlertTriangle, RefreshCw, ArrowRight,
  Loader2, FileSpreadsheet, Archive, ChevronDown, ChevronUp, Plus,
  CheckCircle2, Circle,
} from "lucide-react";

const isElectron = typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

// Known tables in recommended import order
// Matches the exact tables that exist in the local SQLite schema (schema.sql).
// This list is also used as the recommended import order (parents before children).
const KNOWN_TABLES = [
  "profiles", "user_roles",
  "customers", "customer_notes",
  "items", "services", "service_pricing",
  "orders", "order_items", "payments",
  "order_status_history", "internal_order_notes",
  "loyalty_settings", "customer_loyalty", "loyalty_transactions",
  "chart_of_accounts", "journal_entries", "journal_entry_lines",
  "fixed_assets", "depreciation_entries",
  "expenses", "expense_payments",
  "loans", "loan_installments", "loan_payments",
  "cash_transfers", "opening_balances",
  "accounting_settings", "business_settings",
  "notification_logs", "payment_corrections",
];

const IMPORT_ORDER_LABELS: Record<string, string> = {
  profiles: "المستخدمون",
  user_roles: "أدوار المستخدمين",
  customers: "العملاء ⭐",
  customer_notes: "ملاحظات العملاء",
  items: "أنواع الملابس",
  services: "الخدمات",
  service_pricing: "التسعير",
  orders: "الطلبات",
  order_items: "قطع الطلبات",
  payments: "المدفوعات",
  order_status_history: "تاريخ الحالات",
  internal_order_notes: "ملاحظات الطلبات",
  loyalty_settings: "إعدادات الولاء",
  customer_loyalty: "نقاط الولاء",
  loyalty_transactions: "معاملات الولاء",
  chart_of_accounts: "شجرة الحسابات",
  journal_entries: "قيود اليومية",
  journal_entry_lines: "بنود القيود",
  fixed_assets: "الأصول الثابتة",
  depreciation_entries: "قيود الإهلاك",
  expenses: "المصاريف",
  expense_payments: "مدفوعات المصاريف",
  loans: "القروض",
  loan_installments: "أقساط القروض",
  loan_payments: "مدفوعات القروض",
  cash_transfers: "تحويلات الصندوق",
  opening_balances: "أرصدة افتتاحية",
  accounting_settings: "إعدادات المحاسبة",
  business_settings: "إعدادات الشركة",
  notification_logs: "سجل الإشعارات",
  payment_corrections: "تصحيحات المدفوعات",
};

interface TableInfo { name: string; rowCount: number }

interface AnalyzeResult {
  type: "json" | "sqlite" | "csv" | "zip" | "unknown";
  version?: string;
  exportedAt?: string;
  tables: TableInfo[];
  warnings: string[];
  fileSizeBytes: number;
  detectedTable?: string;
}

interface ImportProgress {
  status: "running" | "done" | "error" | "cancelled";
  table?: string;
  tablesTotal: number;
  tablesDone: number;
  rowsTotal: number;
  rowsDone: number;
  errors: string[];
  message?: string;
  skippedCols?: string[];
}

interface TallyEntry {
  tableName: string;
  imported: number;
  skipped: number;
}

type ImportMode = "merge" | "add-only" | "replace";
type ConflictRes = "imported-wins" | "local-wins";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ type }: { type: string }) {
  if (type === "csv") return <FileSpreadsheet size={18} style={{ color: "var(--color-success)" }} />;
  if (type === "zip") return <Archive size={18} style={{ color: "var(--color-warning)" }} />;
  if (type === "json") return <FileJson size={18} style={{ color: "var(--color-accent)" }} />;
  return <Database size={18} style={{ color: "var(--text-tertiary)" }} />;
}

export default function DataImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // File state
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // CSV-specific: allow overriding detected table name
  const [csvTableOverride, setCsvTableOverride] = useState<string>("");

  // Options
  const [mode, setMode] = useState<ImportMode>("add-only");
  const [conflict, setConflict] = useState<ConflictRes>("imported-wins");
  const [confirmText, setConfirmText] = useState("");

  // Import state
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  // Session tally (persists across multiple CSV imports)
  const [tally, setTally] = useState<TallyEntry[]>([]);

  // UI collapse states
  const [guideOpen, setGuideOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checkedTables, setCheckedTables] = useState<Set<string>>(new Set());

  if (!isElectron) {
    return (
      <div className="page-layout" dir="rtl">
        <div className="page-header">
          <h1 className="page-title">استيراد البيانات</h1>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <p style={{ color: "var(--text-secondary)" }}>هذه الصفحة متاحة فقط في تطبيق Windows المكتبي.</p>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-accent)", color: "#fff" }}>
            <ArrowRight size={14} /> العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const drovo = (window as any).drovo;

  const resetForNextFile = () => {
    setFilePath(null);
    setFileName(null);
    setAnalysis(null);
    setProgress(null);
    setConfirmText("");
    setCsvTableOverride("");
  };

  const analyzeFilePath = useCallback(async (fp: string, name: string) => {
    setFilePath(fp);
    setFileName(name);
    setAnalysis(null);
    setProgress(null);
    setAnalyzing(true);
    setCsvTableOverride("");
    try {
      const result = await drovo.import.analyze(fp) as { data: AnalyzeResult | null; error: string | null };
      if (result.error || !result.data) {
        toast.error("تعذّر تحليل الملف: " + (result.error ?? "خطأ غير معروف"));
      } else {
        setAnalysis(result.data);
        if (result.data.detectedTable) {
          setCsvTableOverride(result.data.detectedTable);
        }
      }
    } catch (e) {
      toast.error("خطأ في التحليل: " + String(e));
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handlePickFile = async () => {
    const fp = await drovo.dialog.openFile([
      { name: "All Supported", extensions: ["csv", "zip", "json", "db"] },
      { name: "CSV (Supabase)", extensions: ["csv"] },
      { name: "ZIP (Multiple CSVs)", extensions: ["zip"] },
      { name: "DROVO Backup", extensions: ["json", "db"] },
    ]) as string | null;
    if (!fp) return;
    await analyzeFilePath(fp, fp.split(/[\\/]/).pop() ?? fp);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const fp = (file as any).path ?? file.name;
    await analyzeFilePath(fp, file.name);
  }, [analyzeFilePath]);

  const subscribeProgress = () => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = drovo.import.onProgress((p: ImportProgress) => setProgress(p));
  };

  const handleStartImport = async () => {
    if (!filePath || !analysis) return;
    setImporting(true);
    subscribeProgress(); // subscribe BEFORE triggering import to avoid missed events
    setProgress({ status: "running", tablesTotal: 0, tablesDone: 0, rowsTotal: 0, rowsDone: 0, errors: [] });

    try {
      if (analysis.type === "csv") {
        const tableTarget = csvTableOverride || analysis.detectedTable || null;
        const res = await drovo.import.csv(filePath, tableTarget, { mode, conflictResolution: conflict }) as { data: { imported: number; skipped: number; tableName: string } | null; error: string | null };
        if (res.error) {
          toast.error("فشل الاستيراد: " + res.error);
        } else if (res.data) {
          setTally((prev) => {
            const existing = prev.findIndex((e) => e.tableName === res.data!.tableName);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = { tableName: res.data!.tableName, imported: prev[existing].imported + res.data!.imported, skipped: prev[existing].skipped + res.data!.skipped };
              return next;
            }
            return [...prev, { tableName: res.data!.tableName, imported: res.data!.imported, skipped: res.data!.skipped }];
          });
          // Auto-check in checklist
          if (res.data.tableName) {
            setCheckedTables((prev) => new Set([...prev, res.data!.tableName]));
          }
        }
      } else if (analysis.type === "zip") {
        const res = await drovo.import.zip(filePath, { mode, conflictResolution: conflict }) as { data: { tables: { tableName: string; imported: number; skipped: number }[] } | null; error: string | null };
        if (res.error) {
          toast.error("فشل الاستيراد: " + res.error);
        } else if (res.data) {
          setTally((prev) => {
            const next = [...prev];
            for (const t of res.data!.tables) {
              const idx = next.findIndex((e) => e.tableName === t.tableName);
              if (idx >= 0) {
                next[idx] = { ...next[idx], imported: next[idx].imported + t.imported, skipped: next[idx].skipped + t.skipped };
              } else {
                next.push({ tableName: t.tableName, imported: t.imported, skipped: t.skipped });
              }
            }
            return next;
          });
          setCheckedTables((prev) => new Set([...prev, ...res.data!.tables.map((t) => t.tableName)]));
        }
      } else {
        // JSON / SQLite
        await drovo.import.start(filePath, { mode, conflictResolution: conflict });
      }
    } catch (e) {
      toast.error("فشل الاستيراد: " + String(e));
      setProgress((prev) => prev ? { ...prev, status: "error", errors: [...prev.errors, String(e)] } : null);
    } finally {
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      setImporting(false);
    }
  };

  const isDone = progress?.status === "done";
  const isError = progress?.status === "error" || progress?.status === "cancelled";
  const progressPct = progress && progress.rowsTotal > 0
    ? Math.round((progress.rowsDone / progress.rowsTotal) * 100)
    : isDone ? 100 : 0;

  const isCsvLike = analysis?.type === "csv" || analysis?.type === "zip";

  return (
    <div className="page-layout overflow-y-auto" dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="page-title">استيراد البيانات</h1>
          <p className="page-subtitle">استورد بياناتك من Supabase (CSV) أو من نسخة احتياطية</p>
        </div>
        <div className="page-actions">
          <button
            onClick={() => navigate("/import-diagnostics")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
          >
            <Database size={13} /> فحص قاعدة البيانات
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full pb-8">

        {/* Supabase Guide (collapsible) */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
          <button
            onClick={() => setGuideOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-right"
          >
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              📋 كيف تصدّر بياناتك من Supabase؟
            </span>
            {guideOpen ? <ChevronUp size={15} style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown size={15} style={{ color: "var(--text-tertiary)" }} />}
          </button>
          <AnimatePresence>
            {guideOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: "hidden" }}
              >
                <div className="px-4 pb-4 flex flex-col gap-3">
                  <div className="h-px" style={{ background: "var(--border-subtle)" }} />
                  <p className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                    الطريقة الأسرع (ملفات CSV منفصلة):
                  </p>
                  <ol className="space-y-2">
                    {[
                      "افتح Supabase Dashboard",
                      "اذهب إلى Database ← Tables",
                      "اختر الجدول (ابدأ بـ customers)",
                      "اضغط على القائمة ← Export CSV",
                      "ارفع الملف هنا",
                      "كرر لكل جدول حسب الترتيب أدناه",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5"
                          style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}>
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <div className="rounded-lg px-3 py-2.5 text-[12px]" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--color-warning)" }}>ملاحظة:</strong> يمكنك أيضاً وضع كل ملفات CSV في مجلد، ضغطه كـ ZIP، ورفعه مرة واحدة.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Import order checklist (collapsible) */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
          <button
            onClick={() => setChecklistOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-right"
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                الترتيب الموصى به للاستيراد
              </span>
              {checkedTables.size > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}>
                  {checkedTables.size} / {IMPORT_ORDER_LABELS ? Object.keys(IMPORT_ORDER_LABELS).length : KNOWN_TABLES.length}
                </span>
              )}
            </div>
            {checklistOpen ? <ChevronUp size={15} style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown size={15} style={{ color: "var(--text-tertiary)" }} />}
          </button>
          <AnimatePresence>
            {checklistOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: "hidden" }}
              >
                <div className="px-4 pb-4">
                  <div className="h-px mb-3" style={{ background: "var(--border-subtle)" }} />
                  <div className="grid grid-cols-2 gap-1.5">
                    {KNOWN_TABLES.map((t, i) => {
                      const done = checkedTables.has(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setCheckedTables((prev) => {
                            const next = new Set(prev);
                            if (next.has(t)) next.delete(t); else next.add(t);
                            return next;
                          })}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-right transition-colors"
                          style={{
                            background: done ? "rgba(16,185,129,0.08)" : "var(--bg-elevated)",
                            border: "1px solid",
                            borderColor: done ? "rgba(16,185,129,0.25)" : "var(--border-subtle)",
                          }}
                        >
                          <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>{i + 1}.</span>
                          {done
                            ? <CheckCircle2 size={12} style={{ color: "var(--color-success)" }} className="shrink-0" />
                            : <Circle size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />}
                          <span className="text-[11px] font-medium truncate" style={{ color: done ? "var(--color-success)" : "var(--text-secondary)" }}>
                            {IMPORT_ORDER_LABELS[t] ?? t}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Session tally */}
        <AnimatePresence>
          {tally.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl px-4 py-3"
              style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}
            >
              <p className="text-[11px] font-semibold mb-2" style={{ color: "var(--color-success)" }}>
                الجداول المستوردة في هذه الجلسة:
              </p>
              <div className="flex flex-col gap-1">
                {tally.map((e) => (
                  <div key={e.tableName} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={12} style={{ color: "var(--color-success)" }} />
                      <span className="font-mono" style={{ color: "var(--text-primary)" }}>{e.tableName}</span>
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {e.imported.toLocaleString()} سجل{e.skipped > 0 ? ` (${e.skipped} فشلت)` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 1: File drop zone */}
        <AnimatePresence mode="wait">
          {!progress && (
            <motion.section
              key="upload"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="ds-card flex flex-col gap-4"
            >
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {tally.length > 0 ? "استيراد جدول آخر" : "اختيار الملف"}
              </h2>

              <div
                onClick={handlePickFile}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors py-10"
                style={{
                  borderColor: isDragOver ? "var(--color-accent)" : "var(--border-default)",
                  background: isDragOver ? "var(--accent-subtle)" : "var(--bg-elevated)",
                }}
              >
                <Upload size={28} style={{ color: isDragOver ? "var(--color-accent)" : "var(--text-tertiary)" }} />
                <div className="text-center">
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                    اسحب ملف CSV أو ZIP أو JSON هنا
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                    الصيغ المدعومة: .csv من Supabase | .zip (ملفات متعددة) | .drovo.json | .db
                  </p>
                </div>
                <input ref={inputRef} type="file" accept=".csv,.zip,.json,.db" className="hidden" />
              </div>

              {analyzing && (
                <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  <Loader2 size={14} className="animate-spin" /> جاري تحليل الملف...
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Step 2: Analysis + Options */}
        <AnimatePresence>
          {analysis && !progress && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="ds-card flex flex-col gap-5"
            >
              {/* File info header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileTypeIcon type={analysis.type} />
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{fileName}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {analysis.type === "csv" ? "CSV من Supabase" :
                       analysis.type === "zip" ? `ZIP — ${analysis.tables.length} ملف CSV` :
                       analysis.type === "json" ? "تصدير JSON" : "SQLite"} • {formatBytes(analysis.fileSizeBytes)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetForNextFile}
                  className="text-[11px] px-2.5 py-1 rounded-lg"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                >
                  تغيير
                </button>
              </div>

              {/* Warnings */}
              {analysis.warnings.length > 0 && analysis.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg"
                  style={{ background: "rgba(245,158,11,0.08)", color: "var(--color-warning)" }}>
                  <AlertTriangle size={13} /> {w}
                </div>
              ))}

              {/* CSV: table name */}
              {analysis.type === "csv" && (
                <div>
                  <p className="text-[11px] font-semibold mb-1.5 tracking-wide" style={{ color: "var(--text-tertiary)" }}>الجدول المستهدف</p>
                  <select
                    value={csvTableOverride}
                    onChange={(e) => setCsvTableOverride(e.target.value)}
                    className="ds-input text-[13px] h-9 w-full"
                    dir="rtl"
                  >
                    {KNOWN_TABLES.map((t) => (
                      <option key={t} value={t}>{t} — {IMPORT_ORDER_LABELS[t] ?? ""}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ZIP / JSON: table list */}
              {(analysis.type === "zip" || analysis.type === "json" || analysis.type === "sqlite") && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
                  <div className="grid grid-cols-2 px-3 py-2 text-[11px] font-semibold tracking-wide"
                    style={{ color: "var(--text-tertiary)", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span>الجدول</span><span className="text-left">السجلات</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {analysis.tables.map((t) => (
                      <div key={t.name} className="grid grid-cols-2 px-3 py-1.5 text-[12px]"
                        style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                        <span className="font-mono">{t.name}</span>
                        <span className="font-mono text-left" style={{ color: "var(--text-primary)" }}>{t.rowCount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import mode */}
              <div>
                <p className="text-[11px] font-semibold mb-2 tracking-wide" style={{ color: "var(--text-tertiary)" }}>طريقة الاستيراد</p>
                <div className="flex flex-col gap-1.5">
                  {([
                    { id: "add-only" as ImportMode, label: "إضافة فقط", desc: "يضيف سجلات جديدة فقط، لا يعدّل الموجودة" },
                    { id: "merge" as ImportMode, label: "دمج (استبدال عند التكرار)", desc: "يضيف الجديد ويحدّث الموجود بالمستورد" },
                    ...(!isCsvLike ? [{ id: "replace" as ImportMode, label: "استبدال كل البيانات ⚠️", desc: "يحذف جميع البيانات المحلية أولاً", danger: true }] : []),
                  ] as const).map((opt) => (
                    <label key={opt.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                      style={{
                        background: mode === opt.id ? (("danger" in opt && opt.danger) ? "rgba(239,68,68,0.08)" : "var(--accent-subtle)") : "var(--bg-elevated)",
                        border: "1px solid",
                        borderColor: mode === opt.id ? (("danger" in opt && opt.danger) ? "var(--color-danger)" : "var(--color-accent)") : "var(--border-default)",
                      }}>
                      <input type="radio" name="mode" value={opt.id} checked={mode === opt.id} onChange={() => setMode(opt.id)} className="mt-0.5 accent-[var(--color-accent)]" />
                      <div>
                        <p className="text-[13px] font-medium" style={{ color: (("danger" in opt && opt.danger) ? "var(--color-danger)" : "var(--text-primary)") }}>{opt.label}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conflict resolution for merge */}
              {mode === "merge" && (
                <div>
                  <p className="text-[11px] font-semibold mb-1.5 tracking-wide" style={{ color: "var(--text-tertiary)" }}>عند التكرار</p>
                  <div className="flex gap-2">
                    {([
                      { id: "imported-wins" as ConflictRes, label: "المستورد يفوز" },
                      { id: "local-wins" as ConflictRes, label: "المحلي يفوز" },
                    ] as const).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[12px] flex-1"
                        style={{ background: conflict === opt.id ? "var(--accent-subtle)" : "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                        <input type="radio" name="conflict" value={opt.id} checked={conflict === opt.id} onChange={() => setConflict(opt.id)} className="accent-[var(--color-accent)]" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Replace confirmation */}
              {mode === "replace" && (
                <div className="flex flex-col gap-2 p-3 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-[12px] font-medium" style={{ color: "var(--color-danger)" }}>
                    ⚠️ سيتم حذف جميع البيانات المحلية. لا يمكن التراجع عن هذه العملية.
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>اكتب "تأكيد" للمتابعة</p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="تأكيد"
                    className="ds-input text-[13px] h-9"
                    dir="rtl"
                  />
                </div>
              )}

              <button
                onClick={handleStartImport}
                disabled={importing || (mode === "replace" && confirmText !== "تأكيد")}
                className="w-full h-10 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                style={{ background: mode === "replace" ? "var(--color-danger)" : "var(--color-accent)", color: "#fff" }}
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                ابدأ الاستيراد
              </button>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Step 3: Progress + Result */}
        <AnimatePresence>
          {progress && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="ds-card flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {isDone ? "✅ اكتمل الاستيراد" : isError ? "❌ فشل الاستيراد" : "جاري الاستيراد..."}
                </h2>
                {importing && (
                  <button onClick={() => drovo.import.cancel()} className="text-[12px] px-2.5 py-1 rounded-lg"
                    style={{ background: "var(--danger-subtle)", color: "var(--color-danger)" }}>
                    إلغاء
                  </button>
                )}
              </div>

              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${progressPct}%` }}
                  style={{ background: isDone ? "var(--color-success)" : isError ? "var(--color-danger)" : "var(--color-accent)" }}
                />
              </div>

              <div className="flex justify-between text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <span>{progress.rowsDone.toLocaleString()} / {progress.rowsTotal.toLocaleString()} سجل</span>
                <span>{progress.tablesDone} / {progress.tablesTotal} جدول</span>
              </div>

              {progress.table && !isDone && !isError && (
                <p className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>← {progress.table}</p>
              )}

              {progress.skippedCols && progress.skippedCols.length > 0 && (
                <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", color: "var(--color-warning)" }}>
                  <strong>الأعمدة المتجاهلة:</strong> {progress.skippedCols.join(", ")}
                </div>
              )}

              {progress.message && (
                <p className="text-[13px] font-medium" style={{ color: isDone ? "var(--color-success)" : "var(--text-secondary)" }}>
                  {progress.message}
                </p>
              )}

              {progress.errors.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="px-3 py-2 text-[11px] font-semibold" style={{ background: "rgba(239,68,68,0.08)", color: "var(--color-danger)" }}>
                    {progress.errors.length} خطأ
                  </p>
                  <div className="max-h-32 overflow-y-auto px-3 py-2 space-y-1">
                    {progress.errors.map((e, i) => (
                      <p key={i} className="text-[11px] font-mono" style={{ color: "var(--color-danger)" }}>{e}</p>
                    ))}
                  </div>
                </div>
              )}

              {(isDone || isError) && (
                <div className="flex gap-2">
                  {/* Import another table */}
                  {(isDone || isError) && (
                    <button
                      onClick={resetForNextFile}
                      className="flex-1 h-9 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5"
                      style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
                    >
                      <Plus size={14} /> استيراد جدول آخر
                    </button>
                  )}
                  {mode === "replace" && isDone && (
                    <button
                      onClick={() => { drovo.app.restart?.(); window.location.reload(); }}
                      className="flex-1 h-9 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2"
                      style={{ background: "var(--color-accent)", color: "#fff" }}
                    >
                      <RefreshCw size={14} /> إعادة تشغيل
                    </button>
                  )}
                  {isDone && (
                    <button
                      onClick={() => navigate("/customers")}
                      className="flex-1 h-9 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                    >
                      <ArrowRight size={14} /> عرض العملاء
                    </button>
                  )}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Done — finish session */}
        {tally.length > 0 && !progress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center"
          >
            <button
              onClick={() => navigate("/")}
              className="px-6 h-10 rounded-xl text-[14px] font-semibold flex items-center gap-2"
              style={{ background: "var(--color-success)", color: "#fff" }}
            >
              <CheckCircle2 size={16} /> إنهاء الاستيراد
            </button>
          </motion.div>
        )}

      </div>
    </div>
  );
}
