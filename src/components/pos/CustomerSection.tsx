import { Search, UserPlus, Plus, Loader2, Crown } from "lucide-react";
import type { Customer } from "@/types/pos";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  searchCustomerSuggestions,
  type CustomerSuggestion,
} from "@/lib/supabase-queries";
import CustomerSnapshot from "./CustomerSnapshot";
import { formatOMR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import PhoneInput, { type PhoneInputValue } from "@/components/ui/phone-input";
import { parsePhone, fetchCountryCodes, getDefaultCountryCode } from "@/lib/phone";

interface Props {
  phone: string;
  name: string;
  notes: string;
  matchedCustomer: Customer | null;
  onPhoneChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onNotesChange: (v: string) => void;
}

export default function CustomerSection({
  phone, name, notes, matchedCustomer,
  onPhoneChange, onNameChange, onNotesChange,
}: Props) {
  const [creating, setCreating] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searched, setSearched] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  // Suppress reopening dropdown right after a selection programmatically updates the phone
  const suppressNextSearchRef = useRef(false);

  const showAddNew = phone.length >= 4 && !matchedCustomer && name.trim();

  // Debounced live search
  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const q = phone.trim();
    if (q.length < 2 || matchedCustomer) {
      setSuggestions([]);
      setSearched(false);
      setOpen(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const reqId = ++reqIdRef.current;
      setSearching(true);
      const results = await searchCustomerSuggestions(q, 8);
      if (reqId !== reqIdRef.current) return; // stale
      setSuggestions(results);
      setSearched(true);
      setSearching(false);
      setHighlight(0);
      setOpen(true);
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [phone, matchedCustomer]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selectSuggestion = useCallback(
    (s: CustomerSuggestion) => {
      suppressNextSearchRef.current = true;
      onPhoneChange(s.phone);
      onNameChange(s.name);
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
    },
    [onPhoneChange, onNameChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[highlight];
      if (s) selectSuggestion(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!name.trim() || !phone.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({ full_name: name.trim(), phone_number: phone.trim() })
      .select("id")
      .single();
    setCreating(false);

    if (error) {
      toast.error("Failed to create customer: " + error.message);
      return;
    }
    toast.success("Customer created successfully");
    onPhoneChange(phone);
  };

  const showDropdown =
    open && phone.trim().length >= 2 && !matchedCustomer && (searching || searched);

  return (
    <div className="pos-section space-y-3">
      <h2 className="pos-label">Customer</h2>
      <div className="relative" ref={wrapperRef}>
        <PhoneInput
          rawPhone={phone}
          onChange={(v: PhoneInputValue) => onPhoneChange(v.fullE164 || v.localPhone)}
          placeholder="Phone number..."
          autoFocus
          inputClassName="pos-input pl-3"
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0 && !matchedCustomer) setOpen(true);
          }}
        />

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
              role="listbox"
            >
              {searching && suggestions.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
                </div>
              )}

              {!searching && suggestions.length === 0 && searched && (
                <div className="p-3 space-y-2">
                  <p className="text-sm text-muted-foreground">No customer found</p>
                  {name.trim() ? (
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={creating}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Create new customer
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enter a name below to create a new customer.
                    </p>
                  )}
                </div>
              )}

              {suggestions.length > 0 && (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {suggestions.map((s, idx) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(s)}
                        onMouseEnter={() => setHighlight(idx)}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors",
                          idx === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                        )}
                        role="option"
                        aria-selected={idx === highlight}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{s.name}</span>
                            {s.customerType === "vip" && (
                              <Crown className="w-3 h-3 text-amber-500 shrink-0" aria-label="VIP" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">{s.phone}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium">
                            {s.orderCount} {s.orderCount === 1 ? "order" : "orders"}
                          </div>
                          {s.totalSpent > 0 && (
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {formatOMR(s.totalSpent)}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {matchedCustomer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-md text-sm"
          >
            <UserPlus className="w-4 h-4 text-primary" />
            <span className="font-medium">Matched: {matchedCustomer.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <input
        type="text"
        placeholder="Customer Name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="pos-input w-full"
      />
      <AnimatePresence>
        {showAddNew && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onClick={handleCreateCustomer}
            disabled={creating}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add New Customer
          </motion.button>
        )}
      </AnimatePresence>
      <textarea
        placeholder="Customer notes (optional)"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        rows={2}
        className="pos-input w-full resize-none py-2"
      />
      <CustomerSnapshot customerId={matchedCustomer?.id ?? null} />
    </div>
  );
}
