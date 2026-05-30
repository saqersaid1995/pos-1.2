import { useState, useEffect, useRef } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getCachedItems, getCachedPricing, getCachedServices } from "@/lib/offline-db";
import { formatOMR } from "@/lib/currency";
import type { OrderItem } from "@/types/pos";
import { canUseServer } from "@/lib/electron";

interface PricingRule {
  item_type: string;
  service_type: string;
  price: number;
  urgent_price: number | null;
  is_active: boolean;
  is_default_service: boolean;
}

interface QuickItem {
  name: string;
  nameAr: string;
  imageUrl: string;
  services: { service: string; price: number; urgentPrice: number | null; isDefault: boolean }[];
  defaultService: string;
  defaultPrice: number;
  defaultUrgentPrice: number | null;
}

interface GridSelection {
  count: number;
  service: string;
  price: number;
}

interface Props {
  items: OrderItem[];
  orderType: "regular" | "urgent";
  onAddQuickItem: (itemType: string, serviceId: string, price: number) => void;
}

const FILTER_ALL = "الكل";

// ─── Service name → Arabic translation ───────────────────────────────────────
const SERVICE_AR: Record<string, string> = {
  "Wash Only": "غسيل فقط",
  "Wash + Iron": "غسيل + كوي",
  "Wash and Iron": "غسيل + كوي",
  "Iron Only": "كوي فقط",
  "Dry Clean": "تنظيف جاف",
  "Dry Cleaning": "تنظيف جاف",
  "Pressing": "كوي",
  "Steam Pressing": "كوي بخار",
  "Steam": "بخار",
  "Folding": "طي",
  "Wash": "غسيل",
};
function translateService(name: string): string {
  return SERVICE_AR[name] ?? name;
}

