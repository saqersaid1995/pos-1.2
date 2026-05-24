export interface Customer {
  id: string;
  phone: string;
  name: string;
  notes?: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
}

export interface GarmentCondition {
  id: string;
  label: string;
}

export interface OrderItem {
  id: string;
  itemType: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  defaultPrice?: number;
  isManualPriceOverride?: boolean;
  isDefaultServiceSelected?: boolean;
  color?: string;
  brand?: string;
  notes?: string;
  conditions: string[];
}

export type OrderType = "regular" | "urgent";
export type PickupMethod = "walk-in" | "delivery" | "app";
export type PaymentMethod = "cash" | "card" | "bank-transfer" | "partial" | "pay-later";
export type PaymentStatus = "unpaid" | "partially-paid" | "paid";

export interface Order {
  id: string;
  orderNumber: string;
  customerId?: string;
  customerPhone: string;
  customerName: string;
  orderDate: string;
  deliveryDate: string;
  orderType: OrderType;
  pickupMethod: PickupMethod;
  employeeId?: string;
  orderNotes?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  urgentFee: number;
  total: number;
  paidAmount: number;
  remainingBalance: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

// SERVICES and ITEM_TYPES are now loaded dynamically from the database.
// See the `items` and `services` tables.

export const GARMENT_CONDITIONS: GarmentCondition[] = [
  { id: "stain", label: "Stain Present" },
  { id: "old", label: "Old Garment" },
  { id: "sensitive", label: "Sensitive Fabric" },
  { id: "shrink", label: "May Shrink" },
  { id: "special-care", label: "Requires Special Care" },
  { id: "damaged-button", label: "Damaged Button" },
  { id: "broken-zipper", label: "Broken Zipper" },
];

export const EMPLOYEES = [
  { id: "1", name: "Ahmad" },
  { id: "2", name: "Fatima" },
  { id: "3", name: "Omar" },
];
