import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, X, UserPlus, Crown, MoreHorizontal, Eye, Trash2, ArchiveRestore,
} from "lucide-react";
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

// ─── Helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#6366F1","#8B5CF6","#EC4899","#F59E0B","#10B981","#3B82F6","#EF4444","#F97316"];

function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function avatarInitial(name: string) {
  const t = name.trim();
  return t ? t[0].toUpperCase() : "؟";
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const d = dateStr.slice(0, 10);
  if (d === today) return "اليوم";
  if (d === yesterday) return "أمس";
  return d;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  height: 32, padding: "0 8px", fontSize: 12, borderRadius: 6,
  background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", outline: "none", cursor: "pointer", flexShrink: 0,
};

const thStyle: React.CSSProperties = {
  padding: "8px 16px", textAlign: "right", fontSize: 11,
  fontWeight: 500, color: "var(--text-tertiary)", background: "var(--bg-base)",
};

// ─── Main Page ───────────────────────────────────────────────────────────────

type SortKey = "recent" | "orders" | "spent" | "balance" | "name";
type DrawerTab = "orders" | "payments" | "notes";

export default function Customers() {
  const nav = useNavigate();
  const state = useCustomerState();
  const [sort, setSort] = useState<SortKey>("recent");
  const [confirmTarget, setConfirmTarget] = useState<CustomerWithStats | null>(null);
  const [drawerCustomer, setDrawerCustomer] = useState<CustomerWithStats | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("orders");

  const customers = useMemo(() => {
    const list = [...state.customers];
    switch (sort) {
      case "name":    return list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      case "orders":  return list.sort((a, b) => b.totalOrders - a.totalOrders);
      case "spent":   return list.sort((a, b) => b.totalSpent - a.totalSpent);
      case "balance": return list.sort((a, b) => b.outstandingBalance - a.outstandingBalance);
      default:        return list.sort((a, b) => (b.lastOrderDate ?? "").localeCompare(a.lastOrderDate ?? ""));
    }
  }, [state.customers, sort]);

  const handleRemove = async () => {
    if (!confirmTarget) return;
    const result = await state.removeCustomer(confirmTarget.id);
    if (result.action === "deleted") toast.success("تم حذف العميل");
    else if (result.action === "archived") toast.success("تم أرشفة العميل (لديه طلبات سابقة)");
    else toast.error("فشل حذف العميل");
    setConfirmTarget(null);
  };

  const handleRestore = async (id: string) => {
    const ok = await state.restoreCustomer(id);
    if (ok) toast.success("تم استعادة العميل");
    else toast.error("فشل استعادة العميل");
  };

  const targetHasHistory = confirmTarget
    ? confirmTarget.totalOrders > 0 || confirmTarget.outstandingBalance > 0
    : false;

  return (
    <div className="page-layout" style={{ background: "var(--bg-base)", padding: 0 }}>
      {/* Header */}
      <div className="page-header" style={{ padding: "14px 24px" }}>
        <div>
          <h1 className="page-title">العملاء</h1>
          <p className="page-subtitle">إدارة بيانات العملاء</p>
        </div>
      </div>

      {state.loading ? (
        <div style={{ padding: "24px", display: "flex", gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton-shimmer rounded-lg" style={{ flex: 1, height: 60 }} />
          ))}
        </div>
      ) : (
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14, overflow: "auto", flex: 1 }}>

          {/* Stats bar */}
          <div style={{
            display: "flex", borderRadius: 10,
            border: "0.5px solid var(--border-subtle)",
            background: "var(--bg-elevated)", overflow: "hidden",
          }}>
            {([
              { key: "total",        label: "إجمالي العملاء", value: state.totals.total,                       color: undefined },
              { key: "vip",          label: "VIP",            value: state.totals.vip,                         color: "#F59E0B" },
              { key: "withBalance",  label: "برصيد معلق",     value: state.totals.withBalance,                 color: state.totals.withBalance > 0 ? "#EF4444" : undefined },
              { key: "totalRevenue", label: "إجمالي الإيرادات",value: formatOMR(state.totals.totalRevenue),    color: "#10B981" },
            ] as { key: string; label: string; value: string | number; color?: string }[]).map((s, i) => (
              <div key={s.key} style={{ display: "flex", flex: 1 }}>
                {i > 0 && <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch" }} />}
                <div style={{ flex: 1, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "monospace", lineHeight: 1, color: s.color || "var(--text-primary)" }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }} dir="rtl">
            {/* Search */}
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="ابحث بالاسم أو الهاتف..."
                value={state.search}
                onChange={(e) => state.setSearch(e.target.value)}
                dir="rtl"
                style={{
                  width: "100%", height: 32, paddingRight: 32, paddingLeft: 10,
                  fontSize: 13, borderRadius: 6,
                  background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                  color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
                }}
              />
              {state.search && (
                <button
                  onClick={() => state.setSearch("")}
                  style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Type */}
            <select value={state.typeFilter} onChange={(e) => state.setTypeFilter(e.target.value as any)} dir="rtl" style={selectStyle}>
              <option value="all">النوع</option>
              <option value="regular">عادي</option>
              <option value="vip">👑 VIP</option>
            </select>

            {/* Sort */}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} dir="rtl" style={selectStyle}>
              <option value="recent">الأحدث</option>
              <option value="orders">الطلبات</option>
              <option value="spent">الإنفاق</option>
              <option value="balance">الرصيد</option>
              <option value="name">الاسم</option>
            </select>

            {/* Balance filter */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", flexShrink: 0 }}>
              <input type="checkbox" checked={state.balanceFilter} onChange={(e) => state.setBalanceFilter(e.target.checked)} style={{ cursor: "pointer" }} />
              برصيد معلق
            </label>

            {/* Show archived */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", flexShrink: 0 }}>
              <input type="checkbox" checked={state.showArchived} onChange={(e) => state.setShowArchived(e.target.checked)} style={{ cursor: "pointer" }} />
              المؤرشف
            </label>

            {/* Add customer */}
            <button
              onClick={() => nav("/customers/new")}
              style={{
                height: 32, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "var(--color-accent, #6366F1)", color: "#fff", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              <UserPlus size={13} />
              عميل جديد
            </button>
          </div>

          {/* Table */}
          <div style={{ background: "var(--bg-elevated)", border: "0.5px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }} dir="rtl">
                  <th style={thStyle}>العميل</th>
                  <th style={thStyle}>الهاتف</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>الطلبات</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>الإنفاق</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>الرصيد</th>
                  <th style={thStyle}>آخر طلب</th>
                  <th style={{ ...thStyle, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const color = avatarColor(c.name || c.phone);
                  const initial = avatarInitial(c.name || c.phone);
                  return (
                    <tr
                      key={c.id}
                      dir="rtl"
                      style={{ borderBottom: "1px solid var(--border-subtle)", height: 48, cursor: "pointer", transition: "background 100ms", opacity: c.isActive ? 1 : 0.6 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      onClick={() => { setDrawerCustomer(c); setDrawerTab("orders"); }}
                    >
                      <td style={{ padding: "0 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                            background: color + "22", color, fontSize: 13, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {initial}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{c.name}</span>
                            {c.customerType === "vip" && <Crown size={11} style={{ color: "#F59E0B" }} />}
                            {!c.isActive && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: "rgba(100,116,139,0.15)", color: "#64748B", fontWeight: 700 }}>مؤرشف</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "0 16px", fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)", direction: "ltr" }}>{c.phone}</td>
                      <td style={{ padding: "0 16px", textAlign: "center", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{c.totalOrders}</td>
                      <td style={{ padding: "0 16px", textAlign: "left", fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)" }}>{formatOMR(c.totalSpent)}</td>
                      <td style={{ padding: "0 16px", textAlign: "left" }}>
                        {c.outstandingBalance > 0 ? (
                          <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "#EF4444" }}>{formatOMR(c.outstandingBalance)}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0 16px", fontSize: 12, color: "var(--text-secondary)" }}>{relativeDate(c.lastOrderDate)}</td>
                      <td style={{ padding: "0 12px" }} onClick={(e) => e.stopPropagation()}>
                        <MenuCell
                          c={c}
                          onView={() => nav(`/customer/${c.id}`)}
                          onDelete={() => setConfirmTarget(c)}
                          onRestore={() => handleRestore(c.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                      {state.search || state.typeFilter !== "all" || state.balanceFilter
                        ? "لا توجد نتائج تطابق الفلاتر"
                        : "لا يوجد عملاء بعد"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Detail Drawer */}
      {drawerCustomer && (
        <CustomerDrawer
          customer={drawerCustomer}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={() => setDrawerCustomer(null)}
          onViewProfile={() => nav(`/customer/${drawerCustomer.id}`)}
        />
      )}

      {/* Delete / Archive Confirmation */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {targetHasHistory ? "أرشفة العميل؟" : "حذف العميل؟"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {targetHasHistory
                ? `"${confirmTarget?.name}" لديه طلبات أو رصيد معلق. سيتم أرشفته بدلاً من الحذف النهائي.`
                : `هل أنت متأكد من حذف "${confirmTarget?.name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {targetHasHistory ? "أرشفة" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Menu Cell ───────────────────────────────────────────────────────────────

function MenuCell({ c, onView, onDelete, onRestore }: {
  c: CustomerWithStats;
  onView: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-tertiary)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", left: 0, top: "100%", zIndex: 50, minWidth: 140,
            background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
            borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", overflow: "hidden", marginTop: 2,
          }}>
            <MenuItem icon={<Eye size={13} />} label="عرض الملف" onClick={() => { setOpen(false); onView(); }} />
            {c.isActive
              ? <MenuItem icon={<Trash2 size={13} />} label="حذف" onClick={() => { setOpen(false); onDelete(); }} danger />
              : <MenuItem icon={<ArchiveRestore size={13} />} label="استعادة" onClick={() => { setOpen(false); onRestore(); }} />
            }
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
        background: "transparent", border: "none", cursor: "pointer", fontSize: 12, textAlign: "right",
        color: danger ? "#EF4444" : "var(--text-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}{label}
    </button>
  );
}

// ─── Customer Drawer ─────────────────────────────────────────────────────────

function CustomerDrawer({ customer, tab, onTabChange, onClose, onViewProfile }: {
  customer: CustomerWithStats;
  tab: DrawerTab;
  onTabChange: (t: DrawerTab) => void;
  onClose: () => void;
  onViewProfile: () => void;
}) {
  const color = avatarColor(customer.name || customer.phone);
  const initial = avatarInitial(customer.name || customer.phone);

  const sortedOrders = [...customer.orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const paidOrders = sortedOrders.filter((o) => o.paymentStatus === "paid");
  const unpaidOrders = sortedOrders.filter((o) => o.paymentStatus !== "paid");

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div
        dir="rtl"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 380, zIndex: 101,
          background: "var(--bg-elevated)", borderLeft: "1px solid var(--border-default)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Drawer Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", background: color + "22", color,
            fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{customer.name}</span>
              {customer.customerType === "vip" && <Crown size={13} style={{ color: "#F59E0B" }} />}
            </div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)", direction: "ltr", textAlign: "right" }}>{customer.phone}</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          {([
            { label: "الطلبات",  value: customer.totalOrders,                             danger: false },
            { label: "الإنفاق",  value: formatOMR(customer.totalSpent),                   danger: false },
            { label: "الرصيد",   value: customer.outstandingBalance > 0 ? formatOMR(customer.outstandingBalance) : "—", danger: customer.outstandingBalance > 0 },
          ] as { label: string; value: string | number; danger: boolean }[]).map((s, i) => (
            <div key={s.label} style={{ flex: 1, padding: "10px 0", textAlign: "center", borderRight: i > 0 ? "1px solid var(--border-subtle)" : "none" }}>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace", color: s.danger ? "#EF4444" : "var(--text-primary)" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", padding: "0 16px", flexShrink: 0 }}>
          {([["orders", "الطلبات"], ["payments", "المدفوعات"], ["notes", "الملاحظات"]] as [DrawerTab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              style={{
                padding: "10px 12px", fontSize: 12, fontWeight: tab === id ? 600 : 400,
                color: tab === id ? "var(--color-accent, #6366F1)" : "var(--text-secondary)",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: tab === id ? "2px solid var(--color-accent, #6366F1)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {tab === "orders" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedOrders.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>لا توجد طلبات</div>
              )}
              {sortedOrders.map((o) => (
                <div key={o.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-base)", border: "0.5px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 500 }}>{o.orderNumber}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{relativeDate(o.orderDate)}</div>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)" }}>{formatOMR(o.totalAmount)}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: o.paymentStatus === "paid" ? "#10B981" : o.paymentStatus === "partially-paid" ? "#F59E0B" : "#EF4444" }}>
                      {o.paymentStatus === "paid" ? "مدفوع" : o.paymentStatus === "partially-paid" ? "جزئي" : "غير مدفوع"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "payments" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {paidOrders.length === 0 && unpaidOrders.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>لا توجد مدفوعات</div>
              )}
              {paidOrders.map((o) => (
                <div key={o.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-base)", border: "0.5px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 500 }}>{o.orderNumber}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{relativeDate(o.orderDate)}</div>
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "#10B981" }}>{formatOMR(o.paidAmount)}</div>
                </div>
              ))}
              {unpaidOrders.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginTop: 6 }}>رصيد معلق</div>
                  {unpaidOrders.map((o) => (
                    <div key={o.id} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.05)", border: "0.5px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 500 }}>{o.orderNumber}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{relativeDate(o.orderDate)}</div>
                      </div>
                      <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "#EF4444" }}>{formatOMR(o.remainingBalance)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {customer.notes.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>لا توجد ملاحظات</div>
              )}
              {customer.notes.map((n) => (
                <div key={n.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-base)", border: "0.5px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{n.text}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                    {n.createdBy || "—"} · {relativeDate(n.createdAt.slice(0, 10))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <button
            onClick={onViewProfile}
            style={{ width: "100%", height: 34, borderRadius: 7, fontSize: 12, fontWeight: 600, background: "var(--color-accent, #6366F1)", color: "#fff", border: "none", cursor: "pointer" }}
          >
            عرض الملف الكامل
          </button>
        </div>
      </div>
    </>
  );
}
