import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import type { WorkflowOrder } from "@/types/workflow";
import { BUSINESS } from "@/lib/business-config";

interface OrderLabelProps {
  order: WorkflowOrder;
}

export default function OrderLabel({ order }: OrderLabelProps) {
  return (
    <div className="label-print border-2 border-dashed border-border rounded-lg p-4 bg-card max-w-[320px] mx-auto space-y-3">
      <div className="flex items-center justify-center gap-2">
        <img src={BUSINESS.logo} alt={BUSINESS.name} className="h-8 w-8 object-contain" />
        <div className="text-center">
          <h4 className="text-sm font-bold">{BUSINESS.name}</h4>
          <p className="text-[0.6rem] text-muted-foreground">{BUSINESS.tagline}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1 text-xs">
          <p className="font-bold text-base">{order.orderNumber}</p>
          <p className="font-medium">{order.customerName}</p>
          <p className="text-muted-foreground">{order.customerPhone}</p>
        </div>
        <QRCodeSVG value={`ORDER:${order.orderNumber}`} size={72} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-2">
        <div>
          <span className="text-muted-foreground">Due: </span>
          <span className="font-medium">{order.deliveryDate}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Items: </span>
          <span className="font-medium">{order.itemCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Type: </span>
          <span className="font-medium capitalize">{order.orderType}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="font-medium">${order.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {order.orderType === "urgent" && (
        <div className="text-center">
          <Badge className="bg-accent text-accent-foreground text-xs">⚡ URGENT</Badge>
        </div>
      )}
    </div>
  );
}
