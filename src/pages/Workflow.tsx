import { useWorkflowState } from "@/hooks/useWorkflowState";
import SummaryCards from "@/components/workflow/SummaryCards";
import FilterBar from "@/components/workflow/FilterBar";
import WorkflowBoard from "@/components/workflow/WorkflowBoard";
import OrderDetailDrawer from "@/components/workflow/OrderDetailDrawer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function Workflow() {
  const wf = useWorkflowState();

  const handleMoveNext = async (id: string) => {
    const result = await wf.moveToNext(id);
    if (result?.whatsappResult) {
      if (result.whatsappResult.success) {
        toast.success("Order marked Ready for Pickup and WhatsApp notification sent.");
      } else {
        toast.warning("Order marked Ready for Pickup, but WhatsApp notification failed.");
      }
    } else {
      toast.success("Order moved to next stage");
    }
  };

  const handleMovePrev = (id: string) => {
    wf.moveToPrev(id);
    toast.info("Order moved back");
  };

  const handlePaymentComplete = () => {
    toast.success("Payment completed — Order delivered!");
    wf.refetch();
  };

  return (
    <div
      className="page-layout"
      style={{ background: "var(--bg-base)", padding: 0 }}
    >
      {/* Sticky page header */}
      <div
        className="page-header"
        style={{ padding: "20px 32px" }}
      >
        <div>
          <h1 className="page-title">لوحة العمليات</h1>
          <p className="page-subtitle">إدارة وتتبع الطلبات</p>
        </div>
        <div className="page-actions">
          <Link to="/">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              طلب جديد
            </Button>
          </Link>
        </div>
      </div>

      {/* Content area */}
      {wf.loading ? (
        <div style={{ padding: "32px" }}>
          <div className="flex gap-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="skeleton-shimmer rounded-lg"
                style={{ width: 280, height: 400, flexShrink: 0 }}
              />
            ))}
          </div>
        </div>
      ) : wf.orders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{ padding: "80px 32px", textAlign: "center" }}
        >
          <p
            className="text-lg font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            لا توجد طلبات بعد
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            أنشئ طلبك الأول من صفحة نقطة البيع
          </p>
          <Link to="/">
            <Button size="sm" className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" />
              إنشاء طلب
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div style={{ padding: "0 32px" }}>
            <SummaryCards counts={wf.statusCounts} />
          </div>
          <div style={{ padding: "0 32px" }}>
            <FilterBar
              filters={wf.filters}
              onFilterChange={wf.updateFilter}
              onReset={wf.resetFilters}
            />
          </div>
          <div style={{ padding: "0 32px 32px", overflowX: "auto" }}>
            <WorkflowBoard
              ordersByStatus={wf.ordersByStatus}
              onSelectOrder={wf.setSelectedOrderId}
              onMoveNext={handleMoveNext}
              onMovePrev={handleMovePrev}
              onPaymentComplete={handlePaymentComplete}
            />
          </div>
        </>
      )}

      <OrderDetailDrawer
        order={wf.selectedOrder}
        open={!!wf.selectedOrderId}
        onClose={() => wf.setSelectedOrderId(null)}
        onMoveNext={handleMoveNext}
        onMovePrev={handleMovePrev}
        onAddNote={wf.addNote}
        onToggleUrgent={wf.toggleUrgent}
        onPaymentComplete={handlePaymentComplete}
        onDeleteOrder={async (id) => {
          await wf.deleteOrder(id);
          toast.success("Order deleted");
        }}
      />
    </div>
  );
}
