// Laundry POS - Real Data Mode
import { useState, useCallback } from "react";
import { usePOSState } from "@/hooks/usePOSState";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import SmartSearchBar from "@/components/pos/SmartSearchBar";
import QuickAddGrid from "@/components/pos/QuickAddGrid";
import GarmentTable from "@/components/pos/GarmentTable";
import LoyaltyRedemption from "@/components/pos/LoyaltyRedemption";
import ActionButtons from "@/components/pos/ActionButtons";
import InvoiceModal from "@/components/pos/InvoiceModal";
import ScanOrderModal from "@/components/pos/ScanOrderModal";
import { SettingsRow, DiscountRow } from "@/components/pos/SettingsRow";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { awardLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty";
import { triggerLoyaltyWhatsApp } from "@/lib/loyalty-whatsapp";
import { formatOMR } from "@/lib/currency";
import { ChevronDown, ChevronUp } from "lucide-react";
import { canUseServer } from "@/lib/electron";
import type { PaymentMethod } from "@/types/pos";

// ─── Option configs ───────────────────────────────────────────────────────────

const ORDER_TYPE_OPTIONS = [
  { id: "regular", label: "عادي" },
  { id: "urgent", label: "⚡ عاجل", color: "#F59E0B" },
];

const PICKUP_OPTIONS = [
  { id: "walk-in", label: "🏪 زيارة" },
  { id: "delivery", label: "🚚 توصيل" },
  { id: "app", label: "📱 تطبيق" },
];

const PAYMENT_OPTIONS = [
  { id: "cash", label: "💵 نقد" },
  { id: "card", label: "💳 بطاقة" },
  { id: "bank-transfer", label: "🔄 تحويل" },
  { id: "partial", label: "½ جزئي", color: "#F59E0B" },
  { id: "pay-later", label: "⏰ آجل", color: "#EF4444" },
];

// ─── Component ────────────────────────────────────────────────────────────────

const Index = () => {
  const pos = usePOSState();
  const { settings: loyaltySettings } = useLoyaltySettings();
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState<string | undefined>();
  const [showExtras, setShowExtras] = useState(false);
  useOfflineCache();

  const handleBarcodeScan = useCallback((code: string) => {
    setScanCode(code);
    setScanOpen(true);
  }, []);
  useBarcodeScanner(handleBarcodeScan, !scanOpen);

  const handleQuickAdd = (itemType: string, serviceId: string, price: number) => {
    const existing = pos.items.find((i) => i.itemType === itemType && i.serviceId === serviceId);
    if (existing) {
      pos.updateItem(existing.id, { quantity: existing.quantity + 1 });
    } else {
      pos.addItemWithDefaults(itemType, serviceId, price);
    }
  };

  const processLoyaltyAfterSave = async (orderId: string) => {
    const custId = pos.matchedCustomer?.id;
    if (!custId || !loyaltySettings?.is_enabled) return;
    if (loyaltyDiscount > 0) {
      const pointsUsed = loyaltyDiscount * loyaltySettings.redeem_points_rate;
      await redeemLoyaltyPoints(custId, orderId, pointsUsed, loyaltyDiscount);
    }
    if (pos.paidAmount > 0) {
      await awardLoyaltyPoints(custId, orderId, pos.paidAmount);
    }
    setLoyaltyDiscount(0);
  };

  const handleSave = async () => {
    if (pos.items.length === 0) { toast.error("أضف قطعة واحدة على الأقل."); return; }
    if (!pos.customerPhone.trim()) { toast.error("رقم هاتف العميل مطلوب."); return; }
    const result = await pos.saveOrder();
    if (result.success) {
      await processLoyaltyAfterSave(result.orderId!);
      if (pos.paymentStatus === "paid" && pos.matchedCustomer?.id && pos.customerPhone) {
        triggerLoyaltyWhatsApp(result.orderId!, pos.matchedCustomer.id, pos.customerPhone, pos.paidAmount);
      }
      toast.success(`تم حفظ الطلب ${pos.orderNumber}` + (!canUseServer() ? " (غير متصل)" : ""));
      pos.clearForm();
      setShowExtras(false);
    } else {
      toast.error(result.error || "فشل حفظ الطلب");
    }
  };

  const handleSaveAndPrint = async () => {
    if (pos.items.length === 0) { toast.error("أضف قطعة واحدة على الأقل."); return; }
    if (!pos.customerPhone.trim()) { toast.error("رقم هاتف العميل مطلوب."); return; }
    const result = await pos.saveOrder();
    if (result.success) {
      await processLoyaltyAfterSave(result.orderId!);
      if (pos.paymentStatus === "paid" && pos.matchedCustomer?.id && pos.customerPhone) {
        triggerLoyaltyWhatsApp(result.orderId!, pos.matchedCustomer.id, pos.customerPhone, pos.paidAmount);
      }
      toast.success(`تم حفظ الطلب ${pos.orderNumber}` + (!canUseServer() ? " (غير متصل)" : ""));
      if (canUseServer()) {
        pos.setShowInvoice(true);
      } else {
        toast.info("الطباعة غير متاحة بدون اتصال");
        pos.clearForm();
      }
    } else {
      toast.error(result.error || "فشل حفظ الطلب");
    }
  };

  const handleSaveAndProcess = async () => {
    if (pos.items.length === 0) { toast.error("أضف قطعة واحدة على الأقل."); return; }
    const result = await pos.saveOrder();
    if (result.success) {
      await processLoyaltyAfterSave(result.orderId!);
      if (pos.paymentStatus === "paid" && pos.matchedCustomer?.id && pos.customerPhone) {
        triggerLoyaltyWhatsApp(result.orderId!, pos.matchedCustomer.id, pos.customerPhone, pos.paidAmount);
      }
      toast.success(`تم حفظ الطلب ${pos.orderNumber} وإرساله للمعالجة`);
      pos.clearForm();
      setShowExtras(false);
    } else {
      toast.error(result.error || "فشل حفظ الطلب");
    }
  };

  const adjustedTotal = Math.max(0, pos.total - loyaltyDiscount);
  const adjustedRemaining = Math.max(0, adjustedTotal - pos.paidAmount);
  const isUrgent = pos.orderType === "urgent";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between shrink-0 print:hidden"
        style={{ padding: "14px 24px", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <div>
            <h1 className="page-title">نقطة البيع</h1>
            <p className="page-subtitle">{pos.orderNumber}</p>
          </div>
          {/* Urgent badge */}
          <AnimatePresence>
            {isUrgent && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 9px",
                  borderRadius: 99,
                  background: "rgba(245,158,11,0.13)",
                  color: "#F59E0B",
                  border: "1px solid rgba(245,158,11,0.35)",
                  letterSpacing: "0.02em",
                }}
              >
                ⚡ طلب عاجل
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <span className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>
          {pos.orderDate}
        </span>
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ── LEFT PANEL ── */}
        <div
          className="flex flex-col gap-3 overflow-hidden"
          style={{ flex: 1, minWidth: 0, padding: "12px 10px 12px 20px" }}
        >
          <SmartSearchBar
            customerPhone={pos.customerPhone}
            customerName={pos.customerName}
            matchedCustomer={pos.matchedCustomer}
            onPhoneChange={pos.setCustomerPhone}
            onNameChange={pos.setCustomerName}
            onOpenOrder={(code) => { setScanCode(code); setScanOpen(true); }}
            onScanClick={() => setScanOpen(true)}
          />

          <QuickAddGrid
            items={pos.items}
            orderType={pos.orderType}
            onAddQuickItem={handleQuickAdd}
          />

          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <GarmentTable
              items={pos.items}
              orderType={pos.orderType}
              onAdd={pos.addItem}
              onUpdate={pos.updateItem}
              onRemove={pos.removeItem}
            />
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{
            width: 200,
            flexShrink: 0,
            padding: "10px 14px 14px 10px",
            borderLeft: "1px solid var(--border-subtle)",
          }}
        >
          <div className="flex flex-col gap-2">

            {/* ── Settings rows ── */}
            <div className="flex flex-col gap-1">
              <SettingsRow
                label="نوع الطلب"
                value={pos.orderType}
                onChange={(v) => pos.setOrderType(v as "regular" | "urgent")}
                options={ORDER_TYPE_OPTIONS}
                isUrgent={isUrgent}
              />
              <SettingsRow
                label="الاستلام"
                value={pos.pickupMethod}
                onChange={(v) => pos.setPickupMethod(v as "walk-in" | "delivery" | "app")}
                options={PICKUP_OPTIONS}
              />
              <SettingsRow
                label="الدفع"
                value={pos.paymentMethod}
                onChange={(v) => pos.setPaymentMethod(v as PaymentMethod)}
                options={PAYMENT_OPTIONS}
              />
              <DiscountRow
                label="الخصم"
                value={pos.discount}
                onChange={pos.setDiscount}
              />
            </div>

            {/* ── Partial payment expansion ── */}
            <AnimatePresence>
              {pos.paymentMethod === "partial" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1 pt-0.5">
                    {/* Paid amount input row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 8px",
                        height: 30,
                        borderRadius: 6,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        boxSizing: "border-box",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>المبلغ المدفوع</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>OMR</span>
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          step={1}
                          value={pos.paidAmount || ""}
                          onChange={(e) => pos.setPaidAmount(Number(e.target.value))}
                          placeholder="0.000"
                          style={{
                            width: 72,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: 12,
                            fontWeight: 500,
                            textAlign: "left",
                            fontFamily: "monospace",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                    </div>
                    {/* Remaining */}
                    <div
                      style={{
                        padding: "1px 12px",
                        fontSize: 11,
                        color: "var(--color-danger, #EF4444)",
                        fontFamily: "monospace",
                      }}
                    >
                      المتبقي: {formatOMR(adjustedRemaining)}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Extras toggle ── */}
            <button
              onClick={() => setShowExtras((p) => !p)}
              className="flex items-center gap-1 text-[11px] transition-colors self-start"
              style={{ color: showExtras ? "var(--color-accent)" : "var(--text-tertiary)" }}
            >
              {showExtras ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showExtras ? "إخفاء التفاصيل" : "+ تفاصيل إضافية"}
            </button>

            <AnimatePresence>
              {showExtras && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1">
                    {/* Delivery date */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 8px",
                        height: 30,
                        borderRadius: 6,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        boxSizing: "border-box",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>تاريخ التسليم</span>
                      <input
                        type="date"
                        value={pos.deliveryDate}
                        onChange={(e) => pos.setDeliveryDate(e.target.value)}
                        style={{
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          direction: "ltr",
                        }}
                      />
                    </div>
                    {/* Customer notes */}
                    <textarea
                      placeholder="ملاحظات العميل..."
                      value={pos.customerNotes}
                      onChange={(e) => pos.setCustomerNotes(e.target.value)}
                      rows={2}
                      className="ds-input w-full resize-none text-[12px] py-2"
                      dir="rtl"
                    />
                    {/* Order notes */}
                    <textarea
                      placeholder="ملاحظات الطلب..."
                      value={pos.orderNotes}
                      onChange={(e) => pos.setOrderNotes(e.target.value)}
                      rows={2}
                      className="ds-input w-full resize-none text-[12px] py-2"
                      dir="rtl"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />

            {/* ── Totals ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 2px" }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                  {formatOMR(pos.subtotal)}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>المجموع الفرعي</span>
              </div>

              {pos.discount > 0 && (
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      color: "var(--color-success, #10B981)",
                    }}
                  >
                    - {formatOMR(pos.discount)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>خصم</span>
                </div>
              )}

              {loyaltySettings?.is_enabled && (
                <LoyaltyRedemption
                  customerId={pos.matchedCustomer?.id ?? null}
                  orderTotal={pos.total}
                  loyaltySettings={loyaltySettings}
                  loyaltyDiscount={loyaltyDiscount}
                  onLoyaltyDiscountChange={setLoyaltyDiscount}
                />
              )}
            </div>

            {/* ── Grand total ── */}
            <div style={{ height: 1, background: "var(--border-default)", margin: "0" }} />
            <div className="flex items-center justify-between" style={{ padding: "2px 2px" }}>
              <motion.span
                key={adjustedTotal}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: "var(--color-accent, #6366F1)",
                }}
              >
                {formatOMR(adjustedTotal)}
              </motion.span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>الإجمالي</span>
            </div>
            <div style={{ height: 1, background: "var(--border-subtle)", margin: "0" }} />

            {/* ── Action buttons ── */}
            <ActionButtons
              onSave={handleSave}
              onSaveAndPrint={handleSaveAndPrint}
              onSaveAndProcess={handleSaveAndProcess}
              onCancel={pos.clearForm}
              onClear={pos.clearForm}
              disabled={pos.items.length === 0 || pos.saving}
            />

          </div>
        </div>
      </div>

      {/* Invoice Modal */}
      {pos.showInvoice && (
        <InvoiceModal
          orderNumber={pos.orderNumber}
          customerName={pos.customerName}
          customerPhone={pos.customerPhone}
          orderDate={pos.orderDate}
          deliveryDate={pos.deliveryDate}
          items={pos.items}
          subtotal={pos.subtotal}
          discount={pos.discount}
          total={pos.total}
          paidAmount={pos.paidAmount}
          remainingBalance={pos.remainingBalance}
          onClose={() => { pos.setShowInvoice(false); pos.clearForm(); }}
        />
      )}

      {/* Scan Order Modal */}
      <ScanOrderModal
        open={scanOpen}
        onOpenChange={(open) => { setScanOpen(open); if (!open) setScanCode(undefined); }}
        initialCode={scanCode}
        selectedCustomer={pos.matchedCustomer}
      />
    </div>
  );
};

export default Index;
