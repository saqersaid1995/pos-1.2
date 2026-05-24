import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import { Loader2, Gift, Star, Percent, ArrowRight, CalendarClock, Hourglass } from "lucide-react";
import { toast } from "sonner";

export default function LoyaltySettings() {
  const { settings, loading, update } = useLoyaltySettings();
  const [saving, setSaving] = useState(false);
  const [earnRate, setEarnRate] = useState<number | null>(null);
  const [redeemRate, setRedeemRate] = useState<number | null>(null);
  const [maxPercent, setMaxPercent] = useState<number | null>(null);
  const [minRedeem, setMinRedeem] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [validityDays, setValidityDays] = useState<number | null>(null);

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Loyalty Program" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const currentEarn = earnRate ?? settings.earn_points_rate;
  const currentRedeem = redeemRate ?? settings.redeem_points_rate;
  const currentMax = maxPercent ?? settings.max_redemption_percent;
  const currentMinRedeem = minRedeem ?? settings.min_redeem_points;
  const currentStart = startDate ?? settings.loyalty_start_date ?? "";
  const currentValidity = validityDays ?? settings.points_validity_days ?? null;

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    const res = await update({ is_enabled: enabled });
    setSaving(false);
    if (res?.error) {
      toast.error("Failed to update setting");
    } else {
      toast.success(enabled ? "Loyalty program enabled" : "Loyalty program disabled");
    }
  };

  const handleSaveRules = async () => {
    // Validation
    if (currentValidity !== null && currentValidity !== undefined && currentValidity < 1) {
      toast.error("Validity period must be at least 1 day");
      return;
    }
    if (currentStart && isNaN(new Date(currentStart).getTime())) {
      toast.error("Invalid start date");
      return;
    }

    setSaving(true);
    const res = await update({
      earn_points_rate: currentEarn,
      redeem_points_rate: currentRedeem,
      max_redemption_percent: currentMax,
      min_redeem_points: currentMinRedeem,
      loyalty_start_date: currentStart ? currentStart : null,
      points_validity_days: currentValidity && currentValidity > 0 ? currentValidity : null,
    });
    setSaving(false);
    if (res?.error) {
      toast.error("Failed to save rules");
    } else {
      setEarnRate(null);
      setRedeemRate(null);
      setMaxPercent(null);
      setMinRedeem(null);
      setStartDate(null);
      setValidityDays(null);
      toast.success("Loyalty rules updated");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Loyalty Program" subtitle="Settings" />
      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {/* Master Toggle */}
        <div className="pos-section p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Loyalty Program</h2>
              <p className="text-xs text-muted-foreground">
                {settings.is_enabled ? "Active — customers earn points on paid orders" : "Disabled — no points earned or redeemed"}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.is_enabled}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
        </div>

        {/* Rules */}
        <div className={`pos-section p-5 space-y-5 ${!settings.is_enabled ? "opacity-50 pointer-events-none" : ""}`}>
          <h2 className="pos-label flex items-center gap-2"><Star className="w-4 h-4" /> Loyalty Rules</h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Points Earning Rate</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={currentEarn}
                  onChange={(e) => setEarnRate(Number(e.target.value))}
                  className="pos-input w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">point(s) per OMR</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Redemption Rate</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={currentRedeem}
                  onChange={(e) => setRedeemRate(Number(e.target.value))}
                  className="pos-input w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">points = 1 OMR discount</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Minimum Points to Redeem</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={currentMinRedeem}
                  onChange={(e) => setMinRedeem(Number(e.target.value))}
                  className="pos-input w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">points required before redemption</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Percent className="w-3 h-3" /> Max Redemption per Order
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={currentMax}
                  onChange={(e) => setMaxPercent(Number(e.target.value))}
                  className="pos-input w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">% of order total</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <CalendarClock className="w-3 h-3" /> Loyalty Start Date
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={currentStart || ""}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pos-input w-44"
                />
                {currentStart && (
                  <button
                    type="button"
                    onClick={() => setStartDate("")}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  Points earned only from payments on/after this date
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Hourglass className="w-3 h-3" /> Points Validity Period
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={currentValidity ?? ""}
                  placeholder="Never"
                  onChange={(e) => {
                    const v = e.target.value;
                    setValidityDays(v === "" ? 0 : Number(v));
                  }}
                  className="pos-input w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">days (leave empty = never expires)</span>
              </div>
              <div className="flex gap-1.5 mt-1">
                {[30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setValidityDays(d)}
                    className="px-2 py-0.5 text-[11px] rounded border border-border hover:bg-muted"
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={handleSaveRules} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Rules
          </Button>
        </div>

        {/* Info */}
        <div className="pos-section p-5 space-y-3">
          <h2 className="pos-label">How It Works</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <ArrowRight className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>Points are earned automatically when an order is marked as <strong className="text-foreground">paid</strong>.</span>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>Cashiers can redeem points at checkout if the customer has enough balance.</span>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>Disabling the program preserves all existing points — they can be used again when re-enabled.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
