import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  getPendingSyncActions,
  getUnsyncedOrders,
  getMeta,
  setMeta,
  markSyncActionComplete,
  markSyncActionFailed,
  markOrderSynced,
  clearSyncedActions,
  type OfflineSyncAction,
} from "@/lib/offline-db";
import { createOrder, updateOrderStatus, addInternalNote } from "@/lib/supabase-queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NetworkContextType {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const [actions, orders] = await Promise.all([
        getPendingSyncActions(),
        getUnsyncedOrders(),
      ]);
      setPendingCount(actions.length + orders.length);
      const syncTime = await getMeta("last_sync_time");
      setLastSyncTime(syncTime || null);
    } catch {
      // IndexedDB may not be available
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 5000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    let synced = 0;
    let failed = 0;

    try {
      // 1. Sync offline orders
      const unsyncedOrders = await getUnsyncedOrders();
      for (const order of unsyncedOrders) {
        try {
          const result = await createOrder({
            customerId: null,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            orderNumber: order.orderNumber,
            orderDate: order.orderDate,
            deliveryDate: order.deliveryDate,
            orderType: order.orderType,
            pickupMethod: order.pickupMethod,
            employeeId: "",
            orderNotes: order.orderNotes,
            items: order.items,
            subtotal: order.subtotal,
            urgentFee: order.urgentFee,
            discount: order.discount,
            tax: order.tax,
            total: order.total,
            paidAmount: order.paidAmount,
            remainingBalance: order.remainingBalance,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
          });
          if (result.success && result.orderId) {
            await markOrderSynced(order.localId, result.orderId);
            synced++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      // 2. Sync queued actions
      const pendingActions = await getPendingSyncActions();
      for (const action of pendingActions) {
        try {
          await processSyncAction(action);
          await markSyncActionComplete(action.id);
          synced++;
        } catch (err: any) {
          await markSyncActionFailed(action.id, err?.message || "Unknown error");
          failed++;
        }
      }

      await clearSyncedActions();
      await setMeta("last_sync_time", new Date().toISOString());
      setLastSyncTime(new Date().toISOString());

      if (synced > 0) toast.success(`Synced ${synced} changes to cloud`);
      if (failed > 0) toast.warning(`${failed} changes failed to sync`);
      if (synced === 0 && failed === 0) toast.info("Everything is up to date");
    } catch (err) {
      toast.error("Sync failed. Please try again.");
      console.error("Sync error:", err);
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isSyncing, refreshPendingCount]);

  return (
    <NetworkContext.Provider value={{ isOnline, pendingCount, lastSyncTime, isSyncing, syncNow, refreshPendingCount }}>
      {children}
    </NetworkContext.Provider>
  );
}

async function processSyncAction(action: OfflineSyncAction) {
  switch (action.actionType) {
    case "update_order_status": {
      const { orderId, fromStatus, toStatus } = action.payload;
      await updateOrderStatus(orderId, fromStatus, toStatus);
      break;
    }
    case "collect_payment": {
      const { orderId, amount, paymentMethod } = action.payload;
      await supabase.from("payments").insert({
        order_id: orderId,
        amount,
        payment_method: paymentMethod,
      });
      // Update order payment fields
      const { data: order } = await supabase.from("orders").select("paid_amount, total_amount").eq("id", orderId).maybeSingle();
      if (order) {
        const newPaid = Number(order.paid_amount) + amount;
        const remaining = Math.max(0, Number(order.total_amount) - newPaid);
        const status = remaining <= 0 ? "paid" : newPaid > 0 ? "partially-paid" : "unpaid";
        await supabase.from("orders").update({
          paid_amount: newPaid,
          remaining_amount: remaining,
          payment_status: status,
        }).eq("id", orderId);
      }
      break;
    }
    case "add_note": {
      const { orderId, text, createdBy } = action.payload;
      await addInternalNote(orderId, text, createdBy);
      break;
    }
    default:
      console.warn("Unknown sync action type:", action.actionType);
  }
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error("useNetwork must be used within NetworkProvider");
  return context;
}
