import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Crown, Phone, Calendar, ShoppingBag, DollarSign, Clock, AlertCircle,
  FileText, Plus, Edit, Package, ExternalLink, Loader2, Gift
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchCustomerById, fetchOrdersByCustomerId, addCustomerNote, updateCustomerRecord } from "@/lib/supabase-queries";
import type { CustomerRecord, CustomerWithStats } from "@/types/customer";
import type { WorkflowOrder } from "@/types/workflow";
import { formatOMR } from "@/lib/currency";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import { fetchLoyaltyBalance, type LoyaltyBalance } from "@/lib/loyalty-balance";
import PhoneInput, { type PhoneInputValue } from "@/components/ui/phone-input";
import { parsePhone, fetchCountryCodes, getDefaultCountryCode, buildE164 } from "@/lib/phone";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-secondary text-secondary-foreground",
  washing: "bg-primary/15 text-primary",
  drying: "bg-accent/15 text-accent",
  ironing: "bg-warning/15 text-foreground",
  "ready-for-pickup": "bg-success/15 text-foreground",
  delivered: "bg-success text-success-foreground",
};

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: "bg-destructive/15 text-destructive",
  "partially-paid": "bg-warning/15 text-foreground",
  paid: "bg-success/15 text-foreground",
};

function buildStats(customer: CustomerRecord, orders: WorkflowOrder[]): CustomerWithStats {
  const active = orders.filter((o) => o.currentStatus !== "delivered");
  const completed = orders.filter((o) => o.currentStatus === "delivered");
  const totalSpent = orders.reduce((s, o) => s + o.totalAmount, 0);
  const totalPaid = orders.reduce((s, o) => s + o.paidAmount, 0);
  const sorted = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  return {
    ...customer,
    totalOrders: orders.length,
    activeOrders: active.length,
    completedOrders: completed.length,
    totalSpent,
    totalPaid,
    outstandingBalance: Math.max(0, totalSpent - totalPaid),
    unpaidOrderCount: orders.filter((o) => o.paymentStatus === "unpaid").length,
    partiallyPaidOrderCount: orders.filter((o) => o.paymentStatus === "partially-paid").length,
    lastOrderDate: sorted[0]?.orderDate ?? null,
    orders,
  };
}

