import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, Download, Upload, FolderOpen, Clock, RotateCcw,
  HardDrive, ShieldCheck, Loader2, Monitor,
} from "lucide-react";
import { toast } from "sonner";

const isElectron =
  typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

interface BackupFile {
  name: string;
  path: string;
  size: number;
  mtime: string;
}

interface AutoSettings {
  enabled: boolean;
  folder: string;
  interval: "daily" | "weekly";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar-OM", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Backup() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [autoSettings, setAutoSettings] = useState<AutoSettings>({
    enabled: false,
    folder: "",
    interval: "daily",
  });

  // Load auto-backup settings from drovo storage on mount
  useEffect(() => {
    if (!isElectron) return;
    const drovo = (window as any).drovo;
    drovo?.store?.get?.("autoBackup").then((saved: AutoSettings | null) => {
      if (saved) setAutoSettings(saved);
    }).catch(() => {});
  }, []);

  // Load backup file list whenever folder changes
  useEffect(() => {
    if (!isElectron || !autoSettings.folder) {
      setBackupFiles([]);
      return;
    }
    loadBackupFiles(autoSettings.folder);
  }, [autoSettings.folder]);

  async function loadBackupFiles(folder: string) {
    const drovo = (window as any).drovo;
    try {
      const files: BackupFile[] = await drovo?.fs?.listFiles?.(folder, "*.db") ?? [];
      setBackupFiles(files.sort((a, b) => b.mtime.localeCompare(a.mtime)));
    } catch {
      setBackupFiles([]);
    }
  }

  // ── Manual export ──────────────────────────────────────────────────────────
  async function handleExport() {
    const drovo = (window as any).drovo;
    setExporting(true);
    try {
      const path: string | null = await drovo.dialog.saveFile("drovo-backup.db", [
        { name: "Database", extensions: ["db"] },
      ]);
      if (!path) return;
      await drovo.backup.export(path);
      toast.success(`تم حفظ النسخة الاحتياطية في:\n${path}`);
    } catch (err: any) {
      toast.error(`فشل التصدير: ${err?.message ?? String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  // ── Manual import ──────────────────────────────────────────────────────────
  async function handleImport() {
    const drovo = (window as any).drovo;
    setImporting(true);
    try {
      const path: string | null = await drovo.dialog.openFile([
        { name: "Database", extensions: ["db"] },
      ]);
      if (!path) return;
      await drovo.backup.import(path);
      toast.success("تم استيراد البيانات. سيُعاد تشغيل التطبيق...");
      setTimeout(() => window.location.reload(), 3000);
    } catch (err: any) {
      toast.error(`فشل الاستيراد: ${err?.message ?? String(err)}`);
    } finally {
      setImporting(false);
    }
  }

  // ── Choose auto-backup folder ──────────────────────────────────────────────
  async function handleChooseFolder() {
    const drovo = (window as any).drovo;
    try {
      const folder: string | null = await drovo.dialog.openFolder();
      if (!folder) return;
      setAutoSettings((prev) => ({ ...prev, folder }));
    } catch (err: any) {
      toast.error(`تعذّر اختيار المجلد: ${err?.message ?? String(err)}`);
    }
  }

  // ── Save auto-backup settings ──────────────────────────────────────────────
  async function handleSaveAuto() {
    const drovo = (window as any).drovo;
    setSavingAuto(true);
    try {
      await drovo?.store?.set?.("autoBackup", autoSettings);
      await drovo?.backup?.setAutoBackup?.(autoSettings);
      toast.success("تم حفظ إعدادات النسخ التلقائي");
    } catch (err: any) {
      toast.error(`فشل الحفظ: ${err?.message ?? String(err)}`);
    } finally {
      setSavingAuto(false);
    }
  }

  // ── Restore from history ───────────────────────────────────────────────────
  async function handleRestore(filePath: string) {
    const drovo = (window as any).drovo;
    setRestoringFile(filePath);
    try {
      await drovo.backup.import(filePath);
      toast.success("تم استعادة النسخة. سيُعاد تشغيل التطبيق...");
      setTimeout(() => window.location.reload(), 3000);
    } catch (err: any) {
      toast.error(`فشلت الاستعادة: ${err?.message ?? String(err)}`);
    } finally {
      setRestoringFile(null);
    }
  }

  // ── Web mode guard ─────────────────────────────────────────────────────────
  if (!isElectron) {
    return (
      <div className="page-layout" style={{ background: "var(--bg-base)" }} dir="rtl">
        <div className="page-header">
          <div>
            <h1 className="page-title">النسخ الاحتياطي</h1>
            <p className="page-subtitle">حفظ واستعادة البيانات</p>
          </div>
        </div>
        <div className="max-w-2xl">
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <CardContent className="flex items-start gap-4 pt-6">
              <Monitor className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  هذه الميزة متاحة فقط في تطبيق Windows
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  قم بتنزيل تطبيق DROVO POS لنظام Windows للوصول إلى إدارة النسخ الاحتياطي.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="page-layout" style={{ background: "var(--bg-base)" }} dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="page-title">النسخ الاحتياطي</h1>
          <p className="page-subtitle">حفظ واستعادة البيانات</p>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl">

        {/* ── Manual export ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">تصدير نسخة احتياطية</CardTitle>
                <CardDescription className="text-xs">احفظ نسخة من قاعدة البيانات الحالية</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} disabled={exporting} className="w-full sm:w-auto">
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Download className="w-4 h-4 ml-2" />
              )}
              تصدير نسخة احتياطية
            </Button>
          </CardContent>
        </Card>

        {/* ── Manual import ── */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-sm">استيراد نسخة احتياطية</CardTitle>
                <CardDescription className="text-xs">استعادة البيانات من ملف نسخة احتياطية سابق</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning */}
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">
                <strong>تحذير:</strong> سيؤدي الاستيراد إلى استبدال{" "}
                <strong>جميع البيانات الحالية</strong> بشكل كامل ولا يمكن التراجع عن هذا الإجراء.
                تأكد من تصدير نسخة احتياطية من البيانات الحالية أولاً.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleImport}
              disabled={importing}
              className="w-full sm:w-auto"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Upload className="w-4 h-4 ml-2" />
              )}
              استيراد نسخة احتياطية
            </Button>
          </CardContent>
        </Card>

        {/* ── Auto-backup settings ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">النسخ التلقائي</CardTitle>
                <CardDescription className="text-xs">جدولة نسخ احتياطية دورية تلقائية</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-toggle" className="text-sm font-medium cursor-pointer">
                تفعيل النسخ التلقائي
              </Label>
              <Switch
                id="auto-toggle"
                checked={autoSettings.enabled}
                onCheckedChange={(v) => setAutoSettings((p) => ({ ...p, enabled: v }))}
              />
            </div>

            <div
              className={`space-y-4 transition-opacity ${
                autoSettings.enabled ? "opacity-100" : "opacity-40 pointer-events-none"
              }`}
            >
              {/* Folder selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">مجلد الحفظ</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground truncate min-w-0 font-mono">
                    {autoSettings.folder || "لم يتم الاختيار بعد"}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleChooseFolder}>
                    <FolderOpen className="w-3.5 h-3.5 ml-1.5" />
                    اختر مجلد الحفظ
                  </Button>
                </div>
              </div>

              {/* Interval */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">فترة النسخ</Label>
                <Select
                  value={autoSettings.interval}
                  onValueChange={(v: "daily" | "weekly") =>
                    setAutoSettings((p) => ({ ...p, interval: v }))
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">يومياً</SelectItem>
                    <SelectItem value="weekly">أسبوعياً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleSaveAuto} disabled={savingAuto} className="w-full sm:w-auto">
              {savingAuto ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              حفظ الإعدادات
            </Button>
          </CardContent>
        </Card>

        {/* ── Backup history ── */}
        {autoSettings.folder && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <HardDrive className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">سجل النسخ الاحتياطية</CardTitle>
                  <CardDescription className="text-xs">
                    الملفات في المجلد المحدد
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {backupFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  لا توجد نسخ احتياطية في هذا المجلد بعد.
                </p>
              ) : (
                <div className="space-y-2">
                  {backupFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {file.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(file.mtime)} · {formatSize(file.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs h-7"
                        disabled={restoringFile === file.path}
                        onClick={() => handleRestore(file.path)}
                      >
                        {restoringFile === file.path ? (
                          <Loader2 className="w-3 h-3 animate-spin ml-1" />
                        ) : (
                          <RotateCcw className="w-3 h-3 ml-1" />
                        )}
                        استعادة
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
