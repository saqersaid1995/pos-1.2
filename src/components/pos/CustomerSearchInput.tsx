import { useState, useEffect, useRef, useCallback } from "react";
import { User, X, Loader2, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchCustomerSuggestions, fetchCustomerSnapshot } from "@/lib/supabase-queries";
import type { CustomerSuggestion, CustomerSnapshot } from "@/lib/supabase-queries";
import type { CustomerRecord } from "@/types/customer";
import { isElectron } from "@/lib/electron";

function getInitials(name: string): string {
  return (
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?"
  );
}

interface Props {
  customerPhone: string;
  customerName: string;
  matchedCustomer: CustomerRecord | null;
  onPhoneChange: (phone: string) => void;
  onNameChange: (name: string) => void;
}

export default function CustomerSearchInput({
  customerPhone,
  customerName,
  matchedCustomer,
  onPhoneChange,
  onNameChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showNewName, setShowNewName] = useState(false);
  const [snapshot, setSnapshot] = useState<CustomerSnapshot | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const suppressRef = useRef(false);

  const isVip = matchedCustomer?.customerType === "vip";

  // Debounced customer search
  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3 || matchedCustomer) {
      setSuggestions([]);
      setDropdownOpen(false);
      setHasSearched(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      console.log("[CustomerSearch] querying for:", q);
      try {
        let results: CustomerSuggestion[];
        if (isElectron) {
          if (!(window as any).drovo?.db?.query) {
            console.error("[CustomerSearch] window.drovo.db.query not available");
            results = [];
          } else {
            const rows: any[] = await (window as any).drovo.db.query(
              `SELECT id, full_name, phone_number, customer_type, loyalty_points, outstanding_balance
               FROM customers
               WHERE phone_number LIKE ? OR full_name LIKE ?
               LIMIT 6`,
              [`%${q}%`, `%${q}%`]
            );
            console.log("[CustomerSearch] SQLite results:", rows);
            results = (rows || []).map((r) => ({
              id: r.id,
              name: r.full_name || "",
              phone: r.phone_number || "",
              customerType: ((r.customer_type || "regular").toLowerCase()) as "regular" | "vip",
              orderCount: 0,
            }));
          }
        } else {
          results = await searchCustomerSuggestions(q, 6);
          console.log("[CustomerSearch] Supabase results:", results);
        }
        setSuggestions(results);
        setHasSearched(true);
        setDropdownOpen(true);
      } catch (err) {
        console.error("[CustomerSearchInput] search error:", err);
        setSuggestions([]);
        setHasSearched(true);
        setDropdownOpen(true);
      }
      setSearching(false);
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, matchedCustomer]);

  // Fetch loyalty snapshot when customer selected
  useEffect(() => {
    if (!matchedCustomer?.id) { setSnapshot(null); return; }
    fetchCustomerSnapshot(matchedCustomer.id).then(setSnapshot).catch(() => setSnapshot(null));
  }, [matchedCustomer?.id]);

  // Close on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const selectSuggestion = useCallback(
    (s: CustomerSuggestion) => {
      suppressRef.current = true;
      setQuery("");
      setDropdownOpen(false);
      setSuggestions([]);
      setHasSearched(false);
      setShowNewName(false);
      onPhoneChange(s.phone);
      onNameChange(s.name);
    },
    [onPhoneChange, onNameChange]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setDropdownOpen(false);
    setSnapshot(null);
    setHasSearched(false);
    setShowNewName(false);
    onPhoneChange("");
    onNameChange("");
  }, [onPhoneChange, onNameChange]);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {matchedCustomer ? (
        /* Customer card */
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 10px",
            borderRadius: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxSizing: "border-box",
          }}
        >
          {/* Avatar 32px */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
              background: isVip ? "rgba(245,158,11,0.15)" : "var(--accent-subtle)",
              color: isVip ? "var(--color-warning)" : "var(--color-accent)",
            }}
          >
            {getInitials(matchedCustomer.name || customerName || matchedCustomer.phone)}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }} dir="rtl">
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {matchedCustomer.name || customerName}
              </span>
              {isVip && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: "rgba(245,158,11,0.15)", color: "var(--color-warning)", flexShrink: 0 }}>
                  VIP
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)", lineHeight: 1, marginTop: 1 }}>
              {matchedCustomer.phone}
              {snapshot && snapshot.loyaltyPoints > 0 && (
                <span style={{ marginRight: 6, color: "var(--color-warning)" }}>
                  · ★ {snapshot.loyaltyPoints.toFixed(0)} نقطة
                </span>
              )}
            </div>
          </div>

          {/* Clear X */}
          <button
            onClick={handleClear}
            style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", transition: "color 120ms, background 120ms" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-danger)"; (e.currentTarget as HTMLElement).style.background = "var(--danger-subtle)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = ""; }}
            title="مسح العميل"
          >
            <X size={13} />
          </button>
        </motion.div>
      ) : (
        /* Search input */
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 10,
            padding: "0 12px",
            height: 40,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxSizing: "border-box",
          }}
        >
          <User size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowNewName(false); }}
            placeholder="ربط عميل بالطلب الجديد (اختياري)..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "var(--text-primary)", direction: "rtl", minWidth: 0 }}
            autoComplete="off"
            data-disable-global-barcode="true"
          />
          {query && !searching && (
            <button
              type="button"
              onClick={() => { setQuery(""); setSuggestions([]); setDropdownOpen(false); setHasSearched(false); }}
              style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          )}
          {searching && (
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          )}
        </div>
      )}

      {/* New customer name input */}
      <AnimatePresence>
        {!matchedCustomer && showNewName && customerPhone && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: 6 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="text"
                placeholder="اسم العميل (اختياري)"
                value={customerName}
                onChange={(e) => onNameChange(e.target.value)}
                className="ds-input"
                style={{ flex: 1, fontSize: 13, height: 36 }}
                dir="rtl"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowNewName(false)}
                style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}
              >
                <X size={13} />
              </button>
            </div>
            <p style={{ fontSize: 11, marginTop: 4, paddingRight: 2, color: "var(--text-tertiary)", direction: "rtl" }}>
              عميل جديد · رقم {customerPhone}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {!matchedCustomer && (dropdownOpen || searching) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "100%",
              zIndex: 9999,
              borderRadius: 8,
              background: "var(--bg-overlay)",
              border: "0.5px solid var(--border-default)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {searching && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 12, color: "var(--text-tertiary)" }}>
                <Loader2 size={12} className="animate-spin" /> جاري البحث...
              </div>
            )}
            {!searching && hasSearched && suggestions.length === 0 && (
              <div style={{ padding: 12 }} dir="rtl">
                <p style={{ fontSize: 12, marginBottom: 8, color: "var(--text-secondary)" }}>لا توجد نتائج</p>
                {/^[\d+]/.test(query) && !showNewName && (
                  <button
                    type="button"
                    onClick={() => {
                      onPhoneChange(query.trim());
                      setDropdownOpen(false);
                      setHasSearched(false);
                      setShowNewName(true);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "6px 10px", borderRadius: 8, background: "var(--accent-subtle)", color: "var(--color-accent)", border: "none", cursor: "pointer" }}
                  >
                    <UserPlus size={12} /> إضافة عميل جديد
                  </button>
                )}
              </div>
            )}
            {suggestions.length > 0 && (
              <ul style={{ padding: "4px 0", listStyle: "none", margin: 0 }}>
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(s)}
                      style={{
                        width: "100%",
                        height: 44,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "0 12px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        transition: "background 80ms",
                        boxSizing: "border-box",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      dir="rtl"
                    >
                      {/* Avatar 28px */}
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          background: s.customerType === "vip" ? "rgba(245,158,11,0.15)" : "var(--accent-subtle)",
                          color: s.customerType === "vip" ? "var(--color-warning)" : "var(--color-accent)",
                        }}
                      >
                        {getInitials(s.name || s.phone)}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                            {s.name}
                          </span>
                          {s.customerType === "vip" && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: "rgba(245,158,11,0.15)", color: "var(--color-warning)", flexShrink: 0 }}>
                              VIP
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "monospace", marginTop: 1, color: "var(--text-secondary)" }}>
                          {s.phone}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, flexShrink: 0, color: "var(--text-tertiary)" }}>
                        {s.orderCount} طلب
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
  );
}
