import { useState } from "react";
import { toLocalDateStr } from "@/lib/utils";
import type { WorkflowOrder } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatOMR } from "@/lib/currency";
import PaymentModal from "@/components/payment/PaymentModal";

interface OrderCardProps {
  order: WorkflowOrder;
  onSelect: (id: string) => void;
  onMoveNext: (id: string) => void;
  onMovePrev: (id: string) => void;
  onPaymentComplete?: () => void;
}

function isPhoneLike(s: string): boolean {
  return /^[+\d\s\-()]+$/.test(s.trim());
}

export default function OrderCard({ order, onSelect, onMoveNext, onMovePrev, onPaymentComplete }: OrderCardProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);

  const today = toLocalDateStr();
  const isOverdue = order.deliveryDate && order.deliveryDate < today && order.currentStatus !== "delivered";
  const isDueToday = order.deliveryDate === today && order.currentStatus !== "delivered";
  const stageIdx = WORKFLOW_STAGES.findIndex((s) => s.id === order.currentStatus);
  const canMoveNext = stageIdx < WORKFLOW_STAGES.length - 1;
  const canMovePrev = stageIdx > 0;
  const isReadyForPickup = order.currentStatus === "ready-for-pickup";

  const displayName =
    order.customerName &&
    order.customerName.trim() &&
    order.customerName !== order.customerPhone &&
    !isPhoneLike(order.customerName)
      ? order.customerName
      : null;

  const leftBorder = order.orderType === "urgent"
    ? "3px solid #F59E0B"
    : isOverdue
    ? "3px solid #EF4444"
    : isDueToday
    ? "3px solid #F97316"
    : undefined;

  return (
    <>
      <div
        dir="rtl"
        style={{
          background: "var(--bg-elevated)",
          border: "0.5px solid var(--border-subtle)",
          borderRight: leftBorder,
          borderRadius: 8,
          padding: 12,
          cursor: "pointer",
          transition: "border-color 100ms",
        }}
        onClick={() => onSelect(order.id)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
        }}
      >
        {/* Row 1: order number + badges */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <div style={{ display: "flex", gap: 3 }}>
            {order.orderType === "urgent" && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99,
                background: "rgba(245,158,11,0.15)", color: "#F59E0B",
              }}>
                ⚡ عاجل
              </span>
            )}
            {isOverdue && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99,
                background: "rgba(239,68,68,0.15)", color: "#EF4444",
              }}>
                متأخر
              </span>
            )}
            {isDueToday && !isOverdue && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99,
                background: "rgba(249,115,22,0.15)", color: "#F97316",
              }}>
                اليوم
              </span>
            )}
            {order.id.startsWith("local-") && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99,
                background: "rgba(245,158,11,0.15)", color: "#F59E0B",
              }}>
                غير متزامن
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-tertiary)" }}>
            {order.orderNumber}
          </span>
        </div>

        {/* Row 2: customer name */}
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: displayName ? "var(--text-primary)" : "var(--text-tertiary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 2,
          fontStyle: displayName ? "normal" : "italic",
        }}>
          {displayName || "عميل غير محدد"}
        </div>

        {/* Row 3: phone */}
        <div style={{
          fontSize: 11,
          fontFamily: "monospace",
          color: "var(--text-secondary)",
          marginBottom: 8,
          direction: "ltr",
          textAlign: "right",
        }}>
          {order.customerPhone}
        </div>

        {/* Row 4: items count + amount */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {order.itemCount} {order.itemCount === 1 ? "قطعة" : "قطع"}
          </span>
          <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 500, color: "var(--text-primary)" }}>
            {formatOMR(order.totalAmount)}
          </span>
        </div>

        {/* Row 5: payment badge */}
        <div style={{ marginBottom: 10 }}>
          <PaymentBadge status={order.paymentStatus} />
        </div>

        {/* Actions */}
        <div onClick={(e) => e.stopPropagation()}>
          {isReadyForPickup && order.remainingBalance > 0 ? (
            <button
              style={{
                width: "100%",
                height: 28,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(16,185,129,0.12)",
                color: "#10B981",
                border: "1px solid rgba(16,185,129,0.3)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
              onClick={() => setPaymentOpen(true)}
            >
              تحصيل {formatOMR(order.remainingBalance)}
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button
                disabled={!canMovePrev}
                onClick={() => onMovePrev(order.id)}
                style={{
                  height: 28,
                  borderRadius: 6,
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  cursor: canMovePrev ? "pointer" : "not-allowed",
                  opacity: canMovePrev ? 1 : 0.35,
                }}
              >
                <ChevronRight size={11} />
                رجوع
              </button>
              <button
                disabled={!canMoveNext}
                onClick={() => onMoveNext(order.id)}
                style={{
                  height: 28,
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: canMoveNext ? "var(--color-accent, #6366F1)" : "transparent",
                  border: canMoveNext ? "none" : "1px solid var(--border-default)",
                  color: canMoveNext ? "#fff" : "var(--text-tertiary)",
                  cursor: canMoveNext ? "pointer" : "not-allowed",
                  opacity: canMoveNext ? 1 : 0.35,
                }}
              >
                التالي
                <ChevronLeft size={11} />
              </button>
            </div>
          )}
        </div>

        {/* View details */}
        <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <Link
            to={`/order/${order.id}`}
            style={{ fontSize: 11, color: "var(--text-tertiary)", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
          >
            عرض التفاصيل ←
          </Link>
        </div>
      </div>

      {paymentOpen && (
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

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    paid:             { label: "مدفوع",       bg: "rgba(16,185,129,0.12)",  color: "#10B981" },
    "partially-paid": { label: "جزئي",         bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
    unpaid:           { label: "غير مدفوع",   bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
  };
  const info = map[status] || map.unpaid;
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: "2px 7px",
      borderRadius: 99,
      background: info.bg,
      color: info.color,
      display: "inline-block",
    }}>
      {info.label}
    </span>
  );
}