export default function CustomerProfile() {
  const { customerId } = useParams();
  const nav = useNavigate();
  const { settings: loyaltySettings } = useLoyaltySettings();
  const [customer, setCustomer] = useState<CustomerWithStats | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<LoyaltyBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState<PhoneInputValue>({ countryCode: "+968", localPhone: "", fullE164: "" });
  const [editType, setEditType] = useState<"regular" | "vip">("regular");
  const [tab, setTab] = useState<"active" | "completed" | "all">("all");

  const loadCustomer = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    const [cust, orders] = await Promise.all([
      fetchCustomerById(customerId),
      fetchOrdersByCustomerId(customerId),
    ]);
    if (cust) {
      setCustomer(buildStats(cust, orders));
      // Fetch loyalty balance breakdown (available / expired / expiring soon)
      const bal = await fetchLoyaltyBalance(customerId);
      setLoyaltyBalance(bal);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-foreground">Customer not found</p>
          <button onClick={() => nav("/customers")} className="text-primary hover:underline text-sm">← Back to Customers</button>
        </div>
      </div>
    );
  }

  const activeOrders = customer.orders.filter((o) => o.currentStatus !== "delivered");
  const completedOrders = customer.orders.filter((o) => o.currentStatus === "delivered");
  const displayOrders = tab === "active" ? activeOrders : tab === "completed" ? completedOrders : customer.orders;

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addCustomerNote(customer.id, noteText.trim(), "Staff");
    setNoteText("");
    toast.success("Note added");
    loadCustomer();
  };

  const startEdit = async () => {
    setEditName(customer.name);
    const codes = await fetchCountryCodes();
    const fallback = await getDefaultCountryCode();
    const parsed = parsePhone(customer.phone, codes.map((c) => c.country_code), fallback);
    setEditPhone(parsed);
    setEditType(customer.customerType);
    setEditing(true);
  };

  const saveEdit = async () => {
    const e164 = editPhone.fullE164 || buildE164(editPhone.countryCode, editPhone.localPhone);
    await updateCustomerRecord(customer.id, {
      full_name: editName,
      phone_number: e164,
      country_code: editPhone.countryCode,
      local_phone: editPhone.localPhone,
      full_phone_e164: e164,
      customer_type: editType === "vip" ? "VIP" : "Regular",
    });
    setEditing(false);
    toast.success("Customer updated");
    loadCustomer();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => nav("/customers")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight truncate">{customer.name}</h1>
            {customer.customerType === "vip" && (
              <Badge className="bg-accent text-accent-foreground text-[10px]">VIP</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={startEdit} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
              <Edit className="w-3 h-3" /> Edit
            </button>
            <button onClick={() => nav("/")} className="text-xs font-medium text-primary hover:underline">New Order →</button>
          </div>
        </div>
      </header>

      <div className="p-4 max-w-[1400px] mx-auto space-y-4">
        {editing && (
          <div className="pos-section space-y-3">
            <h2 className="pos-label">Edit Customer</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" className="pos-input w-full" />
              <PhoneInput value={editPhone} onChange={setEditPhone} placeholder="Phone" />
              <select value={editType} onChange={(e) => setEditType(e.target.value as any)} className="pos-input w-full">
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">Save</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="pos-section space-y-3">
            <h2 className="pos-label">Customer Information</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{customer.phone}</span></div>
              <div className="flex items-center gap-2"><Crown className="w-4 h-4 text-muted-foreground" /><span className="capitalize">{customer.customerType}</span></div>
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><span>Member since {new Date(customer.createdAt).toLocaleDateString()}</span></div>
            </div>
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MiniCard icon={<ShoppingBag className="w-4 h-4" />} label="Total Orders" value={customer.totalOrders} />
            <MiniCard icon={<Package className="w-4 h-4" />} label="Active" value={customer.activeOrders} accent={customer.activeOrders > 0} />
            <MiniCard icon={<DollarSign className="w-4 h-4" />} label="Total Spent" value={formatOMR(customer.totalSpent)} />
            <MiniCard icon={<AlertCircle className="w-4 h-4" />} label="Outstanding" value={formatOMR(customer.outstandingBalance)} warning={customer.outstandingBalance > 0} />
            <MiniCard icon={<FileText className="w-4 h-4" />} label="Unpaid Orders" value={customer.unpaidOrderCount} warning={customer.unpaidOrderCount > 0} />
            <MiniCard icon={<Clock className="w-4 h-4" />} label="Last Order" value={customer.lastOrderDate ?? "—"} />
            {loyaltySettings?.is_enabled && loyaltyBalance && (
              <>
                <MiniCard
                  icon={<Gift className="w-4 h-4" />}
                  label="Available Points"
                  value={loyaltyBalance.available.toFixed(0)}
                  accent={loyaltyBalance.available > 0}
                />
                {loyaltyBalance.expiringSoon > 0 && (
                  <MiniCard
                    icon={<Clock className="w-4 h-4" />}
                    label={`Expiring in ${loyaltyBalance.expiringSoonDays}d`}
                    value={loyaltyBalance.expiringSoon.toFixed(0)}
                    warning
                  />
                )}
                {loyaltyBalance.expired > 0 && (
                  <MiniCard
                    icon={<AlertCircle className="w-4 h-4" />}
                    label="Expired Points"
                    value={loyaltyBalance.expired.toFixed(0)}
                  />
                )}
                {loyaltyBalance.lastEarnedAt && (
                  <MiniCard
                    icon={<Calendar className="w-4 h-4" />}
                    label="Last Earned"
                    value={new Date(loyaltyBalance.lastEarnedAt).toLocaleDateString()}
                  />
                )}
                {loyaltyBalance.nextExpiryAt && (
                  <MiniCard
                    icon={<Clock className="w-4 h-4" />}
                    label="Next Expiry"
                    value={new Date(loyaltyBalance.nextExpiryAt).toLocaleDateString()}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="pos-section">
          <h2 className="pos-label mb-3">Financial Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div><span className="text-muted-foreground block text-xs">Lifetime Spending</span><span className="font-bold text-lg">{formatOMR(customer.totalSpent)}</span></div>
            <div><span className="text-muted-foreground block text-xs">Total Paid</span><span className="font-bold text-lg">{formatOMR(customer.totalPaid)}</span></div>
            <div><span className="text-muted-foreground block text-xs">Outstanding</span><span className={`font-bold text-lg ${customer.outstandingBalance > 0 ? "text-destructive" : ""}`}>{formatOMR(customer.outstandingBalance)}</span></div>
            <div><span className="text-muted-foreground block text-xs">Unpaid Orders</span><span className="font-bold text-lg">{customer.unpaidOrderCount}</span></div>
            <div><span className="text-muted-foreground block text-xs">Partially Paid</span><span className="font-bold text-lg">{customer.partiallyPaidOrderCount}</span></div>
          </div>
        </div>

        <div className="pos-section p-0">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h2 className="pos-label">Order History</h2>
            <div className="flex gap-1">
              {(["all", "active", "completed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  {t === "all" ? `All (${customer.totalOrders})` : t === "active" ? `Active (${customer.activeOrders})` : `Done (${customer.completedOrders})`}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-3 font-medium text-muted-foreground">Order #</th>
                  <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                  <th className="p-3 font-medium text-muted-foreground hidden md:table-cell">Due</th>
                  <th className="p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3 font-medium text-muted-foreground">Payment</th>
                  <th className="p-3 font-medium text-muted-foreground text-right">Total</th>
                  <th className="p-3 font-medium text-muted-foreground text-right hidden sm:table-cell">Balance</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {displayOrders.map((o) => (
                  <OrderRow key={o.id} order={o} onView={() => nav(`/order/${o.id}`)} />
                ))}
                {displayOrders.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No orders</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pos-section space-y-3">
          <h2 className="pos-label">Internal Notes</h2>
          {customer.notes.length > 0 ? (
            <div className="space-y-2">
              {customer.notes.map((n) => (
                <div key={n.id} className="bg-secondary/50 rounded-md p-3 text-sm">
                  <p>{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}{n.createdBy ? ` · ${n.createdBy}` : ""}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No notes yet</p>
          )}
          <div className="flex gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              placeholder="Add a note..."
              className="pos-input flex-1"
            />
            <button onClick={handleAddNote} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => nav("/")} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">New Order</button>
          <button onClick={() => nav("/workflow")} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80">Workflow Board</button>
          <button onClick={() => nav("/customers")} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80">All Customers</button>
          <a href={`tel:${customer.phone}`} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 flex items-center gap-1">
            <Phone className="w-3 h-3" /> Call
          </a>
        </div>
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, accent, warning }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean; warning?: boolean }) {
  return (
    <div className="pos-section p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-lg font-bold ${accent ? "text-primary" : warning ? "text-destructive" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function OrderRow({ order: o, onView }: { order: WorkflowOrder; onView: () => void }) {
  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
      <td className="p-3">
        <span className="font-mono text-xs font-medium">{o.orderNumber}</span>
        {o.orderType === "urgent" && <Badge className="ml-1.5 bg-destructive text-destructive-foreground text-[9px] px-1 py-0">Urgent</Badge>}
      </td>
      <td className="p-3 text-muted-foreground hidden sm:table-cell">{o.orderDate}</td>
      <td className="p-3 text-muted-foreground hidden md:table-cell">{o.deliveryDate}</td>
      <td className="p-3">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[o.currentStatus] || "bg-secondary text-secondary-foreground"}`}>
          {o.currentStatus.replace(/-/g, " ")}
        </span>
      </td>
      <td className="p-3">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAYMENT_COLORS[o.paymentStatus] || ""}`}>
          {o.paymentStatus.replace(/-/g, " ")}
        </span>
      </td>
      <td className="p-3 text-right font-medium">{formatOMR(o.totalAmount)}</td>
      <td className="p-3 text-right hidden sm:table-cell">
        {o.remainingBalance > 0 ? <span className="text-destructive">{formatOMR(o.remainingBalance)}</span> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="p-3">
        <button onClick={onView} className="text-primary hover:underline text-xs flex items-center gap-0.5">
          <ExternalLink className="w-3 h-3" /> View
        </button>
      </td>
    </tr>
  );
}
