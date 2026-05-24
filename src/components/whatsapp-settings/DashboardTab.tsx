import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, RefreshCw, Send, Calendar as CalendarIcon, Save, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatOMR } from "@/lib/currency";
import { callAdmin, fetchSettings, updateSettings, type WhatsAppSettingsRow } from "@/lib/whatsapp-settings";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";

type Period = "today" | "week" | "month" | "last_month" | "custom";

interface ConnStatus {
  connected: boolean;
  token_healthy: boolean;
  display_phone_number: string;
  masked_token: string;
  graph_api_version: string;
}

interface DashboardData {
  kpis: {
    total_messages: number; outgoing: number; incoming: number;
    sent: number; delivered: number; failed: number; pending: number;
    delivery_rate: number; estimated_cost: number; mtd_cost: number;
    outstanding_cost: number; currency: string;
  };
  status_breakdown: Array<{ status: string; count: number; percent: number }>;
  daily: Array<{ date: string; sent: number; failed: number; cost: number }>;
  template_usage: Array<{
    template_name: string; language: string; event_type: string; category: string;
    sent: number; delivered: number; failed: number; cost: number; success_rate: number;
  }>;
  error_groups: Array<{ code: string; count: number; last_at: string; last_message: string }>;
  latest_failures: Array<{
    id: string; created_at: string; phone: string; template_name: string;
    error_code: string | null; error_message: string | null;
  }>;
  insights: {
    top_template: any; top_failure_template: any; top_recipient: any;
    last_success_at: string | null; last_failure_at: string | null; last_incoming_at: string | null;
  };
}

