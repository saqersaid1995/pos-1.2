import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, KeyRound, UserCheck, UserX } from "lucide-react";

interface StaffMember {
  id: string;
  full_name: string;
  username: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  role: string;
}

export default function StaffManagement() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({ full_name: "", username: "", phone: "", role: "cashier", password: "" });
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    const { data: roles } = await supabase.from("user_roles").select("*");

    if (profiles && roles) {
      const mapped: StaffMember[] = profiles.map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        username: p.username,
        phone: p.phone || "",
        is_active: p.is_active,
        created_at: p.created_at,
        role: roles.find((r: any) => r.user_id === p.id)?.role || "cashier",
      }));
      setStaff(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const callStaffFunction = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("create-staff", {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.error) throw new Error(res.error.message || "Request failed");
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const handleCreate = async () => {
    if (!form.full_name || !form.username || !form.password) {
      toast.error("Fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await callStaffFunction({
        full_name: form.full_name,
        username: form.username,
        password: form.password,
        phone: form.phone,
        role: form.role,
      });
      toast.success("Staff account created");
      setShowCreate(false);
      setForm({ full_name: "", username: "", phone: "", role: "cashier", password: "" });
      await loadStaff();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await callStaffFunction({
        action: "update",
        user_id: editTarget.id,
        full_name: form.full_name,
        phone: form.phone,
        role: form.role,
      });
      toast.success("Staff updated");
      setEditTarget(null);
      await loadStaff();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleToggleActive = async (member: StaffMember) => {
    try {
      await callStaffFunction({
        action: "update",
        user_id: member.id,
        is_active: !member.is_active,
      });
      toast.success(member.is_active ? "Staff deactivated" : "Staff activated");
      await loadStaff();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    setSaving(true);
    try {
      await callStaffFunction({
        action: "reset-password",
        user_id: resetTarget.id,
        new_password: newPassword,
      });
      toast.success("Password reset successfully");
      setResetTarget(null);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const openEdit = (m: StaffMember) => {
    setForm({ full_name: m.full_name, username: m.username, phone: m.phone, role: m.role, password: "" });
    setEditTarget(m);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Staff Management" />
      <div className="p-4 max-w-[1000px] mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Staff Accounts</h2>
          <Button size="sm" onClick={() => { setForm({ full_name: "", username: "", phone: "", role: "cashier", password: "" }); setShowCreate(true); }}>
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Username</th>
                  <th className="p-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Role</th>
                  <th className="p-3 text-left font-medium text-muted-foreground hidden md:table-cell">Status</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => (
                  <tr key={m.id} className={`border-b ${!m.is_active ? "opacity-50" : ""}`}>
                    <td className="p-3 font-medium">{m.full_name}</td>
                    <td className="p-3 text-muted-foreground">{m.username}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-xs">
                        {m.role}
                      </Badge>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <Badge variant={m.is_active ? "outline" : "secondary"} className="text-xs">
                        {m.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setResetTarget(m); setNewPassword(""); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleActive(m)}>
                          {m.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Staff Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Username *</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password for {resetTarget?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={saving || !newPassword}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
