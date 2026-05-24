import type { PaymentMethod, PaymentStatus } from "@/types/pos";
import { motion, AnimatePresence } from "framer-motion";
import { formatOMR } from "@/lib/currency";

interface Props {
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  onDiscountChange: (v: number) => void;
  onPaidAmountChange: (v: number) => void;
  onPaymentMethodChange: (v: PaymentMethod) => void;
  loyaltySlot?: React.ReactNode;
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank-transfer", label: "Transfer" },
  { id: "partial", label: "Partial" },
  { id: "pay-later", label: "Pay Later" },
];

const statusColors: Record<PaymentStatus, string> = {
  unpaid: "bg-destructive/10 text-destructive",
  "partially-paid": "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
};

export default function PricingSummary(props: Props) {
  const {
    subtotal, discount, total, paidAmount, remainingBalance,
    paymentStatus, paymentMethod,
    onDiscountChange, onPaidAmountChange, onPaymentMethodChange,
    loyaltySlot,
  } = props;

  return (
    <div className="pos-section space-y-4">
      <h2 className="pos-label">Payment</h2>

      {/* Payment Method */}
      <div className="grid grid-cols-3 gap-1.5">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => onPaymentMethodChange(m.id)}
            className={`h-9 rounded-md text-xs font-medium transition-all duration-[120ms] border ${
              paymentMethod === m.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-foreground hover:bg-secondary"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Pricing breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatOMR(subtotal)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Discount</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={discount || ""}
            onChange={(e) => onDiscountChange(Number(e.target.value))}
            placeholder="0.000"
            className="pos-input w-24 text-right text-sm h-8"
          />
        </div>
        {loyaltySlot}
        <div className="h-px bg-border" />
        <div className="flex justify-between items-center">
          <span className="font-semibold">Total</span>
          <motion.span
            key={total}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="pos-total text-primary"
          >
            {formatOMR(total)}
          </motion.span>
        </div>
      </div>

      {/* Paid amount */}
      <AnimatePresence>
        {(paymentMethod === "partial" || paymentMethod === "cash" || paymentMethod === "card" || paymentMethod === "bank-transfer") && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Paid Amount</span>
              <input
                type="number"
                min={0}
                step={1}
                value={paidAmount || ""}
                onChange={(e) => onPaidAmountChange(Number(e.target.value))}
                placeholder="0.000"
                className="pos-input w-24 text-right text-sm h-8"
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-medium">{formatOMR(remainingBalance)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Badge */}
      <div className="flex justify-center">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${statusColors[paymentStatus]}`}>
          {paymentStatus.replace("-", " ")}
        </span>
      </div>
    </div>
  );
}
