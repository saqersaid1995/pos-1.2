import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ScanBarcode, X, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  searchOrderByCode,
  fetchCustomerByPhone,
  fetchOrdersByCustomerId,
} from "@/lib/supabase-queries";
import type { WorkflowOrder } from "@/types/workflow";
import PhoneSearchResults from "@/components/scan/PhoneSearchResults";

const BARCODE_PATTERN = /^(ORDER:)?ORD-\d{6}-\d{4}$/i;
const ORDER_PATTERN = /^ORD-/i;

interface SmartSearchBarProps {
  onScanClick: () => void;
  /** Open the scan/payment modal pre-loaded with this order code */
  onOpenOrder: (code: string) => void;
  /** Auto-fill customer in POS form */
  onUseCustomer: (phone: string, name: string) => void;
}

export default function SmartSearchBar({
  onScanClick,
  onOpenOrder,
  onUseCustomer,
}: SmartSearchBarProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Phone-search results
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orders, setOrders] = useState<WorkflowOrder[]>([]);
  const [noResults, setNoResults] = useState(false);

  const clearResults = useCallback(() => {
    setOrders([]);
    setCustomerName("");
    setCustomerPhone("");
    setNoResults(false);
    setHasSearched(false);
  }, []);

  const refreshPhoneOrders = useCallback(async () => {
    if (!customerPhone) return;
    const customer = await fetchCustomerByPhone(customerPhone);
    if (!customer) return;
    const next = await fetchOrdersByCustomerId(customer.id);
    setOrders(next);
  }, [customerPhone]);

  const runSearch = useCallback(
    async (raw: string) => {
      const value = raw.trim().replace(/^ORDER:/i, "");
      if (!value) return;

      setSearching(true);
      clearResults();
      setHasSearched(true);

      // 1) Barcode → open order modal directly
      if (BARCODE_PATTERN.test(value)) {
        onOpenOrder(value);
        setSearching(false);
        setQuery("");
        setHasSearched(false);
        return;
      }

      // 2) Order # lookup
      if (ORDER_PATTERN.test(value)) {
        const order = await searchOrderByCode(value);
        setSearching(false);
        if (order) {
          onOpenOrder(value);
          setQuery("");
          setHasSearched(false);
        } else {
          setNoResults(true);
          toast.error("No matching order found");
        }
        return;
      }

      // 3) Otherwise treat as phone number
      const customer = await fetchCustomerByPhone(value);
      if (!customer) {
        setSearching(false);
        setNoResults(true);
        return;
      }
      const found = await fetchOrdersByCustomerId(customer.id);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone);
      setOrders(found);
      setSearching(false);
      toast.success(
        `Found ${customer.name} • ${found.length} order${found.length !== 1 ? "s" : ""}`
      );
    },
    [clearResults, onOpenOrder]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleUseCustomer = () => {
    if (customerPhone) {
      onUseCustomer(customerPhone, customerName);
      toast.success(`${customerName} loaded into order form`);
      setQuery("");
      clearResults();
    }
  };

  const handleCreateNew = () => {
    // Push the typed value into the POS phone field
    onUseCustomer(query.trim(), "");
    toast.success("New customer ready — enter name to save");
    setQuery("");
    clearResults();
  };

  return (
    <div className="pos-section space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search phone / order # / barcode"
            className="pl-8 pr-8 h-10 text-sm"
            autoComplete="off"
            data-disable-global-barcode="true"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                clearResults();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" size="sm" className="h-10 px-3 gap-1.5" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="hidden sm:inline text-xs">Search</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-3 gap-1.5"
          onClick={onScanClick}
        >
          <ScanBarcode className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Scan</span>
        </Button>
      </form>

      {/* No results → offer to use as new customer */}
      {hasSearched && noResults && !searching && (
        <div className="rounded-md border border-dashed border-border p-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            No customer or order matches <strong className="text-foreground">"{query}"</strong>
          </p>
          {/^[\d+\s-]{4,}$/.test(query) && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleCreateNew}>
              <UserPlus className="h-3.5 w-3.5" /> Create new customer with this phone
            </Button>
          )}
        </div>
      )}

      {/* Customer + orders results */}
      {orders.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs gap-1.5"
              onClick={handleUseCustomer}
            >
              <UserPlus className="h-3.5 w-3.5" /> Use for new order
            </Button>
          </div>
          <PhoneSearchResults
            customerName={customerName}
            customerPhone={customerPhone}
            orders={orders}
            onRefresh={refreshPhoneOrders}
          />
        </div>
      )}

      {/* Customer with no orders */}
      {hasSearched && !noResults && orders.length === 0 && customerPhone && !searching && (
        <div className="rounded-md border border-border p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{customerName}</p>
            <p className="text-xs text-muted-foreground">{customerPhone} • No orders yet</p>
          </div>
          <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={handleUseCustomer}>
            <UserPlus className="h-3.5 w-3.5" /> Use for new order
          </Button>
        </div>
      )}
    </div>
  );
}
