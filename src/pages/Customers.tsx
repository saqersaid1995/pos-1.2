import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Crown, AlertCircle, DollarSign, Loader2, MoreHorizontal, Eye, Trash2, ArchiveRestore, UserPlus } from "lucide-react";
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
    <div className="page-layout" style={{ background: "var(--bg-base)" }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">العملاء</h1>
          <p className="page-subtitle">إدارة بيانات العملاء</p>
        </div>
        <div className="page-actions">
          {/* Filter controls */}
          <select
            value={state.typeFilter}
            onChange={(e) => state.setTypeFilter(e.target.value as any)}
            className="ds-input"
            style={{ height: "36px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "7px", padding: "0 12px", color: "var(--text-primary)", fontSize: "13px" }}
          >
            <option value="all">All Types</option>
            <option value="regular">Regular</option>
            <option value="vip">VIP</option>
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={state.balanceFilter}
              onChange={(e) => state.setBalanceFilter(e.target.checked)}
              className="rounded"
            />
            Outstanding Balance
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={state.showArchived}
              onChange={(e) => state.setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show Archived
          </label>
          <Button size="sm" onClick={() => nav("/customers/new")} style={{ background: "var(--color-accent)", color: "#fff", border: "none" }}>
            <UserPlus className="h-4 w-4 mr-1" /> Add Customer
          </Button>
        </div>
      </div>

      {state.loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" style={{ color: "var(--color-accent)" }} />}
              label="Total Customers"
              value={state.totals.total}
            />
            <StatCard
              icon={<Crown className="w-4 h-4" style={{ color: "var(--color-warning)" }} />}
              label="VIP Customers"
              value={state.totals.vip}
              accent
            />
            <StatCard
              icon={<AlertCircle className="w-4 h-4" style={{ color: state.totals.withBalance > 0 ? "var(--color-danger)" : "var(--text-tertiary)" }} />}
              label="With Balance"
              value={state.totals.withBalance}
              warning={state.totals.withBalance > 0}
            />
            <StatCard
              icon={<DollarSign className="w-4 h-4" style={{ color: "var(--color-success)" }} />}
              label="Total Revenue"
              value={formatOMR(state.totals.totalRevenue)}
            />
          </div>

          {/* Search Bar */}
          <div className="relative" style={{ maxWidth: "400px" }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
              className="ds-input w-full"
              style={{
                height: "36px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "7px",
                paddingLeft: "40px",
                paddingRight: "12px",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none",
                width: "100%",
              }}
            />
          </div>

          {/* Customer Table */}
          <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                  <th className="section-label" style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500 }}>Customer</th>
                  <th className="section-label hidden sm:table-cell" style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500 }}>Phone</th>
                  <th className="section-label" style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500 }}>Orders</th>
                  <th className="section-label hidden md:table-cell" style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500 }}>Spent</th>
                  <th className="section-label" style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500 }}>Balance</th>
                  <th className="section-label hidden lg:table-cell" style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500 }}>Last Order</th>
                  <th style={{ padding: "10px 16px", width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {state.customers.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: "1px solid var(--border-subtle)", height: "44px" }}
                    className={`transition-colors ${!c.isActive ? "opacity-60" : ""}`}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "0 16px", cursor: "pointer" }} onClick={() => nav(`/customer/${c.id}`)}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.name}</span>
                        {c.customerType === "vip" && (
                          <span className="ds-badge-accent" style={{ fontSize: "10px" }}>VIP</span>
                        )}
                        {!c.isActive && (
                          <span className="ds-badge-muted" style={{ fontSize: "10px" }}>Archived</span>
                        )}
                      </div>
                      <span className="text-xs sm:hidden" style={{ color: "var(--text-secondary)" }}>{c.phone}</span>
                    </td>
                    <td className="hidden sm:table-cell" style={{ padding: "0 16px", color: "var(--text-secondary)" }}>{c.phone}</td>
                    <td style={{ padding: "0 16px", textAlign: "center", color: "var(--text-primary)", fontWeight: 500 }}>{c.totalOrders}</td>
                    <td className="hidden md:table-cell" style={{ padding: "0 16px", textAlign: "right", color: "var(--text-primary)", fontWeight: 500 }}>{formatOMR(c.totalSpent)}</td>
                    <td style={{ padding: "0 16px", textAlign: "right" }}>
                      {c.outstandingBalance > 0 ? (
                        <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>{formatOMR(c.outstandingBalance)}</span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>{formatOMR(0)}</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell" style={{ padding: "0 16px", color: "var(--text-secondary)" }}>{c.lastOrderDate ?? "—"}</td>
                    <td style={{ padding: "0 16px" }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--text-tertiary)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
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
                  <tr>
                    <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)" }}>
                      {state.search || state.typeFilter !== "all" || state.balanceFilter ? "No customers match your filters" : "No customers yet"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

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

function StatCard({ icon, label, value, accent, warning }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean; warning?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "10px",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    }}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="section-label">{label}</span>
      </div>
      <span style={{
        fontSize: "22px",
        fontWeight: 700,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        color: accent ? "var(--color-accent)" : warning ? "var(--color-danger)" : "var(--text-primary)",
      }}>
        {value}
      </span>
    </div>
  );
}
