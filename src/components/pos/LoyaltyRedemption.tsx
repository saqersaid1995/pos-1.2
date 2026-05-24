import { useState, useEffect } from "react";
import { Gift, Loader2 } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { fetchLoyaltyBalance } from "@/lib/loyalty-balance";
import type { LoyaltySettings } from "@/hooks/useLoyaltySettings";

interface Props {
  customerId: string | null;
  orderTotal: number;
  loyaltySettings: LoyaltySettings;
  loyaltyDiscount: number;
  onLoyaltyDiscountChange: (amount: number) => void;
}

export default function LoyaltyRedemption({
  customerId,
  orderTotal,
  loyaltySettings,
  loyaltyDiscount,
  onLoyaltyDiscountChange,
}: Props) {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId || !loyaltySettings.is_enabled) {
      setBalance(0);
      onLoyaltyDiscountChange(0);
      return;
    }
    setLoading(true);
    fetchLoyaltyBalance(customerId).then((b) => {
      setBalance(b.available);
      setLoading(false);
    });
  }, [customerId, loyaltySettings.is_enabled]);

  if (!loyaltySettings.is_enabled || !customerId) return null;

  const meetsMinimum = balance >= loyaltySettings.min_redeem_points;
  const maxRedeemOMR = (orderTotal * loyaltySettings.max_redemption_percent) / 100;
  const maxRedeemFromPoints = balance / loyaltySettings.redeem_points_rate;
  const maxDiscount = meetsMinimum ? Math.min(maxRedeemOMR, maxRedeemFromPoints) : 0;
  const pointsUsed = loyaltyDiscount * loyaltySettings.redeem_points_rate;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading loyalty...
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-md border border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Gift className="w-3.5 h-3.5" />
          Loyalty Points
        </div>
        <span className="text-xs font-bold text-foreground">{Number(balance).toFixed(2)} pts</span>
      </div>

      {balance > 0 && meetsMinimum && maxDiscount > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={maxDiscount}
              step={0.1}
              value={loyaltyDiscount}
              onChange={(e) => onLoyaltyDiscountChange(Number(e.target.value))}
              className="flex-1 h-1.5 accent-primary"
            />
            <span className="text-xs font-medium w-16 text-right">
              {formatOMR(loyaltyDiscount)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Using {pointsUsed.toFixed(2)} pts • Max {formatOMR(maxDiscount)} ({loyaltySettings.max_redemption_percent}%)
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          {balance > 0 && !meetsMinimum
            ? `Not enough points yet (need ${loyaltySettings.min_redeem_points} pts)`
            : "No points available for redemption"}
        </p>
      )}
    </div>
  );
}
