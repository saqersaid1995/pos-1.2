import { Plus, Trash2, AlertCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { OrderItem } from "@/types/pos";
import { GARMENT_CONDITIONS } from "@/types/pos";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedItems, getCachedServices, getCachedPricing } from "@/lib/offline-db";
import { formatOMR } from "@/lib/currency";
import { canUseServer } from "@/lib/electron";

interface ItemRecord { id: string; item_name: string }
interface ServiceRecord { id: string; service_name: string }
interface PricingRule {
  id: string; item_type: string; service_type: string;
  price: number; urgent_price: number | null; is_active: boolean; is_default_service: boolean;
}

interface Props {
  items: OrderItem[];
  orderType: "regular" | "urgent";
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<OrderItem>) => void;
  onRemove: (id: string) => void;
}

const SERVICE_COLORS = [
  { bg: "var(--accent-subtle)", text: "var(--color-accent)" },
  { bg: "rgba(16,185,129,0.12)", text: "#10B981" },
  { bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
  { bg: "rgba(168,85,247,0.12)", text: "#A855F7" },
  { bg: "rgba(59,130,246,0.12)", text: "#3B82F6" },
  { bg: "rgba(239,68,68,0.12)", text: "#EF4444" },
];

function getServiceColor(service: string) {
  const hash = service.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return SERVICE_COLORS[hash % SERVICE_COLORS.length];
}

function ItemRow({ item, onUpdate, onRemove, pricingRules, dbItems, dbServices, orderType }: {
  item: OrderItem; onUpdate: Props["onUpdate"]; onRemove: Props["onRemove"];
  pricingRules: PricingRule[]; dbItems: ItemRecord[]; dbServices: ServiceRecord[];
  orderType: "regular" | "urgent";
}) {
  const [expanded, setExpanded] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const matchingRule = pricingRules.find(
    (r) => r.item_type === item.itemType && r.service_type === item.serviceId && r.is_active
  );
  const hasWarning = item.itemType && item.serviceId && !matchingRule;
  const urgentPriceMissing = orderType === "urgent" && matchingRule && matchingRule.urgent_price == null;

  const availableServiceNames = item.itemType
    ? [...new Set(pricingRules.filter((r) => r.item_type === item.itemType && r.is_active).map((r) => r.service_type))]
    : dbServices.map((s) => s.service_name);

  const svcColor = item.serviceId ? getServiceColor(item.serviceId) : { bg: "var(--bg-overlay)", text: "var(--text-tertiary)" };

  const handleItemTypeChange = (newItemType: string) => {
    const defaultRule = pricingRules.find((r) => r.item_type === newItemType && r.is_default_service && r.is_active);
    const updates: Partial<OrderItem> = { itemType: newItemType, isManualPriceOverride: false, isDefaultServiceSelected: false };
    if (defaultRule) {
      const ep = orderType === "urgent" && defaultRule.urgent_price != null ? defaultRule.urgent_price : defaultRule.price;
      Object.assign(updates, { serviceId: defaultRule.service_type, unitPrice: ep, defaultPrice: ep, isDefaultServiceSelected: true });
    } else {
      const firstRule = pricingRules.find((r) => r.item_type === newItemType && r.is_active);
      if (firstRule) {
        const ep = orderType === "urgent" && firstRule.urgent_price != null ? firstRule.urgent_price : firstRule.price;
        Object.assign(updates, { serviceId: firstRule.service_type, unitPrice: ep, defaultPrice: ep });
      } else {
        Object.assign(updates, { serviceId: "", unitPrice: 0 });
      }
    }
    onUpdate(item.id, updates);
  };

  const handleServiceChange = (newService: string) => {
    const rule = pricingRules.find((r) => r.item_type === item.itemType && r.service_type === newService && r.is_active);
    const updates: Partial<OrderItem> = { serviceId: newService, isManualPriceOverride: false, isDefaultServiceSelected: false };
    if (rule) {
      const ep = orderType === "urgent" && rule.urgent_price != null ? rule.urgent_price : rule.price;
      Object.assign(updates, { unitPrice: ep, defaultPrice: ep });
    }
    onUpdate(item.id, updates);
    setSvcOpen(false);
  };

  return (
    <>
      <motion.tr
        layout
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.15 }}
        className="group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* النوع */}
        <td className="py-1.5 pr-3 pl-1" style={{ width: "30%" }}>
          <select
            value={item.itemType}
            onChange={(e) => handleItemTypeChange(e.target.value)}
            className="w-full bg-transparent text-[12px] outline-none cursor-pointer"
            style={{ color: item.itemType ? "var(--text-primary)" : "var(--text-tertiary)" }}
            dir="rtl"
          >
            <option value="">اختر النوع...</option>
            {dbItems.map((i) => <option key={i.id} value={i.item_name}>{i.item_name}</option>)}
          </select>
          {hasWarning && (
            <div className="flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: "var(--color-danger)" }}>
              <AlertCircle size={9} /> لا توجد قاعدة سعر
            </div>
          )}
        </td>

        {/* الخدمة */}
        <td className="py-1.5 px-1" style={{ width: "22%" }}>
          <div className="relative">
            <button
              onClick={() => setSvcOpen((p) => !p)}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap"
              style={{ background: svcColor.bg, color: svcColor.text, border: "1px solid transparent" }}
              title={item.serviceId || "اختر الخدمة"}
            >
              {item.serviceId || "خدمة..."}
            </button>
            {svcOpen && availableServiceNames.length > 0 && (
              <div
                className="absolute z-50 top-full mt-1 rounded-xl overflow-hidden shadow-xl"
                style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", minWidth: 140, left: 0 }}
              >
                {availableServiceNames.map((s) => {
                  const c = getServiceColor(s);
                  return (
                    <button
                      key={s}
                      onClick={() => handleServiceChange(s)}
                      className="w-full text-right px-3 py-2 text-[12px] transition-colors flex items-center gap-2"
                      style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                      dir="rtl"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.text }} />
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {urgentPriceMissing && (
            <div className="flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: "var(--color-warning)" }}>
              <AlertTriangle size={9} /> سعر عاجل غير محدد
            </div>
          )}
        </td>

        {/* الكمية */}
        <td className="py-1.5 px-1 text-center" style={{ width: "16%" }}>
          <div className="flex items-center justify-center gap-0.5">
            <button
              onClick={() => item.quantity > 1 && onUpdate(item.id, { quantity: item.quantity - 1 })}
              className="w-5 h-5 rounded flex items-center justify-center text-[11px] transition-colors"
              style={{
                color: hovered ? "var(--text-secondary)" : "var(--text-tertiary)",
                background: hovered ? "var(--bg-overlay)" : "transparent",
              }}
            >−</button>
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n >= 1) onUpdate(item.id, { quantity: n });
              }}
              onBlur={(e) => {
                const n = parseInt(e.target.value, 10);
                if (isNaN(n) || n < 1) onUpdate(item.id, { quantity: 1 });
              }}
              className="w-7 text-center text-[12px] bg-transparent outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{ color: "var(--text-primary)" }}
            />
            <button
              onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
              className="w-5 h-5 rounded flex items-center justify-center text-[11px] transition-colors"
              style={{
                color: hovered ? "var(--text-secondary)" : "var(--text-tertiary)",
                background: hovered ? "var(--bg-overlay)" : "transparent",
              }}
            >+</button>
          </div>
        </td>

        {/* سعر الوحدة */}
        <td className="py-1.5 px-1 text-right" style={{ width: "14%" }}>
          <input
            type="number"
            min={0}
            step={0.001}
            value={item.unitPrice}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!isNaN(n) && n >= 0) {
                const isOverride = matchingRule ? n !== matchingRule.price : true;
                onUpdate(item.id, { unitPrice: n, isManualPriceOverride: isOverride, defaultPrice: matchingRule?.price ?? item.defaultPrice });
              }
            }}
            onBlur={(e) => {
              const n = parseFloat(e.target.value);
              if (isNaN(n) || n < 0) onUpdate(item.id, { unitPrice: 0 });
            }}
            className="w-full text-right text-[12px] bg-transparent outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{
              color: item.isManualPriceOverride ? "var(--color-warning)" : "var(--text-secondary)",
            }}
          />
        </td>

        {/* الإجمالي */}
        <td className="py-1.5 px-1 text-right" style={{ width: "14%" }}>
          <span className="text-[12px] font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
            {formatOMR(item.unitPrice * item.quantity)}
          </span>
        </td>

        {/* Actions */}
        <td className="py-1.5 pl-1 pr-2 text-right" style={{ width: "10%" }}>
          <div className="flex items-center justify-end gap-0.5">
            <button
              onClick={() => setExpanded((p) => !p)}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors"
              style={{ color: "var(--text-tertiary)", opacity: hovered ? 1 : 0.4 }}
              title="تفاصيل"
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors"
              style={{ color: "var(--color-danger)", opacity: hovered ? 1 : 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--danger-subtle)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
              title="حذف"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </td>
      </motion.tr>

      {/* Expanded details row */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <td colSpan={6} className="px-3 pb-2 pt-0">
            <AnimatePresence>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input placeholder="اللون" value={item.color || ""} onChange={(e) => onUpdate(item.id, { color: e.target.value })}
                    className="ds-input text-[12px] h-8" dir="rtl" />
                  <input placeholder="الماركة" value={item.brand || ""} onChange={(e) => onUpdate(item.id, { brand: e.target.value })}
                    className="ds-input text-[12px] h-8" dir="rtl" />
                </div>
                <textarea placeholder="ملاحظات خاصة..." value={item.notes || ""} onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
                  rows={2} className="ds-input w-full text-[12px] mt-2 resize-none py-1.5" dir="rtl" />
                <div className="flex flex-wrap gap-1 mt-2">
                  {GARMENT_CONDITIONS.map((c) => {
                    const active = item.conditions.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          const next = active ? item.conditions.filter((x) => x !== c.id) : [...item.conditions, c.id];
                          onUpdate(item.id, { conditions: next });
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
                        style={{
                          background: active ? "var(--accent-subtle)" : "var(--bg-overlay)",
                          color: active ? "var(--color-accent)" : "var(--text-secondary)",
                          border: "1px solid",
                          borderColor: active ? "var(--color-accent)" : "var(--border-default)",
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </td>
        </tr>
      )}
    </>
  );
}

export default function GarmentTable({ items, orderType, onAdd, onUpdate, onRemove }: Props) {
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [dbItems, setDbItems] = useState<ItemRecord[]>([]);
  const [dbServices, setDbServices] = useState<ServiceRecord[]>([]);

  useEffect(() => {
    async function load() {
      let prData: PricingRule[] = [];
      let itData: ItemRecord[] = [];
      let svData: ServiceRecord[] = [];

      if (canUseServer()) {
        const [prRes, itRes, svRes] = await Promise.all([
          supabase.from("service_pricing").select("id, item_type, service_type, price, urgent_price, is_active, is_default_service")
            .eq("is_active", true).order("item_type").order("service_type"),
          supabase.from("items").select("id, item_name").eq("is_active", true).order("item_name"),
          supabase.from("services").select("id, service_name").eq("is_active", true).order("service_name"),
        ]);
        prData = (prRes.data || []) as PricingRule[];
        itData = (itRes.data || []) as ItemRecord[];
        svData = (svRes.data || []) as ServiceRecord[];
      }

      if (prData.length === 0) {
        const cached = await getCachedPricing();
        prData = cached.filter((p) => p.is_active).map((p) => ({
          id: p.id, item_type: p.item_type, service_type: p.service_type,
          price: p.price, urgent_price: (p as any).urgent_price ?? null, is_active: p.is_active, is_default_service: p.is_default_service,
        }));
      }
      if (itData.length === 0) {
        const cached = await getCachedItems();
        itData = cached.filter((i) => i.is_active).map((i) => ({ id: i.id, item_name: i.item_name }));
      }
      if (svData.length === 0) {
        const cached = await getCachedServices();
        svData = cached.filter((s) => s.is_active).map((s) => ({ id: s.id, service_name: s.service_name }));
      }

      setPricingRules(prData);
      setDbItems(itData);
      setDbServices(svData);
    }
    load();
  }, []);

  return (
    <div
      className="rounded-xl flex flex-col overflow-hidden"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", flex: 1, minHeight: 0 }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          القطع ({items.length})
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors"
          style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.2)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)"; }}
        >
          <Plus size={12} /> إضافة يدوية
        </button>
      </div>

      {/* Table */}
      <div className="overflow-y-auto flex-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 gap-2">
            <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>لم تُضف قطع بعد</p>
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              استخدم الإضافة السريعة أعلاه أو اضغط إضافة يدوية
            </p>
            <button
              onClick={onAdd}
              className="mt-2 flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
            >
              <Plus size={13} /> إضافة يدوية
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse" dir="rtl">
            <thead className="sticky top-0" style={{ background: "var(--bg-elevated)" }}>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["النوع", "الخدمة", "الكمية", "سعر الوحدة", "الإجمالي", ""].map((h) => (
                  <th key={h} className="py-1.5 px-1 text-right text-[10px] font-semibold tracking-wide first:pr-3 last:pl-2"
                    style={{ color: "var(--text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                    pricingRules={pricingRules}
                    dbItems={dbItems}
                    dbServices={dbServices}
                    orderType={orderType}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
