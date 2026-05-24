import { useWorkflowState } from "@/hooks/useWorkflowState";
import SummaryCards from "@/components/workflow/SummaryCards";
import FilterBar from "@/components/workflow/FilterBar";
import WorkflowBoard from "@/components/workflow/WorkflowBoard";
import OrderDetailDrawer from "@/components/workflow/OrderDetailDrawer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
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
    <div className="min-h-screen bg-background">
      <AppHeader title="Workflow" subtitle="Operations Board" />

      <div className="p-4 space-y-4 max-w-[1800px] mx-auto">
        {wf.loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : wf.orders.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium">No orders yet</p>
            <p className="text-sm mt-1">Create your first order from the POS page</p>
            <Link to="/">
              <Button className="mt-4" size="sm">Create Order</Button>
            </Link>
          </div>
        ) : (
          <>
            <SummaryCards counts={wf.statusCounts} />
            <FilterBar filters={wf.filters} onFilterChange={wf.updateFilter} onReset={wf.resetFilters} />
            <WorkflowBoard
              ordersByStatus={wf.ordersByStatus}
              onSelectOrder={wf.setSelectedOrderId}
              onMoveNext={handleMoveNext}
              onMovePrev={handleMovePrev}
              onPaymentComplete={handlePaymentComplete}
            />
          </>
        )}
      </div>

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
