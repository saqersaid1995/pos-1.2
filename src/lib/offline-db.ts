import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface OfflineSyncAction {
  id: string;
  actionType: "create_order" | "update_order_status" | "collect_payment" | "add_note";
  localId: string;
  payload: any;
  createdAt: string;
  syncStatus: "pending" | "synced" | "failed";
  errorMessage?: string;
}

export interface CachedCustomer {
  id: string;
  full_name: string;
  phone_number: string;
  customer_type: string;
  is_active: boolean;
  cachedAt: string;
}

export interface CachedItem {
  id: string;
  item_name: string;
  item_name_ar: string | null;
  image_url: string | null;
  show_in_quick_add: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface CachedService {
  id: string;
  service_name: string;
  is_active: boolean;
}

export interface CachedPricing {
  id: string;
  item_type: string;
  service_type: string;
  price: number;
  is_default_service: boolean;
  item_id: string | null;
  service_id: string | null;
  is_active: boolean;
}

export interface OfflineOrder {
  localId: string;
  cloudId?: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderDate: string;
  deliveryDate: string;
  orderType: string;
  pickupMethod: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  urgentFee: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  remainingBalance: number;
  orderNotes: string;
  items: any[];
  currentStatus: string;
  createdAt: string;
  synced: boolean;
}

interface LaundryOfflineDB extends DBSchema {
  syncQueue: {
    key: string;
    value: OfflineSyncAction;
    indexes: { "by-status": string };
  };
  customers: {
    key: string;
    value: CachedCustomer;
    indexes: { "by-phone": string };
  };
  items: {
    key: string;
    value: CachedItem;
  };
  services: {
    key: string;
    value: CachedService;
  };
  pricing: {
    key: string;
    value: CachedPricing;
  };
  offlineOrders: {
    key: string;
    value: OfflineOrder;
    indexes: { "by-synced": number };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

let dbInstance: IDBPDatabase<LaundryOfflineDB> | null = null;

export async function getOfflineDB(): Promise<IDBPDatabase<LaundryOfflineDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<LaundryOfflineDB>("lavinderia-offline", 1, {
    upgrade(db) {
      const syncStore = db.createObjectStore("syncQueue", { keyPath: "id" });
      syncStore.createIndex("by-status", "syncStatus");

      const custStore = db.createObjectStore("customers", { keyPath: "id" });
      custStore.createIndex("by-phone", "phone_number");

      db.createObjectStore("items", { keyPath: "id" });
      db.createObjectStore("services", { keyPath: "id" });
      db.createObjectStore("pricing", { keyPath: "id" });

      const orderStore = db.createObjectStore("offlineOrders", { keyPath: "localId" });
      orderStore.createIndex("by-synced", "synced");

      db.createObjectStore("meta", { keyPath: "key" });
    },
  });

  return dbInstance;
}

// Generate a local ID for offline records
export function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// ── Sync Queue Operations ──

export async function addToSyncQueue(action: Omit<OfflineSyncAction, "id" | "createdAt" | "syncStatus">) {
  const db = await getOfflineDB();
  const entry: OfflineSyncAction = {
    ...action,
    id: generateLocalId(),
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await db.put("syncQueue", entry);
  return entry;
}

export async function getPendingSyncActions(): Promise<OfflineSyncAction[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex("syncQueue", "by-status", "pending");
}

export async function markSyncActionComplete(id: string) {
  const db = await getOfflineDB();
  const action = await db.get("syncQueue", id);
  if (action) {
    action.syncStatus = "synced";
    await db.put("syncQueue", action);
  }
}

export async function markSyncActionFailed(id: string, errorMessage: string) {
  const db = await getOfflineDB();
  const action = await db.get("syncQueue", id);
  if (action) {
    action.syncStatus = "failed";
    action.errorMessage = errorMessage;
    await db.put("syncQueue", action);
  }
}

export async function clearSyncedActions() {
  const db = await getOfflineDB();
  const synced = await db.getAllFromIndex("syncQueue", "by-status", "synced");
  const tx = db.transaction("syncQueue", "readwrite");
  for (const item of synced) {
    await tx.store.delete(item.id);
  }
  await tx.done;
}

// ── Cache Operations ──

export async function cacheCustomers(customers: CachedCustomer[]) {
  const db = await getOfflineDB();
  const tx = db.transaction("customers", "readwrite");
  await tx.store.clear();
  for (const c of customers) {
    await tx.store.put({ ...c, cachedAt: new Date().toISOString() });
  }
  await tx.done;
  await setMeta("customers_cached_at", new Date().toISOString());
}

export async function getCachedCustomers(): Promise<CachedCustomer[]> {
  const db = await getOfflineDB();
  return db.getAll("customers");
}

export async function getCachedCustomerByPhone(phone: string): Promise<CachedCustomer | undefined> {
  const db = await getOfflineDB();
  return db.getFromIndex("customers", "by-phone", phone);
}

export async function cacheItems(items: CachedItem[]) {
  const db = await getOfflineDB();
  const tx = db.transaction("items", "readwrite");
  await tx.store.clear();
  for (const item of items) await tx.store.put(item);
  await tx.done;
  await setMeta("items_cached_at", new Date().toISOString());
}

export async function getCachedItems(): Promise<CachedItem[]> {
  const db = await getOfflineDB();
  return db.getAll("items");
}

export async function cacheServices(services: CachedService[]) {
  const db = await getOfflineDB();
  const tx = db.transaction("services", "readwrite");
  await tx.store.clear();
  for (const s of services) await tx.store.put(s);
  await tx.done;
  await setMeta("services_cached_at", new Date().toISOString());
}

export async function getCachedServices(): Promise<CachedService[]> {
  const db = await getOfflineDB();
  return db.getAll("services");
}

export async function cachePricing(pricing: CachedPricing[]) {
  const db = await getOfflineDB();
  const tx = db.transaction("pricing", "readwrite");
  await tx.store.clear();
  for (const p of pricing) await tx.store.put(p);
  await tx.done;
  await setMeta("pricing_cached_at", new Date().toISOString());
}

export async function getCachedPricing(): Promise<CachedPricing[]> {
  const db = await getOfflineDB();
  return db.getAll("pricing");
}

// ── Offline Orders ──

export async function saveOfflineOrder(order: OfflineOrder) {
  const db = await getOfflineDB();
  await db.put("offlineOrders", order);
}

export async function getUnsyncedOrders(): Promise<OfflineOrder[]> {
  const db = await getOfflineDB();
  const all = await db.getAll("offlineOrders");
  return all.filter((o) => !o.synced);
}

export async function markOrderSynced(localId: string, cloudId: string) {
  const db = await getOfflineDB();
  const order = await db.get("offlineOrders", localId);
  if (order) {
    order.synced = true;
    order.cloudId = cloudId;
    await db.put("offlineOrders", order);
  }
}

export async function getAllOfflineOrders(): Promise<OfflineOrder[]> {
  const db = await getOfflineDB();
  return db.getAll("offlineOrders");
}

export async function updateOfflineOrderStatus(localId: string, newStatus: string) {
  const db = await getOfflineDB();
  const order = await db.get("offlineOrders", localId);
  if (order) {
    order.currentStatus = newStatus;
    await db.put("offlineOrders", order);
  }
}

// ── Meta ──

export async function setMeta(key: string, value: string) {
  const db = await getOfflineDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getOfflineDB();
  const entry = await db.get("meta", key);
  return entry?.value;
}
