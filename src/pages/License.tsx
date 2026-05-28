import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Info, ShieldCheck, RefreshCw, Headphones, Mail, Phone,
  Cpu, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const isElectron =
  typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

export default function License() {
  const [appVersion, setAppVersion] = useState<string>("...");
  const [hardwareId, setHardwareId] = useState<string>("...");
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    const drovo = (window as any).drovo;
    if (!drovo) return;

    // Fetch app version
    const fetchVersion = async () => {
      try {
        const v = await drovo.app?.version?.();
        if (v) setAppVersion(String(v));
      } catch {
        setAppVersion("غير متاح");
      }
    };

    // Fetch hardware ID and mask it
    const fetchHwId = async () => {
      try {
        const id = await drovo.hardware?.id?.();
        if (id) {
          const masked = `${String(id).slice(0, 8)}...`;
          setHardwareId(masked);
        }
      } catch {
        setHardwareId("غير متاح");
      }
    };

    void fetchVersion();
    void fetchHwId();
  }, []);

  async function handleCheckUpdates() {
    const drovo = (window as any).drovo;
    if (!drovo) return;
    setCheckingUpdate(true);
    try {
      const result = await drovo.app?.checkForUpdates?.();
      if (result?.updateAvailable) {
        toast.success(`يوجد تحديث جديد: الإصدار ${result.version ?? ""}. جارٍ التنزيل...`);
      } else {
        toast.info("أنت تستخدم أحدث إصدار بالفعل.");
      }
    } catch (err: any) {
      toast.error(`تعذّر التحقق من التحديثات: ${err?.message ?? String(err)}`);
    } finally {
      setCheckingUpdate(false);
    }
  }

  return (
    <div className="page-layout" style={{ background: "var(--bg-base)" }} dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="page-title">الترخيص</h1>
          <p className="page-subtitle">معلومات النظام والتحديثات</p>
        </div>
      </div>

      <div className="space-y-6 max-w-2xl">

        {/* ── App info ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Info className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">معلومات البرنامج</CardTitle>
                <CardDescription className="text-xs">تفاصيل الإصدار والنظام</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="الإصدار" value={appVersion} />
            <InfoRow label="النظام" value={navigator.platform || "—"} />
            <InfoRow
              label="المعرّف الفريد"
              value={
                <span className="font-mono text-xs select-all">
                  {hardwareId}
                </span>
              }
            />
          </CardContent>
        </Card>

        {/* ── License status ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-sm">حالة الترخيص</CardTitle>
                <CardDescription className="text-xs">معلومات اشتراكك الحالي</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الحالة</span>
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-300">
                <ShieldCheck className="w-3 h-3 ml-1" />
                مفعّل
              </Badge>
            </div>
            <InfoRow label="نوع الترخيص" value="نسخة احترافية" />
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              سيتم إضافة نظام إدارة التراخيص في إصدار قادم.
            </div>
          </CardContent>
        </Card>

        {/* ── Updates ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <RefreshCw className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">التحديثات</CardTitle>
                <CardDescription className="text-xs">تحقق من توفر إصدارات أحدث</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleCheckUpdates}
              disabled={checkingUpdate || !isElectron}
            >
              {checkingUpdate ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <RefreshCw className="w-4 h-4 ml-2" />
              )}
              التحقق من التحديثات
            </Button>
            {!isElectron && (
              <p className="text-xs text-muted-foreground mt-2">
                متاح فقط في تطبيق Windows.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Support ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Headphones className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">الدعم الفني</CardTitle>
                <CardDescription className="text-xs">تواصل معنا عند الحاجة</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <a
                href="mailto:support@drovo.app"
                className="text-sm text-foreground hover:text-primary transition-colors"
              >
                support@drovo.app
              </a>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">WhatsApp — قريباً</span>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

/* ── Helper component ── */
function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
