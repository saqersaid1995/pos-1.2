import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Filter } from "lucide-react";
import { WORKFLOW_STAGES, type WorkflowStatus } from "@/types/workflow";
import type { WorkflowFilters } from "@/hooks/useWorkflowState";
import { useState } from "react";

interface FilterBarProps {
  filters: WorkflowFilters;
  onFilterChange: <K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => void;
  onReset: () => void;
}

export default function FilterBar({ filters, onFilterChange, onReset }: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters =
    filters.status !== "all" || filters.orderType !== "all" || filters.paymentStatus !== "all" || filters.dateFilter !== "all";

  return (
    <div className="pos-section space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search order, customer, phone..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
        </Button>
        {(hasActiveFilters || filters.search) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={onReset}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => onFilterChange("status", v as WorkflowStatus | "all")}
            options={[{ value: "all", label: "All Statuses" }, ...WORKFLOW_STAGES.map((s) => ({ value: s.id, label: s.label }))]}
          />
          <FilterSelect
            label="Type"
            value={filters.orderType}
            onChange={(v) => onFilterChange("orderType", v as "all" | "regular" | "urgent")}
            options={[
              { value: "all", label: "All Types" },
              { value: "regular", label: "Regular" },
              { value: "urgent", label: "Urgent" },
            ]}
          />
          <FilterSelect
            label="Payment"
            value={filters.paymentStatus}
            onChange={(v) => onFilterChange("paymentStatus", v as "all" | "unpaid" | "partially-paid" | "paid")}
            options={[
              { value: "all", label: "All Payments" },
              { value: "unpaid", label: "Unpaid" },
              { value: "partially-paid", label: "Partial" },
              { value: "paid", label: "Paid" },
            ]}
          />
          <FilterSelect
            label="Date"
            value={filters.dateFilter}
            onChange={(v) => onFilterChange("dateFilter", v as "all" | "today" | "overdue")}
            options={[
              { value: "all", label: "All Dates" },
              { value: "today", label: "Today" },
              { value: "overdue", label: "Overdue" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="pos-input text-xs w-full h-8"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
