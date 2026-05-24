import { Plus, Trash2, AlertCircle, PencilLine, Star, AlertTriangle } from "lucide-react";
import type { OrderItem } from "@/types/pos";
import { GARMENT_CONDITIONS } from "@/types/pos";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedItems, getCachedServices, getCachedPricing } from "@/lib/offline-db";
import { formatOMR } from "@/lib/currency";

interface ItemRecord {
  id: string;
  item_name: string;
}

interface ServiceRecord {
  id: string;
  service_name: string;
}

interface PricingRule {
  id: string;
  item_type: string;
  service_type: string;
  price: number;
  urgent_price: number | null;
  is_active: boolean;
  is_default_service: boolean;
}

interface Props {
  items: OrderItem[];
  orderType: "regular" | "urgent";
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<OrderItem>) => void;
  onRemove: (id: string) => void;
}

function ConditionTags({ itemId, conditions, onUpdate }: { itemId: string; conditions: string[]; onUpdate: Props["onUpdate"] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {GARMENT_CONDITIONS.map((c) => {
        const active = conditions.includes(c.id);
        return (
          <motion.button
            key={c.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              const next = active ? conditions.filter((x) => x !== c.id) : [...conditions, c.id];
              onUpdate(itemId, { conditions: next });
            }}
            className={`px-2.5 py-1 text-xs rounded-full border transition-all duration-[120ms] ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {c.label}
          </motion.button>
        );
      })}
    </div>
  );
}

function ItemRow({ item, onUpdate, onRemove, pricingRules, dbItems, dbServices, orderType }: {
  item: OrderItem;
  onUpdate: Props["onUpdate"];
  onRemove: Props["onRemove"];
  pricingRules: PricingRule[];
  dbItems: ItemRecord[];
  dbServices: ServiceRecord[];
  orderType: "regular" | "urgent";
}) {
  const [expanded, setExpanded] = useState(false);

  const matchingRule = pricingRules.find(
    (r) => r.item_type === item.itemType && r.service_type === item.serviceId && r.is_active
  );
  const hasWarning = item.itemType && item.serviceId && !matchingRule;

  // Determine if urgent price is missing for urgent orders
  const urgentPriceMissing = orderType === "urgent" && matchingRule && matchingRule.urgent_price == null;

  const availableServiceNames = item.itemType
    ? [...new Set(pricingRules.filter((r) => r.item_type === item.itemType && r.is_active).map((r) => r.service_type))]
    : dbServices.map((s) => s.service_name);

  const handleQuantityInput = (val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1) {
      onUpdate(item.id, { quantity: num });
    } else if (val === "") {
      // Allow empty temporarily while typing, but enforce min on blur
    }
  };

  const handleQuantityBlur = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      onUpdate(item.id, { quantity: 1 });
    }
  };

  const handlePriceInput = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const isOverride = matchingRule ? num !== matchingRule.price : true;
      onUpdate(item.id, {
        unitPrice: num,
        isManualPriceOverride: isOverride,
        defaultPrice: matchingRule?.price ?? item.defaultPrice,
      });
    } else if (val === "" || val === "0.") {
      // Allow empty/partial typing
    }
  };

  const handlePriceBlur = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      onUpdate(item.id, { unitPrice: 0 });
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className={`border rounded-md p-3 bg-background ${hasWarning ? "border-destructive/50" : "border-border"}`}
    >
      <div className="grid grid-cols-[1fr_1fr_100px_90px_80px_36px] gap-2 items-center">
        <select
          value={item.itemType}
          onChange={(e) => {
            const newItemType = e.target.value;
            const defaultRule = pricingRules.find((r) => r.item_type === newItemType && r.is_default_service && r.is_active);
            const updates: Partial<OrderItem> = {
              itemType: newItemType,
              isManualPriceOverride: false,
              isDefaultServiceSelected: false,
            };
            if (defaultRule) {
              const effectivePrice = orderType === "urgent" && defaultRule.urgent_price != null ? defaultRule.urgent_price : defaultRule.price;
              updates.serviceId = defaultRule.service_type;
              updates.unitPrice = effectivePrice;
              updates.defaultPrice = effectivePrice;
              updates.isDefaultServiceSelected = true;
            } else {
              const firstRule = pricingRules.find((r) => r.item_type === newItemType && r.is_active);
              if (firstRule) {
                const effectivePrice = orderType === "urgent" && firstRule.urgent_price != null ? firstRule.urgent_price : firstRule.price;
                updates.serviceId = firstRule.service_type;
                updates.unitPrice = effectivePrice;
                updates.defaultPrice = effectivePrice;
              } else {
                updates.serviceId = "";
                updates.unitPrice = 0;
              }
            }
            onUpdate(item.id, updates);
          }}
          className="pos-input w-full text-sm"
        >
          <option value="">Item type...</option>
          {dbItems.map((i) => <option key={i.id} value={i.item_name}>{i.item_name}</option>)}
        </select>

        <select
          value={item.serviceId}
          onChange={(e) => {
            const newService = e.target.value;
            const rule = pricingRules.find((r) => r.item_type === item.itemType && r.service_type === newService && r.is_active);
            const updates: Partial<OrderItem> = {
              serviceId: newService,
              isManualPriceOverride: false,
              isDefaultServiceSelected: false,
            };
            if (rule) {
              const effectivePrice = orderType === "urgent" && rule.urgent_price != null ? rule.urgent_price : rule.price;
              updates.unitPrice = effectivePrice;
              updates.defaultPrice = effectivePrice;
            }
            onUpdate(item.id, updates);
          }}
          className="pos-input w-full text-sm"
        >
          <option value="">Service...</option>
          {availableServiceNames.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Quantity: [-] [input] [+] */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => item.quantity > 1 && onUpdate(item.id, { quantity: item.quantity - 1 })}
            className="w-7 h-7 rounded border border-border flex items-center justify-center text-sm hover:bg-secondary transition-colors shrink-0"
          >−</button>
          <input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) => handleQuantityInput(e.target.value)}
            onBlur={(e) => handleQuantityBlur(e.target.value)}
            className="pos-input w-10 text-center text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
            className="w-7 h-7 rounded border border-border flex items-center justify-center text-sm hover:bg-secondary transition-colors shrink-0"
          >+</button>
        </div>

        {/* Price: editable */}
        <div className="relative">
          <input
            type="number"
            min={0}
            step={0.001}
            value={item.unitPrice}
            onChange={(e) => handlePriceInput(e.target.value)}
            onBlur={(e) => handlePriceBlur(e.target.value)}
            className="pos-input w-full text-sm text-right pr-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* Total: read-only */}
        <span className="text-sm font-semibold text-right">{formatOMR(item.unitPrice * item.quantity)}</span>

        <button onClick={() => onRemove(item.id)} className="w-8 h-8 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Default service indicator */}
      {item.isDefaultServiceSelected && !item.isManualPriceOverride && (
        <div className="flex items-center gap-1 mt-1.5 text-xs text-primary">
          <Star className="h-3 w-3" />
          Default service selected
        </div>
      )}

      {/* Manual price override indicator */}
      {item.isManualPriceOverride && (
        <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          <PencilLine className="h-3 w-3" />
          Manual price override
          {item.defaultPrice !== undefined && (
            <span className="text-muted-foreground ml-1">(default: {formatOMR(item.defaultPrice)})</span>
          )}
        </div>
      )}

      {urgentPriceMissing && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Urgent price not set — using regular price
        </div>
      )}

      {hasWarning && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          No pricing rule found for this combination. Please set up pricing in Services & Pricing.
        </div>
      )}

      <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors">
        {expanded ? "Hide details ▲" : "More details ▼"}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input placeholder="Color" value={item.color || ""} onChange={(e) => onUpdate(item.id, { color: e.target.value })} className="pos-input w-full text-sm" />
              <input placeholder="Brand" value={item.brand || ""} onChange={(e) => onUpdate(item.id, { brand: e.target.value })} className="pos-input w-full text-sm" />
            </div>
            <textarea placeholder="Special notes..." value={item.notes || ""} onChange={(e) => onUpdate(item.id, { notes: e.target.value })} rows={2} className="pos-input w-full text-sm mt-2 resize-none py-2" />
            <ConditionTags itemId={item.id} conditions={item.conditions} onUpdate={onUpdate} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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

      if (navigator.onLine) {
        const [prRes, itRes, svRes] = await Promise.all([
          supabase.from("service_pricing").select("id, item_type, service_type, price, urgent_price, is_active, is_default_service").eq("is_active", true).order("item_type").order("service_type"),
          supabase.from("items").select("id, item_name").eq("is_active", true).order("item_name"),
          supabase.from("services").select("id, service_name").eq("is_active", true).order("service_name"),
        ]);
        prData = (prRes.data || []) as PricingRule[];
        itData = (itRes.data || []) as ItemRecord[];
        svData = (svRes.data || []) as ServiceRecord[];
      }

      // Fallback to IndexedDB cached data
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
    <div className="pos-section space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="pos-label">Garments ({items.length})</h2>
        <button onClick={onAdd} className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">No items added yet. Click "Add Item" to start.</div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_100px_90px_80px_36px] gap-2 px-3 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Item</span><span>Service</span><span>Qty</span><span className="text-right">Price</span><span className="text-right">Total</span><span></span>
        </div>
      )}

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onUpdate={onUpdate} onRemove={onRemove} pricingRules={pricingRules} dbItems={dbItems} dbServices={dbServices} orderType={orderType} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
