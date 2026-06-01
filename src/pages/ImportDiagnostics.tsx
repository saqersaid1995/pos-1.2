import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ArrowRight, AlertTriangle, CheckCircle2, Database, Download, Bug } from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";
import { localDb } from "@/lib/db/local-client";
import { isElectron as isElectronFlag, canUseServer } from "@/lib/electron";

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
    label: "Active items (COALESCE-safe: is_active = 1 or NULL)",
    sql: `SELECT COUNT(*) AS c FROM items WHERE COALESCE(is_active, 1) = 1`,
  },
  {
    label: "Active services (COALESCE-safe: is_active = 1 or NULL)",
    sql: `SELECT COUNT(*) AS c FROM services WHERE COALESCE(is_active, 1) = 1`,
  },
  {
    label: "Active service_pricing (COALESCE-safe: is_active = 1 or NULL)",
    sql: `SELECT COUNT(*) AS c FROM service_pricing WHERE COALESCE(is_active, 1) = 1`,
  },
  {
    label: "Non-deleted, non-draft orders (COALESCE-safe: NULL counts as 0)",
    sql: `SELECT COUNT(*) AS c FROM orders WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(is_draft, 0) = 0`,
  },
  {
    label: "Active items with show_in_quick_add (visible in POS Quick Add)",
    sql: `SELECT COUNT(*) AS c FROM items WHERE COALESCE(is_active, 1) = 1 AND COALESCE(show_in_quick_add, 1) = 1`,
  },
  {
    label: "Active service_pricing rows with matching active item",
    sql: `SELECT COUNT(*) AS c FROM service_pricing sp JOIN items i ON i.item_name = sp.item_type WHERE COALESCE(sp.is_active, 1) = 1 AND COALESCE(i.is_active, 1) = 1`,
  },
];

async function runQuery(sql: string): Promise<{ data: Record<string, unknown>[] | null; error: unknown }> {
  return (window as any).drovo.db.query(sql, []) as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
}

const SENSITIVE_FIELDS = new Set(["pin_hash", "password", "token"]);

function maskSensitiveFields(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const masked: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      masked[key] = SENSITIVE_FIELDS.has(key) ? "***MASKED***" : val;
    }
    return masked;
  });
}

async function runQueryParams(sql: string, params: unknown[]): Promise<{ data: Record<string, unknown>[] | null; error: unknown }> {
  return (window as any).drovo.db.query(sql, params) as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
}

// ─── Runtime Query Debug types ───────────────────────────────────────────────

interface RuntimeQueryResult {
  label: string;
  source: "localDb (QueryBuilder)" | "raw SQL (IPC)";
  rowCount: number | null;
  error: string | null;
  sampleRow: Record<string, unknown> | null;
}

interface RuntimeDebugData {
  isElectron: boolean;
  canUseServer: boolean;
  navigatorOnLine: boolean;
  windowDrovoType: string;
  results: RuntimeQueryResult[];
  ranAt: string;
}