function getPeriodRange(period: Period, custom?: { from?: Date; to?: Date }): { from: string; to: string } {
  const now = new Date();
  const end = new Date(); end.setHours(23, 59, 59, 999);
  let start = new Date();
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start = new Date(now.getTime() - 7 * 86400000);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime());
  } else if (period === "custom" && custom?.from && custom?.to) {
    start = new Date(custom.from); start.setHours(0, 0, 0, 0);
    end.setTime(new Date(custom.to).setHours(23, 59, 59, 999));
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString() : "—";

export default function DashboardTab() {
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [status, setStatus] = useState<ConnStatus | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<WhatsAppSettingsRow | null>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);

  async function load() {
    setLoading(true);
    try {
      const [s, d, st] = await Promise.all([
        callAdmin("status").catch(() => null),
        callAdmin("dashboard_stats", { from: range.from, to: range.to }),
        fetchSettings(),
      ]);
      setStatus(s as ConnStatus);
      setData(d as DashboardData);
      setSettings(st);
    } catch (e: any) {
      toast.error(`Failed to load: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [range.from, range.to]);

  async function retry(logId: string) {
    try {
      const res: any = await callAdmin("retry_failed_message", { log_id: logId });
      if (res?.success) toast.success("Retry sent");
      else toast.error(`Retry failed: ${res?.error || res?.data?.error?.message || "Unknown"}`);
      await load();
    } catch (e) { toast.error(String(e)); }
  }

  return (
    <div className="space-y-4">
      <ConnectionHealthRow status={status} loading={loading} onRefresh={load} />

      <PeriodFilter
        period={period} setPeriod={setPeriod}
        customRange={customRange} setCustomRange={setCustomRange}
        loading={loading} onRefresh={load}
      />

      {data && (
        <>
          <KPIGrid data={data} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StatusBreakdown rows={data.status_breakdown} />
            <TrendsChart daily={data.daily} currency={data.kpis.currency} />
          </div>
          <TemplateUsageTable rows={data.template_usage} currency={data.kpis.currency} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ErrorGroupsTable rows={data.error_groups} />
            <LatestFailures rows={data.latest_failures} onRetry={retry} />
          </div>
          <InsightsCard insights={data.insights} />
          {settings && <CostSettingsCard settings={settings} onSaved={load} />}
        </>
      )}
    </div>
  );
}

/* ---------- Connection Health ---------- */
function ConnectionHealthRow({ status, loading, onRefresh }: { status: ConnStatus | null; loading: boolean; onRefresh: () => void }) {
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    try {
      const data: any = await callAdmin("test_connection");
      if (data.success) toast.success(`Connected: ${data.data?.display_phone_number || "OK"}`);
      else toast.error(`Failed: ${data.data?.error?.message || data.error || "Unknown"}`);
      onRefresh();
    } catch (e) { toast.error(String(e)); }
    finally { setTesting(false); }
  }
  return (
    <Card>
      <CardContent className="py-3 flex items-center flex-wrap gap-3">
        {status?.connected
          ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>
          : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Not connected</Badge>}
        <span className="text-sm text-muted-foreground">Phone:</span>
        <span className="font-mono text-sm">{status?.display_phone_number || "—"}</span>
        <span className="text-sm text-muted-foreground ml-2">Token:</span>
        <span className="font-mono text-xs">{status?.masked_token || "—"}</span>
        <span className="text-sm text-muted-foreground ml-2">API:</span>
        <span className="font-mono text-xs">{status?.graph_api_version || "—"}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={test} disabled={testing}>
            <Send className="h-4 w-4" />{testing ? "…" : "Test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Period Filter ---------- */
function PeriodFilter({
  period, setPeriod, customRange, setCustomRange, loading, onRefresh,
}: {
  period: Period; setPeriod: (p: Period) => void;
  customRange: { from?: Date; to?: Date }; setCustomRange: (r: { from?: Date; to?: Date }) => void;
  loading: boolean; onRefresh: () => void;
}) {
  const opts: { v: Period; label: string }[] = [
    { v: "today", label: "Today" },
    { v: "week", label: "This Week" },
    { v: "month", label: "This Month" },
    { v: "last_month", label: "Last Month" },
    { v: "custom", label: "Custom" },
  ];
  return (
    <Card>
      <CardContent className="py-3 flex flex-wrap items-center gap-2">
        {opts.map(o => (
          <Button key={o.v} size="sm" variant={period === o.v ? "default" : "outline"} onClick={() => setPeriod(o.v)}>
            {o.label}
          </Button>
        ))}
        {period === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customRange.from ? format(customRange.from, "PP") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customRange.from} onSelect={(d) => setCustomRange({ ...customRange, from: d })}
                  className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customRange.to ? format(customRange.to, "PP") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customRange.to} onSelect={(d) => setCustomRange({ ...customRange, to: d })}
                  className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- KPI Grid ---------- */
function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function KPIGrid({ data }: { data: DashboardData }) {
  const k = data.kpis;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPI label="Total Sent" value={String(k.outgoing)} />
      <KPI label="Delivered" value={String(k.delivered)} />
      <KPI label="Failed" value={String(k.failed)} />
      <KPI label="Incoming" value={String(k.incoming)} />
      <KPI label="Outgoing" value={String(k.outgoing)} />
      <KPI label="Delivery Rate" value={`${k.delivery_rate}%`} />
      <KPI label="Est. Period Cost" value={formatOMR(k.estimated_cost)} sub={`MTD: ${formatOMR(k.mtd_cost)}`} />
      <KPI label="Outstanding (Unpaid)" value={formatOMR(k.outstanding_cost)} />
    </div>
  );
}

/* ---------- Status Breakdown ---------- */
function StatusBreakdown({ rows }: { rows: DashboardData["status_breakdown"] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map(r => (
          <div key={r.status} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="capitalize">{r.status}</span>
              <span className="text-muted-foreground">{r.count} ({r.percent}%)</span>
            </div>
            <div className="h-2 bg-muted rounded">
              <div className={cn("h-full rounded",
                r.status === "failed" ? "bg-destructive" :
                r.status === "delivered" || r.status === "read" ? "bg-green-500" :
                "bg-primary"
              )} style={{ width: `${Math.min(r.percent, 100)}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------- Trends Chart ---------- */
function TrendsChart({ daily, currency }: { daily: DashboardData["daily"]; currency: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Trends</CardTitle></CardHeader>
      <CardContent style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} />
            <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} />
            <Line type="monotone" dataKey="cost" stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ---------- Template Usage ---------- */
function TemplateUsageTable({ rows, currency }: { rows: DashboardData["template_usage"]; currency: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Template Usage</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Lang</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Success %</TableHead>
              <TableHead className="text-right">Est. Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{r.template_name}</TableCell>
                <TableCell>{r.language || "—"}</TableCell>
                <TableCell className="text-xs">{r.event_type || "—"}</TableCell>
                <TableCell className="text-right">{r.sent}</TableCell>
                <TableCell className="text-right">{r.delivered}</TableCell>
                <TableCell className="text-right">{r.failed}</TableCell>
                <TableCell className="text-right">{r.success_rate}%</TableCell>
                <TableCell className="text-right">{formatOMR(r.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Error Groups ---------- */
function ErrorGroupsTable({ rows }: { rows: DashboardData["error_groups"] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Errors by Code</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead>Last</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No errors 🎉</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="font-mono">{r.code}</TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-xs">{fmt(r.last_at)}</TableCell>
                <TableCell className="text-xs max-w-[200px] truncate">{r.last_message || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Latest Failures ---------- */
function LatestFailures({ rows, onRetry }: { rows: DashboardData["latest_failures"]; onRetry: (id: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Latest Failures</CardTitle></CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent failures</p>
        ) : rows.map((r) => (
          <div key={r.id} className="border rounded p-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">{r.error_code || "ERR"}</Badge>
              <span className="font-mono text-xs">{r.phone}</span>
              <span className="text-xs text-muted-foreground">{r.template_name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{fmt(r.created_at)}</span>
              <Button size="sm" variant="outline" onClick={() => onRetry(r.id)}>
                <RotateCw className="h-3 w-3 mr-1" />Retry
              </Button>
            </div>
            {r.error_message && <p className="text-xs text-destructive mt-1">{r.error_message}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------- Insights ---------- */
function InsightsCard({ insights }: { insights: DashboardData["insights"] }) {
  const items: Array<[string, string]> = [
    ["Most used template", insights.top_template ? `${insights.top_template.template_name} (${insights.top_template.sent})` : "—"],
    ["Highest failure template", insights.top_failure_template?.failed
      ? `${insights.top_failure_template.template_name} (${insights.top_failure_template.failed})` : "—"],
    ["Top recipient", insights.top_recipient ? `${insights.top_recipient.phone} (${insights.top_recipient.count})` : "—"],
    ["Last successful send", fmt(insights.last_success_at)],
    ["Last failed send", fmt(insights.last_failure_at)],
    ["Last incoming", fmt(insights.last_incoming_at)],
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Operational Insights</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(([k, v]) => (
          <div key={k} className="border rounded p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-sm mt-1">{v}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------- Cost Settings ---------- */
function CostSettingsCard({ settings, onSaved }: { settings: WhatsAppSettingsRow; onSaved: () => void }) {
  const [rates, setRates] = useState(settings.cost_rates || {});
  const [outstanding, setOutstanding] = useState(settings.outstanding_unpaid_cost || 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRates(settings.cost_rates || {});
    setOutstanding(settings.outstanding_unpaid_cost || 0);
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      await updateSettings(settings.id, {
        cost_rates: rates,
        outstanding_unpaid_cost: outstanding,
      } as any);
      toast.success("Cost settings saved");
      onSaved();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || String(e)}`);
    } finally { setSaving(false); }
  }

  const fields: Array<[keyof typeof rates, string]> = [
    ["utility", "Utility template (OMR)"],
    ["marketing", "Marketing template (OMR)"],
    ["service", "Service conversation (OMR)"],
    ["authentication", "Authentication template (OMR)"],
    ["default", "Default fallback (OMR)"],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost Configuration</CardTitle>
        <CardDescription>Estimated rates per message. Adjust to match your Meta pricing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map(([key, label]) => (
            <div key={key as string} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number" step="0.001" min="0"
                value={(rates as any)[key] ?? 0}
                onChange={(e) => setRates({ ...rates, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs">Outstanding unpaid cost (OMR)</Label>
            <Input
              type="number" step="0.001" min="0"
              value={outstanding}
              onChange={(e) => setOutstanding(Number(e.target.value))}
            />
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
