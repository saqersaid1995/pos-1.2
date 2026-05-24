import type { WorkflowOrder } from "./workflow";

export type CustomerType = "regular" | "vip";

export interface CustomerNote {
  id: string;
  customerId: string;
  text: string;
  createdAt: string;
  createdBy?: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  customerType: CustomerType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  notes: CustomerNote[];
}

export interface CustomerWithStats extends CustomerRecord {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  totalSpent: number;
  totalPaid: number;
  outstandingBalance: number;
  unpaidOrderCount: number;
  partiallyPaidOrderCount: number;
  lastOrderDate: string | null;
  orders: WorkflowOrder[];
}
