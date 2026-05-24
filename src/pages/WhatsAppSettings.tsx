import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle, XCircle, RefreshCw, Send, Copy, AlertTriangle, Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchSettings, updateSettings, callAdmin,
  TEMPLATE_KEYS, EVENT_KEYS,
  type WhatsAppSettingsRow, type WhatsAppTemplate,
} from "@/lib/whatsapp-settings";
import UpdateSecretsCard from "@/components/whatsapp-settings/UpdateSecretsCard";
import CountryCodesTab from "@/components/whatsapp-settings/CountryCodesTab";
import DashboardTab from "@/components/whatsapp-settings/DashboardTab";
import MenuBotTab from "@/components/whatsapp-settings/MenuBotTab";

type Status = {
  connected: boolean;
  token_healthy: boolean;
  token_health_error?: string;
  masked_token: string;
  masked_phone_number_id: string;
  display_phone_number: string;
  graph_api_version: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_message: string | null;
  last_incoming_at: string | null;
  webhook_url: string;
  masked_verify_token: string;
  masked_app_secret: string;
  has_verify_token: boolean;
  has_app_secret: boolean;
};

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString() : "—";

const WhatsAppSettings = () => {
  const [settings, setSettings] = useState<WhatsAppSettingsRow | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
    void refreshStatus();
  }, []);

  async function load() {
    const s = await fetchSettings();
    setSettings(s);
  }

  async function refreshStatus() {
    setLoadingStatus(true);
    try {
      const data = await callAdmin("status");
      setStatus(data as Status);
    } catch (e) {
      toast.error(`Failed to load status: ${String(e)}`);
    } finally {
      setLoadingStatus(false);
    }
  }

  async function saveSettings(patch: Partial<WhatsAppSettingsRow>) {
    if (!settings) return;
    setSaving(true);
    try {
      await updateSettings(settings.id, patch);
      setSettings({ ...settings, ...patch });
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="WhatsApp Settings" />
      <div className="max-w-6xl mx-auto p-4">
        <Tabs defaultValue="dashboard">
          <div className="overflow-x-auto -mx-1 mb-4">
            <TabsList className="inline-flex w-max h-auto justify-start gap-1 px-1">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
              <TabsTrigger value="countries">Country Codes</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="events">Event Mapping</TabsTrigger>
              <TabsTrigger value="invoice">Invoice PDF</TabsTrigger>
              <TabsTrigger value="webhook">Webhook</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="inbox">Inbox</TabsTrigger>
              <TabsTrigger value="menubot">Menu Bot</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="credentials">
            <CredentialsTab status={status} settings={settings} onSave={saveSettings} saving={saving} onRefreshStatus={refreshStatus} />
          </TabsContent>
          <TabsContent value="countries">
            <CountryCodesTab />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab settings={settings} onSave={saveSettings} saving={saving} status={status} />
          </TabsContent>
          <TabsContent value="events">
            <EventsTab settings={settings} onSave={saveSettings} saving={saving} />
          </TabsContent>
          <TabsContent value="invoice">
            <InvoiceTab settings={settings} onSave={saveSettings} saving={saving} />
          </TabsContent>
          <TabsContent value="webhook">
            <WebhookTab status={status} />
          </TabsContent>
          <TabsContent value="logs">
            <LogsTab />
          </TabsContent>
          <TabsContent value="inbox">
            <InboxTab settings={settings} onSave={saveSettings} saving={saving} />
          </TabsContent>
          <TabsContent value="menubot">
            <MenuBotTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WhatsAppSettings;

/* -------------------- Connection -------------------- */
function ConnectionTab({ status, loading, onRefresh }: { status: Status | null; loading: boolean; onRefresh: () => void }) {
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    try {
      const data: any = await callAdmin("test_connection");
      if (data.success) toast.success(`Connected: ${data.data?.display_phone_number || "OK"}`);
      else toast.error(`Failed: ${data.data?.error?.message || data.error || "Unknown"}`);
      await onRefresh();
    } catch (e) { toast.error(String(e)); }
    finally { setTesting(false); }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>Live health of your WhatsApp Business connection</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={test} disabled={testing}>
              <Send className="h-4 w-4" />
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {status.connected
                ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>
                : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Not connected</Badge>}
              {status.token_healthy
                ? <Badge variant="outline" className="text-green-700 border-green-300">Token healthy</Badge>
                : <Badge variant="destructive">Token check failed</Badge>}
            </div>
            {status.token_health_error && !status.token_healthy && (
              <p className="text-xs text-destructive">{status.token_health_error}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="Phone Number ID" value={status.masked_phone_number_id || "—"} />
              <Field label="Display Phone" value={status.display_phone_number || "—"} />
              <Field label="Graph API Version" value={status.graph_api_version} />
              <Field label="Last Successful Send" value={fmt(status.last_success_at)} />
              <Field label="Last Failed Send" value={fmt(status.last_failure_at)} />
              <Field label="Last Incoming Message" value={fmt(status.last_incoming_at)} />
            </div>
            {status.last_failure_message && (
              <p className="text-xs text-destructive">Last error: {status.last_failure_message}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const isSecretName = /^[A-Z_]+$/.test(label.split(" ")[0]);
  return (
    <div className="border rounded-md p-3 bg-card min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        {isSecretName && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title="Copy secret name"
            onClick={() => {
              const name = label.split(" ")[0];
              navigator.clipboard.writeText(name);
              toast.success(`Copied ${name}`);
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
      <p className="font-mono text-sm mt-1 truncate" title={value}>{value}</p>
    </div>
  );
}

/* -------------------- Credentials -------------------- */
function CredentialsTab({
  status, settings, onSave, saving, onRefreshStatus,
}: { status: Status | null; settings: WhatsAppSettingsRow | null; onSave: (p: Partial<WhatsAppSettingsRow>) => Promise<void>; saving: boolean; onRefreshStatus: () => Promise<void> }) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (settings) setVersion(settings.graph_api_version);
  }, [settings]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Current Secrets (masked)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="WHATSAPP_ACCESS_TOKEN" value={status?.masked_token || "—"} />
          <Field label="WHATSAPP_PHONE_NUMBER_ID" value={status?.masked_phone_number_id || "—"} />
          <Field label="VERIFY_TOKEN" value={status?.has_verify_token ? status.masked_verify_token : "Not set"} />
          <Field label="WHATSAPP_APP_SECRET (optional)" value={status?.has_app_secret ? status.masked_app_secret : "Not set"} />
        </CardContent>
      </Card>

      <UpdateSecretsCard onAfterTest={onRefreshStatus} />

      <Card>
        <CardHeader>
          <CardTitle>Other Settings</CardTitle>
          <CardDescription>Country codes are managed in the “Country Codes” tab</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label>Graph API Version</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v18.0" />
          </div>
          <Button disabled={saving} onClick={() => onSave({ graph_api_version: version })}>
            <Save className="h-4 w-4" />Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Templates -------------------- */
function TemplatesTab({
  settings, onSave, saving, status,
}: { settings: WhatsAppSettingsRow | null; onSave: (p: Partial<WhatsAppSettingsRow>) => Promise<void>; saving: boolean; status: Status | null }) {
  const [local, setLocal] = useState<Record<string, WhatsAppTemplate> | null>(null);
  const [testOpen, setTestOpen] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState(status?.display_phone_number || "");
  const [testing, setTesting] = useState(false);

  useEffect(() => { if (settings) setLocal(settings.templates); }, [settings]);
  if (!local) return null;

  function update(key: string, patch: Partial<WhatsAppTemplate>) {
    setLocal({ ...local, [key]: { ...local![key], ...patch } });
  }

  async function send(key: string) {
    if (!local) return;
    const tpl = local[key];
    setTesting(true);
    try {
      const data: any = await callAdmin("test_template", {
        phone: testPhone, template_name: tpl.name, language: tpl.language,
      });
      if (data.success) toast.success("Test template sent");
      else toast.error(`Failed: ${data.data?.error?.message || data.error}`);
    } catch (e) { toast.error(String(e)); }
    finally { setTesting(false); setTestOpen(null); }
  }

  return (
    <div className="space-y-3">
      {TEMPLATE_KEYS.map(({ key, label }) => {
        const t = local[key] || { name: "", language: "ar", enabled: false, params: [] };
        return (
          <Card key={key}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Trigger key: <code>{key}</code></p>
                </div>
                <Switch checked={t.enabled} onCheckedChange={(v) => update(key, { enabled: v })} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Template Name</Label>
                  <Input value={t.name} onChange={(e) => update(key, { name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Language</Label>
                  <Input value={t.language} onChange={(e) => update(key, { language: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Required parameters</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(t.params || []).map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTestOpen(key)}>
                <Send className="h-4 w-4" />Test send
              </Button>
            </CardContent>
          </Card>
        );
      })}
      <Button disabled={saving} onClick={() => onSave({ templates: local })}>
        <Save className="h-4 w-4" />Save templates
      </Button>

      <Dialog open={!!testOpen} onOpenChange={(o) => !o && setTestOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Test send template</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Recipient phone (with country code)</Label>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="96812345678" />
            <p className="text-xs text-muted-foreground">Sends without parameters — for connectivity verification only.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(null)}>Cancel</Button>
            <Button onClick={() => testOpen && send(testOpen)} disabled={testing || !testPhone}>
              {testing ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------- Event mapping -------------------- */
function EventsTab({
  settings, onSave, saving,
}: { settings: WhatsAppSettingsRow | null; onSave: (p: Partial<WhatsAppSettingsRow>) => Promise<void>; saving: boolean }) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => { if (settings) setMap(settings.event_mapping); }, [settings]);
  if (!settings) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Event → Template Mapping</CardTitle>
        <CardDescription>Choose which template fires for each business event</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {EVENT_KEYS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <Label>{label}</Label>
            <Select value={map[key] || ""} onValueChange={(v) => setMap({ ...map, [key]: v })}>
              <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_KEYS.map(({ key: tk, label: tl }) => (
                  <SelectItem key={tk} value={tk}>{tl} ({settings.templates[tk]?.name || "—"})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <Button disabled={saving} onClick={() => onSave({ event_mapping: map })}>
          <Save className="h-4 w-4" />Save mapping
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------- Invoice -------------------- */
function InvoiceTab({
  settings, onSave, saving,
}: { settings: WhatsAppSettingsRow | null; onSave: (p: Partial<WhatsAppSettingsRow>) => Promise<void>; saving: boolean }) {
  const [s, setS] = useState<Partial<WhatsAppSettingsRow>>({});
  useEffect(() => { if (settings) setS(settings); }, [settings]);
  if (!settings) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice PDF Settings</CardTitle>
        <CardDescription>Branding for PDFs attached to WhatsApp invoices</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={s.business_name || ""} onChange={(e) => setS({ ...s, business_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input value={s.business_logo_url || ""} onChange={(e) => setS({ ...s, business_logo_url: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Default Invoice Language</Label>
            <Select value={s.default_invoice_language || "ar"} onValueChange={(v) => setS({ ...s, default_invoice_language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">Arabic</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Receipt Size</Label>
            <Input value={s.receipt_size || ""} onChange={(e) => setS({ ...s, receipt_size: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Footer Text</Label>
          <Textarea value={s.invoice_footer_text || ""} onChange={(e) => setS({ ...s, invoice_footer_text: e.target.value })} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!s.include_qr} onCheckedChange={(v) => setS({ ...s, include_qr: v })} />
          <Label>Include QR code on invoice</Label>
        </div>
        <Button disabled={saving} onClick={() => onSave(s)}>
          <Save className="h-4 w-4" />Save
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------- Webhook -------------------- */
function WebhookTab({ status }: { status: Status | null }) {
  if (!status) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Incoming Webhook</CardTitle>
        <CardDescription>Configure this URL in Meta WhatsApp Business → Configuration → Webhook</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Webhook URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={status.webhook_url} className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(status.webhook_url);
              toast.success("Copied");
            }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Verify Token" value={status.has_verify_token ? status.masked_verify_token : "Not set"} />
          <Field label="App Secret" value={status.has_app_secret ? status.masked_app_secret : "Not set"} />
          <Field label="Last Incoming Message" value={fmt(status.last_incoming_at)} />
          <Field label="Last Failure" value={status.last_failure_message || "—"} />
        </div>
        <p className="text-xs text-muted-foreground">
          To verify the webhook in Meta, paste the URL above and use the value of the
          <code className="mx-1">VERIFY_TOKEN</code> backend secret.
        </p>
      </CardContent>
    </Card>
  );
}

/* -------------------- Logs -------------------- */
type LogRow = {
  id: string;
  ts: string;
  phone: string;
  event: string;
  template: string;
  status: string;
  error: string | null;
  provider_id: string | null;
  direction: "outgoing" | "incoming";
};

function LogsTab() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: notif }, { data: msgs }] = await Promise.all([
      supabase.from("notification_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("whatsapp_messages" as any).select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    const a: LogRow[] = (notif || []).map((n: any) => ({
      id: `n-${n.id}`, ts: n.created_at, phone: n.recipient_phone, event: n.message_type,
      template: n.message_type, status: n.send_status, error: n.error_message,
      provider_id: n.provider_message_id, direction: "outgoing",
    }));
    const b: LogRow[] = (msgs || []).map((m: any) => ({
      id: `m-${m.id}`, ts: m.created_at, phone: m.phone, event: m.message_type,
      template: m.message_type, status: m.send_status, error: null,
      provider_id: m.wa_message_id, direction: m.type === "incoming" ? "incoming" : "outgoing",
    }));
    setRows([...a, ...b].sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, 200));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      switch (filter) {
        case "sent": return r.status === "sent";
        case "failed": return r.status === "failed";
        case "order_ready": return r.event?.toLowerCase().includes("ready");
        case "loyalty": return r.event?.toLowerCase().includes("loyalty");
        case "incoming": return r.direction === "incoming";
        case "outgoing": return r.direction === "outgoing";
        default: return true;
      }
    });
  }, [rows, filter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>WhatsApp Logs</CardTitle>
            <CardDescription>Latest 200 entries from notifications + inbox messages</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {["all", "sent", "failed", "order_ready", "loyalty", "incoming", "outgoing"].map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No logs.</p>
          ) : filtered.map((r) => (
            <div key={r.id} className="border rounded p-2 text-sm bg-card">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
                <Badge variant="outline">{r.direction}</Badge>
                <span className="font-mono text-xs">{r.phone}</span>
                <span className="text-xs text-muted-foreground">{r.event}</span>
                <span className="text-xs text-muted-foreground ml-auto">{fmt(r.ts)}</span>
              </div>
              {r.error && <p className="text-xs text-destructive mt-1">{r.error}</p>}
              {r.provider_id && <p className="text-xs text-muted-foreground font-mono mt-1 truncate">ID: {r.provider_id}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------- Inbox -------------------- */
function InboxTab({
  settings, onSave, saving,
}: { settings: WhatsAppSettingsRow | null; onSave: (p: Partial<WhatsAppSettingsRow>) => Promise<void>; saving: boolean }) {
  const [s, setS] = useState<Partial<WhatsAppSettingsRow>>({});
  useEffect(() => { if (settings) setS(settings); }, [settings]);
  if (!settings) return null;
  const toggles: Array<[keyof WhatsAppSettingsRow, string, string]> = [
    ["incoming_enabled", "Incoming messages enabled", "Receive customer messages via webhook"],
    ["auto_reply_enabled", "Auto-reply enabled", "Send menu-bot auto replies"],
    ["push_notifications_enabled", "Push notifications enabled", "Notify staff via Web Push on new messages"],
    ["unread_badge_enabled", "Unread badge enabled", "Show unread count in navigation"],
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Support Inbox Settings</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {toggles.map(([k, label, desc]) => (
          <div key={k as string} className="flex items-center justify-between border rounded p-3">
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch checked={!!(s as any)[k]} onCheckedChange={(v) => setS({ ...s, [k]: v } as any)} />
          </div>
        ))}
        <Button disabled={saving} onClick={() => onSave(s)}>
          <Save className="h-4 w-4" />Save
        </Button>
      </CardContent>
    </Card>
  );
}