async function runRuntimeDebug(): Promise<RuntimeDebugData> {
  const results: RuntimeQueryResult[] = [];

  // Helper for localDb (QueryBuilder path — same as what UI uses)
  async function qb(label: string, builder: ReturnType<typeof localDb.from>): Promise<void> {
    try {
      const { data, error } = await builder as any;
      results.push({
        label,
        source: "localDb (QueryBuilder)",
        rowCount: data ? (data as any[]).length : null,
        error: error ? String(error) : null,
        sampleRow: data && (data as any[]).length > 0 ? (data as any[])[0] : null,
      });
    } catch (e) {
      results.push({ label, source: "localDb (QueryBuilder)", rowCount: null, error: String(e), sampleRow: null });
    }
  }

  // Helper for raw SQL (IPC path — same as diagnostics page)
  async function raw(label: string, sql: string, params: unknown[] = []): Promise<void> {
    try {
      const r = await runQueryParams(sql, params);
      const rows = r.data as any[] | null;
      results.push({
        label,
        source: "raw SQL (IPC)",
        rowCount: rows ? rows.length : null,
        error: r.error ? String(r.error) : null,
        sampleRow: rows && rows.length > 0 ? rows[0] : null,
      });
    } catch (e) {
      results.push({ label, source: "raw SQL (IPC)", rowCount: null, error: String(e), sampleRow: null });
    }
  }

  // ── POS items ────────────────────────────────────────────────────────────
  await qb("POS items (localDb)", localDb.from("items")
    .select("item_name, item_name_ar, image_url, sort_order, show_in_quick_add")
    .eq("is_active", true).eq("show_in_quick_add", true));
  await raw("POS items (raw SQL)", `SELECT item_name, item_name_ar FROM items WHERE COALESCE(is_active,1)=1 AND COALESCE(show_in_quick_add,1)=1`);

  // ── POS service_pricing ───────────────────────────────────────────────────
  await qb("POS service_pricing (localDb)", localDb.from("service_pricing")
    .select("item_type, service_type, price, urgent_price, is_active, is_default_service")
    .eq("is_active", true));
  await raw("POS service_pricing (raw SQL)", `SELECT item_type, service_type FROM service_pricing WHERE COALESCE(is_active,1)=1`);

  // ── POS services ──────────────────────────────────────────────────────────
  await qb("POS services (localDb)", localDb.from("services")
    .select("service_name").eq("is_active", true));
  await raw("POS services (raw SQL)", `SELECT service_name FROM services WHERE COALESCE(is_active,1)=1`);

  // ── Workflow orders ───────────────────────────────────────────────────────
  await qb("Workflow orders (localDb, no nested)", localDb.from("orders")
    .select("id, order_number, current_status, is_deleted, is_draft, customer_id")
    .eq("is_deleted", false).eq("is_draft", false)
    .order("created_at", { ascending: false }));
  await raw("Workflow orders (raw SQL)", `SELECT id, order_number, current_status, is_deleted, is_draft FROM orders WHERE COALESCE(is_deleted,0)=0 AND COALESCE(is_draft,0)=0 ORDER BY created_at DESC LIMIT 50`);

  // ── Orders status distribution ────────────────────────────────────────────
  await raw("Orders status distribution (raw SQL)", `SELECT current_status, COUNT(*) as cnt FROM orders GROUP BY current_status ORDER BY cnt DESC`);

  // ── Customers ─────────────────────────────────────────────────────────────
  await qb("Customers (localDb)", localDb.from("customers").select("id, full_name, phone_number").order("created_at", { ascending: false }));
  await raw("Customers (raw SQL)", `SELECT id, full_name FROM customers LIMIT 10`);

  // ── Payments all time ─────────────────────────────────────────────────────
  await qb("Payments all-time (localDb)", localDb.from("payments").select("id, amount, payment_date, payment_method").order("payment_date", { ascending: false }));
  await raw("Payments all-time (raw SQL)", `SELECT id, payment_date, amount FROM payments ORDER BY payment_date DESC LIMIT 10`);

  // ── Payments this month ───────────────────────────────────────────────────
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().slice(0, 10);
  await qb("Payments this month (localDb)", localDb.from("payments")
    .select("id, amount, payment_date")
    .gte("payment_date", monthStart).lte("payment_date", today));
  await raw("Payments this month (raw SQL)", `SELECT id, payment_date FROM payments WHERE SUBSTR(COALESCE(payment_date,'0000-00-00'),1,10) >= ? AND SUBSTR(COALESCE(payment_date,'9999-99-99'),1,10) <= ?`, [monthStart, today]);

  // ── Payment date range ────────────────────────────────────────────────────
  await raw("Payment date range (raw SQL)", `SELECT MIN(payment_date) as min_date, MAX(payment_date) as max_date, COUNT(*) as total FROM payments`);

  // ── Orders with nested customers (first 5) ────────────────────────────────
  await qb("Orders with customers nested (localDb, LIMIT 5)", localDb.from("orders")
    .select("id, order_number, customer_id, customers(id, full_name)")
    .eq("is_deleted", false).eq("is_draft", false)
    .order("created_at", { ascending: false }).limit(5));

  return {
    isElectron: isElectronFlag,
    canUseServer: canUseServer(),
    navigatorOnLine: navigator.onLine,
    windowDrovoType: typeof (window as any).drovo,
    results,
    ranAt: new Date().toISOString(),
  };
}

