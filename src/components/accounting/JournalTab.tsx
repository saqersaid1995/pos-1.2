import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatOMR } from "@/lib/currency";
import { type Account, type JournalEntry, type JournalEntryLine } from "@/lib/accounting-queries";
import { ChevronRight, ChevronDown } from "lucide-react";

const SOURCE_COLORS: Record<string, string> = {
  order: "bg-primary/10 text-primary border-primary/30",
  payment: "bg-success/10 text-success border-success/30",
  expense: "bg-warning/10 text-warning border-warning/30",
  expense_payment: "bg-destructive/10 text-destructive border-destructive/30",
  manual: "bg-muted text-muted-foreground border-border",
  opening: "bg-secondary text-secondary-foreground",
};

export function JournalTab({
  entries, linesByEntry, accounts,
}: { entries: JournalEntry[]; linesByEntry: Map<string, JournalEntryLine[]>; accounts: Account[] }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const filtered = entries.filter((e) =>
    !search || e.description.toLowerCase().includes(search.toLowerCase()) || e.source_type.includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-3">
          <span>Journal Entries</span>
          <Input className="max-w-xs" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">No journal entries yet — they'll appear automatically as orders, payments, and expenses are recorded.</div>
        ) : (
          <div className="space-y-1">
            {filtered.map((e) => {
              const lines = linesByEntry.get(e.id) || [];
              const total = lines.filter((l) => l.debit_account_id).reduce((s, l) => s + l.amount, 0);
              const isOpen = expanded.has(e.id);
              return (
                <div key={e.id} className="border rounded-md">
                  <button onClick={() => toggle(e.id)} className="w-full flex items-center gap-3 p-2 hover:bg-muted/40 text-left text-sm">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-mono text-xs text-muted-foreground w-20">{e.entry_date}</span>
                    <Badge className={SOURCE_COLORS[e.source_type] || ""}>{e.source_type}</Badge>
                    <span className="flex-1 truncate">{e.description}</span>
                    <span className="font-medium tabular-nums">{formatOMR(total)}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/20 p-2">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground"><tr><th className="text-left p-1">Account</th><th className="text-right p-1">Debit</th><th className="text-right p-1">Credit</th></tr></thead>
                        <tbody>
                          {lines.map((l) => {
                            const acct = accountMap.get((l.debit_account_id || l.credit_account_id)!);
                            return (
                              <tr key={l.id}>
                                <td className="p-1"><span className="font-mono text-muted-foreground mr-2">{acct?.code}</span>{acct?.account_name}{l.line_description && <span className="text-muted-foreground italic"> — {l.line_description}</span>}</td>
                                <td className="p-1 text-right tabular-nums">{l.debit_account_id ? formatOMR(l.amount) : ""}</td>
                                <td className="p-1 text-right tabular-nums">{l.credit_account_id ? formatOMR(l.amount) : ""}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
