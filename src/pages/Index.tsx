// Laundry POS - Real Data Mode
import { useState, useCallback } from "react";
import { usePOSState } from "@/hooks/usePOSState";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import SmartSearchBar from "@/components/pos/SmartSearchBar";
import QuickAddGrid from "@/components/pos/QuickAddGrid";
import GarmentTable from "@/components/pos/GarmentTable";
import PricingSummary from "@/components/pos/PricingSummary";
import LoyaltyRedemption from "@/components/pos/LoyaltyRedemption";
import ActionButtons from "@/components/pos/ActionButtons";
import InvoiceModal from "@/components/pos/InvoiceModal";
import ScanOrderModal from "@/components/pos/ScanOrderModal";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { awardLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty";
import { triggerLoyaltyWhatsApp } from "@/lib/loyalty-whatsapp";
import { ChevronDown, ChevronUp, MessageSquare, ClipboardList } from "lucide-react";
import { canUseServer } from "@/lib/electron";

const PICKUP_LABELS: Record<string, string> = { "walk-in": "زيارة", "delivery": "توصيل", "app": "تطبيق" };

const Index = () => {
  const pos = usePOSState();
  const { settings: loyaltySettings } = useLoyaltySettings();
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState<string | undefined>();
  const [showCustomerNotes, setShowCustomerNotes] = useState(false);
  const [showOrderNotes, setShowOrderNotes] = useState(false);
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
      setShowCustomerNotes(false);
      setShowOrderNotes(false);
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
      setShowCustomerNotes(false);
      setShowOrderNotes(false);
    } else {
      toast.error(result.error || "فشل حفظ الطلب");
    }
  };

  const adjustedTotal = Math.max(0, pos.total - loyaltyDiscount);
  const adjustedRemaining = Math.max(0, adjustedTotal - pos.paidAmount);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0 print:hidden"
        style={{ padding: "14px 24px", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h1 className="page-title">نقطة البيع</h1>
          <p className="page-subtitle">{pos.orderNumber}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {pos.orderDate}
          </span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex gap-0 flex-1 overflow-hidden">

        {/* LEFT PANEL */}
        <div
          className="flex flex-col gap-3 overflow-hidden"
          style={{ flex: "0 0 60%", padding: "16px 12px 16px 24px" }}
        >
          {/* Smart Search */}
          <SmartSearchBar
            customerPhone={pos.customerPhone}
            customerName={pos.customerName}
            matchedCustomer={pos.matchedCustomer}
            onPhoneChange={pos.setCustomerPhone}
            onNameChange={pos.setCustomerName}
            onOpenOrder={(code) => { setScanCode(code); setScanOpen(true); }}
            onScanClick={() => setScanOpen(true)}
          />

          {/* Quick Add Grid */}
          <QuickAddGrid
            items={pos.items}
            orderType={pos.orderType}
            onAddQuickItem={handleQuickAdd}
          />

          {/* Garments Table — fills remaining space */}
          <GarmentTable
            items={pos.items}
            orderType={pos.orderType}
            onAdd={pos.addItem}
            onUpdate={pos.updateItem}
            onRemove={pos.removeItem}
          />
        </div>

        {/* RIGHT PANEL */}
        <div
          className="flex flex-col overflow-y-auto shrink-0"
          style={{ flex: "0 0 40%", padding: "16px 24px 16px 12px", borderLeft: "1px solid var(--border-subtle)" }}
        >
          <div className="flex flex-col gap-4">

            {/* Order Type */}
            <div>
              <p className="text-[11px] font-semibold mb-1.5 tracking-wide" style={{ color: "var(--text-tertiary)" }}>نوع الطلب</p>
              <div className="flex gap-2">
                {(["regular", "urgent"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => pos.setOrderType(t)}
                    className="flex-1 py-1.5 px-3 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: pos.orderType === t ? (t === "urgent" ? "var(--color-warning)" : "var(--color-accent)") : "var(--bg-elevated)",
                      color: pos.orderType === t ? (t === "urgent" ? "#000" : "#fff") : "var(--text-secondary)",
                      border: "1px solid",
                      borderColor: pos.orderType === t ? (t === "urgent" ? "var(--color-warning)" : "var(--color-accent)") : "var(--border-default)",
                    }}
                  >
                    {t === "regular" ? "عادي" : "عاجل"}
                  </button>
                ))}
              </div>
            </div>

            {/* Pickup Method */}
            <div>
              <p className="text-[11px] font-semibold mb-1.5 tracking-wide" style={{ color: "var(--text-tertiary)" }}>طريقة الاستلام</p>
              <div className="flex gap-2">
                {(["walk-in", "delivery", "app"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => pos.setPickupMethod(m)}
                    className="flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                    style={{
                      background: pos.pickupMethod === m ? "var(--color-accent)" : "var(--bg-elevated)",
                      color: pos.pickupMethod === m ? "#fff" : "var(--text-secondary)",
                      border: "1px solid",
                      borderColor: pos.pickupMethod === m ? "var(--color-accent)" : "var(--border-default)",
                    }}
                  >
                    {PICKUP_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery Date */}
            <div>
              <p className="text-[11px] font-semibold mb-1.5 tracking-wide" style={{ color: "var(--text-tertiary)" }}>تاريخ التسليم</p>
              <input
                type="date"
                value={pos.deliveryDate}
                onChange={(e) => pos.setDeliveryDate(e.target.value)}
                className="ds-input w-full text-[13px] h-9"
                dir="rtl"
              />
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "var(--border-subtle)" }} />

            {/* Pricing Summary */}
            <PricingSummary
              subtotal={pos.subtotal}
              discount={pos.discount}
              total={adjustedTotal}
              paidAmount={pos.paidAmount}
              remainingBalance={adjustedRemaining}
              paymentStatus={pos.paymentStatus}
              paymentMethod={pos.paymentMethod}
              onDiscountChange={pos.setDiscount}
              onPaidAmountChange={pos.setPaidAmount}
              onPaymentMethodChange={pos.setPaymentMethod}
              loyaltySlot={
                loyaltySettings?.is_enabled ? (
                  <LoyaltyRedemption
                    customerId={pos.matchedCustomer?.id ?? null}
                    orderTotal={pos.total}
                    loyaltySettings={loyaltySettings}
                    loyaltyDiscount={loyaltyDiscount}
                    onLoyaltyDiscountChange={setLoyaltyDiscount}
                  />
                ) : undefined
              }
            />

            {/* Collapsible Notes */}
            <div className="flex flex-col gap-2">
              {/* Customer notes toggle */}
              <button
                onClick={() => setShowCustomerNotes((p) => !p)}
                className="flex items-center gap-1.5 text-[12px] transition-colors self-start"
                style={{ color: showCustomerNotes ? "var(--color-accent)" : "var(--text-tertiary)" }}
              >
                <MessageSquare size={12} />
                ملاحظات العميل
                {showCustomerNotes ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              <AnimatePresence>
                {showCustomerNotes && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <textarea
                      placeholder="ملاحظات خاصة بالعميل..."
                      value={pos.customerNotes}
                      onChange={(e) => pos.setCustomerNotes(e.target.value)}
                      rows={2}
                      className="ds-input w-full resize-none text-[12px] py-2"
                      dir="rtl"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Order notes toggle */}
              <button
                onClick={() => setShowOrderNotes((p) => !p)}
                className="flex items-center gap-1.5 text-[12px] transition-colors self-start"
                style={{ color: showOrderNotes ? "var(--color-accent)" : "var(--text-tertiary)" }}
              >
                <ClipboardList size={12} />
                ملاحظات الطلب
                {showOrderNotes ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              <AnimatePresence>
                {showOrderNotes && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <textarea
                      placeholder="ملاحظات عامة على الطلب..."
                      value={pos.orderNotes}
                      onChange={(e) => pos.setOrderNotes(e.target.value)}
                      rows={2}
                      className="ds-input w-full resize-none text-[12px] py-2"
                      dir="rtl"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Buttons */}
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
      />
    </div>
  );
};

export default Index;
