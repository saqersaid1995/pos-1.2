import type { WorkflowOrder, WorkflowStatus } from "@/types/workflow";
import { WORKFLOW_STAGES } from "@/types/workflow";
import OrderCard from "./OrderCard";

interface WorkflowBoardProps {
  ordersByStatus: Record<WorkflowStatus, WorkflowOrder[]>;
  onSelectOrder: (id: string) => void;
  onMoveNext: (id: string) => void;
  onMovePrev: (id: string) => void;
  onPaymentComplete?: () => void;
}

export default function WorkflowBoard({
  ordersByStatus,
  onSelectOrder,
  onMoveNext,
  onMovePrev,
  onPaymentComplete,
}: WorkflowBoardProps) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minHeight: 400 }}>
      {WORKFLOW_STAGES.map((stage) => {
        const orders = ordersByStatus[stage.id];
        return (
          <div
            key={stage.id}
            style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column" }}
          >
            {/* Column header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 8,
                borderRight: `3px solid ${stage.color}`,
                background: `${stage.color}14`,
                marginBottom: 8,
                flexShrink: 0,
              }}
              dir="rtl"
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {stage.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "1px 8px",
                  borderRadius: 99,
                  background: `${stage.color}20`,
                  color: stage.color,
                }}
              >
                {orders.length}
              </span>
            </div>

            {/* Cards column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                overflowY: "auto",
                flex: 1,
                minHeight: 200,
                paddingBottom: 8,
              }}
            >
              {orders.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    textAlign: "center",
                    paddingTop: 32,
                  }}
                >
                  لا توجد طلبات
                </div>
              )}
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onSelect={onSelectOrder}
                  onMoveNext={onMoveNext}
                  onMovePrev={onMovePrev}
                  onPaymentComplete={onPaymentComplete}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
