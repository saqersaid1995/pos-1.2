import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ArrowRight, AlertTriangle, CheckCircle2, Database } from "lucide-react";

const isElectron = typeof window !== "undefined" && typeof (window as any).drovo !== "undefined";

interface TableCount {
  table: string;
  count: number;
  error?: string;
}

interface SampleRows {
  table: string;
  rows: Record<string, unknown>[];
  error?: string;
}

interface RelationCheck {
  label: string;
  sql: string;
  count: number;
  error?: string;
}

interface DiagnosticData {
  counts: TableCount[];
  samples: SampleRows[];
  relations: RelationCheck[];
  loadedAt: string;
}

const COUNT_TABLES = [
  "customers",
  "orders",
  "order_items",
  "payments",
  "items",
  "services",
  "service_pricing",
  "order_status_history",
  "cash_transfers",
  "expenses",
];

const SAMPLE_TABLES = ["orders", "payments", "items", "services", "service_pricing"];

const RELATION_CHECKS: Array<{ label: string; sql: string }> = [
  {
    label: "Orphan orders (no matching customer)",
    sql: `SELECT COUNT(*) AS c FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE c.id IS NULL AND o.customer_id IS NOT NULL`,
  },
  {
    label: "Orphan order_items (no matching order)",
    sql: `SELECT COUNT(*) AS c FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL`,
  },
  {
    label: "Orphan payments (no matching order)",
    sql: `SELECT COUNT(*) AS c FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE o.id IS NULL`,
  },
  {
    label: "Items with is_active stored as string 't'/'f' (Supabase CSV bug)",
    sql: `SELECT COUNT(*) AS c FROM items WHERE is_active NOT IN (0, 1)`,
  },
  {
    label: "Services with is_active stored as string 't'/'f' (Supabase CSV bug)",
    sql: `SELECT COUNT(*) AS c FROM services WHERE is_active NOT IN (0, 1)`,
  },
  {
    label: "Service_pricing with is_active stored as string 't'/'f' (Supabase CSV bug)",
    sql: `SELECT COUNT(*) AS c FROM service_pricing WHERE is_active NOT IN (0, 1)`,
  },
  {
    label: "Orders with is_deleted stored as string (should be 0 or 1)",
    sql: `SELECT COUNT(*) AS c FROM orders WHERE is_deleted NOT IN (0, 1)`,
  },
  {
    label: "Active items (is_active = 1)",
    sql: `SELECT COUNT(*) AS c FROM items WHERE is_active = 1`,
  },
  {
    label: "Active services (is_active = 1)",
    sql: `SELECT COUNT(*) AS c FROM services WHERE is_active = 1`,
  },
  {
    label: "Active service_pricing (is_active = 1)",
    sql: `SELECT COUNT(*) AS c FROM service_pricing WHERE is_active = 1`,
  },
  {
    label: "Non-deleted, non-draft orders",
    sql: `SELECT COUNT(*) AS c FROM orders WHERE is_deleted = 0 AND is_draft = 0`,
  },
];

async function runQuery(sql: string): Promise<{ data: Record<string, unknown>[] | null; error: unknown }> {
  return (window as any).drovo.db.query(sql, []) as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
}

