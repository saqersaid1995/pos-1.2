import { useState, useCallback, useMemo, useEffect } from "react";
import { toLocalDateStr } from "@/lib/utils";
import type { WorkflowOrder, WorkflowStatus } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { fetchAllOrders, updateOrderStatus, addInternalNote, toggleOrderUrgent, softDeleteOrder } from "@/lib/supabase-queries";
import { sendReadyForPickupWhatsApp } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { getUnsyncedOrders, getAllOfflineOrders, updateOfflineOrderStatus, addToSyncQueue, generateLocalId, type OfflineOrder } from "@/lib/offline-db";
import { toast } from "sonner";

export interface WorkflowFilters {
  search: string;
  status: WorkflowStatus | "all";
  orderType: "all" | "regular" | "urgent";
  paymentStatus: "all" | "unpaid" | "partially-paid" | "paid";
  dateFilter: "all" | "today" | "overdue";
}

const initialFilters: WorkflowFilters = {
  search: "",
  status: "all",
  orderType: "all",
  paymentStatus: "all",
  dateFilter: "all",
};

function offlineOrderToWorkflow(o: OfflineOrder): WorkflowOrder {
  const items = (o.items || []).map((item: any) => ({
    itemType: item.itemType || "",
    service: item.serviceId || "",
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice || 0,
    notes: item.notes,
    conditions: item.conditions || [],
  }));

  return {
    id: o.localId,
    orderNumber: o.orderNumber,
    customerName: o.customerName || "Walk-in",
    customerPhone: o.customerPhone || "",
    orderDate: o.orderDate,
    deliveryDate: o.deliveryDate || "",
    orderType: (o.orderType as "regular" | "urgent") || "regular",
    pickupMethod: (o.pickupMethod as "walk-in" | "delivery" | "app") || "walk-in",
    paymentStatus: (o.paymentStatus as "unpaid" | "partially-paid" | "paid") || "unpaid",
    paymentMethod: o.paymentMethod || "cash",
    subtotal: o.subtotal ?? o.total,
    discount: o.discount ?? 0,
    totalAmount: o.total,
    paidAmount: o.paidAmount,
    remainingBalance: o.remainingBalance,
    itemCount: items.reduce((s: number, i: any) => s + i.quantity, 0),
    items,
    currentStatus: (o.currentStatus as WorkflowStatus) || "received",
    statusUpdatedAt: o.createdAt,
    orderNotes: o.orderNotes || undefined,
    statusHistory: [],
    internalNotes: [],
    paymentHistory: [],
  };
}

