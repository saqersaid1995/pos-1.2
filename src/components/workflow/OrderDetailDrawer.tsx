import { useState } from "react";
import { toLocalDateStr } from "@/lib/utils";
import type { WorkflowOrder } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ChevronLeft, AlertTriangle, Clock, StickyNote, History, ExternalLink, Banknote, Copy, Trash2, CreditCard } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { formatOMR } from "@/lib/currency";
import { toast } from "sonner";
import PaymentModal from "@/components/payment/PaymentModal";

interface Props {
  order: WorkflowOrder | null;
  open: boolean;
  onClose: () => void;
  onMoveNext: (id: string) => void;
  onMovePrev: (id: string) => void;
  onAddNote: (id: string, text: string) => void;
  onToggleUrgent: (id: string) => void;
  onPaymentComplete?: () => void;
  onDeleteOrder?: (id: string) => void;
}

export default function OrderDetailDrawer({ order, open, onClose, onMoveNext, onMovePrev, onAddNote, onToggleUrgent, onPaymentComplete, onDeleteOrder }: Props) {
  const [noteText, setNoteText] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const navigate = useNavigate();

  if (!order) return null;

  const stageIdx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
  const canNext = stageIdx < WORKFLOW_STAGES.length - 1;
  const canPrev = stageIdx > 0;
  const today = toLocalDateStr();
  const isOverdue = order.deliveryDate < today && order.currentStatus !== "delivered";
  const isReadyForPickup = order.currentStatus === "ready-for-pickup";

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    onAddNote(order.id, noteText.trim());
    setNoteText("");
  };

  const handleRepeatOrder = () => {
    // Navigate to POS with repeat order data via URL params
    const itemsParam = encodeURIComponent(JSON.stringify(order.items));
    navigate(`/?repeat=${order.id}&customer=${encodeURIComponent(order.customerName)}&phone=${encodeURIComponent(order.customerPhone)}`);
    onClose();
    toast.success("Order duplicated — edit and save when ready");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-base">{order.orderNumber}</SheetTitle>
              {order.orderType === "urgent" && <Badge className="bg-accent text-accent-foreground text-[0.65rem]">Urgent</Badge>}
              {isOverdue && <Badge variant="destructive" className="text-[0.65rem]">Overdue</Badge>}
            </div>
            <SheetDescription className="text-sm">{order.customerName} • {order.customerPhone}</SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4">
            {/* Collect & Pay CTA for ready-for-pickup with balance */}
            {isReadyForPickup && order.remainingBalance > 0 && (
              <div className="py-3">
                <Button
                  size="lg"
                  className="w-full h-12 text-sm font-semibold gap-2 bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => setPaymentOpen(true)}
                >
                  <Banknote className="h-5 w-5" />
                  Collect & Pay — {formatOMR(order.remainingBalance)}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2 py-3">
              <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => onMovePrev(order.id)} className="h-8 text-xs">
                <ChevronLeft className="h-3 w-3 mr-1" />
                {canPrev && WORKFLOW_STAGES[stageIdx - 1]?.label}
              </Button>
              <div className="flex-1 text-center">
                <Badge variant="secondary" className="text-xs font-semibold">{WORKFLOW_STAGES[stageIdx]?.label}</Badge>
              </div>
              <Button size="sm" disabled={!canNext} onClick={() => onMoveNext(order.id)} className="h-8 text-xs">
                {canNext && WORKFLOW_STAGES[stageIdx + 1]?.label}
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3 py-3 text-sm">
              <InfoRow label="Order Date" value={order.orderDate} />
              <InfoRow label="Delivery Date" value={order.deliveryDate} />
              <InfoRow label="Type" value={order.orderType} />
              <InfoRow label="Pickup" value={order.pickupMethod} />
              <InfoRow label="Payment Status" value={order.paymentStatus} />
              <InfoRow label="Total" value={formatOMR(order.totalAmount)} />
              <InfoRow label="Paid" value={formatOMR(order.paidAmount)} />
              {order.remainingBalance > 0 && <InfoRow label="Remaining" value={formatOMR(order.remainingBalance)} />}
            </div>

            <Separator />

            <div className="py-3">
              <h4 className="pos-label mb-2">Items ({order.itemCount})</h4>
              <div className="space-y-1.5">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-secondary/50 rounded px-2 py-1.5">
                    <div>
                      <span className="font-medium">{item.itemType}</span>
                      <span className="text-muted-foreground ml-1.5">× {item.quantity}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">({item.service})</span>
                    </div>
                    <span className="text-xs font-medium">{formatOMR(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>

            {order.orderNotes && (
              <>
                <Separator />
                <div className="py-3">
                  <h4 className="pos-label mb-1">Order Notes</h4>
                  <p className="text-sm text-muted-foreground">{order.orderNotes}</p>
                </div>
              </>
            )}

            <Separator />

            <div className="py-3">
              <h4 className="pos-label mb-2 flex items-center gap-1"><StickyNote className="h-3 w-3" /> Internal Notes</h4>
              <div className="space-y-1.5 mb-3">
                {order.internalNotes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet</p>}
                {order.internalNotes.map((note) => (
                  <div key={note.id} className="text-xs bg-secondary/50 rounded px-2 py-1.5">
                    <p>{note.text}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {note.createdBy && `${note.createdBy} • `}{new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="min-h-[60px] text-xs"
                />
              </div>
              <Button size="sm" className="mt-2 h-7 text-xs" onClick={handleAddNote} disabled={!noteText.trim()}>
                Add Note
              </Button>
            </div>

            <Separator />

            <div className="py-3">
              <h4 className="pos-label mb-2 flex items-center gap-1"><History className="h-3 w-3" /> Status History</h4>
              <div className="space-y-1">
                {/* Merge status changes and payments, sorted by date */}
                {[
                  ...order.statusHistory.map((change) => ({
                    id: change.id,
                    date: change.changedAt,
                    type: "status" as const,
                    data: change,
                  })),
                  ...order.paymentHistory.map((payment) => ({
                    id: payment.id,
                    date: payment.paymentDate,
                    type: "payment" as const,
                    data: payment,
                  })),
                ]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((entry) =>
                    entry.type === "status" ? (
                      <div key={entry.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>
                          {entry.data.fromStatus ? `${entry.data.fromStatus} → ${entry.data.toStatus}` : `Created as ${entry.data.toStatus}`}
                        </span>
                        <span className="ml-auto shrink-0">{new Date(entry.date).toLocaleDateString()}</span>
                      </div>
                    ) : (
                      <div key={entry.id} className="flex items-center gap-2 text-xs text-success">
                        <CreditCard className="h-3 w-3 shrink-0" />
                        <span>
                          Payment: {formatOMR(entry.data.amount)} ({entry.data.paymentMethod})
                        </span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString()} {new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )
                  )}
              </div>
            </div>

            <div className="py-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => onToggleUrgent(order.id)}
              >
                <AlertTriangle className="h-3 w-3" />
                {order.orderType === "urgent" ? "Remove Urgent" : "Mark Urgent"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={handleRepeatOrder}
              >
                <Copy className="h-3 w-3" /> Repeat Order
              </Button>
              <Link to={`/order/${order.id}`} onClick={onClose}>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" /> Full Details
                </Button>
              </Link>
              {onDeleteOrder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this order? It will be hidden from all views.")) {
                      onDeleteOrder(order.id);
                      onClose();
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Delete Order
                </Button>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {paymentOpen && order && (
        <PaymentModal
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          order={order}
          onPaymentComplete={() => {
            setPaymentOpen(false);
            onPaymentComplete?.();
          }}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}
