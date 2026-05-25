import { useState, useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Printer as PrinterIcon, Monitor, Loader2, RefreshCw, FileText, AlignLeft,
} from "lucide-react";
import { toast } from "sonner";

const isElectron =
  typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

interface PrinterSettings {
  defaultPrinter: string;
  paperSize: "80mm" | "a4";
  headerText: string;
  footerText: string;
}

const DEFAULT_SETTINGS: PrinterSettings = {
  defaultPrinter: "",
  paperSize: "80mm",
  headerText: "",
  footerText: "شكراً لزيارتكم، نتطلع لخدمتكم مجدداً",
};

export default function Printer() {
  const [printers, setPrinters] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  // Load printers list and current settings on mount
  useEffect(() => {
    if (!isElectron) return;
    void loadPrinters();
    void loadSettings();
  }, []);

  async function loadPrinters() {
    const drovo = (window as any).drovo;
    setLoadingPrinters(true);
    try {
      const list: string[] = (await drovo?.printer?.list?.()) ?? [];
      setPrinters(list);
    } catch (err: any) {
      toast.error(`تعذّر تحميل قائمة الطابعات: ${err?.message ?? String(err)}`);
    } finally {
      setLoadingPrinters(false);
    }
  }

  async function loadSettings() {
    const drovo = (window as any).drovo;
    try {
      const rows: Array<{ key: string; value: string }> =
        (await drovo?.db?.all?.(
          "SELECT key, value FROM business_settings WHERE id='default'",
          []
        )) ?? [];

      // business_settings is typically a single row with columns
      const row: Record<string, string> =
        (await drovo?.db?.get?.(
          "SELECT default_printer, paper_size, invoice_header, invoice_footer FROM business_settings WHERE id='default'",
          []
        )) ?? {};

      setSettings({
        defaultPrinter: row.default_printer ?? "",
        paperSize: (row.paper_size as "80mm" | "a4") ?? "80mm",
        headerText: row.invoice_header ?? "",
        footerText: row.invoice_footer ?? "شكراً لزيارتكم، نتطلع لخدمتكم مجدداً",
      });
    } catch {
      // Table might not have these columns yet — use defaults silently
    }
  }

  async function handleSave() {
    const drovo = (window as any).drovo;
    setSaving(true);
    try {
      await drovo?.db?.run?.(
        `UPDATE business_settings
         SET default_printer=?, paper_size=?, invoice_header=?, invoice_footer=?
         WHERE id='default'`,
        [
          settings.defaultPrinter,
          settings.paperSize,
          settings.headerText,
          settings.footerText,
        ]
      );
      toast.success("تم حفظ إعدادات الطابعة");
    } catch (err: any) {
      toast.error(`فشل الحفظ: ${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    const drovo = (window as any).drovo;
    setTestPrinting(true);
    try {
      await drovo?.printer?.print?.({ silent: true, printBackground: true });
      toast.success("تم إرسال الطباعة التجريبية");
    } catch (err: any) {
      toast.error(`فشلت الطباعة التجريبية: ${err?.message ?? String(err)}`);
    } finally {
      setTestPrinting(false);
    }
  }

  // ── Web mode guard ─────────────────────────────────────────────────────────
  if (!isElectron) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <AppHeader title="إعدادات الطابعة" />
        <div className="p-4 max-w-2xl mx-auto">
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <CardContent className="flex items-start gap-4 pt-6">
              <Monitor className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  هذه الميزة متاحة فقط في تطبيق Windows
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  قم بتنزيل تطبيق DROVO POS لنظام Windows للوصول إلى إعدادات الطابعة.
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
    <div className="min-h-screen bg-background" dir="rtl">
      <AppHeader title="إعدادات الطابعة" />

      <div className="p-4 max-w-3xl mx-auto space-y-6">

        {/* ── Printer selection ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <PrinterIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">اختيار الطابعة</CardTitle>
                <CardDescription className="text-xs">حدد الطابعة الافتراضية للفواتير</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={settings.defaultPrinter}
                  onValueChange={(v) => setSettings((p) => ({ ...p, defaultPrinter: v }))}
                  disabled={loadingPrinters || printers.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingPrinters
                          ? "جارٍ التحميل..."
                          : printers.length === 0
                          ? "لم يتم العثور على طابعات"
                          : "اختر الطابعة"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={loadPrinters}
                disabled={loadingPrinters}
                title="تحديث القائمة"
              >
                {loadingPrinters ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Paper size ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">حجم الورق</CardTitle>
                <CardDescription className="text-xs">اختر حجم الورق المناسب لطابعتك</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={settings.paperSize}
              onValueChange={(v: "80mm" | "a4") =>
                setSettings((p) => ({ ...p, paperSize: v }))
              }
              className="flex flex-col gap-3 sm:flex-row"
            >
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 flex-1 cursor-pointer">
                <RadioGroupItem value="80mm" id="paper-80mm" />
                <Label htmlFor="paper-80mm" className="cursor-pointer flex-1">
                  <span className="text-sm font-medium block">80mm حراري</span>
                  <span className="text-xs text-muted-foreground">طابعة الحرارية المصغّرة</span>
                </Label>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 flex-1 cursor-pointer">
                <RadioGroupItem value="a4" id="paper-a4" />
                <Label htmlFor="paper-a4" className="cursor-pointer flex-1">
                  <span className="text-sm font-medium block">A4</span>
                  <span className="text-xs text-muted-foreground">طابعة الورق العادية</span>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* ── Invoice header & footer ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <AlignLeft className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">رأس وتذييل الفاتورة</CardTitle>
                <CardDescription className="text-xs">النص الذي يظهر في أعلى وأسفل كل فاتورة</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="header-text" className="text-xs text-muted-foreground">
                رأس الفاتورة
              </Label>
              <Textarea
                id="header-text"
                rows={4}
                placeholder={"اسم المحل\nالعنوان\nرقم الهاتف\nالرقم الضريبي"}
                value={settings.headerText}
                onChange={(e) => setSettings((p) => ({ ...p, headerText: e.target.value }))}
                className="resize-none font-mono text-xs"
                dir="rtl"
              />
              <p className="text-[11px] text-muted-foreground">
                يمكنك كتابة اسم المحل، العنوان، الهاتف، أو الرقم الضريبي — كل معلومة في سطر منفصل.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer-text" className="text-xs text-muted-foreground">
                تذييل الفاتورة
              </Label>
              <Textarea
                id="footer-text"
                rows={3}
                placeholder="شكراً لزيارتكم، نتطلع لخدمتكم مجدداً"
                value={settings.footerText}
                onChange={(e) => setSettings((p) => ({ ...p, footerText: e.target.value }))}
                className="resize-none font-mono text-xs"
                dir="rtl"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Save button ── */}
        <div className="flex justify-start">
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
            حفظ الإعدادات
          </Button>
        </div>

        {/* ── Test print ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <PrinterIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">طباعة تجريبية</CardTitle>
                <CardDescription className="text-xs">تحقق من صحة إعدادات الطابعة</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleTestPrint}
              disabled={testPrinting}
              className="w-full sm:w-auto"
            >
              {testPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <PrinterIcon className="w-4 h-4 ml-2" />
              )}
              طباعة فاتورة تجريبية
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
