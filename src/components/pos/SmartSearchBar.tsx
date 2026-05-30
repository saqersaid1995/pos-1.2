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
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "?";
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
  customerPhone, customerName, matchedCustomer,
  onPhoneChange, onNameChange, onOpenOrder, onScanClick,
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
    if (suppressRef.current) { suppressRef.current = false; return; }
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

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query, matchedCustomer]);

  // Fetch snapshot when customer matched
  useEffect(() => {
    if (!matchedCustomer?.id) { setSnapshot(null); return; }
    fetchCustomerSnapshot(matchedCustomer.id).then(setSnapshot).catch(() => setSnapshot(null));
  }, [matchedCustomer?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const selectSuggestion = useCallback((s: CustomerSuggestion) => {
    suppressRef.current = true;
    setQuery("");
    setDropdownOpen(false);
    setSuggestions([]);
    setHasSearched(false);
    setShowNewName(false);
    onPhoneChange(s.phone);
    onNameChange(s.name);
  }, [onPhoneChange, onNameChange]);

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

  const isVip = matchedCustomer?.customerType === "vip";

  // === CUSTOMER CARD mode ===
  if (matchedCustomer) {
    const initials = getInitials(matchedCustomer.name || customerName || matchedCustomer.phone);
    const lastVisit = snapshot ? formatLastVisit(snapshot.lastOrderDate) : "";

    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-3 flex items-start gap-3"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 leading-none"
          style={{
            background: isVip ? "rgba(245,158,11,0.15)" : "var(--accent-subtle)",
            color: isVip ? "var(--color-warning)" : "var(--color-accent)",
          }}
        >
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0" dir="rtl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {matchedCustomer.name || customerName || matchedCustomer.phone}
            </span>
            {isVip && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(245,158,11,0.15)", color: "var(--color-warning)" }}
              >
                <Crown size={9} /> VIP
              </span>
            )}
          </div>
          <p className="text-[12px] font-mono mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {matchedCustomer.phone}
          </p>
          {snapshot && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {snapshot.loyaltyPoints > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--color-warning)" }}>
                  <Star size={10} /> {snapshot.loyaltyPoints.toFixed(0)} نقطة
                </span>
              )}
              {snapshot.outstandingBalance > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--color-danger)" }}>
                  <AlertCircle size={10} /> {formatOMR(snapshot.outstandingBalance)} مستحق
                </span>
              )}
              {lastVisit && (
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  آخر زيارة: {lastVisit}
                </span>
              )}
            </div>
          )}
          {snapshot && snapshot.outstandingBalance > 0 && (
            <button
              onClick={onScanClick}
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.35)" }}
            >
              <AlertCircle size={10} /> عرض الفواتير
            </button>
          )}
        </div>

        {/* Clear */}
        <button
          onClick={handleClear}
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: "var(--text-tertiary)" }}
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
          <X size={14} />
        </button>
      </motion.div>
    );
  }

  // === SEARCH mode ===
  const ModeIcon = mode === "phone" ? Phone : mode === "order" ? FileSearch : QrCode;
  const showNoMatch = hasSearched && !searching && suggestions.length === 0 && query.trim().length >= 2 && !dropdownOpen;

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-2">
      <form onSubmit={handleSubmit}>
        <div
          className="flex items-center gap-2 rounded-xl px-3 h-11 transition-colors"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <ModeIcon size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />

          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowNewName(false); }}
            placeholder="ابحث برقم الهاتف أو رقم الطلب أو امسح QR..."
            className="flex-1 bg-transparent text-[13px] outline-none min-w-0"
            style={{ color: "var(--text-primary)", direction: "rtl" }}
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
          {searching && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--text-tertiary)" }} />}

          <button
            type="button"
            onClick={onScanClick}
            className="shrink-0 flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium transition-colors"
            style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
          >
            <Camera size={11} /> مسح وتسليم
          </button>
        </div>
      </form>

      {/* New customer name input */}
      <AnimatePresence>
        {showNewName && customerPhone && !matchedCustomer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="اسم العميل (اختياري)"
                value={customerName}
                onChange={(e) => onNameChange(e.target.value)}
                className="ds-input flex-1 text-[13px] h-9"
                dir="rtl"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { setShowNewName(false); }}
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              >
                <X size={13} />
              </button>
            </div>
            <p className="text-[11px] mt-1 pr-1" style={{ color: "var(--text-tertiary)" }} dir="rtl">
              عميل جديد · رقم {customerPhone}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {dropdownOpen && (suggestions.length > 0 || searching) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 right-0 z-50 rounded-xl overflow-hidden"
            style={{
              top: "calc(100% + 4px)",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            {searching && (
              <div className="flex items-center gap-2 px-3 py-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                <Loader2 size={12} className="animate-spin" /> جاري البحث...
              </div>
            )}
            <ul className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 transition-colors"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    dir="rtl"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                        {s.customerType === "vip" && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded-full"
                            style={{ background: "rgba(245,158,11,0.15)", color: "var(--color-warning)" }}>VIP</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-secondary)" }}>{s.phone}</div>
                    </div>
                    <div className="text-[11px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
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
        {showNoMatch && /^[\d+]/.test(query) && !showNewName && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-0 right-0 z-50 rounded-xl p-3"
            style={{
              top: "calc(100% + 4px)",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
            }}
            dir="rtl"
          >
            <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
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
              className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--accent-subtle)", color: "var(--color-accent)" }}
            >
              <UserPlus size={12} /> إضافة عميل جديد
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
