import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import { toLocalDateStr } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type Account = "cash" | "bank";
interface Transfer {
  id: string;
  transfer_date: string;
  from_account: Account;
  to_account: Account;
  amount: number;
  notes: string | null;
  created_at: string;
}

interface Props {
  onChanged?: () => void;
}

export function CashTransferCard({ onChanged }: Props) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [list, setList] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [from, setFrom] = useState<Account>("cash");
  const [to, setTo] = useState<Account>("bank");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(toLocalDateStr(new Date()));
  const [notes, setNotes] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cash_transfers" as any)
      .select("*")
      .order("transfer_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setList(((data || []) as any) as Transfer[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!isAdmin) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (from === to) { toast.error("From and To accounts must differ"); return; }
    setSaving(true);
    const { error } = await supabase.from("cash_transfers" as any).insert({
      transfer_date: date,
      from_account: from,
      to_account: to,
      amount: amt,
      notes,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Transfer recorded");
    setAmount(""); setNotes("");
    await load();
    onChanged?.();
  };

  const remove = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Delete this transfer? Its journal entry will be reversed.")) return;
    const { error } = await supabase.from("cash_transfers" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Transfer deleted");
    await load();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4" /> Cash ↔ Bank Transfer
          <span className="text-xs text-muted-foreground font-normal">(internal — does not affect P&amp;L)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin ? (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Select value={from} onValueChange={(v) => setFrom(v as Account)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash on Hand</SelectItem>
                  <SelectItem value="bank">Bank Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Select value={to} onValueChange={(v) => setTo(v as Account)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash on Hand</SelectItem>
                  <SelectItem value="bank">Bank Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount (OMR)</Label>
              <Input type="number" step="0.001" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Optional" />
            </div>
            <Button onClick={submit} disabled={saving || from === to}>
              {saving ? "Saving..." : "Record Transfer"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only admins can record transfers.</p>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-6">Loading...</TableCell></TableRow>
              )}
              {!loading && list.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-6">No transfers recorded</TableCell></TableRow>
              )}
              {list.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.transfer_date}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Transfer</Badge></TableCell>
                  <TableCell className="capitalize">{t.from_account} → {t.to_account}</TableCell>
                  <TableCell className="text-right font-semibold">{formatOMR(Number(t.amount))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.notes || "—"}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
