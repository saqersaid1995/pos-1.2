// Caches reference data from Supabase into IndexedDB for offline use
import { supabase } from "@/integrations/supabase/client";
import {
  cacheCustomers,
  cacheItems,
  cacheServices,
  cachePricing,
  type CachedCustomer,
  type CachedItem,
  type CachedService,
  type CachedPricing,
} from "@/lib/offline-db";

export async function refreshOfflineCache(): Promise<{ success: boolean; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};

  try {
    // Customers
    const { data: customers } = await supabase
      .from("customers")
      .select("id, full_name, phone_number, customer_type, is_active")
      .eq("is_active", true);
    if (customers) {
      const mapped: CachedCustomer[] = customers.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        phone_number: c.phone_number,
        customer_type: c.customer_type,
        is_active: c.is_active,
        cachedAt: new Date().toISOString(),
      }));
      await cacheCustomers(mapped);
      counts.customers = mapped.length;
    }

    // Items
    const { data: items } = await supabase
      .from("items")
      .select("id, item_name, item_name_ar, image_url, show_in_quick_add, sort_order, is_active")
      .eq("is_active", true);
    if (items) {
      const mapped: CachedItem[] = items.map((i) => ({
        id: i.id,
        item_name: i.item_name,
        item_name_ar: i.item_name_ar,
        image_url: i.image_url,
        show_in_quick_add: i.show_in_quick_add,
        sort_order: i.sort_order,
        is_active: i.is_active,
      }));
      await cacheItems(mapped);
      counts.items = mapped.length;
    }

    // Services
    const { data: services } = await supabase
      .from("services")
      .select("id, service_name, is_active")
      .eq("is_active", true);
    if (services) {
      const mapped: CachedService[] = services.map((s) => ({
        id: s.id,
        service_name: s.service_name,
        is_active: s.is_active,
      }));
      await cacheServices(mapped);
      counts.services = mapped.length;
    }

    // Pricing
    const { data: pricing } = await supabase
      .from("service_pricing")
      .select("id, item_type, service_type, price, is_default_service, item_id, service_id, is_active")
      .eq("is_active", true);
    if (pricing) {
      const mapped: CachedPricing[] = pricing.map((p) => ({
        id: p.id,
        item_type: p.item_type,
        service_type: p.service_type,
        price: Number(p.price),
        is_default_service: p.is_default_service,
        item_id: p.item_id,
        service_id: p.service_id,
        is_active: p.is_active,
      }));
      await cachePricing(mapped);
      counts.pricing = mapped.length;
    }

    return { success: true, counts };
  } catch (err) {
    console.error("Offline cache refresh error:", err);
    return { success: false, counts };
  }
}
