import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { formatOMR } from "@/lib/currency";
import {
  type Account, type AccountBalance, type AccountType, type NormalBalance, type ClassificationType,
  createAccount, deleteAccount,
} from "@/lib/accounting-queries";

const TYPES: AccountType[] = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
const DEFAULT_BALANCE: Record<AccountType, NormalBalance> = {
  Asset: "debit", Expense: "debit", Liability: "credit", Equity: "credit", Revenue: "credit",
};
const CLASSIFICATIONS_BY_TYPE: Record<AccountType, ClassificationType[]> = {
  Asset: ["current_asset", "non_current_asset"],
  Liability: ["current_liability", "non_current_liability"],
  Equity: ["equity"],
  Revenue: ["revenue"],
  Expense: ["expense"],
};
const CLASSIFICATION_LABEL: Record<ClassificationType, string> = {
  current_asset: "Current Asset",
  non_current_asset: "Non-Current Asset",
  current_liability: "Current Liability",
  non_current_liability: "Non-Current Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

export function ChartOfAccountsTab({
  accounts, balances, onChanged,
}: { accounts: Account[]; balances: AccountBalance[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(""); const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("Expense");
  const [classification, setClassification] = useState<ClassificationType>("expense");
  const [subType, setSubType] = useState("");
  const balanceMap = new Map(balances.map((b) => [b.id, b.balance]));

  // When type changes, reset classification to first valid option
  const handleTypeChange = (v: AccountType) => {
    setType(v);
    setClassification(CLASSIFICATIONS_BY_TYPE[v][0]);
  };

  const handleAdd = async () => {
    if (!code.trim() || !name.trim()) { toast.error("Code and name are required"); return; }
    const ok = await createAccount({
      code: code.trim(), account_name: name.trim(), account_type: type,
      sub_type: subType.trim(), normal_balance: DEFAULT_BALANCE[type],
      classification_type: classification,
    });
    if (ok) { toast.success("Account added"); setOpen(false); setCode(""); setName(""); setSubType(""); onChanged(); }
    else toast.error("Failed (code may already exist)");
  };

  const handleDelete = async (a: Account) => {
    if (!confirm(`Delete account ${a.code} ${a.account_name}?`)) return;
    const ok = await deleteAccount(a.id);
    if (ok) { toast.success("Deleted"); onChanged(); } else toast.error("Cannot delete (system accounts protected, or has entries)");
  };

  const grouped = TYPES.map((t) => ({ type: t, accounts: accounts.filter((a) => a.account_type === t) }));

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base">Chart of Accounts</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Account</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 5100" /></div>
              <div><Label>Account Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Type</Label>
                <Select value={type} onValueChange={(v) => handleTypeChange(v as AccountType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Classification</Label>
                <Select value={classification} onValueChange={(v) => setClassification(v as ClassificationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATIONS_BY_TYPE[type].map((c) => (
                      <SelectItem key={c} value={c}>{CLASSIFICATION_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sub-type (optional)</Label><Input value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="e.g. Operating Expense" /></div>
            </div>
            <DialogFooter><Button onClick={handleAdd}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-5">
        {grouped.map((g) => (
          <div key={g.type}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{g.type}</h3>
            <div className="space-y-1">
              {g.accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-12">{a.code}</span>
                    <span>{a.account_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{CLASSIFICATION_LABEL[a.classification_type]}</Badge>
                    {a.sub_type && <Badge variant="outline" className="text-[10px]">{a.sub_type}</Badge>}
                    {a.is_system && <Lock className="h-3 w-3 text-muted-foreground" aria-label="System account" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-muted-foreground text-xs">{formatOMR(balanceMap.get(a.id) || 0)}</span>
                    {!a.is_system && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(a)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
