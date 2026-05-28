import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Upload, FileJson, Database, AlertTriangle, RefreshCw, ArrowRight, Loader2 } from "lucide-react";

const isElectron = typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

interface TableInfo { name: string; rowCount: number }

interface AnalyzeResult {
  type: "json" | "sqlite" | "unknown";
  version?: string;
  exportedAt?: string;
  tables: TableInfo[];
  warnings: string[];
  fileSizeBytes: number;
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
}

type ImportMode = "replace" | "merge" | "add-only";
type ConflictRes = "newer-wins" | "imported-wins" | "local-wins";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DataImport() {
  const navigate = useNavigate();
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [conflict, setConflict] = useState<ConflictRes>("imported-wins");
  const [confirmText, setConfirmText] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Redirect non-Electron
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

  const analyzeFilePath = useCallback(async (fp: string, name: string) => {
    setFilePath(fp);
    setFileName(name);
    setAnalysis(null);
    setProgress(null);
    setAnalyzing(true);
    try {
      const result = await (window as any).drovo.import.analyze(fp) as { data: AnalyzeResult | null; error: string | null };
      if (result.error || !result.data) {
        toast.error("تعذّر تحليل الملف: " + (result.error || "خطأ غير معروف"));
      } else {
        setAnalysis(result.data);
      }
    } catch (e) {
      toast.error("خطأ في التحليل: " + String(e));
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handlePickFile = async () => {
    const fp = await (window as any).drovo.dialog.openFile([
      { name: "DROVO Backup", extensions: ["json", "db"] },
    ]) as string | null;
    if (!fp) return;
    const name = fp.split(/[\\/]/).pop() ?? fp;
    await analyzeFilePath(fp, name);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // In Electron, file.path is available
    const fp = (file as any).path ?? file.name;
    await analyzeFilePath(fp, file.name);
  }, [analyzeFilePath]);

  const handleStartImport = async () => {
    if (!filePath) return;
    setImporting(true);
    setProgress({ status: "running", tablesTotal: 0, tablesDone: 0, rowsTotal: 0, rowsDone: 0, errors: [] });

    // Subscribe to progress events
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = (window as any).drovo.import.onProgress((p: ImportProgress) => {
      setProgress(p);
    });

    try {
      await (window as any).drovo.import.start(filePath, { mode, conflictResolution: conflict });
    } catch (e) {
      toast.error("فشل الاستيراد: " + String(e));
      setProgress((prev) => prev ? { ...prev, status: "error", errors: [...prev.errors, String(e)] } : null);
    } finally {
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      setImporting(false);
    }
  };

  const handleCancel = async () => {
    await (window as any).drovo.import.cancel();
  };

  const isDone = progress?.status === "done";
  const isError = progress?.status === "error" || progress?.status === "cancelled";
  const progressPct = progress && progress.rowsTotal > 0
    ? Math.round((progress.rowsDone / progress.rowsTotal) * 100)
    : 0;

  return (
    <div className="page-layout overflow-y-auto" dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="page-title">استيراد البيانات</h1>
          <p className="page-subtitle">استورد بياناتك من Supabase أو من نسخة احتياطية سابقة</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">

        {/* Step 1: File Selection */}
        <section className="ds-card flex flex-col gap-4">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            ١. اختيار الملف
          </h2>

          {/* Drop zone */}
          <div
            ref={dropRef}
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
                اسحب ملف .drovo.json أو .db هنا
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                أو اضغط لاختيار الملف
              </p>
            </div>
            <input ref={inputRef} type="file" accept=".json,.db" className="hidden" />
          </div>

          {analyzing && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <Loader2 size={14} className="animate-spin" /> جاري تحليل الملف...
            </div>
          )}
        </section>

        {/* Step 2: Analysis */}
        <AnimatePresence>
          {analysis && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="ds-card flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  ٢. تحليل الملف
                </h2>
                <div className="flex items-center gap-2">
                  {analysis.type === "json" ? <FileJson size={15} style={{ color: "var(--color-accent)" }} /> : <Database size={15} style={{ color: "var(--color-success)" }} />}
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {analysis.type === "json" ? "تصدير Supabase (JSON)" : analysis.type === "sqlite" ? "قاعدة بيانات SQLite" : "نوع غير معروف"}
                  </span>
                </div>
              </div>

              {fileName && (
                <div className="flex items-center justify-between text-[12px] px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <span style={{ color: "var(--text-primary)" }}>{fileName}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>{formatBytes(analysis.fileSizeBytes)}</span>
                </div>
              )}

              {analysis.exportedAt && (
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  تاريخ التصدير: {new Date(analysis.exportedAt).toLocaleString("ar-OM")}
                </p>
              )}

              {analysis.warnings.length > 0 && (
                <div className="flex flex-col gap-1">
                  {analysis.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", color: "var(--color-warning)" }}>
                      <AlertTriangle size={13} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Tables list */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
                <div className="grid grid-cols-2 px-3 py-2 text-[11px] font-semibold tracking-wide" style={{ color: "var(--text-tertiary)", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span>الجدول</span><span className="text-left">عدد السجلات</span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {analysis.tables.map((t) => (
                    <div key={t.name} className="grid grid-cols-2 px-3 py-2 text-[12px]" style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                      <span className="font-mono">{t.name}</span>
                      <span className="font-mono text-left" style={{ color: "var(--text-primary)" }}>{t.rowCount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Step 3: Options */}
        <AnimatePresence>
          {analysis && analysis.type !== "unknown" && !progress && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="ds-card flex flex-col gap-5"
            >
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                ٣. خيارات الاستيراد
              </h2>

              {/* Mode */}
              <div>
                <p className="text-[11px] font-semibold mb-2 tracking-wide" style={{ color: "var(--text-tertiary)" }}>طريقة الاستيراد</p>
                <div className="flex flex-col gap-2">
                  {([
                    { id: "merge" as ImportMode, label: "دمج مع البيانات الحالية", desc: "يضيف السجلات الجديدة ويحدّث الموجودة" },
                    { id: "add-only" as ImportMode, label: "إضافة فقط", desc: "يضيف سجلات جديدة فقط، لا يعدّل الموجودة" },
                    { id: "replace" as ImportMode, label: "استبدال كل البيانات", desc: "يحذف جميع البيانات المحلية أولاً ⚠️", danger: true },
                  ] as const).map((opt) => (
                    <label key={opt.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors" style={{ background: mode === opt.id ? (opt.danger ? "rgba(239,68,68,0.08)" : "var(--accent-subtle)") : "var(--bg-elevated)", border: "1px solid", borderColor: mode === opt.id ? (opt.danger ? "var(--color-danger)" : "var(--color-accent)") : "var(--border-default)" }}>
                      <input type="radio" name="mode" value={opt.id} checked={mode === opt.id} onChange={() => setMode(opt.id)} className="mt-0.5 accent-[var(--color-accent)]" />
                      <div>
                        <p className="text-[13px] font-medium" style={{ color: opt.danger ? "var(--color-danger)" : "var(--text-primary)" }}>{opt.label}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conflict resolution (only for merge) */}
              {mode === "merge" && (
                <div>
                  <p className="text-[11px] font-semibold mb-2 tracking-wide" style={{ color: "var(--text-tertiary)" }}>عند التعارض</p>
                  <div className="flex flex-col gap-1.5">
                    {([
                      { id: "imported-wins" as ConflictRes, label: "المستورد يفوز" },
                      { id: "local-wins" as ConflictRes, label: "المحلي يفوز" },
                    ] as const).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-[12px]" style={{ background: conflict === opt.id ? "var(--accent-subtle)" : "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                        <input type="radio" name="conflict" value={opt.id} checked={conflict === opt.id} onChange={() => setConflict(opt.id)} className="accent-[var(--color-accent)]" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Replace confirmation */}
              {mode === "replace" && (
                <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-[12px] font-medium" style={{ color: "var(--color-danger)" }}>
                    ⚠️ سيتم حذف جميع البيانات المحلية. هذه العملية لا يمكن التراجع عنها.
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

              {/* Start button */}
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

        {/* Step 4: Progress */}
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
                  <button onClick={handleCancel} className="text-[12px] px-2.5 py-1 rounded-lg" style={{ background: "var(--danger-subtle)", color: "var(--color-danger)" }}>
                    إلغاء
                  </button>
                )}
              </div>

              {/* Progress bar */}
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
                <p className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                  ← {progress.table}
                </p>
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
                  {mode === "replace" && isDone && (
                    <button
                      onClick={() => { (window as any).drovo.app.restart?.(); window.location.reload(); }}
                      className="flex-1 h-9 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2"
                      style={{ background: "var(--color-accent)", color: "#fff" }}
                    >
                      <RefreshCw size={14} /> إعادة تشغيل التطبيق
                    </button>
                  )}
                  <button
                    onClick={() => navigate("/customers")}
                    className="flex-1 h-9 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2"
                    style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
                  >
                    <ArrowRight size={14} /> عرض العملاء
                  </button>
                  <button
                    onClick={() => { setProgress(null); setAnalysis(null); setFilePath(null); setFileName(null); setConfirmText(""); }}
                    className="h-9 px-3 rounded-lg text-[13px]"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                  >
                    بداية جديدة
                  </button>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
