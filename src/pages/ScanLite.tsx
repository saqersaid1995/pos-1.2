import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScanLine, Search, Keyboard, Phone } from "lucide-react";
import { toast } from "sonner";
import { WORKFLOW_STAGES } from "@/types/workflow";
import {
  searchOrderByCode, updateOrderStatus, fetchCustomerByPhone, fetchOrdersByCustomerId,
} from "@/lib/supabase-queries";
import { sendReadyForPickupWhatsApp } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowOrder } from "@/types/workflow";
import QrScanner from "@/components/scan/QrScanner";
import ScanResultCard from "@/components/scan/ScanResultCard";
import PhoneSearchResults from "@/components/scan/PhoneSearchResults";
import { BUSINESS } from "@/lib/business-config";
import { useStandaloneAppMeta } from "@/hooks/useStandaloneAppMeta";

type SearchMode = "barcode" | "order" | "phone";

export default function ScanLite() {
  const navigate = useNavigate();

  useStandaloneAppMeta({
    title: "Quick Scan",
    description: "Lavinderia Scan - Quick Order Lookup",
    applicationName: "Quick Scan",
    appleMobileWebAppTitle: "Quick Scan",
    themeColor: "#0f172a",
    manifestHref: "/scan-lite-manifest.json",
    faviconHref: "/scan-favicon.png",
    appleTouchIconHref: "/scan-apple-touch-icon.png",
  });

  const [mode, setMode] = useState<SearchMode>("barcode");
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [searching, setSearching] = useState(false);

  const [foundOrder, setFoundOrder] = useState<WorkflowOrder | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [phoneCustomerName, setPhoneCustomerName] = useState("");
  const [phoneCustomerPhone, setPhoneCustomerPhone] = useState("");
  const [phoneOrders, setPhoneOrders] = useState<WorkflowOrder[]>([]);
  const [phoneNotFound, setPhoneNotFound] = useState(false);

  const vibrate = () => {
    try {
      navigator.vibrate?.(100);
    } catch {
      return undefined;
    }
  };

  const lookupOrder = useCallback(async (code: string) => {
    const clean = code.trim().replace(/^ORDER:/, "");
    if (!clean) return;
    setSearching(true);
    clearPhone();
    const order = await searchOrderByCode(clean);
    setSearching(false);
    if (order) {
      setFoundOrder(order);
      setNotFound(false);
      vibrate();
      toast.success(`Order found: ${order.orderNumber}`);
    } else {
      setFoundOrder(null);
      setNotFound(true);
      toast.error("No matching order found");
    }
  }, []);

  const lookupPhone = useCallback(async (phone: string) => {
    const clean = phone.trim();
    if (!clean) return;
    setSearching(true);
    clearSingle();
    const customer = await fetchCustomerByPhone(clean);
    if (!customer) {
      setPhoneNotFound(true);
      setSearching(false);
      toast.error("No customer found");
      return;
    }
    const orders = await fetchOrdersByCustomerId(customer.id);
    setPhoneCustomerName(customer.name);
    setPhoneCustomerPhone(customer.phone);
    setPhoneOrders(orders);
    setPhoneNotFound(false);
    setSearching(false);
    vibrate();
    toast.success(`Found ${orders.length} order(s)`);
  }, []);

  const handleMoveNext = async () => {
    if (!foundOrder) return;
    const idx = WORKFLOW_STAGES.findIndex((s) => s.id === foundOrder.currentStatus);
    if (idx < WORKFLOW_STAGES.length - 1) {
      const fromStatus = foundOrder.currentStatus;
      const toStatus = WORKFLOW_STAGES[idx + 1].id;
      await updateOrderStatus(foundOrder.id, fromStatus, toStatus);

      // Trigger WhatsApp when moving to ready-for-pickup (same as workflow)
      if (fromStatus === "received" && toStatus === "ready-for-pickup") {
        const { data: orderData } = await supabase
          .from("orders")
          .select("ready_pickup_whatsapp_sent, customer_id")
          .eq("id", foundOrder.id)
          .maybeSingle();

        if (orderData && !orderData.ready_pickup_whatsapp_sent) {
          const result = await sendReadyForPickupWhatsApp({
            orderId: foundOrder.id,
            customerId: orderData.customer_id,
            customerName: foundOrder.customerName,
            customerPhone: foundOrder.customerPhone,
            orderNumber: foundOrder.orderNumber,
            totalAmount: foundOrder.totalAmount,
            remainingAmount: foundOrder.remainingBalance,
          });
          if (result.success) {
            toast.success("Moved to Ready for Pickup & WhatsApp sent");
          } else {
            toast.warning("Moved to Ready for Pickup, but WhatsApp failed");
          }
        } else {
          toast.success("Moved to next stage");
        }
      } else {
        toast.success("Moved to next stage");
      }

      const updated = await searchOrderByCode(foundOrder.orderNumber);
      if (updated) setFoundOrder(updated);
    }
  };

  const handleMarkDelivered = async () => {
    if (!foundOrder) return;
    if (foundOrder.remainingBalance > 0) {
      toast.error("Outstanding balance must be paid first.");
      return;
    }
    await updateOrderStatus(foundOrder.id, foundOrder.currentStatus, "delivered");
    toast.success("Order delivered");
    const updated = await searchOrderByCode(foundOrder.orderNumber);
    if (updated) setFoundOrder(updated);
  };

  const handleRefresh = async () => {
    if (!foundOrder) return;
    const updated = await searchOrderByCode(foundOrder.orderNumber);
    if (updated) setFoundOrder(updated);
  };

  const refreshPhoneOrders = useCallback(async () => {
    if (!phoneCustomerPhone) return;
    const customer = await fetchCustomerByPhone(phoneCustomerPhone);
    if (!customer) return;
    const orders = await fetchOrdersByCustomerId(customer.id);
    setPhoneOrders(orders);
  }, [phoneCustomerPhone]);

  const clearSingle = () => { setFoundOrder(null); setNotFound(false); };
  const clearPhone = () => { setPhoneOrders([]); setPhoneCustomerName(""); setPhoneCustomerPhone(""); setPhoneNotFound(false); };
  const clearAll = () => { clearSingle(); clearPhone(); setManualCode(""); setPhoneInput(""); };

  const hasResults = foundOrder || notFound || phoneOrders.length > 0 || phoneNotFound;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center gap-3 pt-6 pb-2 px-4">
        <img src={BUSINESS.logo} alt="Logo" className="h-10 w-10 rounded-full object-cover" />
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Lavinderia Scan</h1>
          <p className="text-[0.6rem] text-muted-foreground leading-none">Quick Order Lookup</p>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 pb-6 space-y-4">
        {/* Mode tabs */}
        <Tabs value={mode} onValueChange={(v) => { setMode(v as SearchMode); clearAll(); }}>
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="barcode" className="text-xs gap-1.5">
              <ScanLine className="h-4 w-4" /> Scan
            </TabsTrigger>
            <TabsTrigger value="order" className="text-xs gap-1.5">
              <Keyboard className="h-4 w-4" /> Order #
            </TabsTrigger>
            <TabsTrigger value="phone" className="text-xs gap-1.5">
              <Phone className="h-4 w-4" /> Phone
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Barcode */}
        {mode === "barcode" && (
          <div className="space-y-3">
            <QrScanner onScan={lookupOrder} scanning={scanning} onToggle={() => setScanning(!scanning)} />
            <form onSubmit={(e) => { e.preventDefault(); lookupOrder(manualCode); }} className="flex gap-2">
              <Input
                placeholder="Scan or type code..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 h-12 text-base"
                autoFocus
              />
              <Button type="submit" size="lg" className="h-12 px-5 gap-1.5" disabled={searching}>
                <Search className="h-4 w-4" /> Go
              </Button>
            </form>
          </div>
        )}

        {/* Order # */}
        {mode === "order" && (
          <form onSubmit={(e) => { e.preventDefault(); lookupOrder(manualCode); }} className="flex gap-2">
            <Input
              placeholder="Enter order number..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 h-12 text-base"
              autoFocus
            />
            <Button type="submit" size="lg" className="h-12 px-5 gap-1.5" disabled={searching}>
              <Search className="h-4 w-4" /> Go
            </Button>
          </form>
        )}

        {/* Phone */}
        {mode === "phone" && (
          <form onSubmit={(e) => { e.preventDefault(); lookupPhone(phoneInput); }} className="flex gap-2">
            <Input
              placeholder="Customer phone..."
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="flex-1 h-12 text-base"
              type="tel"
              autoFocus
            />
            <Button type="submit" size="lg" className="h-12 px-5 gap-1.5" disabled={searching}>
              <Search className="h-4 w-4" /> Go
            </Button>
          </form>
        )}

        {/* Results */}
        {notFound && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm font-medium text-destructive">No matching order found</p>
            <Button variant="outline" size="sm" onClick={clearAll}>Try Again</Button>
          </div>
        )}

        {phoneNotFound && mode === "phone" && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm font-medium text-destructive">No customer found</p>
            <Button variant="outline" size="sm" onClick={() => { setPhoneNotFound(false); setPhoneInput(""); }}>Try Again</Button>
          </div>
        )}

        {foundOrder && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Result</h2>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>Clear</Button>
            </div>
            <ScanResultCard
              order={foundOrder}
              onMoveNext={handleMoveNext}
              onMarkDelivered={handleMarkDelivered}
              onPrint={() => navigate(`/order/${foundOrder.id}`)}
              onRefresh={handleRefresh}
            />
          </div>
        )}

        {phoneOrders.length > 0 && mode === "phone" && (
          <PhoneSearchResults
            customerName={phoneCustomerName}
            customerPhone={phoneCustomerPhone}
            orders={phoneOrders}
            onRefresh={refreshPhoneOrders}
          />
        )}

        {/* Empty state */}
        {!hasResults && (
          <div className="text-center pt-8 text-muted-foreground">
            <ScanLine className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">
              {mode === "phone" ? "Enter phone to find orders" : "Scan or enter an order number"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
