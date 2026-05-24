import { useState, useCallback, useRef } from "react";
import type { OrderItem, OrderType, PickupMethod, PaymentMethod, PaymentStatus } from "@/types/pos";
import { generateOrderNumber, createOrder, fetchCustomerByPhone } from "@/lib/supabase-queries";
import { toLocalDateStr } from "@/lib/utils";
import type { CustomerRecord } from "@/types/customer";
import { saveOfflineOrder, addToSyncQueue, generateLocalId, getCachedCustomerByPhone } from "@/lib/offline-db";
import { supabase } from "@/integrations/supabase/client";

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}


export function usePOSState() {
  // Customer
  const [customerPhone, setCustomerPhoneRaw] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState<CustomerRecord | null>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);

  // Order details
  const [orderNumber, setOrderNumber] = useState(generateOrderNumber);
  const [orderDate] = useState(() => toLocalDateStr());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [orderType, setOrderTypeRaw] = useState<OrderType>("regular");
  const [pickupMethod, setPickupMethod] = useState<PickupMethod>("walk-in");

  // Keep a ref to pricing rules for order type switching
  const pricingRulesRef = useRef<Array<{ item_type: string; service_type: string; price: number; urgent_price: number | null }>>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  // Items
  const [items, setItems] = useState<OrderItem[]>([]);

  // Payment
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay-later");
  const [paidAmount, setPaidAmount] = useState(0);

  // Invoice & saving
  const [showInvoice, setShowInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  // Customer search - async
  const searchCustomer = useCallback(async (phone: string) => {
    setCustomerPhoneRaw(phone);
    if (phone.length >= 4) {
      if (navigator.onLine) {
        const found = await fetchCustomerByPhone(phone);
        if (found) {
          setMatchedCustomer(found);
          setMatchedCustomerId(found.id);
          setCustomerName(found.name);
          setCustomerNotes(found.notes?.[0]?.text || "");
        } else {
          setMatchedCustomer(null);
          setMatchedCustomerId(null);
        }
      } else {
        // Offline: search cached customers
        const cached = await getCachedCustomerByPhone(phone);
        if (cached) {
          setMatchedCustomer({
            id: cached.id,
            name: cached.full_name,
            phone: cached.phone_number,
            customerType: cached.customer_type.toLowerCase() as "regular" | "vip",
            isActive: cached.is_active,
            createdAt: "",
            updatedAt: "",
            notes: [],
          });
          setMatchedCustomerId(cached.id);
          setCustomerName(cached.full_name);
        } else {
          setMatchedCustomer(null);
          setMatchedCustomerId(null);
        }
      }
    } else {
      setMatchedCustomer(null);
      setMatchedCustomerId(null);
    }
  }, []);

  // Item management
  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        id: generateId(),
        itemType: "",
        serviceId: "",
        quantity: 1,
        unitPrice: 0,
        conditions: [],
      },
    ]);
  }, []);

  const addItemWithDefaults = useCallback((itemType: string, serviceId: string, price: number) => {
    setItems((prev) => [
      ...prev,
      {
        id: generateId(),
        itemType,
        serviceId,
        quantity: 1,
        unitPrice: price,
        defaultPrice: price,
        isDefaultServiceSelected: true,
        conditions: [],
      },
    ]);
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<OrderItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, ...updates };
      })
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Recalculate all item prices when order type changes
  const setOrderType = useCallback(async (newType: OrderType) => {
    setOrderTypeRaw(newType);
    // Fetch pricing rules if not cached
    if (pricingRulesRef.current.length === 0 && navigator.onLine) {
      const { data } = await supabase
        .from("service_pricing")
        .select("item_type, service_type, price, urgent_price")
        .eq("is_active", true);
      if (data) pricingRulesRef.current = data as typeof pricingRulesRef.current;
    }
    const rules = pricingRulesRef.current;
    if (rules.length === 0) return;

    setItems((prev) =>
      prev.map((item) => {
        if (item.isManualPriceOverride) return item; // Don't override manual prices
        const rule = rules.find((r) => r.item_type === item.itemType && r.service_type === item.serviceId);
        if (!rule) return item;
        const effectivePrice = newType === "urgent" && rule.urgent_price != null ? rule.urgent_price : rule.price;
        return { ...item, unitPrice: effectivePrice, defaultPrice: effectivePrice };
      })
    );
  }, []);

  // Calculations — no global urgent multiplier; prices are per-item
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const urgentFee = 0; // kept for API compatibility but no longer used
  const total = Math.max(0, subtotal - discount);
  const remainingBalance = Math.max(0, total - paidAmount);

  const paymentStatus: PaymentStatus =
    paidAmount >= total && total > 0 ? "paid" : paidAmount > 0 ? "partially-paid" : "unpaid";

  // Save to Supabase (or offline)
  const saveOrder = useCallback(async () => {
    if (items.length === 0) return { success: false, error: "No items" };
    if (!customerPhone.trim()) {
      return { success: false, error: "Customer phone number is required" };
    }

    // Default customer name to phone number if empty
    const effectiveName = customerName.trim() || customerPhone.trim();

    setSaving(true);
    try {
      const orderItems = items.map((item) => ({
        itemType: item.itemType,
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        color: item.color,
        brand: item.brand,
        notes: item.notes,
        conditions: item.conditions,
      }));

      if (!navigator.onLine) {
        // Save offline
        const localId = generateLocalId();
        await saveOfflineOrder({
          localId,
          orderNumber,
          customerName: effectiveName,
          customerPhone: customerPhone.trim(),
          orderDate,
          deliveryDate,
          orderType,
          pickupMethod,
          paymentStatus,
          paymentMethod,
          subtotal,
          urgentFee,
          discount,
          tax: 0,
          total,
          paidAmount,
          remainingBalance,
          orderNotes,
          items: orderItems,
          currentStatus: "received",
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { success: true, orderId: localId };
      }

      const result = await createOrder({
        customerId: matchedCustomerId,
        customerName: effectiveName,
        customerPhone: customerPhone.trim(),
        orderNumber,
        orderDate,
        deliveryDate,
        orderType,
        pickupMethod,
        employeeId,
        orderNotes,
        items: orderItems,
        subtotal,
        urgentFee,
        discount,
        tax: 0,
        total,
        paidAmount,
        remainingBalance,
        paymentMethod,
        paymentStatus,
      });
      return result;
    } finally {
      setSaving(false);
    }
  }, [
    items, customerName, customerPhone, matchedCustomerId,
    orderNumber, orderDate, deliveryDate, orderType, pickupMethod,
    employeeId, orderNotes, subtotal, urgentFee, discount,
    total, paidAmount, remainingBalance, paymentMethod, paymentStatus,
  ]);

  const clearForm = useCallback(() => {
    setCustomerPhoneRaw("");
    setCustomerName("");
    setCustomerNotes("");
    setMatchedCustomer(null);
    setMatchedCustomerId(null);
    setDeliveryDate("");
    setOrderTypeRaw("regular");
    setPickupMethod("walk-in");
    setEmployeeId("");
    setOrderNotes("");
    setItems([]);
    setDiscount(0);
    setPaymentMethod("pay-later");
    setPaidAmount(0);
    setShowInvoice(false);
    setOrderNumber(generateOrderNumber());
  }, []);

  return {
    // Customer
    customerPhone, customerName, customerNotes, matchedCustomer,
    setCustomerPhone: searchCustomer, setCustomerName, setCustomerNotes,
    // Order
    orderNumber, orderDate, deliveryDate, setDeliveryDate,
    orderType, setOrderType, pickupMethod, setPickupMethod,
    employeeId, setEmployeeId, orderNotes, setOrderNotes,
    // Items
    items, addItem, addItemWithDefaults, updateItem, removeItem,
    // Pricing
    subtotal, urgentFee, discount, setDiscount, total,
    paidAmount, setPaidAmount, remainingBalance, paymentStatus,
    // Payment
    paymentMethod, setPaymentMethod,
    // Invoice
    showInvoice, setShowInvoice,
    // Actions
    saveOrder, saving, clearForm,
  };
}
