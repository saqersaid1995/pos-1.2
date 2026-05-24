import { useState, useEffect, useCallback } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { BUSINESS } from "@/lib/business-config";
import { useParams, Link, useNavigate } from "react-router-dom";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { GARMENT_CONDITIONS } from "@/types/pos";
import type { WorkflowOrder } from "@/types/workflow";
import { fetchOrderById, updateOrderStatus, addInternalNote, toggleOrderUrgent, softDeleteOrder } from "@/lib/supabase-queries";
import { sendReadyForPickupWhatsApp, fetchNotificationLogs } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import PaymentModal from "@/components/payment/PaymentModal";
import EditPaymentModal from "@/components/payment/EditPaymentModal";
import { useAuth } from "@/contexts/AuthContext";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Printer, ChevronRight, ChevronLeft, AlertTriangle,
  Clock, StickyNote, History, User, Package, CreditCard, FileText,
  CheckCircle2, Circle, ArrowRight, Loader2, MessageCircle, Send, RefreshCw, Trash2,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { formatOMR } from "@/lib/currency";

export default function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<WorkflowOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [notifLogs, setNotifLogs] = useState<any[]>([]);
  const [resending, setResending] = useState(false);
  const [editPayment, setEditPayment] = useState<any | null>(null);
  const [corrections, setCorrections] = useState<any[]>([]);
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const data = await fetchOrderById(orderId);
    setOrder(data);
    setLoading(false);
    // Load notification logs
    const logs = await fetchNotificationLogs(orderId);
    setNotifLogs(logs);
    // Load payment corrections
    const { data: corr } = await supabase
      .from("payment_corrections")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setCorrections(corr || []);
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleResendWhatsApp = async () => {
    if (!order) return;
    setResending(true);
    // Get customer_id from DB
    const { data: orderRow } = await supabase
      .from("orders")
      .select("customer_id")
      .eq("id", order.id)
      .maybeSingle();

    const result = await sendReadyForPickupWhatsApp({
      orderId: order.id,
      customerId: orderRow?.customer_id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      remainingAmount: order.remainingBalance,
    });
    setResending(false);
    if (result.success) {
      toast.success("WhatsApp notification resent successfully.");
    } else {
      toast.error(`WhatsApp resend failed: ${result.error || "Unknown error"}`);
    }
    // Reload logs
    const logs = await fetchNotificationLogs(order.id);
    setNotifLogs(logs);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Order not found</h2>
          <Link to="/workflow">
            <Button variant="outline">Back to Workflow</Button>
          </Link>
        </div>
      </div>
    );
  }

  const today = toLocalDateStr();
  const isOverdue = order.deliveryDate < today && order.currentStatus !== "delivered";
  const isDueToday = order.deliveryDate === today && order.currentStatus !== "delivered";
  const stageIdx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
  const canNext = stageIdx < WORKFLOW_STAGES.length - 1;
  const canPrev = stageIdx > 0;

  const invoiceNumber = `INV-${order.orderNumber.replace("ORD-", "")}`;

  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const urgentFee = order.orderType === "urgent" ? subtotal * 0.5 : 0;

  const handleMoveNext = async () => {
    if (canNext) {
      await updateOrderStatus(order.id, order.currentStatus, WORKFLOW_STAGES[stageIdx + 1].id);
      toast.success("Order moved to next stage");
      loadOrder();
    }
  };

  const handleMovePrev = async () => {
    if (canPrev) {
      await updateOrderStatus(order.id, order.currentStatus, WORKFLOW_STAGES[stageIdx - 1].id);
      toast.info("Order moved back");
      loadOrder();
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addInternalNote(order.id, noteText.trim());
    setNoteText("");
    toast.success("Note added");
    loadOrder();
  };

  const handleToggleUrgent = async () => {
    await toggleOrderUrgent(order.id, order.orderType);
    toast.success(order.orderType === "urgent" ? "Urgent flag removed" : "Marked as urgent");
    loadOrder();
  };

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={order.orderNumber}
        actions={<StatusBadge status={order.currentStatus} />}
      />

      <div className="max-w-5xl mx-auto p-4 space-y-5">
        <section className="pos-section">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{order.orderNumber}</h2>
                <span className="text-sm text-muted-foreground font-mono">{invoiceNumber}</span>
              </div>
              <p className="text-sm text-muted-foreground">{order.customerName} • {order.customerPhone}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {order.orderType === "urgent" && <Badge className="bg-accent text-accent-foreground">Urgent</Badge>}
              <PaymentBadge status={order.paymentStatus} />
              {isOverdue && <Badge variant="destructive">Overdue</Badge>}
              {isDueToday && !isOverdue && <Badge className="bg-warning text-warning-foreground">Due Today</Badge>}
              {order.currentStatus === "ready-for-pickup" && <Badge className="bg-success text-success-foreground">Ready for Pickup</Badge>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
            <InfoCell label="Delivery Date" value={order.deliveryDate || "—"} />
            <InfoCell label="Order Type" value={order.orderType} />
            <InfoCell label="Payment" value={formatOMR(order.totalAmount)} />
            <InfoCell label="Status" value={WORKFLOW_STAGES[stageIdx]?.label || order.currentStatus} />
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <section className="pos-section space-y-3">
            <SectionHeader icon={User} title="Customer Information" />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoCell label="Name" value={order.customerName} />
              <InfoCell label="Phone" value={order.customerPhone} />
              <InfoCell label="Pickup Method" value={order.pickupMethod} />
              <InfoCell label="Notes" value={order.orderNotes || "—"} />
            </div>
          </section>

          <section className="pos-section space-y-3">
            <SectionHeader icon={Package} title="Order Information" />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoCell label="Order Number" value={order.orderNumber} />
              <InfoCell label="Invoice" value={invoiceNumber} />
              <InfoCell label="Order Date" value={order.orderDate} />
              <InfoCell label="Delivery Date" value={order.deliveryDate || "—"} />
              <InfoCell label="Order Type" value={order.orderType} />
              <InfoCell label="Pickup" value={order.pickupMethod} />
            </div>
          </section>
        </div>

        <section className="pos-section space-y-3">
          <SectionHeader icon={Package} title={`Items (${order.itemCount})`} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.itemType}</TableCell>
                    <TableCell>{item.service}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatOMR(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium">{formatOMR(item.unitPrice * item.quantity)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.conditions.map((c) => {
                          const cond = GARMENT_CONDITIONS.find((gc) => gc.id === c);
                          return <Badge key={c} variant="outline" className="text-[0.6rem] px-1.5">{cond?.label || c}</Badge>;
                        })}
                        {item.conditions.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <section className="pos-section space-y-3">
            <SectionHeader icon={CreditCard} title="Pricing & Payment" />
            <div className="space-y-2 text-sm">
              <PricingRow label="Subtotal" value={subtotal} />
              {urgentFee > 0 && <PricingRow label="Urgent Fee (50%)" value={urgentFee} />}
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>{formatOMR(order.totalAmount)}</span>
              </div>
              <Separator />
              <PricingRow label="Paid" value={order.paidAmount} />
              {order.remainingBalance > 0 && (
                <div className="flex justify-between font-semibold text-destructive">
                  <span>Remaining</span>
                  <span>{formatOMR(order.remainingBalance)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-muted-foreground">Payment:</span>
                <PaymentBadge status={order.paymentStatus} />
              </div>
            </div>
          </section>

          <section className="pos-section space-y-3">
            <SectionHeader icon={CheckCircle2} title="Workflow Status" />
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {WORKFLOW_STAGES.map((stage, i) => {
                const isActive = i === stageIdx;
                const isDone = i < stageIdx;
                return (
                  <div key={stage.id} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <div className={`w-4 h-0.5 ${isDone ? "bg-success" : "bg-border"}`} />}
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                    }`}>
                      {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      <span className="hidden sm:inline">{stage.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!canPrev} onClick={handleMovePrev} className="h-8 text-xs flex-1">
                <ChevronLeft className="h-3 w-3 mr-1" />
                {canPrev ? WORKFLOW_STAGES[stageIdx - 1]?.label : "Back"}
              </Button>
              <Button size="sm" disabled={!canNext} onClick={handleMoveNext} className="h-8 text-xs flex-1">
                {canNext ? WORKFLOW_STAGES[stageIdx + 1]?.label : "Done"}
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </section>
        </div>

        {/* Invoice View */}
        <section className="pos-section space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader icon={FileText} title="Invoice" />
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 print:hidden" onClick={handlePrint}>
              <Printer className="h-3 w-3" /> Print
            </Button>
          </div>
          <div className="invoice-print border border-border rounded-lg p-6 bg-card space-y-4 text-sm">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <img src={BUSINESS.logo} alt={BUSINESS.name} className="h-10 w-10 object-contain" />
                <div>
                  <h3 className="text-lg font-bold">{BUSINESS.name}</h3>
                  <p className="text-xs text-muted-foreground">{BUSINESS.tagline}</p>
                </div>
              </div>
              <QRCodeSVG value={`ORDER:${order.orderNumber}`} size={64} />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Invoice:</span> <strong>{invoiceNumber}</strong></div>
              <div><span className="text-muted-foreground">Order:</span> <strong>{order.orderNumber}</strong></div>
              <div><span className="text-muted-foreground">Customer:</span> <strong>{order.customerName}</strong></div>
              <div><span className="text-muted-foreground">Phone:</span> <strong>{order.customerPhone}</strong></div>
              <div><span className="text-muted-foreground">Order Date:</span> <strong>{order.orderDate}</strong></div>
              <div><span className="text-muted-foreground">Delivery:</span> <strong>{order.deliveryDate || "—"}</strong></div>
            </div>
            <Separator />
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1 font-semibold">Item</th>
                  <th className="text-left py-1 font-semibold">Service</th>
                  <th className="text-center py-1 font-semibold">Qty</th>
                  <th className="text-right py-1 font-semibold">Price</th>
                  <th className="text-right py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1">{item.itemType}</td>
                    <td className="py-1">{item.service}</td>
                    <td className="text-center py-1">{item.quantity}</td>
                    <td className="text-right py-1">{formatOMR(item.unitPrice)}</td>
                    <td className="text-right py-1">{formatOMR(item.unitPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Separator />
            <div className="flex flex-col items-end space-y-1 text-xs">
              <div className="flex gap-8"><span className="text-muted-foreground">Subtotal:</span> <span>{formatOMR(subtotal)}</span></div>
              {urgentFee > 0 && <div className="flex gap-8"><span className="text-muted-foreground">Urgent Fee:</span> <span>{formatOMR(urgentFee)}</span></div>}
              <Separator className="w-32" />
              <div className="flex gap-8 font-bold text-sm"><span>Total:</span> <span>{formatOMR(order.totalAmount)}</span></div>
              <div className="flex gap-8"><span className="text-muted-foreground">Paid:</span> <span>{formatOMR(order.paidAmount)}</span></div>
              {order.remainingBalance > 0 && (
                <div className="flex gap-8 font-semibold text-destructive"><span>Balance:</span> <span>{formatOMR(order.remainingBalance)}</span></div>
              )}
            </div>
            <p className="text-center text-[0.6rem] text-muted-foreground mt-4">Thank you for your business!</p>
          </div>
        </section>

        {/* WhatsApp Notifications */}
        <section className="pos-section space-y-3 print:hidden">
          <SectionHeader icon={MessageCircle} title="WhatsApp Notifications" />
          {notifLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No WhatsApp notifications sent for this order.</p>
          ) : (
            <div className="space-y-2">
              {notifLogs.map((log: any) => (
                <div key={log.id} className="flex items-start justify-between bg-secondary/50 rounded-md px-3 py-2 text-sm">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{log.message_type?.replace(/_/g, " ")}</span>
                      <Badge
                        variant={log.send_status === "sent" ? "default" : log.send_status === "failed" ? "destructive" : "secondary"}
                        className="text-[0.6rem]"
                      >
                        {log.send_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">To: {log.recipient_phone}</p>
                    {log.error_message && (
                      <p className="text-xs text-destructive">Error: {log.error_message}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleResendWhatsApp}
            disabled={resending || !order.customerPhone}
          >
            {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Resend WhatsApp Notification
          </Button>
        </section>

        {/* Status History */}
        <section className="pos-section space-y-3">
          <SectionHeader icon={History} title="Status History" />
          {order.statusHistory.length === 0 && order.paymentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes yet.</p>
          ) : (
            <div className="space-y-0">
              {(() => {
                const timeline = [
                  ...order.statusHistory.map((change) => ({ id: change.id, date: change.changedAt, type: "status" as const, data: change })),
                  ...order.paymentHistory.map((payment) => ({ id: payment.id, date: payment.paymentDate, type: "payment" as const, data: payment })),
                  ...corrections.map((c: any) => ({ id: `corr-${c.id}`, date: c.created_at, type: "correction" as const, data: c })),
                ].sort((a, b) => a.date.localeCompare(b.date));

                return timeline.map((entry, i) => (
                  <div key={entry.id} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full shrink-0 ${
                        entry.type === "payment" ? "bg-green-500" :
                        entry.type === "correction" ? "bg-warning" :
                        i === timeline.length - 1 ? "bg-primary" : "bg-border"
                      }`} />
                      {i < timeline.length - 1 && <div className="w-0.5 flex-1 bg-border" />}
                    </div>
                    <div className="text-sm space-y-0.5 -mt-0.5 flex-1">
                      {entry.type === "status" ? (
                        <>
                          <p className="font-medium">
                            {(entry.data as any).fromStatus
                              ? <><span className="capitalize">{(entry.data as any).fromStatus.replace("-", " ")}</span> <ArrowRight className="inline h-3 w-3 mx-1" /> <span className="capitalize">{(entry.data as any).toStatus.replace("-", " ")}</span></>
                              : <span>Created as <span className="capitalize font-semibold">{(entry.data as any).toStatus.replace("-", " ")}</span></span>
                            }
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.date).toLocaleString()}
                            {(entry.data as any).changedBy && <> • {(entry.data as any).changedBy}</>}
                          </p>
                        </>
                      ) : entry.type === "payment" ? (
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-green-600">
                              <CreditCard className="inline h-3 w-3 mr-1" />
                              Payment: {formatOMR((entry.data as any).amount)} ({(entry.data as any).paymentMethod})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(entry.date).toLocaleString()}
                            </p>
                          </div>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1 print:hidden"
                              onClick={() => setEditPayment(entry.data)}
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-warning">
                            Payment corrected: <span className="capitalize">{(entry.data as any).old_method}</span>
                            <ArrowRight className="inline h-3 w-3 mx-1" />
                            <span className="capitalize">{(entry.data as any).new_method}</span>
                            {Number((entry.data as any).old_amount) !== Number((entry.data as any).new_amount) && (
                              <> • {formatOMR(Number((entry.data as any).old_amount))} → {formatOMR(Number((entry.data as any).new_amount))}</>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.date).toLocaleString()}
                            {(entry.data as any).changed_by && <> • {(entry.data as any).changed_by}</>}
                          </p>
                          {(entry.data as any).reason && (
                            <p className="text-xs text-muted-foreground italic">Reason: {(entry.data as any).reason}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </section>

        {/* Internal Notes */}
        <section className="pos-section space-y-3">
          <SectionHeader icon={StickyNote} title="Internal Notes" />
          {order.internalNotes.length === 0 && <p className="text-sm text-muted-foreground">No internal notes yet.</p>}
          <div className="space-y-2">
            {order.internalNotes.map((note) => (
              <div key={note.id} className="bg-secondary/50 rounded-md px-3 py-2">
                <p className="text-sm">{note.text}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {note.createdBy && `${note.createdBy} • `}{new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 print:hidden">
            <Textarea
              placeholder="Add an internal note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>
          <Button size="sm" className="h-8 text-xs print:hidden" onClick={handleAddNote} disabled={!noteText.trim()}>
            Add Note
          </Button>
        </section>

        {/* Action Buttons */}
        <section className="pos-section flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Print Invoice
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={handleToggleUrgent}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {order.orderType === "urgent" ? "Remove Urgent" : "Mark Urgent"}
          </Button>
          {order.remainingBalance > 0 && (
            <Button size="sm" className="h-9 text-xs gap-1.5 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => setPaymentOpen(true)}>
              <CreditCard className="h-3.5 w-3.5" /> Collect Payment
            </Button>
          )}
          {canNext && (
            <Button size="sm" className="h-9 text-xs gap-1.5" onClick={handleMoveNext}>
              Move to {WORKFLOW_STAGES[stageIdx + 1]?.label} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={async () => {
              if (confirm("Are you sure you want to delete this order? It will be hidden from all views.")) {
                const ok = await softDeleteOrder(order.id);
                if (ok) {
                  toast.success("Order deleted");
                  navigate("/workflow");
                } else {
                  toast.error("Failed to delete order");
                }
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Order
          </Button>
          <div className="flex-1" />
          <Link to="/workflow">
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Workflow
            </Button>
          </Link>
        </section>

        <PaymentModal
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          order={order}
          onPaymentComplete={loadOrder}
        />

        <EditPaymentModal
          open={!!editPayment}
          onOpenChange={(v) => !v && setEditPayment(null)}
          payment={editPayment}
          onSaved={loadOrder}
        />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <h3 className="pos-label flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" /> {title}
    </h3>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}

function PricingRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatOMR(value)}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const stage = WORKFLOW_STAGES.find((s) => s.id === status);
  return <Badge variant="secondary" className="text-xs">{stage?.label || status}</Badge>;
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: "Paid", className: "bg-success/15 text-success border-success/20" },
    "partially-paid": { label: "Partial", className: "bg-warning/15 text-warning border-warning/20" },
    unpaid: { label: "Unpaid", className: "bg-destructive/15 text-destructive border-destructive/20" },
  };
  const info = map[status] || map.unpaid;
  return <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${info.className}`}>{info.label}</span>;
}
