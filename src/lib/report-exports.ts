import { formatOMR } from "./currency";

export function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => {
      const val = r[h] ?? "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReport(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <html><head><title>Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
      th { background: #f5f5f5; font-weight: 600; }
      h1, h2, h3 { margin: 8px 0; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
      .kpi-card { border: 1px solid #ddd; padding: 12px; border-radius: 6px; }
      .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; }
      .kpi-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
    </style></head><body>${el.innerHTML}</body></html>
  `);
  win.document.close();
  win.print();
}

export function exportSalesCSV(orders: any[]) {
  downloadCSV(orders.map((o) => ({
    Date: o.orderDate,
    "Order Number": o.orderNumber,
    Customer: o.customerName,
    Phone: o.customerPhone,
    Items: o.itemCount,
    "Order Type": o.orderType,
    "Total Amount": o.totalAmount.toFixed(3),
    "Paid Amount": o.paidAmount.toFixed(3),
    "Remaining": o.remainingBalance.toFixed(3),
    "Payment Status": o.paymentStatus,
    "Order Status": o.currentStatus,
  })), "sales-report");
}

export function exportExpensesCSV(expenses: any[]) {
  downloadCSV(expenses.map((e) => ({
    Date: e.expense_date,
    Category: e.category,
    Description: e.description,
    Amount: e.amount.toFixed(3),
    "Payment Source": (e.payment_source || "cash").charAt(0).toUpperCase() + (e.payment_source || "cash").slice(1),
    "Cash Amount": (e.cash_amount || 0).toFixed(3),
    "Bank Amount": (e.bank_amount || 0).toFixed(3),
    Status: e.expense_status === "paid" ? "Paid" : "Accrued",
    Source: e.is_auto_generated ? "Auto-generated" : "Manual",
    Recurring: e.is_recurring ? e.recurring_period || "Yes" : "No",
  })), "expenses-report");
}

export function exportCustomersCSV(customers: any[]) {
  downloadCSV(customers.map((c: any) => ({
    Name: c.name,
    Phone: c.phone,
    Orders: c.orders,
    "Total Spent": c.spent.toFixed(3),
    "Outstanding Balance": c.balance.toFixed(3),
    "Last Order": c.lastDate,
  })), "customers-report");
}
