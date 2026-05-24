/**
 * Fast 1-click invoice printing using shared receipt HTML builder.
 * Prints one or many invoices in a single hidden window.
 */
import { buildReceiptHtml } from "@/lib/invoice-html";
import { BUSINESS } from "@/lib/business-config";
import type { WorkflowOrder } from "@/types/workflow";
import type { OrderItem } from "@/types/pos";

// Map WorkflowOrder.items -> OrderItem[] expected by buildReceiptHtml
function mapItems(order: WorkflowOrder): OrderItem[] {
  return order.items.map((it, idx) => ({
    id: `${order.id}-${idx}`,
    itemType: it.itemType,
    serviceId: it.service,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    conditions: it.conditions ?? [],
  }));
}

async function generateQrMarkup(value: string, size = 55): Promise<string> {
  // Lightweight inline QR using qrcode.react via dynamic SVG render is complex; use a simple QR via qrcode lib if available.
  // Fallback: use Google Chart API as <img>. We embed an <svg> wrapper containing an <image> for compatibility.
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="${url}" width="${size}" height="${size}" /></svg>`;
}

export async function printInvoices(orders: WorkflowOrder[]) {
  if (orders.length === 0) return;

  const logoUrl = new URL(BUSINESS.logo, window.location.origin).toString();

  const sections = await Promise.all(
    orders.map(async (order) => {
      const qrMarkup = await generateQrMarkup(`ORDER:${order.orderNumber}`);
      return buildReceiptHtml({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        items: mapItems(order),
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.totalAmount,
        paidAmount: order.paidAmount,
        remainingBalance: order.remainingBalance,
        logoUrl,
        qrMarkup,
      });
    })
  );

  // Each buildReceiptHtml returns a full <html> doc. For multi-print, extract bodies and stitch.
  let combinedHtml: string;
  if (sections.length === 1) {
    combinedHtml = sections[0];
  } else {
    const bodies = sections.map((html) => {
      const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      return match ? match[1] : html;
    });
    const headMatch = sections[0].match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const head = headMatch ? headMatch[1] : "";
    combinedHtml = `<!doctype html><html><head>${head}<style>.receipt{page-break-after:always;break-after:page;}.receipt:last-child{page-break-after:auto;break-after:auto;}</style></head><body>${bodies.join("")}</body></html>`;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(combinedHtml);
  printWindow.document.close();

  printWindow.onload = async () => {
    const images = Array.from(printWindow.document.images);
    await Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            })
      )
    );
    printWindow.focus();
    printWindow.print();
  };

  printWindow.onafterprint = () => {
    printWindow.close();
  };
}
