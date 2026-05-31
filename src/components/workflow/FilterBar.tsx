import { Search, X, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { WORKFLOW_STAGES, type WorkflowStatus } from "@/types/workflow";
import type { WorkflowFilters } from "@/hooks/useWorkflowState";

interface FilterBarProps {
  filters: WorkflowFilters;
  onFilterChange: <K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => void;
  onReset: () => void;
}

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: "0 8px",
  fontSize: 12,
  borderRadius: 6,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  outline: "none",
  cursor: "pointer",
  flexShrink: 0,
};

export default function FilterBar({ filters, onFilterChange, onReset }: FilterBarProps) {
  const hasActiveFilters =
    filters.status !== "all" ||
    filters.orderType !== "all" ||
    filters.paymentStatus !== "all" ||
    filters.dateFilter !== "all";

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {/* Search */}
      <div style={{ flex: 1, position: "relative" }}>
        <Search
          size={14}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-tertiary)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="ابحث عن طلب أو عميل..."
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          style={{
            width: "100%",
            height: 32,
            paddingRight: 32,
            paddingLeft: 10,
            fontSize: 13,
            borderRadius: 6,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            outline: "none",
            boxSizing: "border-box",
            direction: "rtl",
          }}
          dir="rtl"
        />
        {filters.search && (
          <button
            onClick={() => onFilterChange("search", "")}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Status */}
      <select
        style={selectStyle}
        value={filters.status}
        onChange={(e) => onFilterChange("status", e.target.value as WorkflowStatus | "all")}
        dir="rtl"
      >
        <option value="all">الكل</option>
        {WORKFLOW_STAGES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {/* Payment */}
      <select
        style={selectStyle}
        value={filters.paymentStatus}
        onChange={(e) => onFilterChange("paymentStatus", e.target.value as "all" | "unpaid" | "partially-paid" | "paid")}
        dir="rtl"
      >
        <option value="all">الدفع</option>
        <option value="unpaid">غير مدفوع</option>
        <option value="partially-paid">جزئي</option>
        <option value="paid">مدفوع</option>
      </select>

      {/* Order type */}
      <select
        style={selectStyle}
        value={filters.orderType}
        onChange={(e) => onFilterChange("orderType", e.target.value as "all" | "regular" | "urgent")}
        dir="rtl"
      >
        <option value="all">النوع</option>
        <option value="regular">عادي</option>
        <option value="urgent">⚡ عاجل</option>
      </select>

      {/* Date */}
      <select
        style={selectStyle}
        value={filters.dateFilter}
        onChange={(e) => onFilterChange("dateFilter", e.target.value as "all" | "today" | "overdue")}
        dir="rtl"
      >
        <option value="all">التاريخ</option>
        <option value="today">اليوم</option>
        <option value="overdue">متأخرة</option>
      </select>

      {/* Reset */}
      {(hasActiveFilters || filters.search) && (
        <button
          onClick={onReset}
          style={{
            height: 32,
            padding: "0 8px",
            borderRadius: 6,
            background: "transparent",
            border: "1px solid var(--border-default)",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
          title="مسح الفلاتر"
        >
          <X size={13} />
        </button>
      )}

      {/* New order */}
      <Link to="/" style={{ flexShrink: 0 }}>
        <button
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: "var(--color-accent, #6366F1)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={13} />
          طلب جديد
        </button>
      </Link>
    </div>
  );
}
