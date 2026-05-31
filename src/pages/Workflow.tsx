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
        toast.success("تم تحديث الطلب للجاهزة للاستلام وإرسال إشعار واتساب");
      } else {
        toast.warning("تم تحديث الطلب ولكن فشل إرسال إشعار واتساب");
      }
    } else {
      toast.success("تم تحريك الطلب للمرحلة التالية");
    }
  };

  const handleMovePrev = (id: string) => {
    wf.moveToPrev(id);
    toast.info("تم إرجاع الطلب للمرحلة السابقة");
  };

  const handlePaymentComplete = () => {
    toast.success("تم تسديد الدفع وتسليم الطلب!");
    wf.refetch();
  };

  return (
    <div
      className="page-layout"
      style={{ background: "var(--bg-base)", padding: 0 }}
    >
      {/* Page header */}
      <div className="page-header" style={{ padding: "14px 24px" }}>
        <div>
          <h1 className="page-title">لوحة العمليات</h1>
          <p className="page-subtitle">إدارة وتتبع الطلبات</p>
        </div>
      </div>

      {/* Content area */}
      {wf.loading ? (
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="skeleton-shimmer rounded-lg"
                style={{ flex: 1, height: 400 }}
              />
            ))}
          </div>
        </div>
      ) : wf.orders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{ padding: "80px 32px", textAlign: "center" }}
        >
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
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
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14, overflow: "auto", flex: 1 }}>
          <SummaryCards counts={wf.statusCounts} />
          <FilterBar
            filters={wf.filters}
            onFilterChange={wf.updateFilter}
            onReset={wf.resetFilters}
          />
          <WorkflowBoard
            ordersByStatus={wf.ordersByStatus}
            onSelectOrder={wf.setSelectedOrderId}
            onMoveNext={handleMoveNext}
            onMovePrev={handleMovePrev}
            onPaymentComplete={handlePaymentComplete}
          />
        </div>
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
