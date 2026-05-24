import { useState, useMemo, useCallback, useEffect } from "react";
import type { CustomerRecord, CustomerWithStats } from "@/types/customer";
import type { WorkflowOrder } from "@/types/workflow";
import {
  fetchAllCustomers,
  fetchCustomerById,
  fetchOrdersByCustomerId,
  addCustomerNote as addCustomerNoteDb,
  updateCustomerRecord,
  deleteCustomer as deleteCustomerDb,
  archiveCustomer as archiveCustomerDb,
  restoreCustomer as restoreCustomerDb,
  customerHasOrders,
  fetchAllOrders,
} from "@/lib/supabase-queries";
import { getCachedCustomers, getUnsyncedOrders, type CachedCustomer } from "@/lib/offline-db";

function buildCustomerStats(customer: CustomerRecord, orders: WorkflowOrder[]): CustomerWithStats {
  const activeOrders = orders.filter((o) => o.currentStatus !== "delivered");
  const completedOrders = orders.filter((o) => o.currentStatus === "delivered");
  const totalSpent = orders.reduce((s, o) => s + o.totalAmount, 0);
  const totalPaid = orders.reduce((s, o) => s + o.paidAmount, 0);
  const unpaidOrderCount = orders.filter((o) => o.paymentStatus === "unpaid").length;
  const partiallyPaidOrderCount = orders.filter((o) => o.paymentStatus === "partially-paid").length;
  const sorted = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return {
    ...customer,
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    completedOrders: completedOrders.length,
    totalSpent,
    totalPaid,
    outstandingBalance: Math.max(0, totalSpent - totalPaid),
    unpaidOrderCount,
    partiallyPaidOrderCount,
    lastOrderDate: sorted[0]?.orderDate ?? null,
    orders,
  };
}

function cachedToCustomerRecord(c: CachedCustomer): CustomerRecord {
  return {
    id: c.id,
    name: c.full_name,
    phone: c.phone_number,
    customerType: (c.customer_type || "Regular").toLowerCase() as "regular" | "vip",
    isActive: c.is_active,
    createdAt: c.cachedAt || "",
    updatedAt: c.cachedAt || "",
    notes: [],
  };
}

export function useCustomerState() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [allOrders, setAllOrders] = useState<WorkflowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "vip">("all");
  const [balanceFilter, setBalanceFilter] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (navigator.onLine) {
        const [custs, ords] = await Promise.all([fetchAllCustomers(), fetchAllOrders()]);
        setCustomers(custs);
        setAllOrders(ords);
      } else {
        // Offline: load from IndexedDB cache
        const cachedCusts = await getCachedCustomers();
        setCustomers(cachedCusts.map(cachedToCustomerRecord));
        // For orders offline, we have no cloud orders cached yet but we have offline-created orders
        // We'll show empty orders for now (offline orders don't have customer_id linkage)
        setAllOrders([]);
      }
    } catch (err) {
      console.error("loadData error, falling back to cache:", err);
      try {
        const cachedCusts = await getCachedCustomers();
        setCustomers(cachedCusts.map(cachedToCustomerRecord));
        setAllOrders([]);
      } catch {
        // IndexedDB also failed
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const customersWithStats: CustomerWithStats[] = useMemo(
    () =>
      customers.map((c) => {
        const custOrders = allOrders.filter(
          (o) => o.customerPhone === c.phone || o.customerName === c.name
        );
        return buildCustomerStats(c, custOrders);
      }),
    [customers, allOrders]
  );

  const filtered = useMemo(() => {
    let result = customersWithStats;
    if (!showArchived) {
      result = result.filter((c) => c.isActive);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter((c) => c.customerType === typeFilter);
    }
    if (balanceFilter) {
      result = result.filter((c) => c.outstandingBalance > 0);
    }
    return result;
  }, [customersWithStats, search, typeFilter, balanceFilter, showArchived]);

  const getCustomer = useCallback(
    (id: string) => {
      const c = customers.find((c) => c.id === id);
      if (!c) return null;
      const custOrders = allOrders.filter(
        (o) => o.customerPhone === c.phone || o.customerName === c.name
      );
      return buildCustomerStats(c, custOrders);
    },
    [customers, allOrders]
  );

  const addNote = useCallback(async (customerId: string, text: string, createdBy?: string) => {
    if (!navigator.onLine) {
      toast_offline();
      return;
    }
    const success = await addCustomerNoteDb(customerId, text, createdBy);
    if (success) await loadData();
  }, [loadData]);

  const updateCustomer = useCallback(async (id: string, updates: Partial<Pick<CustomerRecord, "name" | "phone" | "customerType">>) => {
    if (!navigator.onLine) {
      toast_offline();
      return;
    }
    const dbUpdates: any = {};
    if (updates.name) dbUpdates.full_name = updates.name;
    if (updates.phone) dbUpdates.phone_number = updates.phone;
    if (updates.customerType) dbUpdates.customer_type = updates.customerType === "vip" ? "VIP" : "Regular";

    const success = await updateCustomerRecord(id, dbUpdates);
    if (success) await loadData();
  }, [loadData]);

  const removeCustomer = useCallback(async (id: string): Promise<{ action: "deleted" | "archived" | "error" }> => {
    if (!navigator.onLine) {
      toast_offline();
      return { action: "error" };
    }
    const hasOrders = await customerHasOrders(id);
    if (hasOrders) {
      const ok = await archiveCustomerDb(id);
      if (ok) { await loadData(); return { action: "archived" }; }
      return { action: "error" };
    } else {
      const ok = await deleteCustomerDb(id);
      if (ok) { await loadData(); return { action: "deleted" }; }
      return { action: "error" };
    }
  }, [loadData]);

  const restoreCustomer = useCallback(async (id: string) => {
    if (!navigator.onLine) {
      toast_offline();
      return false;
    }
    const ok = await restoreCustomerDb(id);
    if (ok) await loadData();
    return ok;
  }, [loadData]);

  const totals = useMemo(() => ({
    total: customersWithStats.filter((c) => c.isActive).length,
    vip: customersWithStats.filter((c) => c.customerType === "vip" && c.isActive).length,
    withBalance: customersWithStats.filter((c) => c.outstandingBalance > 0 && c.isActive).length,
    totalRevenue: customersWithStats.filter((c) => c.isActive).reduce((s, c) => s + c.totalSpent, 0),
  }), [customersWithStats]);

  return {
    customers: filtered,
    loading,
    search, setSearch,
    typeFilter, setTypeFilter,
    balanceFilter, setBalanceFilter,
    showArchived, setShowArchived,
    getCustomer,
    addNote,
    updateCustomer,
    removeCustomer,
    restoreCustomer,
    totals,
    refetch: loadData,
  };
}

function toast_offline() {
  // Lazy import to avoid circular deps
  import("sonner").then(({ toast }) => {
    toast.info("This action requires internet connection. Changes will sync when online.");
  });
}
