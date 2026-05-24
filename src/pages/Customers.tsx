import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Crown, AlertCircle, DollarSign, Loader2, MoreHorizontal, Eye, Trash2, ArchiveRestore } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCustomerState } from "@/hooks/useCustomerState";
import { formatOMR } from "@/lib/currency";
import { toast } from "sonner";
import type { CustomerWithStats } from "@/types/customer";

export default function Customers() {
  const nav = useNavigate();
  const state = useCustomerState();
  const [confirmTarget, setConfirmTarget] = useState<CustomerWithStats | null>(null);

  const handleRemove = async () => {
    if (!confirmTarget) return;
    const result = await state.removeCustomer(confirmTarget.id);
    if (result.action === "deleted") {
      toast.success("Customer deleted successfully");
    } else if (result.action === "archived") {
      toast.success("Customer archived (has existing orders)");
    } else {
      toast.error("Failed to remove customer");
    }
    setConfirmTarget(null);
  };

  const handleRestore = async (id: string) => {
    const ok = await state.restoreCustomer(id);
    if (ok) toast.success("Customer restored");
    else toast.error("Failed to restore customer");
  };

  const targetHasHistory = confirmTarget ? confirmTarget.totalOrders > 0 || confirmTarget.outstandingBalance > 0 : false;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Customers" />

      <div className="p-4 max-w-[1400px] mx-auto space-y-4">
        {state.loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard icon={<Users className="w-4 h-4" />} label="Total Customers" value={state.totals.total} />
              <SummaryCard icon={<Crown className="w-4 h-4" />} label="VIP Customers" value={state.totals.vip} accent />
              <SummaryCard icon={<AlertCircle className="w-4 h-4" />} label="With Balance" value={state.totals.withBalance} warning={state.totals.withBalance > 0} />
              <SummaryCard icon={<DollarSign className="w-4 h-4" />} label="Total Revenue" value={formatOMR(state.totals.totalRevenue)} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={state.search}
                  onChange={(e) => state.setSearch(e.target.value)}
                  className="pos-input w-full pl-10"
                />
              </div>
              <select
                value={state.typeFilter}
                onChange={(e) => state.setTypeFilter(e.target.value as any)}
                className="pos-input"
              >
                <option value="all">All Types</option>
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.balanceFilter}
                  onChange={(e) => state.setBalanceFilter(e.target.checked)}
                  className="rounded border-border"
                />
                Outstanding Balance
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.showArchived}
                  onChange={(e) => state.setShowArchived(e.target.checked)}
                  className="rounded border-border"
                />
                Show Archived
              </label>
            </div>

            {/* Customer Table */}
            <div className="pos-section overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="p-3 font-medium text-muted-foreground">Customer</th>
                    <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">Phone</th>
                    <th className="p-3 font-medium text-muted-foreground text-center">Orders</th>
                    <th className="p-3 font-medium text-muted-foreground text-right hidden md:table-cell">Spent</th>
                    <th className="p-3 font-medium text-muted-foreground text-right">Balance</th>
                    <th className="p-3 font-medium text-muted-foreground hidden lg:table-cell">Last Order</th>
                    <th className="p-3 font-medium text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {state.customers.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 hover:bg-secondary/50 transition-colors ${!c.isActive ? "opacity-60" : ""}`}
                    >
                      <td className="p-3 cursor-pointer" onClick={() => nav(`/customer/${c.id}`)}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          {c.customerType === "vip" && (
                            <Badge className="bg-accent text-accent-foreground text-[10px] px-1.5 py-0">VIP</Badge>
                          )}
                          {!c.isActive && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Archived</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground sm:hidden">{c.phone}</span>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">{c.phone}</td>
                      <td className="p-3 text-center font-medium">{c.totalOrders}</td>
                      <td className="p-3 text-right font-medium hidden md:table-cell">{formatOMR(c.totalSpent)}</td>
                      <td className="p-3 text-right">
                        {c.outstandingBalance > 0 ? (
                          <span className="text-destructive font-semibold">{formatOMR(c.outstandingBalance)}</span>
                        ) : (
                          <span className="text-muted-foreground">{formatOMR(0)}</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">{c.lastOrderDate ?? "—"}</td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => nav(`/customer/${c.id}`)}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> View
                            </DropdownMenuItem>
                            {!c.isActive ? (
                              <DropdownMenuItem onClick={() => handleRestore(c.id)}>
                                <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmTarget(c)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {state.customers.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {state.search || state.typeFilter !== "all" || state.balanceFilter ? "No customers match your filters" : "No customers yet"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {targetHasHistory ? "Archive Customer?" : "Delete Customer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {targetHasHistory
                ? `"${confirmTarget?.name}" has existing orders or outstanding balance. They will be archived instead of permanently deleted. Historical data will remain intact.`
                : `Are you sure you want to permanently delete "${confirmTarget?.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {targetHasHistory ? "Archive" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({ icon, label, value, accent, warning }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean; warning?: boolean }) {
  return (
    <div className="pos-section flex flex-col gap-1 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-xl font-bold ${accent ? "text-accent" : warning ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
