import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, FileSearch, QrCode, X, Camera, Loader2, Crown, Star, AlertCircle, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchCustomerSuggestions, fetchCustomerSnapshot } from "@/lib/supabase-queries";
import type { CustomerSuggestion, CustomerSnapshot } from "@/lib/supabase-queries";
import type { CustomerRecord } from "@/types/customer";
import { formatOMR } from "@/lib/currency";

const ORDER_PATTERN = /^ORD-/i;
const BARCODE_PATTERN = /^(ORDER:)?ORD-\d{6}-\d{4}$/i;

type InputMode = "phone" | "order" | "default";

function detectMode(q: string): InputMode {
  if (!q) return "default";
  if (ORDER_PATTERN.test(q) || BARCODE_PATTERN.test(q)) return "order";
  if (/^[\d+]/.test(q)) return "phone";
  return "default";
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

function formatLastVisit(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ar-OM", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

interface Props {
  customerPhone: string;
  customerName: string;
  matchedCustomer: CustomerRecord | null;
  onPhoneChange: (phone: string) => void;
  onNameChange: (name: string) => void;
  onOpenOrder: (code: string) => void;
  onScanClick: () => void;
}

export default function SmartSearchBar({
  customerPhone,
  customerName,
  matchedCustomer,
  onPhoneChange,
  onNameChange,
  onOpenOrder,
  onScanClick,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [snapshot, setSnapshot] = useState<CustomerSnapshot | null>(null);
  const [showNewName, setShowNewName] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const suppressRef = useRef(false);

  const mode = detectMode(query);
  const hasDebt = (snapshot?.outstandingBalance ?? 0) > 0;
  const isVip = matchedCustomer?.customerType === "vip";

  // Auto-trigger direct barcode open
  useEffect(() => {
    const val = query.trim();
    if (BARCODE_PATTERN.test(val)) {
      onOpenOrder(val.replace(/^ORDER:/i, ""));
      setQuery("");
    }
  }, [query, onOpenOrder]);

  // Debounced live suggestions
  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2 || matchedCustomer || ORDER_PATTERN.test(q)) {
      setSuggestions([]);
      setDropdownOpen(false);
      setHasSearched(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      const results = await searchCustomerSuggestions(q, 6);
      setSuggestions(results);
      setHasSearched(true);
      setDropdownOpen(true);
      setSearching(false);
    }, 280);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, matchedCustomer]);

  // Fetch snapshot when customer matched
  useEffect(() => {
    if (!matchedCustomer?.id) {
      setSnapshot(null);
      return;
    }
    fetchCustomerSnapshot(matchedCustomer.id)
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
  }, [matchedCustomer?.id]);

  // Close dropdown on outside click
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = query.trim().replace(/^ORDER:/i, "");
    if (ORDER_PATTERN.test(val)) {
      onOpenOrder(val);
      setQuery("");
      return;
    }
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0]);
    } else if (val.length >= 3 && /^[\d+]/.test(val)) {
      onPhoneChange(val);
      setDropdownOpen(false);
      setShowNewName(true);
    }
  };

  const ModeIcon = mode === "phone" ? Phone : mode === "order" ? FileSearch : QrCode;
  const showNoMatch =
    hasSearched && !searching && suggestions.length === 0 && query.trim().length >= 2 && !dropdownOpen;
  const lastVisit = snapshot ? formatLastVisit(snapshot.lastOrderDate) : "";

  return (
    <div ref={wrapperRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* ── Main row: search/card  +  always-visible scan button ── */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>

        {/* Left: compact customer card OR search input */}
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {matchedCustomer ? (
            /* Compact 44px customer card */
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
                border: hasDebt
                  ? "1px solid rgba(245,158,11,0.4)"
                  : "1px solid var(--border-default)",
                overflow: "hidden",
                boxSizing: "border-box",
              }}
            >
              {/* Avatar 28px */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
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
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap", overflow: "hidden" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {matchedCustomer.name || customerName || matchedCustomer.phone}
                  </span>
                  {isVip && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 99,
                        background: "rgba(245,158,11,0.15)",
                        color: "var(--color-warning)",
                        flexShrink: 0,
                      }}
                    >
                      VIP
                    </span>
                  )}
                  {hasDebt && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 99,
                        background: "rgba(239,68,68,0.12)",
                        color: "var(--color-danger, #EF4444)",
                        flexShrink: 0,
                      }}
                    >
                      ⚠ مديون
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)", lineHeight: 1, marginTop: 1 }}>
                  {matchedCustomer.phone}
                  {snapshot && snapshot.loyaltyPoints > 0 && (
                    <span style={{ marginRight: 6, color: "var(--color-warning)" }}>
                      · ★ {snapshot.loyaltyPoints.toFixed(0)}
                    </span>
                  )}
                  {lastVisit && (
                    <span style={{ marginRight: 6, color: "var(--text-tertiary)" }}>
                      · {lastVisit}
                    </span>
                  )}
                </div>
              </div>

              {/* Clear X */}
              <button
                onClick={handleClear}
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-tertiary)",
                  transition: "color 120ms, background 120ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--color-danger)";
                  (e.currentTarget as HTMLElement).style.background = "var(--danger-subtle)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
                title="مسح العميل"
              >
                <X size={13} />
              </button>
            </motion.div>
          ) : (
            /* Search input form */
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 10,
                  padding: "0 12px",
                  height: 44,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  boxSizing: "border-box",
                }}
              >
                <ModeIcon size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowNewName(false);
                  }}
                  placeholder="ابحث برقم الهاتف أو رقم الطلب..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    direction: "rtl",
                    minWidth: 0,
                  }}
                  autoComplete="off"
                  data-disable-global-barcode="true"
                />
                {query && !searching && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setSuggestions([]);
                      setDropdownOpen(false);
                      setHasSearched(false);
                    }}
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  >
                    <X size={13} />
                  </button>
                )}
                {searching && (
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                )}
              </div>
            </form>
          )}

          {/* New customer name input (search mode only) */}
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
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
                <p
                  style={{ fontSize: 11, marginTop: 4, paddingRight: 2, color: "var(--text-tertiary)", direction: "rtl" }}
                >
                  عميل جديد · رقم {customerPhone}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suggestions dropdown */}
          <AnimatePresence>
            {!matchedCustomer && dropdownOpen && (suggestions.length > 0 || searching) && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "calc(100% + 4px)",
                  zIndex: 50,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-default)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >
                {searching && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <Loader2 size={12} className="animate-spin" /> جاري البحث...
                  </div>
                )}
                <ul style={{ maxHeight: 256, overflowY: "auto", padding: "4px 0", listStyle: "none", margin: 0 }}>
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(s)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          transition: "background 80ms",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                        dir="rtl"
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)",
                              }}
                            >
                              {s.name}
                            </span>
                            {s.customerType === "vip" && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: 99,
                                  background: "rgba(245,158,11,0.15)",
                                  color: "var(--color-warning)",
                                }}
                              >
                                VIP
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontFamily: "monospace",
                              marginTop: 2,
                              color: "var(--text-secondary)",
                            }}
                          >
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* No results — offer new customer */}
          <AnimatePresence>
            {!matchedCustomer && showNoMatch && /^[\d+]/.test(query) && !showNewName && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "calc(100% + 4px)",
                  zIndex: 50,
                  borderRadius: 12,
                  padding: 12,
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-default)",
                }}
                dir="rtl"
              >
                <p style={{ fontSize: 12, marginBottom: 8, color: "var(--text-secondary)" }}>
                  لا يوجد عميل بهذا الرقم
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onPhoneChange(query.trim());
                    setDropdownOpen(false);
                    setHasSearched(false);
                    setShowNewName(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "var(--accent-subtle)",
                    color: "var(--color-accent)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <UserPlus size={12} /> إضافة عميل جديد
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Always-visible scan button ── */}
        <button
          type="button"
          onClick={onScanClick}
          style={{
            flexShrink: 0,
            height: 44,
            padding: "0 12px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: hasDebt ? "rgba(245,158,11,0.12)" : "var(--accent-subtle)",
            color: hasDebt ? "#F59E0B" : "var(--color-accent)",
            border: hasDebt ? "1px solid rgba(245,158,11,0.35)" : "1px solid transparent",
            transition: "all 120ms",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          <Camera size={13} />
          مسح وتسليم
          {hasDebt && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#F59E0B",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              !
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
