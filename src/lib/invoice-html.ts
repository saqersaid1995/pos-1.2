/**
 * Shared invoice HTML builder – single source of truth.
 * Used by InvoiceModal (browser preview/print) and can be used for any HTML-to-print flow.
 */
import type { OrderItem } from "@/types/pos";
import { formatOMR } from "@/lib/currency";
import { BUSINESS } from "@/lib/business-config";

const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface InvoiceData {
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
}

export function buildReceiptHtml(
  data: InvoiceData & { logoUrl: string; qrMarkup: string }
): string {
  const {
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
  } = data;

  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${esc(item.itemType || "—")}</td>
          <td>${esc(item.serviceId || "—")}</td>
          <td class="c">${item.quantity}</td>
          <td class="r">${esc(formatOMR(item.unitPrice * item.quantity))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt</title>
  <style>
    @page {
      size: 80mm 210mm;
      margin: 0;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0; padding: 0; width: 100%; min-height: 100%; background: #fff;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .receipt {
      width: 72mm; margin: 6mm auto 0; font-size: 11px; line-height: 1.35;
      page-break-inside: avoid; break-inside: avoid-page;
    }

    .header {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; text-align: center; margin-bottom: 4px;
    }

    .header img { width: 28px; height: 28px; object-fit: contain; flex: none; }
    .header h1 { margin: 0; font-size: 13px; line-height: 1.1; font-weight: 700; }
    .tagline { margin: 1px 0 0; font-size: 9px; color: #666; }
    .divider { border: 0; border-top: 1px solid #d8d8d8; margin: 4px 0; }

    .phone-row {
      text-align: center; font-size: 22px; font-weight: 700;
      letter-spacing: 0.5px; margin: 4px 0;
    }
    .phone-row .label { font-weight: 400; font-size: 10px; color: #666; }

    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 2px 8px; font-size: 10px;
    }
    .info-grid .full { grid-column: 1 / -1; }
    .label { color: #666; }

    table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 10px; }
    th {
      padding: 0 0 2px; text-align: left; font-size: 9px;
      text-transform: uppercase; letter-spacing: 0.4px; color: #666;
    }
    td { padding: 2px 0; border-top: 1px solid #ededed; vertical-align: top; }
    .c { text-align: center; }
    .r { text-align: right; }

    .totals { display: grid; gap: 2px; margin-top: 2px; font-size: 11px; }
    .totals-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .totals-row.total { font-size: 13px; font-weight: 700; }
    .totals-row.remaining { color: #c1121f; }

    .qr { display: flex; justify-content: center; padding: 5px 0 3px; }
    .qr svg { width: 55px; height: 55px; display: block; }
    .footer { text-align: center; font-size: 9px; color: #666; margin: 0; }
  </style>
</head>
<body>
  <article class="receipt">
    <div class="header">
      <img src="${esc(logoUrl)}" alt="${esc(BUSINESS.name)}" />
      <div>
        <h1>${esc(BUSINESS.name)}</h1>
        <p class="tagline">${esc(BUSINESS.tagline)}</p>
      </div>
    </div>

    <hr class="divider" />

    <div class="phone-row">
      <span class="label">Phone: </span>${esc(customerPhone || "—")}
    </div>

    <hr class="divider" />

    <div class="info-grid">
      <div><span class="label">Order: </span><strong>${esc(orderNumber)}</strong></div>
      <div><span class="label">Date: </span><strong>${esc(orderDate)}</strong></div>
      <div><span class="label">Customer: </span><strong>${esc(customerName || "Walk-in")}</strong></div>
      ${deliveryDate ? `<div><span class="label">Delivery: </span><strong>${esc(deliveryDate)}</strong></div>` : ""}
    </div>

    <hr class="divider" />

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Service</th>
          <th class="c">Qty</th>
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <hr class="divider" />

    <div class="totals">
      ${discount > 0 ? `<div class="totals-row"><span class="label">Subtotal</span><span>${esc(formatOMR(subtotal))}</span></div>
      <div class="totals-row" style="color:#c1121f"><span>Discount</span><span>-${esc(formatOMR(discount))}</span></div>` : ""}
      <div class="totals-row total">
        <span>Total</span>
        <span>${esc(formatOMR(total))}</span>
      </div>
      <div class="totals-row">
        <span class="label">Paid</span>
        <span>${esc(formatOMR(paidAmount))}</span>
      </div>
      ${remainingBalance > 0 ? `<div class="totals-row remaining"><span>Remaining</span><span>${esc(formatOMR(remainingBalance))}</span></div>` : ""}
    </div>

    <div class="qr">${qrMarkup}</div>
    <p class="footer">Thank you for your business!</p>
  </article>
</body>
</html>`;
}
