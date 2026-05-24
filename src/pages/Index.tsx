// Laundry POS - Real Data Mode
import { useState, useCallback } from "react";
import { usePOSState } from "@/hooks/usePOSState";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import CustomerSection from "@/components/pos/CustomerSection";
import OrderDetailsSection from "@/components/pos/OrderDetailsSection";
import GarmentTable from "@/components/pos/GarmentTable";
import PricingSummary from "@/components/pos/PricingSummary";
import LoyaltyRedemption from "@/components/pos/LoyaltyRedemption";
import ActionButtons from "@/components/pos/ActionButtons";
import InvoiceModal from "@/components/pos/InvoiceModal";
import QuickOrderPanel from "@/components/pos/QuickOrderPanel";
import ScanOrderModal from "@/components/pos/ScanOrderModal";
import SmartSearchBar from "@/components/pos/SmartSearchBar";
import { formatOMR } from "@/lib/currency";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import { awardLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty";
import { triggerLoyaltyWhatsApp } from "@/lib/loyalty-whatsapp";

const Index = () => {
  const pos = usePOSState();
  const { settings: loyaltySettings } = useLoyaltySettings();
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState<string | undefined>();
  useOfflineCache();

  // Global barcode scanner listener — auto-opens payment modal
  const handleBarcodeScan = useCallback((code: string) => {
    setScanCode(code);
    setScanOpen(true);
  }, []);
  useBarcodeScanner(handleBarcodeScan, !scanOpen);

  const handleQuickAdd = (itemType: string, serviceId: string, price: number) => {
    // Check if item already exists with same service - increment quantity
    const existing = pos.items.find((i) => i.itemType === itemType && i.serviceId === serviceId);
    if (existing) {
      pos.updateItem(existing.id, { quantity: existing.quantity + 1 });
      toast.success(`${itemType} × ${existing.quantity + 1}`);
    } else {
      pos.addItemWithDefaults(itemType, serviceId, price);
      toast.success(`${itemType} added`);
    }
  };

  const processLoyaltyAfterSave = async (orderId: string) => {
    const custId = pos.matchedCustomer?.id;
    if (!custId || !loyaltySettings?.is_enabled) return;
    // Redeem points if discount applied
    if (loyaltyDiscount > 0) {
      const pointsUsed = loyaltyDiscount * loyaltySettings.redeem_points_rate;
      await redeemLoyaltyPoints(custId, orderId, pointsUsed, loyaltyDiscount);
    }
    // Award points if paid
    if (pos.paidAmount > 0) {
      await awardLoyaltyPoints(custId, orderId, pos.paidAmount);
    }
    setLoyaltyDiscount(0);
  };

  const handleSave = async () => {
    if (pos.items.length === 0) {
      toast.error("Add at least one item to the order.");
      return;
    }
    if (!pos.customerPhone.trim()) {
      toast.error("Customer phone number is required.");
      return;
    }
    const result = await pos.saveOrder();
    if (result.success) {
      await processLoyaltyAfterSave(result.orderId!);
      // Send loyalty WhatsApp if fully paid at creation
      if (pos.paymentStatus === "paid" && pos.matchedCustomer?.id && pos.customerPhone) {
        triggerLoyaltyWhatsApp(result.orderId!, pos.matchedCustomer.id, pos.customerPhone, pos.paidAmount);
      }
      const offlineTag = !navigator.onLine ? " (saved offline)" : "";
      toast.success(`Order ${pos.orderNumber} saved!${offlineTag}`);
      pos.clearForm();
    } else {
      toast.error(result.error || "Failed to save order");
    }
  };

  const handleSaveAndPrint = async () => {
    if (pos.items.length === 0) {
      toast.error("Add at least one item to the order.");
      return;
    }
    if (!pos.customerPhone.trim()) {
      toast.error("Customer phone number is required.");
      return;
    }
    const result = await pos.saveOrder();
    if (result.success) {
      await processLoyaltyAfterSave(result.orderId!);
      if (pos.paymentStatus === "paid" && pos.matchedCustomer?.id && pos.customerPhone) {
        triggerLoyaltyWhatsApp(result.orderId!, pos.matchedCustomer.id, pos.customerPhone, pos.paidAmount);
      }
      const offlineTag = !navigator.onLine ? " (saved offline)" : "";
      toast.success(`Order ${pos.orderNumber} saved!${offlineTag}`);
      if (navigator.onLine) {
        pos.setShowInvoice(true);
      } else {
        toast.info("Invoice printing unavailable offline");
        pos.clearForm();
      }
    } else {
      toast.error(result.error || "Failed to save order");
    }
  };

  const handleSaveAndProcess = async () => {
    if (pos.items.length === 0) {
      toast.error("Add at least one item to the order.");
      return;
    }
    const result = await pos.saveOrder();
    if (result.success) {
      await processLoyaltyAfterSave(result.orderId!);
      if (pos.paymentStatus === "paid" && pos.matchedCustomer?.id && pos.customerPhone) {
        triggerLoyaltyWhatsApp(result.orderId!, pos.matchedCustomer.id, pos.customerPhone, pos.paidAmount);
      }
      toast.success(`Order ${pos.orderNumber} saved and sent to processing!`);
      pos.clearForm();
    } else {
      toast.error(result.error || "Failed to save order");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="New Order"
        subtitle={pos.orderNumber}
        actions={
          <span className="text-sm text-muted-foreground">
            {pos.items.length} Items • {formatOMR(pos.total)}
          </span>
        }
      />

      {/* Main Layout */}
      <div className="flex flex-col gap-4 p-4 max-w-[1600px] mx-auto">
        <SmartSearchBar
          onScanClick={() => setScanOpen(true)}
          onOpenOrder={(code) => {
            setScanCode(code);
            setScanOpen(true);
          }}
          onUseCustomer={(phone, name) => {
            pos.setCustomerPhone(phone);
            if (name) pos.setCustomerName(name);
          }}
        />
      </div>
      <div className="flex flex-col lg:flex-row gap-4 px-4 pb-4 max-w-[1600px] mx-auto">
        <div className="lg:w-[65%] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomerSection
              phone={pos.customerPhone}
              name={pos.customerName}
              notes={pos.customerNotes}
              matchedCustomer={pos.matchedCustomer ? { id: pos.matchedCustomer.id, phone: pos.matchedCustomer.phone, name: pos.matchedCustomer.name, notes: pos.matchedCustomer.notes?.[0]?.text } : null}
              onPhoneChange={pos.setCustomerPhone}
              onNameChange={pos.setCustomerName}
              onNotesChange={pos.setCustomerNotes}
            />
            <OrderDetailsSection
              orderNumber={pos.orderNumber}
              orderDate={pos.orderDate}
              deliveryDate={pos.deliveryDate}
              orderType={pos.orderType}
              pickupMethod={pos.pickupMethod}
              orderNotes={pos.orderNotes}
              onDeliveryDateChange={pos.setDeliveryDate}
              onOrderTypeChange={pos.setOrderType}
              onPickupMethodChange={pos.setPickupMethod}
              onNotesChange={pos.setOrderNotes}
            />
          </div>
          <QuickOrderPanel items={pos.items} orderType={pos.orderType} onAddQuickItem={handleQuickAdd} />
          <GarmentTable
            items={pos.items}
            orderType={pos.orderType}
            onAdd={pos.addItem}
            onUpdate={pos.updateItem}
            onRemove={pos.removeItem}
          />
        </div>

        <div className="lg:w-[35%]">
          <div className="lg:sticky lg:top-20 space-y-4">
            <PricingSummary
              subtotal={pos.subtotal}
              discount={pos.discount}
              total={Math.max(0, pos.total - loyaltyDiscount)}
              paidAmount={pos.paidAmount}
              remainingBalance={Math.max(0, pos.total - loyaltyDiscount - pos.paidAmount)}
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
          onClose={() => {
            pos.setShowInvoice(false);
            pos.clearForm();
          }}
        />
      )}
      {/* Scan Order Modal */}
      <ScanOrderModal
        open={scanOpen}
        onOpenChange={(open) => {
          setScanOpen(open);
          if (!open) setScanCode(undefined);
        }}
        initialCode={scanCode}
      />
    </div>
  );
};

export default Index;