export default function ImportDiagnostics() {
  const navigate = useNavigate();
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = useCallback(async () => {
    if (!isElectron) return;
    setLoading(true);

    // Table counts
    const counts: TableCount[] = await Promise.all(
      COUNT_TABLES.map(async (table) => {
        try {
          const result = await runQuery(`SELECT COUNT(*) AS c FROM "${table}"`);
          if (result.error) return { table, count: 0, error: String(result.error) };
          const rows = result.data as Array<{ c: number }>;
          return { table, count: rows?.[0]?.c ?? 0 };
        } catch (e) {
          return { table, count: 0, error: String(e) };
        }
      })
    );

    // Sample rows
    const samples: SampleRows[] = await Promise.all(
      SAMPLE_TABLES.map(async (table) => {
        try {
          const result = await runQuery(`SELECT * FROM "${table}" LIMIT 3`);
          if (result.error) return { table, rows: [], error: String(result.error) };
          return { table, rows: (result.data as Record<string, unknown>[]) ?? [] };
        } catch (e) {
          return { table, rows: [], error: String(e) };
        }
      })
    );

    // Relation checks
    const relations: RelationCheck[] = await Promise.all(
      RELATION_CHECKS.map(async (check) => {
        try {
          const result = await runQuery(check.sql);
          if (result.error) return { ...check, count: 0, error: String(result.error) };
          const rows = result.data as Array<{ c: number }>;
          return { ...check, count: rows?.[0]?.c ?? 0 };
        } catch (e) {
          return { ...check, count: 0, error: String(e) };
        }
      })
    );

    setData({
      counts,
      samples,
      relations,
      loadedAt: new Date().toLocaleString(),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isElectron) runDiagnostics();
  }, [runDiagnostics]);

  if (!isElectron) {
    return (
      <div className="page-layout" dir="rtl">
        <div className="page-header">
          <h1 className="page-title">Import Diagnostics</h1>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <p style={{ color: "var(--text-secondary)" }}>This page is only available in the desktop (Electron) app.</p>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            <ArrowRight size={14} /> Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-layout" style={{ background: "var(--bg-base)" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Diagnostics</h1>
          <p className="page-subtitle">Inspect local SQLite database after import</p>
        </div>
        <div className="page-actions">
          <button
            onClick={runDiagnostics}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: loading ? 0.7 : 1 }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Running…" : "Refresh"}
          </button>
          <button
            onClick={() => navigate("/import")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
          >
            <ArrowRight size={14} /> Back to Import
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last updated: {data.loadedAt}</p>

          {/* Table counts */}
          <section>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Database size={16} /> Row Counts
            </h2>
            <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                    <th className="section-label" style={{ padding: "8px 16px", textAlign: "left", fontWeight: 500 }}>Table</th>
                    <th className="section-label" style={{ padding: "8px 16px", textAlign: "right", fontWeight: 500 }}>Rows</th>
                    <th className="section-label" style={{ padding: "8px 16px", textAlign: "left", fontWeight: 500 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.counts.map((tc) => (
                    <tr key={tc.table} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "6px 16px", fontFamily: "monospace", color: "var(--text-primary)" }}>{tc.table}</td>
                      <td style={{ padding: "6px 16px", textAlign: "right", fontWeight: 600, color: tc.count > 0 ? "var(--color-success)" : "var(--text-tertiary)" }}>
                        {tc.error ? "—" : tc.count.toLocaleString()}
                      </td>
                      <td style={{ padding: "6px 16px" }}>
                        {tc.error ? (
                          <span className="text-xs" style={{ color: "var(--color-danger)" }}>{tc.error}</span>
                        ) : tc.count > 0 ? (
                          <span className="text-xs flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                            <CheckCircle2 size={12} /> OK
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Empty</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Relation / health checks */}
          <section>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <AlertTriangle size={16} /> Health Checks
            </h2>
            <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                    <th className="section-label" style={{ padding: "8px 16px", textAlign: "left", fontWeight: 500 }}>Check</th>
                    <th className="section-label" style={{ padding: "8px 16px", textAlign: "right", fontWeight: 500 }}>Count</th>
                    <th className="section-label" style={{ padding: "8px 16px", textAlign: "left", fontWeight: 500 }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.relations.map((rc, idx) => {
                    // Checks 3-6 (index 3-6) are "bad if > 0" (string-stored booleans, orphans)
                    // Checks 7-10 (index 7-10) are "good if > 0" (active records)
                    const isOrphanOrBooleanCheck = idx < 7;
                    const isBad = isOrphanOrBooleanCheck && rc.count > 0;
                    const isGood = !isOrphanOrBooleanCheck && rc.count > 0;
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "6px 16px", color: "var(--text-secondary)", fontSize: 12 }}>{rc.label}</td>
                        <td style={{ padding: "6px 16px", textAlign: "right", fontWeight: 600, color: isBad ? "var(--color-danger)" : isGood ? "var(--color-success)" : "var(--text-tertiary)" }}>
                          {rc.error ? "—" : rc.count.toLocaleString()}
                        </td>
                        <td style={{ padding: "6px 16px" }}>
                          {rc.error ? (
                            <span className="text-xs" style={{ color: "var(--color-danger)" }}>{rc.error}</span>
                          ) : isBad ? (
                            <span className="text-xs flex items-center gap-1" style={{ color: "var(--color-danger)" }}>
                              <AlertTriangle size={12} /> Issue
                            </span>
                          ) : (
                            <span className="text-xs flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                              <CheckCircle2 size={12} /> OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sample rows */}
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Sample Rows (LIMIT 3 per table)
            </h2>
            {data.samples.map((s) => (
              <div key={s.table} className="mb-4">
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  {s.table}
                </h3>
                {s.error ? (
                  <p className="text-xs" style={{ color: "var(--color-danger)" }}>{s.error}</p>
                ) : s.rows.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No rows found.</p>
                ) : (
                  <div className="ds-card" style={{ padding: 0, overflow: "auto" }}>
                    <table className="text-xs" style={{ minWidth: "100%" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                          {Object.keys(s.rows[0]).map((col) => (
                            <th key={col} style={{ padding: "4px 10px", textAlign: "left", fontWeight: 500, color: "var(--text-tertiary)", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map((row, ri) => (
                          <tr key={ri} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            {Object.values(row).map((val, ci) => (
                              <td key={ci} style={{ padding: "4px 10px", color: "var(--text-primary)", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {val === null || val === undefined ? (
                                  <span style={{ color: "var(--text-tertiary)" }}>NULL</span>
                                ) : (
                                  String(val).length > 40 ? String(val).slice(0, 40) + "…" : String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
