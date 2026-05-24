export type WorkflowStatus =
  | "received"
  | "ready-for-pickup"
  | "delivered";

export const WORKFLOW_STAGES: { id: WorkflowStatus; label: string; icon: string }[] = [
  { id: "received", label: "Received", icon: "inbox" },
  { id: "ready-for-pickup", label: "Ready for Pickup", icon: "package-check" },
  { id: "delivered", label: "Delivered", icon: "truck" },
];

export interface StatusChange {
  id: string;
  orderId: string;
  fromStatus: WorkflowStatus | null;
  toStatus: WorkflowStatus;
  changedAt: string;
  changedBy?: string;
}

export interface InternalNote {
  id: string;
  orderId: string;
  text: string;
  createdAt: string;
  createdBy?: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
}

export interface WorkflowOrder {
  id: string;
  customerId?: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderDate: string;
  deliveryDate: string;
  orderType: "regular" | "urgent";
  pickupMethod: "walk-in" | "delivery" | "app";
  paymentStatus: "unpaid" | "partially-paid" | "paid";
  paymentMethod: string;
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  itemCount: number;
  items: {
    itemType: string;
    service: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    conditions: string[];
  }[];
  currentStatus: WorkflowStatus;
  statusUpdatedAt: string;
  orderNotes?: string;
  statusHistory: StatusChange[];
  internalNotes: InternalNote[];
  paymentHistory: PaymentRecord[];
}
