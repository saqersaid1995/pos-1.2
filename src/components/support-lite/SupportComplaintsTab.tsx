import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Image, Save } from "lucide-react";
import { format } from "date-fns";

interface Complaint {
  id: string;
  phone: string;
  customer_id: string | null;
  message: string;
  attachment_url: string | null;
  status: string;
  internal_notes: string;
  created_at: string;
  customer_name?: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-red-100 text-red-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
};

export default function SupportComplaintsTab() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => { loadComplaints(); }, []);

  async function loadComplaints() {
    setLoading(true);
    const { data } = await supabase
      .from("whatsapp_complaints" as any)
      .select("*")
      .order("created_at", { ascending: false });

    const items = (data as any[]) || [];
    const customerIds = [...new Set(items.filter((c) => c.customer_id).map((c) => c.customer_id))];
    let customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, full_name").in("id", customerIds);
      for (const c of customers || []) customerMap[c.id] = c.full_name;
    }

    setComplaints(
      items.map((c) => ({
        ...c,
        internal_notes: c.internal_notes || "",
        customer_name: c.customer_id ? customerMap[c.customer_id] || "Unknown" : undefined,
      }))
    );
    setLoading(false);
  }

  async function updateComplaint(id: string, updates: Partial<Complaint>) {
    const { error } = await supabase
      .from("whatsapp_complaints" as any)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Updated");
    loadComplaints();
  }

  const filtered = filterStatus === "all" ? complaints : complaints.filter((c) => c.status === filterStatus);

  return (
    <div className="flex-1 flex flex-col px-4 pb-4 space-y-3 overflow-y-auto">
      {/* Filter */}
      <div className="flex items-center gap-2 pt-3 overflow-x-auto">
        {["all", "new", "in_progress", "resolved"].map((s) => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s)}
            className="capitalize text-xs shrink-0"
          >
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {loading && <p className="text-center text-muted-foreground text-sm py-4">Loading...</p>}

      {filtered.map((complaint) => (
        <Card key={complaint.id}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-sm">{complaint.phone}</span>
                  {complaint.customer_name && (
                    <Badge variant="secondary" className="text-[10px]">{complaint.customer_name}</Badge>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[complaint.status] || ""}`}>
                    {complaint.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(complaint.created_at), "dd/MM/yyyy HH:mm")}
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg" dir="rtl">
              <p className="text-sm whitespace-pre-wrap">{complaint.message}</p>
            </div>

            {complaint.attachment_url && (
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <img src={complaint.attachment_url} alt="Attachment" className="h-20 w-20 object-cover rounded border" />
              </div>
            )}

            <Select value={complaint.status} onValueChange={(v) => updateComplaint(complaint.id, { status: v })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <label className="text-xs font-medium">Internal Notes</label>
              <div className="flex gap-2">
                <Textarea
                  value={complaint.internal_notes}
                  onChange={(e) =>
                    setComplaints((prev) => prev.map((c) => (c.id === complaint.id ? { ...c, internal_notes: e.target.value } : c)))
                  }
                  rows={2}
                  placeholder="Add internal notes..."
                  className="flex-1"
                />
                <Button variant="outline" size="sm" className="self-end" onClick={() => updateComplaint(complaint.id, { internal_notes: complaint.internal_notes })}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {!loading && filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No complaints found.</p>
      )}
    </div>
  );
}
