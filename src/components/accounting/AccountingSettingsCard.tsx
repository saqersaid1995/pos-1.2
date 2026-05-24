import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RefreshCw, Settings } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { type AccountingSettings, updateAccountingStartDate, rebuildAccounting } from "@/lib/accounting-queries";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function AccountingSettingsCard({
  settings, onChanged,
}: { settings: AccountingSettings | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  if (!settings) return null;

  const handleDate = async (d: Date | undefined) => {
    if (!d) return;
    setBusy(true);
    const ok = await updateAccountingStartDate(settings.id, format(d, "yyyy-MM-dd"));
    setBusy(false);
    if (ok) {
      toast.success("Accounting start date updated. Click Rebuild to regenerate entries.");
      onChanged();
    } else toast.error("Failed to update");
  };

  const handleRebuild = async () => {
    setBusy(true);
    const ok = await rebuildAccounting();
    setBusy(false);
    if (ok) { toast.success("Journal rebuilt from cutoff date"); onChanged(); }
    else toast.error("Rebuild failed");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" /> Accounting Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Accounting Start Date (cutoff)</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[200px] justify-start", !settings.accounting_start_date && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {settings.accounting_start_date}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={new Date(settings.accounting_start_date)} onSelect={handleDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-1 min-w-[200px] text-xs text-muted-foreground">
          Only orders, payments, and expenses on or after this date generate journal entries. Click Rebuild after changing the date to replay history from the new cutoff.
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" disabled={busy}>
              <RefreshCw className={cn("h-4 w-4 mr-2", busy && "animate-spin")} /> Rebuild Journal
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rebuild journal from cutoff?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete all auto-generated journal entries and replay every order, payment, and expense from {settings.accounting_start_date} forward. Manual entries are preserved. This may take a moment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRebuild}>Rebuild</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
