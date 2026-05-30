import { useState, useEffect, useRef } from "react";
import { Phone, Camera, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { formatOMR } from "@/lib/currency";
import { isElectron } from "@/lib/electron";

export interface UnpaidCustomer {
  id: string;
  name: string;
  phone: string;
  unpaidCount: number;
  totalOwed: number;
}

interface Props {
  onScanClick: () => void;
  onOpenCustomerInvoices: (customer: UnpaidCustomer) => void;
}

function getInitials(name: string): string {
  return (
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?"
  );
}

export default function SmartSearchBar({ onScanClick, onOpenCustomerInvoices }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnpaidCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setDropdownOpen(false);
      setHasSearched(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      console.log("[InvoiceSearch] querying for:", q);
      try {
        let customers: UnpaidCustomer[] = [];
        if (isElectron) {
          if (!(window as any).drovo?.db?.query) {
            console.error("[InvoiceSearch] window.drovo.db.query not available");
          } else {
            const rows: any[] = await (window as any).drovo.db.query(
              `SELECT c.id, c.full_name, c.phone_number,
                      COUNT(o.id) as unpaid_count,
                      SUM(o.remaining_balance) as total_owed
               FROM orders o
               JOIN customers c ON o.customer_id = c.id
               WHERE c.phone_number LIKE ?
                 AND o.payment_status IN ('unpaid', 'partially-paid')
                 AND (o.is_deleted = 0 OR o.is_deleted IS NULL)
               GROUP BY c.id
               ORDER BY total_owed DESC
               LIMIT 10`,
              [`%${q}%`]
            );
            console.log("[InvoiceSearch] SQLite results:", rows);
            customers = (rows || []).map((r) => ({
              id: r.id,
              name: r.full_name || "",
              phone: r.phone_number || "",
              unpaidCount: Number(r.unpaid_count) || 0,
              totalOwed: Number(r.total_owed) || 0,
            }));
          }
        } else {
          const { data } = await supabase
            .from("orders")
            .select("id, customer_id, customer_name, customer_phone, remaining_balance, payment_status")
            .in("payment_status", ["unpaid", "partially-paid"])
            .ilike("customer_phone", `%${q}%`)
            .eq("is_deleted", false)
            .limit(30);
          const map = new Map<string, UnpaidCustomer>();
          for (const row of (data || [])) {
            const key = row.customer_id || row.customer_phone;
            const existing = map.get(key);
            if (existing) {
              existing.unpaidCount++;
              existing.totalOwed += Number(row.remaining_balance) || 0;
            } else {
              map.set(key, {
                id: row.customer_id || "",
                name: row.customer_name || "",
                phone: row.customer_phone || "",
                unpaidCount: 1,
                totalOwed: Number(row.remaining_balance) || 0,
              });
            }
          }
          customers = Array.from(map.values()).sort((a, b) => b.totalOwed - a.totalOwed);
          console.log("[InvoiceSearch] Supabase results:", customers);
        }
        setResults(customers);
        setHasSearched(true);
        setDropdownOpen(true);
      } catch (err) {
        console.error("[SmartSearchBar] search error:", err);
        setResults([]);
        setHasSearched(true);
        setDropdownOpen(true);
      }
      setSearching(false);
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const handleSelect = (c: UnpaidCustomer) => {
    setDropdownOpen(false);
    setQuery("");
    setResults([]);
    setHasSearched(false);
    onOpenCustomerInvoices(c);
  };

  return (
    <div ref={wrapperRef} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {/* Phone search input */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
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
          <Phone size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث برقم الهاتف لعرض الفواتير المعلقة..."
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
              onClick={() => { setQuery(""); setResults([]); setDropdownOpen(false); setHasSearched(false); }}
              style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          )}
          {searching && (
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          )}
        </div>

        {/* Dropdown */}
        <AnimatePresence>
          {(dropdownOpen || searching) && (
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
              {!searching && hasSearched && results.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }} dir="rtl">
                  لا توجد فواتير معلقة لهذا الرقم
                </div>
              )}
              {results.length > 0 && (
                <ul style={{ padding: "4px 0", listStyle: "none", margin: 0 }}>
                  {results.map((c) => (
                    <li key={c.id || c.phone}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelect(c)}
                        style={{
                          width: "100%",
                          height: 50,
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
                        {/* Avatar */}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            background: "rgba(239,68,68,0.12)",
                            color: "var(--color-danger, #EF4444)",
                          }}
                        >
                          {getInitials(c.name || c.phone)}
                        </div>
                        {/* Name + phone */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name || c.phone}
                          </div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", marginTop: 1, color: "var(--text-secondary)" }}>
                            {c.phone}
                          </div>
                        </div>
                        {/* Count + amount */}
                        <div style={{ flexShrink: 0, textAlign: "left" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-danger, #EF4444)", fontFamily: "monospace" }}>
                            {formatOMR(c.totalOwed)}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
                            {c.unpaidCount} فاتورة
                          </div>
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

      {/* Scan button — always amber */}
      <button
        type="button"
        onClick={onScanClick}
        style={{
          flexShrink: 0,
          height: 40,
          padding: "0 12px",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "rgba(245,158,11,0.12)",
          color: "#F59E0B",
          border: "1px solid rgba(245,158,11,0.35)",
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
      >
        <Camera size={13} />
        مسح وتسليم
      </button>
    </div>
  );
}
