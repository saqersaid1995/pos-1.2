import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Save, TestTube, ArrowUp, ArrowDown } from "lucide-react";

interface MenuItem {
  id: string;
  menu_number: number;
  label_ar: string;
  label_en: string;
  action_type: string;
  reply_key: string | null;
  is_enabled: boolean;
  sort_order: number;
}

interface StaticReply {
  id: string;
  reply_key: string;
  message_text: string;
}

interface Settings {
  id: string;
  test_mode: boolean;
  test_number: string;
  production_mode: boolean;
  greeting_message: string;
  fallback_message: string;
}

const ACTION_TYPES = [
  { value: "static_reply", label: "Static Reply" },
  { value: "order_lookup", label: "Order Lookup" },
  { value: "complaint_flow", label: "Complaint Flow" },
  { value: "human_handover", label: "Human Handover" },
];

export default function MenuBotTab() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [replies, setReplies] = useState<StaticReply[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [menuRes, repliesRes, settingsRes] = await Promise.all([
      supabase.from("whatsapp_menu_items" as any).select("*").order("sort_order"),
      supabase.from("whatsapp_static_replies" as any).select("*").order("reply_key"),
      supabase.from("whatsapp_auto_reply_settings" as any).select("*").limit(1),
    ]);
    setMenuItems((menuRes.data as any) || []);
    setReplies((repliesRes.data as any) || []);
    setSettings(((settingsRes.data as any) || [])[0] || null);
    setLoading(false);
  }

  async function saveMenuItem(item: MenuItem) {
    const { id, ...rest } = item;
    if (id.startsWith("new-")) {
      const { error } = await supabase.from("whatsapp_menu_items" as any).insert({ ...rest });
      if (error) { toast.error("Failed to add menu item"); return; }
    } else {
      const { error } = await supabase.from("whatsapp_menu_items" as any).update(rest).eq("id", id);
      if (error) { toast.error("Failed to update menu item"); return; }
    }
    toast.success("Menu item saved");
    loadAll();
  }

  async function deleteMenuItem(id: string) {
    if (id.startsWith("new-")) {
      setMenuItems((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    await supabase.from("whatsapp_menu_items" as any).delete().eq("id", id);
    toast.success("Deleted");
    loadAll();
  }

  function addNewMenuItem() {
    const nextNum = menuItems.length > 0 ? Math.max(...menuItems.map((m) => m.menu_number)) + 1 : 1;
    setMenuItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        menu_number: nextNum,
        label_ar: "",
        label_en: "",
        action_type: "static_reply",
        reply_key: null,
        is_enabled: true,
        sort_order: prev.length,
      },
    ]);
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const items = [...menuItems];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
    items.forEach((item, i) => (item.sort_order = i));
    setMenuItems(items);
  }

  async function saveAllOrder() {
    for (const item of menuItems) {
      if (!item.id.startsWith("new-")) {
        await supabase.from("whatsapp_menu_items" as any).update({ sort_order: item.sort_order }).eq("id", item.id);
      }
    }
    toast.success("Order saved");
  }

  async function saveReply(reply: StaticReply) {
    const { error } = await supabase.from("whatsapp_static_replies" as any).update({ message_text: reply.message_text }).eq("id", reply.id);
    if (error) { toast.error("Failed to save reply"); return; }
    toast.success("Reply saved");
  }

  async function saveSettings() {
    if (!settings) return;
    const { id, ...rest } = settings;
    const { error } = await supabase.from("whatsapp_auto_reply_settings" as any).update(rest).eq("id", id);
    if (error) { toast.error("Failed to save settings"); return; }
    toast.success("Settings saved");
  }

  async function sendTestMenu() {
    if (!settings?.test_number) {
      toast.error("Set a test number first");
      return;
    }
    const phone = settings.test_number.replace(/\D/g, "");
    await supabase.from("whatsapp_conversation_state" as any).upsert(
      { phone, state: "new", menu_sent: false, updated_at: new Date().toISOString() },
      { onConflict: "phone" }
    );
    toast.success("Test state reset. Send a message from the test number to trigger the menu.");
  }

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Auto-Reply Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {settings && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label className="font-medium">Test Mode</Label>
                    <p className="text-xs text-muted-foreground">Only reply to test number</p>
                  </div>
                  <Switch checked={settings.test_mode} onCheckedChange={(v) => setSettings({ ...settings, test_mode: v })} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label className="font-medium">Production Mode</Label>
                    <p className="text-xs text-muted-foreground">Reply to all customers</p>
                  </div>
                  <Switch checked={settings.production_mode} onCheckedChange={(v) => setSettings({ ...settings, production_mode: v })} />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Test Phone Number</Label>
                  <Input value={settings.test_number} onChange={(e) => setSettings({ ...settings, test_number: e.target.value })} placeholder="e.g. 96899887766" />
                </div>
                <Button variant="outline" size="sm" onClick={sendTestMenu}>
                  <TestTube className="h-4 w-4 mr-1" /> Reset Test
                </Button>
              </div>
              <div>
                <Label>Greeting Message</Label>
                <Textarea value={settings.greeting_message} onChange={(e) => setSettings({ ...settings, greeting_message: e.target.value })} rows={3} />
              </div>
              <div>
                <Label>Fallback Message</Label>
                <Textarea value={settings.fallback_message} onChange={(e) => setSettings({ ...settings, fallback_message: e.target.value })} rows={2} />
              </div>
              <Button onClick={saveSettings}><Save className="h-4 w-4 mr-1" /> Save Settings</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Menu Items</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={saveAllOrder}><Save className="h-4 w-4 mr-1" /> Save Order</Button>
            <Button size="sm" onClick={addNewMenuItem}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {menuItems.map((item, idx) => (
            <div key={item.id} className="flex items-start gap-2 p-3 border rounded-lg bg-card">
              <div className="flex flex-col gap-1 pt-2">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveItem(idx, -1)}><ArrowUp className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveItem(idx, 1)}><ArrowDown className="h-3 w-3" /></Button>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-2">
                <div>
                  <Label className="text-xs">Number</Label>
                  <Input type="number" value={item.menu_number} onChange={(e) => { const items = [...menuItems]; items[idx].menu_number = parseInt(e.target.value) || 0; setMenuItems(items); }} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Label (Arabic)</Label>
                  <Input value={item.label_ar} onChange={(e) => { const items = [...menuItems]; items[idx].label_ar = e.target.value; setMenuItems(items); }} dir="rtl" />
                </div>
                <div>
                  <Label className="text-xs">Action</Label>
                  <Select value={item.action_type} onValueChange={(v) => { const items = [...menuItems]; items[idx].action_type = v; setMenuItems(items); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => (<SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Switch checked={item.is_enabled} onCheckedChange={(v) => { const items = [...menuItems]; items[idx].is_enabled = v; setMenuItems(items); }} />
                    <span className="text-xs">{item.is_enabled ? "On" : "Off"}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => saveMenuItem(item)}><Save className="h-3 w-3" /></Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteMenuItem(item.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Static Replies</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {replies.map((reply) => (
            <div key={reply.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="font-medium capitalize">{reply.reply_key.replace(/_/g, " ")}</Label>
                <Badge variant="secondary" className="text-[10px]">{reply.reply_key}</Badge>
              </div>
              <div className="flex gap-2">
                <Textarea value={reply.message_text} onChange={(e) => { setReplies((prev) => prev.map((r) => (r.id === reply.id ? { ...r, message_text: e.target.value } : r))); }} rows={2} dir="rtl" className="flex-1" />
                <Button variant="outline" size="sm" className="self-end" onClick={() => saveReply(reply)}><Save className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