// ─── Color avatar for items without an image ─────────────────────────────────
const AVATAR_COLORS = [
  { bg: "rgba(99,102,241,0.18)", fg: "#A5B4FC" },   // indigo
  { bg: "rgba(16,185,129,0.18)", fg: "#6EE7B7" },   // emerald
  { bg: "rgba(245,158,11,0.18)", fg: "#FCD34D" },   // amber
  { bg: "rgba(239,68,68,0.18)",  fg: "#FCA5A5" },   // rose
  { bg: "rgba(6,182,212,0.18)",  fg: "#67E8F9" },   // cyan
  { bg: "rgba(168,85,247,0.18)", fg: "#D8B4FE" },   // purple
  { bg: "rgba(249,115,22,0.18)", fg: "#FDBA74" },   // orange
  { bg: "rgba(20,184,166,0.18)", fg: "#5EEAD4" },   // teal
];
function itemAvatar(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Size-like labels (single letters or standard sizes) go in a separate row
const SIZE_TOKENS = new Set(["S", "M", "L", "XL", "XXL", "XS"]);
function isSize(name: string): boolean {
  return SIZE_TOKENS.has(name.trim().toUpperCase());
}

function extractDisplayName(nameEn: string, nameAr: string): string {
  if (nameAr) return nameAr;
  const idx = nameEn.lastIndexOf(" - ");
  if (idx !== -1) {
    const after = nameEn.slice(idx + 3);
    if (/[؀-ۿ]/.test(after)) return after;
  }
  return nameEn;
}

export default function QuickAddGrid({ items, orderType, onAddQuickItem }: Props) {
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [allServices, setAllServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Filter = service type (الكل by default)
  const [activeFilter, setActiveFilter] = useState<string>(FILTER_ALL);

  // Selection: itemName → { count, service, price }
  const [selection, setSelection] = useState<Record<string, GridSelection>>({});

  useEffect(() => {
    async function load() {
      let allDbItems: Array<{ item_name: string; item_name_ar: string | null; image_url: string | null; sort_order: number; show_in_quick_add: boolean }> = [];
      let rules: PricingRule[] = [];
      let svNames: string[] = [];

      console.log('[QuickAddGrid] load | canUseServer:', canUseServer(), '| navigator.onLine:', navigator.onLine);
      if (canUseServer()) {
        const [itemsRes, pricingRes, svcRes] = await Promise.all([
          supabase.from("items").select("item_name, item_name_ar, image_url, sort_order, show_in_quick_add")
            .eq("is_active", true).eq("show_in_quick_add", true).order("sort_order").order("item_name"),
          supabase.from("service_pricing").select("item_type, service_type, price, urgent_price, is_active, is_default_service")
            .eq("is_active", true),
          supabase.from("services").select("service_name").eq("is_active", true).order("service_name"),
        ]);
        console.log('[QuickAddGrid] server results | items:', itemsRes.data?.length ?? 0, 'err:', itemsRes.error, '| pricing:', pricingRes.data?.length ?? 0, 'err:', pricingRes.error, '| services:', svcRes.data?.length ?? 0, 'err:', svcRes.error);
        allDbItems = (itemsRes.data || []) as typeof allDbItems;
        rules = (pricingRes.data || []) as PricingRule[];
        svNames = ((svcRes.data || []) as any[]).map((s) => s.service_name);
      }

      if (allDbItems.length === 0) {
        console.log('[QuickAddGrid] items empty from server — falling back to IndexedDB cache');
        const cached = await getCachedItems();
        allDbItems = cached.filter((i) => i.show_in_quick_add && i.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.item_name.localeCompare(b.item_name))
          .map((i) => ({ item_name: i.item_name, item_name_ar: i.item_name_ar, image_url: i.image_url, sort_order: i.sort_order, show_in_quick_add: i.show_in_quick_add }));
      }
      if (rules.length === 0) {
        const cached = await getCachedPricing();
        rules = cached.filter((p) => p.is_active).map((p) => ({
          item_type: p.item_type, service_type: p.service_type,
          price: p.price, urgent_price: (p as any).urgent_price ?? null,
          is_active: p.is_active, is_default_service: p.is_default_service,
        }));
      }
      if (svNames.length === 0) {
        console.log('[QuickAddGrid] services empty from server — falling back to IndexedDB cache');
        const cached = await getCachedServices();
        svNames = cached.filter((s) => s.is_active).map((s) => s.service_name);
      }

      const mapped: QuickItem[] = allDbItems.map((i) => {
        const itemRules = rules.filter((r) => r.item_type === i.item_name);
        const defaultRule = itemRules.find((r) => r.is_default_service) || itemRules[0];
        return {
          name: i.item_name,
          nameAr: i.item_name_ar || "",
          imageUrl: i.image_url || "",
          services: itemRules.map((r) => ({ service: r.service_type, price: r.price, urgentPrice: r.urgent_price, isDefault: r.is_default_service })),
          defaultService: defaultRule?.service_type || "",
          defaultPrice: defaultRule?.price || 0,
          defaultUrgentPrice: defaultRule?.urgent_price ?? null,
        };
      }).filter((q) => q.defaultService);

      console.log('[QuickAddGrid] final | allDbItems:', allDbItems.length, '| rules:', rules.length, '| mapped (with defaultService):', mapped.length, '| sample item_name:', allDbItems[0]?.item_name ?? 'none', '| sample rule item_type:', rules[0]?.item_type ?? 'none');
      setQuickItems(mapped);
      setAllServices(svNames);
      setLoading(false);
    }
    load();
  }, []);

  // suppress unused variable warning
  void allServices;

  // Auto-collapse when first item is added to the order
  const prevItemsLen = useRef(items.length);
  useEffect(() => {
    if (prevItemsLen.current === 0 && items.length > 0) {
      setCollapsed(true);
    }
    prevItemsLen.current = items.length;
  }, [items.length]);

  // Items in current order for count display
  const itemCounts: Record<string, number> = {};
  items.forEach((item) => { itemCounts[item.itemType] = (itemCounts[item.itemType] || 0) + item.quantity; });

  // Selected item count + total
  const selectionCount = Object.values(selection).reduce((s, v) => s + v.count, 0);
  const selectionTotal = Object.values(selection).reduce((s, v) => s + v.count * v.price, 0);
  const hasSelection = selectionCount > 0;

  // Filtered items: if a service filter is active, show only items that have that service
  const filteredItems = activeFilter === FILTER_ALL
    ? quickItems
    : quickItems.filter((qi) => qi.services.some((sv) => sv.service === activeFilter));

  const handleItemClick = (qi: QuickItem) => {
    const svc = activeFilter !== FILTER_ALL
      ? qi.services.find((s) => s.service === activeFilter) || qi.services.find((s) => s.isDefault) || qi.services[0]
      : qi.services.find((s) => s.isDefault) || qi.services[0];
    if (!svc) return;
    const price = orderType === "urgent" && svc.urgentPrice != null ? svc.urgentPrice : svc.price;

    setSelection((prev) => {
      const existing = prev[qi.name];
      if (existing) {
        return { ...prev, [qi.name]: { ...existing, count: existing.count + 1 } };
      }
      return { ...prev, [qi.name]: { count: 1, service: svc.service, price } };
    });
  };

  const removeFromSelection = (itemName: string) => {
    setSelection((prev) => {
      const existing = prev[itemName];
      if (!existing || existing.count <= 1) {
        const next = { ...prev };
        delete next[itemName];
        return next;
      }
      return { ...prev, [itemName]: { ...existing, count: existing.count - 1 } };
    });
  };

  const handleAddToOrder = () => {
    Object.entries(selection).forEach(([itemName, sel]) => {
      for (let i = 0; i < sel.count; i++) {
        onAddQuickItem(itemName, sel.service, sel.price);
      }
    });
    setSelection({});
  };

  const changeSelectionService = (itemName: string, service: string, price: number) => {
    setSelection((prev) => {
      if (!prev[itemName]) return prev;
      return { ...prev, [itemName]: { ...prev[itemName], service, price } };
    });
  };

  if (loading) {
    return (
      <div className="rounded-xl p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg skeleton-shimmer" style={{ height: 76 }} />
          ))}
        </div>
      </div>
    );
  }

  if (quickItems.length === 0) return null;

  // Build filter pills: "الكل" + unique services that appear in items
  const allServiceNames = Array.from(new Set(quickItems.flatMap((qi) => qi.services.map((s) => s.service))));
  const serviceFilters = [FILTER_ALL, ...allServiceNames.filter((s) => !isSize(s))];
  const sizeFilters = allServiceNames.filter(isSize);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          إضافة سريعة
        </span>
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-1 text-[11px] transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {/* Service filter bar */}
            <div className="flex gap-1.5 px-3 pt-2 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {serviceFilters.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap"
                  style={{
                    background: activeFilter === f ? "var(--color-accent)" : "var(--bg-overlay)",
                    color: activeFilter === f ? "#fff" : "var(--text-secondary)",
                    border: "1px solid",
                    borderColor: activeFilter === f ? "var(--color-accent)" : "var(--border-default)",
                  }}
                >
                  {f === FILTER_ALL ? f : translateService(f)}
                </button>
              ))}
            </div>

            {/* Size filter bar (only if sizes exist) */}
            {sizeFilters.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>الحجم:</span>
                {sizeFilters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
                    style={{
                      background: activeFilter === f ? "var(--color-accent)" : "var(--bg-overlay)",
                      color: activeFilter === f ? "#fff" : "var(--text-secondary)",
                      border: "1px solid",
                      borderColor: activeFilter === f ? "var(--color-accent)" : "var(--border-default)",
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {/* Items grid */}
            <div className="p-2" style={{ maxHeight: 240, overflowY: "auto" }}>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                {filteredItems.map((qi) => {
                  const sel = selection[qi.name];
                  const inOrder = itemCounts[qi.name] || 0;
                  const isSelected = !!sel && sel.count > 0;
                  return (
                    <div key={qi.name} className="relative">
                      <button
                        onClick={() => handleItemClick(qi)}
                        className="w-full rounded-lg flex flex-col items-center overflow-hidden transition-all"
                        style={{
                          background: isSelected ? "var(--accent-subtle)" : "var(--bg-surface)",
                          border: "1px solid",
                          borderColor: isSelected ? "var(--color-accent)" : "var(--border-default)",
                          maxWidth: 100,
                        }}
                        title={qi.nameAr || qi.name}
                      >
                        <div className="w-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.02)", height: 52 }}>
                          {qi.imageUrl ? (
                            <img src={qi.imageUrl} alt={qi.name} style={{ width: 36, height: 36, objectFit: "contain" }} loading="lazy" />
                          ) : (() => {
                            const av = itemAvatar(qi.nameAr || qi.name);
                            const display = extractDisplayName(qi.name, qi.nameAr).slice(0, 2);
                            return (
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: "50%",
                                  background: av.bg,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: av.fg,
                                  letterSpacing: "-0.5px",
                                  lineHeight: 1,
                                  fontFamily: "sans-serif",
                                }}
                              >
                                {display}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ padding: "6px 4px", width: "100%", textAlign: "center" }}>
                          <span
                            style={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              fontSize: 11,
                              lineHeight: 1.3,
                              color: isSelected ? "var(--color-accent)" : "var(--text-secondary)",
                              wordBreak: "break-word",
                            } as React.CSSProperties}
                          >
                            {extractDisplayName(qi.name, qi.nameAr)}
                          </span>
                        </div>
                      </button>

                      {/* Selection count badge */}
                      {isSelected && (
                        <div
                          className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full text-[9px] font-bold min-w-[16px] h-4 px-1 z-10"
                          style={{ background: "var(--color-accent)", color: "#fff" }}
                        >
                          {sel.count}
                        </div>
                      )}

                      {/* In-order count (secondary badge, bottom-left) */}
                      {inOrder > 0 && !isSelected && (
                        <div
                          className="absolute bottom-0.5 left-0.5 flex items-center justify-center rounded-full text-[9px] font-bold min-w-[14px] h-3.5 px-0.5 z-10"
                          style={{ background: "var(--bg-overlay)", color: "var(--text-tertiary)", border: "1px solid var(--border-default)" }}
                        >
                          {inOrder}
                        </div>
                      )}

                      {/* Decrement button */}
                      {isSelected && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromSelection(qi.name); }}
                          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold z-10"
                          style={{ background: "var(--danger-subtle)", color: "var(--color-danger)" }}
                          title="إزالة"
                        >
                          −
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Service selector (when items selected) */}
            <AnimatePresence>
              {hasSelection && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="pt-2 flex flex-col gap-2">
                      {/* Per-item service selectors */}
                      {Object.entries(selection).map(([itemName, sel]) => {
                        const qi = quickItems.find((q) => q.name === itemName);
                        if (!qi || qi.services.length <= 1) return null;
                        return (
                          <div key={itemName} className="flex items-center gap-2 flex-wrap" dir="rtl">
                            <span className="text-[11px] shrink-0" style={{ color: "var(--text-secondary)" }}>
                              {qi.nameAr || qi.name}:
                            </span>
                            {qi.services.map((sv) => {
                              const svPrice = orderType === "urgent" && sv.urgentPrice != null ? sv.urgentPrice : sv.price;
                              const isActive = sel.service === sv.service;
                              return (
                                <button
                                  key={sv.service}
                                  onClick={() => changeSelectionService(itemName, sv.service, svPrice)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
                                  style={{
                                    background: isActive ? "rgba(16,185,129,0.15)" : "var(--bg-overlay)",
                                    color: isActive ? "#10B981" : "var(--text-secondary)",
                                    border: "1px solid",
                                    borderColor: isActive ? "#10B981" : "var(--border-default)",
                                  }}
                                >
                                  {translateService(sv.service)} · {formatOMR(svPrice)}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}

                      {/* Add to order button */}
                      <button
                        onClick={handleAddToOrder}
                        className="w-full h-9 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors"
                        style={{ background: "var(--color-accent)", color: "#fff" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-accent-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-accent)"; }}
                      >
                        <Plus size={14} />
                        إضافة للطلب
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px]"
                          style={{ background: "rgba(255,255,255,0.2)" }}
                        >
                          {selectionCount} قطعة · {formatOMR(selectionTotal)}
                        </span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
