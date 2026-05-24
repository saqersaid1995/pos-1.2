import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedItems, getCachedPricing } from "@/lib/offline-db";
import { Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatOMR } from "@/lib/currency";
import type { OrderItem } from "@/types/pos";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PricingRule {
  item_type: string;
  service_type: string;
  price: number;
  urgent_price: number | null;
  is_active: boolean;
  is_default_service: boolean;
}

interface ServiceOption {
  service: string;
  price: number;
  urgentPrice: number | null;
  isDefault: boolean;
}

interface QuickItem {
  name: string;
  nameAr: string;
  imageUrl: string;
  defaultService: string;
  defaultPrice: number;
  defaultUrgentPrice: number | null;
  sortOrder: number;
  services: ServiceOption[];
}

interface Props {
  items: OrderItem[];
  orderType: "regular" | "urgent";
  onAddQuickItem: (itemType: string, serviceId: string, price: number) => void;
}

export default function QuickOrderPanel({ items, orderType, onAddQuickItem }: Props) {
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItem, setOpenItem] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      let allItems: Array<{ item_name: string; item_name_ar: string | null; image_url: string | null; sort_order: number; show_in_quick_add: boolean }> = [];
      let rules: PricingRule[] = [];

      if (navigator.onLine) {
        const [itemsRes, pricingRes] = await Promise.all([
          supabase.from("items").select("item_name, item_name_ar, image_url, sort_order, show_in_quick_add").eq("is_active", true).eq("show_in_quick_add", true).order("sort_order").order("item_name"),
          supabase.from("service_pricing").select("item_type, service_type, price, urgent_price, is_active, is_default_service").eq("is_active", true),
        ]);
        allItems = (itemsRes.data || []) as typeof allItems;
        rules = (pricingRes.data || []) as PricingRule[];
      }

      if (allItems.length === 0) {
        const cachedItems = await getCachedItems();
        allItems = cachedItems
          .filter((i) => i.show_in_quick_add && i.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.item_name.localeCompare(b.item_name))
          .map((i) => ({
            item_name: i.item_name,
            item_name_ar: i.item_name_ar,
            image_url: i.image_url,
            sort_order: i.sort_order,
            show_in_quick_add: i.show_in_quick_add,
          }));
      }
      if (rules.length === 0) {
        const cachedPricing = await getCachedPricing();
        rules = cachedPricing
          .filter((p) => p.is_active)
          .map((p) => ({
            item_type: p.item_type,
            service_type: p.service_type,
            price: p.price,
            urgent_price: (p as any).urgent_price ?? null,
            is_active: p.is_active,
            is_default_service: p.is_default_service,
          }));
      }

      const mapped: QuickItem[] = allItems.map((i) => {
        const itemRules = rules.filter((r) => r.item_type === i.item_name);
        const defaultRule = itemRules.find((r) => r.is_default_service);
        const fallback = itemRules[0];
        const rule = defaultRule || fallback;
        const services: ServiceOption[] = itemRules.map((r) => ({
          service: r.service_type,
          price: r.price,
          urgentPrice: r.urgent_price,
          isDefault: r.is_default_service,
        }));
        return {
          name: i.item_name,
          nameAr: i.item_name_ar || "",
          imageUrl: i.image_url || "",
          defaultService: rule?.service_type || "",
          defaultPrice: rule?.price || 0,
          defaultUrgentPrice: rule?.urgent_price ?? null,
          sortOrder: i.sort_order,
          services,
        };
      }).filter((q) => q.defaultService);

      setQuickItems(mapped);
      setLoading(false);
    }
    load();
  }, []);

  // Count per item+service combo
  const comboCounts: Record<string, number> = {};
  const itemCounts: Record<string, number> = {};
  items.forEach((item) => {
    const key = `${item.itemType}::${item.serviceId}`;
    comboCounts[key] = (comboCounts[key] || 0) + item.quantity;
    itemCounts[item.itemType] = (itemCounts[item.itemType] || 0) + item.quantity;
  });

  const handleServiceSelect = (qi: QuickItem, svc: ServiceOption) => {
    const price = orderType === "urgent" && svc.urgentPrice != null ? svc.urgentPrice : svc.price;
    onAddQuickItem(qi.name, svc.service, price);
    setOpenItem(null);
  };

  const handleItemClick = (qi: QuickItem) => {
    // If only one service, add directly
    if (qi.services.length <= 1) {
      const price = orderType === "urgent" && qi.defaultUrgentPrice != null ? qi.defaultUrgentPrice : qi.defaultPrice;
      onAddQuickItem(qi.name, qi.defaultService, price);
    }
    // If multiple services, popover handles it via PopoverTrigger
  };

  if (loading) return null;

  return (
    <div className="pos-section space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="pos-label">Quick Add</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {quickItems.map((qi) => {
          const count = itemCounts[qi.name] || 0;
          const hasMultipleServices = qi.services.length > 1;

          const cardContent = (
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.04, boxShadow: "0 8px 24px -8px hsl(var(--primary) / 0.18)" }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              onClick={!hasMultipleServices ? () => handleItemClick(qi) : undefined}
              className="relative flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background hover:border-primary/40 transition-colors text-center overflow-hidden w-full"
            >
              <div className="w-full aspect-square flex items-center justify-center bg-muted/40 p-2">
                {qi.imageUrl ? (
                  <img src={qi.imageUrl} alt={qi.name} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                  <span className="text-3xl font-bold text-muted-foreground/60">{qi.name.charAt(0)}</span>
                )}
              </div>
              <div className="px-2 pb-2 space-y-0.5 w-full">
                <span className="block text-xs font-semibold leading-tight truncate">{qi.name}</span>
                {qi.nameAr && (
                  <span className="block text-[0.65rem] text-muted-foreground leading-tight truncate" dir="rtl">{qi.nameAr}</span>
                )}
                <span className="block text-[0.6rem] text-muted-foreground">
                  {orderType === "urgent" && qi.defaultUrgentPrice != null
                    ? formatOMR(qi.defaultUrgentPrice)
                    : formatOMR(qi.defaultPrice)}
                </span>
              </div>
              {count > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center shadow-lg ring-2 ring-background">
                  {count}
                </span>
              )}
            </motion.button>
          );

          if (!hasMultipleServices) {
            return <div key={qi.name}>{cardContent}</div>;
          }

          return (
            <Popover key={qi.name} open={openItem === qi.name} onOpenChange={(open) => setOpenItem(open ? qi.name : null)}>
              <PopoverTrigger asChild>
                {cardContent}
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="center" side="top">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Select service for {qi.name}</p>
                <div className="space-y-1">
                  {qi.services.map((svc) => {
                    const comboKey = `${qi.name}::${svc.service}`;
                    const svcCount = comboCounts[comboKey] || 0;
                    const svcPrice = orderType === "urgent" && svc.urgentPrice != null ? svc.urgentPrice : svc.price;
                    return (
                      <button
                        key={svc.service}
                        onClick={() => handleServiceSelect(qi, svc)}
                        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{svc.service}</span>
                          <span className="text-xs text-muted-foreground">{formatOMR(svcPrice)}</span>
                        </div>
                        {svcCount > 0 && (
                          <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
                            {svcCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
