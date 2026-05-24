import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, Building } from "lucide-react";
import { formatOMR } from "@/lib/currency";

interface MixedPaymentInputProps {
  cashAmount: string;
  cardAmount: string;
  transferAmount: string;
  onCashChange: (v: string) => void;
  onCardChange: (v: string) => void;
  onTransferChange: (v: string) => void;
  remainingBalance: number;
}

export default function MixedPaymentInput({
  cashAmount, cardAmount, transferAmount,
  onCashChange, onCardChange, onTransferChange,
  remainingBalance,
}: MixedPaymentInputProps) {
  const total = (parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(transferAmount) || 0);
  const afterPayment = Math.max(0, remainingBalance - total);
  const isOver = total > remainingBalance + 0.0005;

  const fillRemaining = () => {
    const current = (parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(transferAmount) || 0);
    const gap = Math.max(0, remainingBalance - current);
    if (gap > 0) onCashChange((parseFloat(cashAmount || "0") + gap).toFixed(3));
  };

  const fillFull = () => {
    onCashChange(remainingBalance.toFixed(3));
    onCardChange("");
    onTransferChange("");
  };

  const fields = [
    { label: "Cash", icon: Banknote, value: cashAmount, onChange: onCashChange },
    { label: "Card", icon: CreditCard, value: cardAmount, onChange: onCardChange },
    { label: "Transfer", icon: Building, value: transferAmount, onChange: onTransferChange },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={fillFull}>
          Pay Full Amount
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={fillRemaining}>
          Fill Remaining
        </Button>
      </div>

      {fields.map((f) => {
        const Icon = f.icon;
        return (
          <div key={f.label} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" /> {f.label}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-xs">OMR</span>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                placeholder="0.000"
                className="pl-12 font-semibold h-9"
              />
            </div>
          </div>
        );
      })}

      <div className="bg-secondary/50 rounded-lg p-2.5 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Payment</span>
          <span className="font-semibold">{formatOMR(total)}</span>
        </div>
        <div className={`flex justify-between font-semibold ${isOver ? "text-destructive" : afterPayment > 0 ? "text-warning" : "text-primary"}`}>
          <span>Remaining After</span>
          <span>{isOver ? "Overpayment!" : formatOMR(afterPayment)}</span>
        </div>
      </div>
    </div>
  );
}

export function getMixedTotal(cash: string, card: string, transfer: string): number {
  return (parseFloat(cash) || 0) + (parseFloat(card) || 0) + (parseFloat(transfer) || 0);
}

export function getMixedPayments(cash: string, card: string, transfer: string): Array<{ method: string; amount: number }> {
  const payments: Array<{ method: string; amount: number }> = [];
  const c = parseFloat(cash) || 0;
  const d = parseFloat(card) || 0;
  const t = parseFloat(transfer) || 0;
  if (c > 0) payments.push({ method: "cash", amount: c });
  if (d > 0) payments.push({ method: "card", amount: d });
  if (t > 0) payments.push({ method: "bank-transfer", amount: t });
  return payments;
}