export default function ImportDiagnostics() {
  const navigate = useNavigate();
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [runtimeDebug, setRuntimeDebug] = useState<RuntimeDebugData | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);

  const exportDiagnosticZip = useCallback(async () => {
    if (!isElectron) return;
    setExportingZip(true);
    try {
      const zip = new JSZip();

      // ── 1. table_counts.json ──────────────────────────────────────────────
      const COUNT_TABLES_ZIP = [
        "customers", "orders", "order_items", "payments", "items",
        "services", "service_pricing", "order_status_history",
        "cash_transfers", "expenses", "profiles", "user_roles",
      ];
      const countResults = await Promise.all(
        COUNT_TABLES_ZIP.map(async (t) => {
          try {
            const r = await runQuery(`SELECT COUNT(*) as count FROM "${t}"`);
            if (r.error) return [t, null] as const;
            const rows = r.data as Array<{ count: number }>;
            return [t, rows?.[0]?.count ?? 0] as const;
          } catch {
            return [t, null] as const;
          }
        })
      );
      const tableCounts: Record<string, number | null> = {};
      for (const [t, c] of countResults) tableCounts[t] = c;
      zip.file("table_counts.json", JSON.stringify(tableCounts, null, 2));

      // ── 2. health_checks.json ─────────────────────────────────────────────
      const healthQueries: Array<{ key: string; sql: string; params?: unknown[] }> = [
        { key: "orphan_orders_no_customer", sql: "SELECT COUNT(*) as c FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE c.id IS NULL" },
        { key: "orphan_order_items_no_order", sql: "SELECT COUNT(*) as c FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL" },
        { key: "orphan_payments_no_order", sql: "SELECT COUNT(*) as c FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE o.id IS NULL" },
        { key: "items_is_active_eq_1", sql: "SELECT COUNT(*) as c FROM items WHERE is_active = 1" },
        { key: "items_is_active_eq_0", sql: "SELECT COUNT(*) as c FROM items WHERE is_active = 0" },
        { key: "items_is_active_null", sql: "SELECT COUNT(*) as c FROM items WHERE is_active IS NULL" },
        { key: "items_is_active_not_integer", sql: "SELECT COUNT(*) as c FROM items WHERE typeof(is_active) != 'integer'" },
        { key: "services_is_active_eq_1", sql: "SELECT COUNT(*) as c FROM services WHERE is_active = 1" },
        { key: "services_is_active_null", sql: "SELECT COUNT(*) as c FROM services WHERE is_active IS NULL" },
        { key: "service_pricing_is_active_eq_1", sql: "SELECT COUNT(*) as c FROM service_pricing WHERE is_active = 1" },
        { key: "service_pricing_is_active_null", sql: "SELECT COUNT(*) as c FROM service_pricing WHERE is_active IS NULL" },
        { key: "orders_is_deleted_eq_0", sql: "SELECT COUNT(*) as c FROM orders WHERE COALESCE(is_deleted, 0) = 0" },
        { key: "orders_is_deleted_eq_1", sql: "SELECT COUNT(*) as c FROM orders WHERE is_deleted = 1" },
        { key: "orders_is_deleted_null", sql: "SELECT COUNT(*) as c FROM orders WHERE is_deleted IS NULL" },
        { key: "items_show_in_quick_add_eq_1", sql: "SELECT COUNT(*) as c FROM items WHERE show_in_quick_add = 1" },
        { key: "items_show_in_quick_add_null", sql: "SELECT COUNT(*) as c FROM items WHERE show_in_quick_add IS NULL" },
      ];
      const healthResults = await Promise.all(
        healthQueries.map(async ({ key, sql }) => {
          try {
            const r = await runQuery(sql);
            if (r.error) return [key, null] as const;
            const rows = r.data as Array<{ c: number }>;
            return [key, rows?.[0]?.c ?? 0] as const;
          } catch {
            return [key, null] as const;
          }
        })
      );
      const healthChecks: Record<string, number | null> = {};
      for (const [k, v] of healthResults) healthChecks[k] = v;
      zip.file("health_checks.json", JSON.stringify(healthChecks, null, 2));

      // ── 3. sample_rows.json ───────────────────────────────────────────────
      const SAMPLE_TABLES_ZIP = [
        "customers", "orders", "order_items", "payments", "items",
        "services", "service_pricing", "order_status_history",
        "cash_transfers", "expenses",
      ];
      const sampleResults = await Promise.all(
        SAMPLE_TABLES_ZIP.map(async (t) => {
          try {
            const r = await runQuery(`SELECT * FROM "${t}" LIMIT 20`);
            if (r.error) return [t, { error: String(r.error), rows: [] }] as const;
            const rows = maskSensitiveFields((r.data as Record<string, unknown>[]) ?? []);
            return [t, { rows }] as const;
          } catch (e) {
            return [t, { error: String(e), rows: [] }] as const;
          }
        })
      );
      const sampleRows: Record<string, unknown> = {};
      for (const [t, v] of sampleResults) sampleRows[t] = v;
      zip.file("sample_rows.json", JSON.stringify(sampleRows, null, 2));

      // ── 4. operational_queries.json ───────────────────────────────────────
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const operationalQueries: Array<{ label: string; sql: string; params?: unknown[]; result?: unknown; error?: string }> = [
        { label: "pos_items", sql: "SELECT * FROM items WHERE COALESCE(is_active, 1) = 1 LIMIT 20" },
        { label: "pos_services", sql: "SELECT * FROM services WHERE COALESCE(is_active, 1) = 1 LIMIT 20" },
        { label: "pos_service_pricing", sql: "SELECT * FROM service_pricing WHERE COALESCE(is_active, 1) = 1 LIMIT 20" },
        { label: "workflow_orders", sql: "SELECT * FROM orders WHERE COALESCE(is_deleted, 0) = 0 ORDER BY created_at DESC LIMIT 20" },
        { label: "cash_flow_all_time", sql: "SELECT p.*, o.order_number, o.payment_status FROM payments p LEFT JOIN orders o ON o.id = p.order_id ORDER BY p.payment_date DESC LIMIT 20" },
        { label: "cash_flow_this_month", sql: "SELECT p.*, o.order_number FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE SUBSTR(COALESCE(p.payment_date,'0000-00-00'),1,10) >= ? AND SUBSTR(COALESCE(p.payment_date,'9999-99-99'),1,10) <= ? LIMIT 20", params: [monthStart, today] },
        { label: "payments_date_distribution", sql: "SELECT SUBSTR(COALESCE(payment_date,'NULL'),1,10) as date_prefix, COUNT(*) as cnt FROM payments GROUP BY 1 ORDER BY 1 DESC LIMIT 30" },
        { label: "orders_date_distribution", sql: "SELECT SUBSTR(COALESCE(order_date,'NULL'),1,10) as date_prefix, COUNT(*) as cnt FROM orders GROUP BY 1 ORDER BY 1 DESC LIMIT 30" },
      ];
      const opResults = await Promise.all(
        operationalQueries.map(async (q) => {
          try {
            const r = q.params
              ? await runQueryParams(q.sql, q.params)
              : await runQuery(q.sql);
            if (r.error) return { ...q, result: null, error: String(r.error) };
            return { ...q, result: r.data ?? [] };
          } catch (e) {
            return { ...q, result: null, error: String(e) };
          }
        })
      );
      const operationalData: Record<string, unknown> = {};
      for (const q of opResults) {
        operationalData[q.label] = { sql: q.sql, ...(q.params ? { params: q.params } : {}), result: q.result, ...(q.error ? { error: q.error } : {}) };
      }
      zip.file("operational_queries.json", JSON.stringify(operationalData, null, 2));

      // ── 5. schema_info.json ────────────────────────────────────────────────
      const SCHEMA_TABLES = ["customers", "orders", "order_items", "payments", "items", "services", "service_pricing", "order_status_history"];
      const schemaResults = await Promise.all(
        SCHEMA_TABLES.map(async (t) => {
          const [colsRes, fkRes] = await Promise.all([
            runQuery(`PRAGMA table_info("${t}")`),
            runQuery(`PRAGMA foreign_key_list("${t}")`),
          ]);
          return [t, {
            columns: colsRes.error ? { error: String(colsRes.error) } : colsRes.data,
            foreign_keys: fkRes.error ? { error: String(fkRes.error) } : fkRes.data,
          }] as const;
        })
      );
      const schemaInfo: Record<string, unknown> = {};
      for (const [t, v] of schemaResults) schemaInfo[t] = v;
      zip.file("schema_info.json", JSON.stringify(schemaInfo, null, 2));

      // ── 6. query_debug.txt ────────────────────────────────────────────────
      const lines: string[] = [];
      const dateStamp = new Date().toISOString();
      lines.push(`Drovo Diagnostic Report`);
      lines.push(`Generated: ${dateStamp}`);
      lines.push(`${"=".repeat(60)}`);
      lines.push(``);

      lines.push(`TABLE COUNTS`);
      lines.push(`${"─".repeat(40)}`);
      for (const [t, c] of Object.entries(tableCounts)) {
        lines.push(`  ${t.padEnd(30)} ${c === null ? "ERROR" : c}`);
      }
      lines.push(``);

      lines.push(`HEALTH CHECKS`);
      lines.push(`${"─".repeat(40)}`);
      const orphanOrders = healthChecks["orphan_orders_no_customer"] ?? 0;
      const orphanItems = healthChecks["orphan_order_items_no_order"] ?? 0;
      const orphanPayments = healthChecks["orphan_payments_no_order"] ?? 0;
      const itemsActiveNull = healthChecks["items_is_active_null"] ?? 0;
      const ordersDeletedNull = healthChecks["orders_is_deleted_null"] ?? 0;
      const ordersActive = healthChecks["orders_is_deleted_eq_0"] ?? 0;

      if (orphanOrders > 0) lines.push(`  ⚠️  Orphan orders (no customer): ${orphanOrders}`);
      else lines.push(`  ✅ No orphan orders`);

      if (orphanItems > 0) lines.push(`  ⚠️  Orphan order_items (no order): ${orphanItems}`);
      else lines.push(`  ✅ No orphan order_items`);

      if (orphanPayments > 0) lines.push(`  ⚠️  Orphan payments (no order): ${orphanPayments}`);
      else lines.push(`  ✅ No orphan payments`);

      if (itemsActiveNull > 0) lines.push(`  ⚠️  Items with is_active NULL: ${itemsActiveNull} (will be treated as active by COALESCE)`);
      else lines.push(`  ✅ No items with is_active NULL`);

      if (ordersDeletedNull > 0) lines.push(`  ⚠️  Orders with is_deleted NULL: ${ordersDeletedNull} (treated as not deleted by COALESCE)`);
      else lines.push(`  ✅ No orders with is_deleted NULL`);

      // null payment dates check
      const paymentsDateDist = (operationalData["payments_date_distribution"] as any)?.result ?? [];
      const nullPaymentDates = paymentsDateDist.filter((r: any) => r.date_prefix === "NULL").reduce((acc: number, r: any) => acc + (r.cnt ?? 0), 0);
      if (nullPaymentDates > 0) lines.push(`  ⚠️  Payments with null payment_date: ${nullPaymentDates}`);
      else lines.push(`  ✅ No null payment dates found in top 30 records`);

      lines.push(``);
      lines.push(`SUMMARY`);
      lines.push(`${"─".repeat(40)}`);

      const likelyWorking: string[] = [];
      const likelyBroken: string[] = [];

      const itemsCount = tableCounts["items"] ?? 0;
      const servicesCount = tableCounts["services"] ?? 0;
      const ordersCount = tableCounts["orders"] ?? 0;
      const customersCount = tableCounts["customers"] ?? 0;

      if ((itemsCount ?? 0) > 0) likelyWorking.push("items");
      else likelyBroken.push("items (empty)");

      if ((servicesCount ?? 0) > 0) likelyWorking.push("services");
      else likelyBroken.push("services (empty)");

      if ((ordersCount ?? 0) > 0 && ordersActive > 0) likelyWorking.push("orders");
      else if ((ordersCount ?? 0) === 0) likelyBroken.push("orders (empty)");

      if ((customersCount ?? 0) > 0) likelyWorking.push("customers");
      else likelyBroken.push("customers (empty)");

      if (orphanOrders === 0 && orphanPayments === 0 && orphanItems === 0) likelyWorking.push("referential integrity");
      else likelyBroken.push("referential integrity (orphan records found)");

      lines.push(`  Likely working: ${likelyWorking.length > 0 ? likelyWorking.join(", ") : "none"}`);
      lines.push(`  Likely broken:  ${likelyBroken.length > 0 ? likelyBroken.join(", ") : "none"}`);
      lines.push(``);

      zip.file("query_debug.txt", lines.join("\n"));

      // ── Trigger download ──────────────────────────────────────────────────
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drovo-diagnostics-${dateStamp.slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("تم تصدير تقرير التشخيص بنجاح!");
    } catch (err) {
      toast.error(`فشل التصدير: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingZip(false);
    }
  }, []);

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

  const runRuntimeDebugPanel = useCallback(async () => {
    if (!isElectron) return;
    setRuntimeLoading(true);
    try {
      const result = await runRuntimeDebug();
      setRuntimeDebug(result);
    } catch (e) {
      toast.error(`Runtime debug failed: ${e}`);
    } finally {
      setRuntimeLoading(false);
    }
  }, []);

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
            onClick={runRuntimeDebugPanel}
            disabled={runtimeLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "#7c3aed", color: "#fff", opacity: runtimeLoading ? 0.7 : 1 }}
          >
            <Bug size={14} className={runtimeLoading ? "animate-spin" : ""} />
            {runtimeLoading ? "Running…" : "Runtime Debug"}
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

      {isElectron && (
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={exportDiagnosticZip}
            disabled={exportingZip}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              opacity: exportingZip ? 0.7 : 1,
            }}
          >
            {exportingZip ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {exportingZip ? "جاري التصدير…" : "تصدير تقرير التشخيص ZIP"}
          </button>
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

      {/* ── Runtime Query Debug Panel ─────────────────────────────────────── */}
      {runtimeDebug && (
        <div className="space-y-4 mt-8 pt-6" style={{ borderTop: "2px solid #7c3aed" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#7c3aed" }}>
            <Bug size={16} /> Runtime Query Debug
          </h2>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Ran at: {runtimeDebug.ranAt}</p>

          {/* Environment */}
          <div className="ds-card" style={{ padding: "12px 16px" }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Environment</h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {[
                ["isElectron", String(runtimeDebug.isElectron)],
                ["canUseServer()", String(runtimeDebug.canUseServer)],
                ["navigator.onLine", String(runtimeDebug.navigatorOnLine)],
                ["typeof window.drovo", runtimeDebug.windowDrovoType],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span style={{ color: "var(--text-tertiary)" }}>{k}:</span>
                  <span style={{ color: v === "true" ? "var(--color-success)" : v === "false" ? "var(--color-danger)" : "var(--text-primary)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Query results */}
          <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Query</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Source</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>Rows</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Error / Sample</th>
                </tr>
              </thead>
              <tbody>
                {runtimeDebug.results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "6px 12px", fontFamily: "monospace", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{r.label}</td>
                    <td style={{ padding: "6px 12px", color: r.source.startsWith("localDb") ? "#7c3aed" : "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.source}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700, color: r.error ? "var(--color-danger)" : r.rowCount === 0 ? "var(--color-warning, orange)" : "var(--color-success)" }}>
                      {r.error ? "ERR" : r.rowCount ?? "—"}
                    </td>
                    <td style={{ padding: "6px 12px", fontFamily: "monospace", color: r.error ? "var(--color-danger)" : "var(--text-tertiary)", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.error
                        ? r.error
                        : r.sampleRow
                          ? JSON.stringify(r.sampleRow).slice(0, 120)
                          : r.rowCount === 0 ? "(empty)" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