export function useWorkflowState() {
  const [orders, setOrders] = useState<WorkflowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<WorkflowFilters>(initialFilters);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const today = toLocalDateStr();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (navigator.onLine) {
        const cloudOrders = await fetchAllOrders();
        // Also merge any unsynced offline orders
        const offlineOrders = await getUnsyncedOrders();
        const offlineWorkflow = offlineOrders.map(offlineOrderToWorkflow);
        // Avoid duplicates (offline orders that haven't synced yet)
        const cloudIds = new Set(cloudOrders.map((o) => o.orderNumber));
        const uniqueOffline = offlineWorkflow.filter((o) => !cloudIds.has(o.orderNumber));
        setOrders([...uniqueOffline, ...cloudOrders]);
      } else {
        // Offline: load all offline orders from IndexedDB
        const allOffline = await getAllOfflineOrders();
        setOrders(allOffline.map(offlineOrderToWorkflow));
      }
    } catch (err) {
      console.error("loadOrders error, falling back to offline:", err);
      try {
        const allOffline = await getAllOfflineOrders();
        setOrders(allOffline.map(offlineOrderToWorkflow));
      } catch {
        setOrders([]);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const updateFilter = useCallback(<K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(initialFilters), []);

  const moveOrder = useCallback(async (orderId: string, toStatus: WorkflowStatus, changedBy?: string): Promise<{ whatsappResult?: { success: boolean; status: string; error?: string } }> => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return {};

    const fromStatus = order.currentStatus;

    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          currentStatus: toStatus,
          statusUpdatedAt: new Date().toISOString(),
          statusHistory: [
            ...o.statusHistory,
            {
              id: Math.random().toString(36).substring(2, 10),
              orderId,
              fromStatus: o.currentStatus,
              toStatus,
              changedAt: new Date().toISOString(),
              changedBy,
            },
          ],
        };
      })
    );

    if (!navigator.onLine) {
      // Offline: update local order and queue sync action
      const isLocalOrder = orderId.startsWith("local-");
      if (isLocalOrder) {
        await updateOfflineOrderStatus(orderId, toStatus);
      } else {
        await addToSyncQueue({
          actionType: "update_order_status",
          localId: generateLocalId(),
          payload: { orderId, fromStatus, toStatus },
        });
      }
      return {};
    }

    await updateOrderStatus(orderId, fromStatus, toStatus, changedBy);

    // Trigger WhatsApp when moving from received → ready-for-pickup
    let whatsappResult: { success: boolean; status: string; error?: string } | undefined;
    if (fromStatus === "received" && toStatus === "ready-for-pickup") {
      const { data: orderData } = await supabase
        .from("orders")
        .select("ready_pickup_whatsapp_sent, customer_id")
        .eq("id", orderId)
        .maybeSingle();

      if (orderData && !orderData.ready_pickup_whatsapp_sent) {
        whatsappResult = await sendReadyForPickupWhatsApp({
          orderId,
          customerId: orderData.customer_id,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          remainingAmount: order.remainingBalance,
        });
      }
    }

    return { whatsappResult };
  }, [orders]);

  const moveToNext = useCallback(async (orderId: string, changedBy?: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return {};
    const idx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
    if (idx < WORKFLOW_STAGES.length - 1) {
      return await moveOrder(orderId, WORKFLOW_STAGES[idx + 1].id, changedBy);
    }
    return {};
  }, [orders, moveOrder]);

  const moveToPrev = useCallback(async (orderId: string, changedBy?: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const idx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
    if (idx > 0) {
      await moveOrder(orderId, WORKFLOW_STAGES[idx - 1].id, changedBy);
    }
  }, [orders, moveOrder]);

  const addNote = useCallback(async (orderId: string, text: string, createdBy?: string) => {
    // Optimistic update
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              internalNotes: [
                ...order.internalNotes,
                {
                  id: Math.random().toString(36).substring(2, 10),
                  orderId,
                  text,
                  createdAt: new Date().toISOString(),
                  createdBy,
                },
              ],
            }
          : order
      )
    );

    if (!navigator.onLine) {
      await addToSyncQueue({
        actionType: "add_note",
        localId: generateLocalId(),
        payload: { orderId, text, createdBy },
      });
      return;
    }

    await addInternalNote(orderId, text, createdBy);
  }, []);

  const toggleUrgent = useCallback(async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, orderType: o.orderType === "urgent" ? "regular" : "urgent" }
          : o
      )
    );

    if (!navigator.onLine) {
      toast.info("Urgent toggle will sync when online.");
      return;
    }

    await toggleOrderUrgent(orderId, order.orderType);
  }, [orders]);

  const deleteOrder = useCallback(async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (!navigator.onLine) {
      toast.info("Delete will sync when online.");
      return;
    }
    await softDeleteOrder(orderId);
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const match =
          order.orderNumber.toLowerCase().includes(s) ||
          order.customerName.toLowerCase().includes(s) ||
          order.customerPhone.includes(s);
        if (!match) return false;
      }
      if (filters.status !== "all" && order.currentStatus !== filters.status) return false;
      if (filters.orderType !== "all" && order.orderType !== filters.orderType) return false;
      if (filters.paymentStatus !== "all" && order.paymentStatus !== filters.paymentStatus) return false;
      if (filters.dateFilter === "today" && order.orderDate !== today) return false;
      if (filters.dateFilter === "overdue" && order.deliveryDate >= today) return false;
      return true;
    });
  }, [orders, filters, today]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { total: 0, urgent: 0 };
    WORKFLOW_STAGES.forEach((s) => (counts[s.id] = 0));
    orders.forEach((o) => {
      if (o.currentStatus !== "delivered") counts.total++;
      counts[o.currentStatus] = (counts[o.currentStatus] || 0) + 1;
      if (o.orderType === "urgent" && o.currentStatus !== "delivered") counts.urgent++;
    });
    return counts;
  }, [orders]);

  const ordersByStatus = useMemo(() => {
    const map: Record<WorkflowStatus, WorkflowOrder[]> = {
      received: [], "ready-for-pickup": [], delivered: [],
    };
    filteredOrders.forEach((o) => {
      map[o.currentStatus].push(o);
    });
    Object.keys(map).forEach((key) => {
      map[key as WorkflowStatus].sort((a, b) => {
        if (a.orderType === "urgent" && b.orderType !== "urgent") return -1;
        if (a.orderType !== "urgent" && b.orderType === "urgent") return 1;
        return 0;
      });
    });
    return map;
  }, [filteredOrders]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  return {
    orders,
    loading,
    filters,
    updateFilter,
    resetFilters,
    filteredOrders,
    ordersByStatus,
    statusCounts,
    moveOrder,
    moveToNext,
    moveToPrev,
    addNote,
    toggleUrgent,
    deleteOrder,
    selectedOrder,
    selectedOrderId,
    setSelectedOrderId,
    refetch: loadOrders,
  };
}
