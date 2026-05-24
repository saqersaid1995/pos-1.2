import type { OrderType, PickupMethod } from "@/types/pos";

interface Props {
  orderNumber: string;
  orderDate: string;
  deliveryDate: string;
  orderType: OrderType;
  pickupMethod: PickupMethod;
  orderNotes: string;
  onDeliveryDateChange: (v: string) => void;
  onOrderTypeChange: (v: OrderType) => void;
  onPickupMethodChange: (v: PickupMethod) => void;
  onNotesChange: (v: string) => void;
}

export default function OrderDetailsSection(props: Props) {
  const {
    orderNumber, orderDate, deliveryDate, orderType, pickupMethod,
    orderNotes,
    onDeliveryDateChange, onOrderTypeChange, onPickupMethodChange,
    onNotesChange,
  } = props;

  return (
    <div className="pos-section space-y-3">
      <h2 className="pos-label">Order Details</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="pos-label text-[0.65rem]">Order #</label>
          <input readOnly value={orderNumber} className="pos-input w-full bg-secondary text-muted-foreground" />
        </div>
        <div>
          <label className="pos-label text-[0.65rem]">Date</label>
          <input readOnly value={orderDate} className="pos-input w-full bg-secondary text-muted-foreground" />
        </div>
      </div>
      <div>
        <label className="pos-label text-[0.65rem]">Delivery Date</label>
        <input
          type="date"
          value={deliveryDate}
          onChange={(e) => onDeliveryDateChange(e.target.value)}
          className="pos-input w-full"
        />
      </div>

      {/* Order Type */}
      <div>
        <label className="pos-label text-[0.65rem]">Order Type</label>
        <div className="flex gap-2 mt-1">
          {(["regular", "urgent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onOrderTypeChange(t)}
              className={`flex-1 h-10 rounded-md text-sm font-medium capitalize transition-all duration-[120ms] border ${
                orderType === t
                  ? t === "urgent"
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Pickup Method */}
      <div>
        <label className="pos-label text-[0.65rem]">Pickup Method</label>
        <div className="flex gap-2 mt-1">
          {(["walk-in", "delivery", "app"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onPickupMethodChange(m)}
              className={`flex-1 h-9 rounded-md text-xs font-medium capitalize transition-all duration-[120ms] border ${
                pickupMethod === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-secondary"
              }`}
            >
              {m.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>




      <div>
        <label className="pos-label text-[0.65rem]">Order Notes</label>
        <textarea
          value={orderNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="General order notes..."
          rows={2}
          className="pos-input w-full resize-none py-2"
        />
      </div>
    </div>
  );
}
