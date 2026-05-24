import { useEffect, useState, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import {
  fetchAccountingSettings, fetchAccounts, fetchAccountBalances,
  fetchJournalEntries, fetchJournalLines, fetchAccountsReceivable, fetchAccountsPayable,
  type AccountingSettings, type Account, type AccountBalance, type JournalEntry, type JournalEntryLine,
  type ARRow, type APRow,
} from "@/lib/accounting-queries";
import { AccountingSettingsCard } from "@/components/accounting/AccountingSettingsCard";
import { ChartOfAccountsTab } from "@/components/accounting/ChartOfAccountsTab";
import { JournalTab } from "@/components/accounting/JournalTab";
import { IncomeStatementTab } from "@/components/accounting/IncomeStatementTab";
import { BalanceSheetTab } from "@/components/accounting/BalanceSheetTab";
import { CashflowTab } from "@/components/accounting/CashflowTab";
import { ReceivablesTab } from "@/components/accounting/ReceivablesTab";
import { PayablesTab } from "@/components/accounting/PayablesTab";
import { OpeningBalancesTab } from "@/components/accounting/OpeningBalancesTab";
import { FixedAssetsTab } from "@/components/accounting/FixedAssetsTab";
import { TrialBalanceTab } from "@/components/accounting/TrialBalanceTab";
import { DiagnosticsTab } from "@/components/accounting/DiagnosticsTab";

export default function Accounting() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [lines, setLines] = useState<JournalEntryLine[]>([]);
  const [ar, setAr] = useState<ARRow[]>([]);
  const [ap, setAp] = useState<APRow[]>([]);

  const reload = async () => {
    setLoading(true);
    const s = await fetchAccountingSettings();
    setSettings(s);
    const cutoff = s?.accounting_start_date || new Date().toISOString().split("T")[0];
    const [a, b, e, arRows, apRows] = await Promise.all([
      fetchAccounts(),
      fetchAccountBalances(),
      fetchJournalEntries(300),
      fetchAccountsReceivable(cutoff),
      fetchAccountsPayable(cutoff),
    ]);
    setAccounts(a); setBalances(b); setEntries(e); setAr(arRows); setAp(apRows);
    const l = await fetchJournalLines(e.map((x) => x.id));
    setLines(l);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const linesByEntry = useMemo(() => {
    const m = new Map<string, JournalEntryLine[]>();
    for (const ln of lines) {
      const arr = m.get(ln.entry_id) || [];
      arr.push(ln);
      m.set(ln.entry_id, arr);
    }
    return m;
  }, [lines]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Accounting" />
      <div className="p-4 max-w-[1600px] mx-auto space-y-4">
        <AccountingSettingsCard settings={settings} onChanged={reload} />

        <Tabs defaultValue="balance-sheet" className="space-y-4">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
            {[
              ["balance-sheet", "Balance Sheet"],
              ["income-statement", "Income Statement"],
              ["trial-balance", "Trial Balance"],
              ["diagnostics", "Diagnostics"],
              ["cashflow", "Cashflow"],
              ["receivables", "Receivables (AR)"],
              ["payables", "Payables (AP)"],
              ["opening", "Opening Balances"],
              ["fixed-assets", "Fixed Assets"],
              ["coa", "Chart of Accounts"],
              ["journal", "Journal"],
            ].map(([v, l]) => (
              <TabsTrigger key={v} value={v}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-4 py-2 text-sm">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="balance-sheet"><BalanceSheetTab balances={balances} /></TabsContent>
          <TabsContent value="income-statement"><IncomeStatementTab balances={balances} /></TabsContent>
          <TabsContent value="trial-balance"><TrialBalanceTab balances={balances} /></TabsContent>
          <TabsContent value="diagnostics"><DiagnosticsTab accounts={accounts} balances={balances} cutoff={settings?.accounting_start_date || new Date().toISOString().split("T")[0]} /></TabsContent>
          <TabsContent value="cashflow"><CashflowTab balances={balances} /></TabsContent>
          <TabsContent value="receivables"><ReceivablesTab rows={ar} /></TabsContent>
          <TabsContent value="payables"><PayablesTab rows={ap} /></TabsContent>
          <TabsContent value="opening"><OpeningBalancesTab accounts={accounts} settings={settings} onChanged={reload} /></TabsContent>
          <TabsContent value="fixed-assets"><FixedAssetsTab onChanged={reload} /></TabsContent>
          <TabsContent value="coa"><ChartOfAccountsTab accounts={accounts} balances={balances} onChanged={reload} /></TabsContent>
          <TabsContent value="journal"><JournalTab entries={entries} linesByEntry={linesByEntry} accounts={accounts} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
