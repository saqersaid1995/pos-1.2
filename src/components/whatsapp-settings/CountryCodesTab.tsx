import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Trash2, ChevronUp, ChevronDown, Plus, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listCountryCodes, createCountryCode, updateCountryCode, deleteCountryCode, setDefaultCountryCode,
  type CountryCodeRow,
} from "@/lib/whatsapp-settings";
import { clearCountryCodeCache } from "@/lib/phone";

export default function CountryCodesTab() {
  const [rows, setRows] = useState<CountryCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("+");

  async function load() {
    setLoading(true);
    setRows(await listCountryCodes());
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function refresh() {
    clearCountryCodeCache();
    await load();
  }

  async function add() {
    const name = newName.trim();
    const code = newCode.trim();
    if (!name || !/^\+\d{1,4}$/.test(code)) {
      toast.error("Provide a country name and code like +965");
      return;
    }
    try {
      await createCountryCode({
        country_name: name, country_code: code,
        is_default: rows.length === 0, is_active: true,
        sort_order: (rows.length ? rows[rows.length - 1].sort_order : 0) + 1,
      });
      setNewName(""); setNewCode("+");
      await refresh();
      toast.success("Country code added");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  async function patch(id: string, p: Partial<CountryCodeRow>) {
    try { await updateCountryCode(id, p); await refresh(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  async function makeDefault(id: string) {
    try { await setDefaultCountryCode(id); await refresh(); toast.success("Default updated"); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this country code?")) return;
    try { await deleteCountryCode(id); await refresh(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const swap = rows[idx + dir];
    if (!swap) return;
    try {
      await Promise.all([
        updateCountryCode(id, { sort_order: swap.sort_order }),
        updateCountryCode(swap.id, { sort_order: rows[idx].sort_order }),
      ]);
      await refresh();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Country Codes</CardTitle>
          <CardDescription>
            Manage country codes available throughout the app (POS phone input, WhatsApp sending, customer profile).
            One must be marked default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No country codes yet.</p>
          ) : rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 border rounded-md p-3 bg-card">
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => move(r.id, -1)}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === rows.length - 1} onClick={() => move(r.id, 1)}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
              <Input
                value={r.country_name}
                onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, country_name: e.target.value } : x))}
                onBlur={(e) => e.target.value !== rows.find(x=>x.id===r.id)?.country_name ? patch(r.id, { country_name: e.target.value }) : null}
                className="flex-1"
              />
              <Input
                value={r.country_code}
                onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, country_code: e.target.value } : x))}
                onBlur={(e) => e.target.value !== rows.find(x=>x.id===r.id)?.country_code ? patch(r.id, { country_code: e.target.value }) : null}
                className="w-24 font-mono"
              />
              <div className="flex items-center gap-2 px-2">
                <Switch checked={r.is_active} onCheckedChange={(v) => patch(r.id, { is_active: v })} />
                <Label className="text-xs">Active</Label>
              </div>
              <Button
                size="sm"
                variant={r.is_default ? "default" : "outline"}
                onClick={() => !r.is_default && makeDefault(r.id)}
                disabled={r.is_default}
              >
                <Star className={`h-3 w-3 ${r.is_default ? "fill-current" : ""}`} />
                {r.is_default ? "Default" : "Set default"}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium">Add country code</p>
            <div className="flex gap-2">
              <Input placeholder="Country name (e.g. Egypt)" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
              <Input placeholder="+20" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-28 font-mono" />
              <Button onClick={add}><Plus className="h-4 w-4" />Add</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
