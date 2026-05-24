import { QRCodeSVG } from "qrcode.react";
import { useCallback, useRef } from "react";
import type { OrderItem } from "@/types/pos";
import { formatOMR } from "@/lib/currency";
import { BUSINESS } from "@/lib/business-config";
import { buildReceiptHtml } from "@/lib/invoice-html";

interface Props {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderDate: string;
  deliveryDate: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  remainingBalance: number;
  onClose: () => void;
}

export default function InvoiceModal(props: Props) {
  const { orderNumber, customerName, customerPhone, orderDate, deliveryDate, items, subtotal, discount, total, paidAmount, remainingBalance, onClose } = props;
  const printTriggered = useRef(false);

  const handlePrint = useCallback(() => {
    if (printTriggered.current) return;
    printTriggered.current = true;

    const qrSvg = document.querySelector(".invoice-qr-source svg");
    const qrMarkup = qrSvg ? new XMLSerializer().serializeToString(qrSvg) : "";
    const logoUrl = new URL(BUSINESS.logo, window.location.origin).toString();
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      printTriggered.current = false;
      return;
    }

    const releasePrintLock = () => {
      printTriggered.current = false;
    };

    const receiptHtml = buildReceiptHtml({
      orderNumber,
      customerName,
      customerPhone,
      orderDate,
      deliveryDate,
      items,
      subtotal,
      discount,
      total,
      paidAmount,
      remainingBalance,
      logoUrl,
      qrMarkup,
    });

    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();

    const resetTimer = window.setTimeout(() => {
      releasePrintLock();
    }, 10000);

    printWindow.onafterprint = () => {
      window.clearTimeout(resetTimer);
      releasePrintLock();
      printWindow.close();
    };

    printWindow.onload = async () => {
      const images = Array.from(printWindow.document.images);
      await Promise.all(
        images.map(
          (image) =>
            image.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  image.addEventListener("load", () => resolve(), { once: true });
                  image.addEventListener("error", () => resolve(), { once: true });
                })
        )
      );

      printWindow.focus();
      printWindow.print();
    };
  }, [customerName, customerPhone, deliveryDate, items, orderDate, orderNumber, subtotal, discount, paidAmount, remainingBalance, total]);

  return (
    <>
      <div className="invoice-qr-source" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
        <QRCodeSVG value={`ORDER:${orderNumber}`} size={55} />
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40">
        <div className="bg-card rounded-lg shadow-lg w-full max-w-sm max-h-[90vh] overflow-auto">
          <div className="p-4 space-y-3" style={{ maxWidth: "80mm", margin: "0 auto" }}>
            <div className="flex items-center gap-2 justify-center">
              <img src={BUSINESS.logo} alt={BUSINESS.name} className="h-10 w-10 object-contain" />
              <div className="text-center">
                <h1 className="text-base font-bold tracking-tight leading-tight">{BUSINESS.name}</h1>
                <p className="text-[10px] text-muted-foreground">{BUSINESS.tagline}</p>
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="text-center py-1">
              <span className="text-[10px] text-muted-foreground">Phone: </span>
              <span className="text-[22px] font-bold tracking-wide">{customerPhone || "—"}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div><span className="text-muted-foreground">Order: </span><span className="font-medium">{orderNumber}</span></div>
              <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{orderDate}</span></div>
              <div><span className="text-muted-foreground">Customer: </span><span className="font-medium">{customerName || "Walk-in"}</span></div>
              {deliveryDate && (
                <div><span className="text-muted-foreground">Delivery: </span><span className="font-medium">{deliveryDate}</span></div>
              )}
            </div>
            <div className="h-px bg-border" />
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground text-[10px] uppercase tracking-wider">
                  <th className="pb-1">Item</th>
                  <th className="pb-1">Service</th>
                  <th className="pb-1 text-center">Qty</th>
                  <th className="pb-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="py-1">{item.itemType || "—"}</td>
                    <td className="py-1">{item.serviceId}</td>
                    <td className="py-1 text-center">{item.quantity}</td>
                    <td className="py-1 text-right">{formatOMR(item.unitPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="h-px bg-border" />
            <div className="space-y-0.5 text-xs">
              {discount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span><span>{formatOMR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span><span>-{formatOMR(discount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-sm">
                <span>Total</span><span>{formatOMR(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span><span>{formatOMR(paidAmount)}</span>
              </div>
              {remainingBalance > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Remaining</span><span>{formatOMR(remainingBalance)}</span>
                </div>
              )}
            </div>
            <div className="qr-section flex justify-center pt-1">
              <QRCodeSVG value={`ORDER:${orderNumber}`} size={60} />
            </div>
            <p className="text-center text-[10px] text-muted-foreground pb-1">Thank you for your business!</p>
          </div>
          <div className="flex gap-2 p-3 border-t border-border">
            <button onClick={handlePrint} className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Print
            </button>
            <button onClick={onClose} className="flex-1 h-9 rounded-md bg-background border border-border text-sm font-medium hover:bg-secondary transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
