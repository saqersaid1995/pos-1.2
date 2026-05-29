// Supabase-compatible query builder that routes through Electron IPC
// (window.drovo.db.query / window.drovo.db.run) instead of HTTP.
// Drop-in replacement: swap `supabase` for `localDb` and all call-sites
// continue to work unchanged.

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type DbResult = { data: unknown; error: unknown };
type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Foreign-key map – drives nested-select (JOIN) resolution
// ---------------------------------------------------------------------------

interface FKDef {
  table: string;
  fk: string;
  isMany: boolean;
}

const FOREIGN_KEYS: Record<string, Record<string, FKDef>> = {
  orders: {
    customers: { table: 'customers', fk: 'customer_id', isMany: false },
    order_items: { table: 'order_items', fk: 'order_id', isMany: true },
    payments: { table: 'payments', fk: 'order_id', isMany: true },
    order_status_history: { table: 'order_status_history', fk: 'order_id', isMany: true },
    internal_order_notes: { table: 'internal_order_notes', fk: 'order_id', isMany: true },
  },
  // payments → orders (many payments belong to one order)
  payments: {
    orders: { table: 'orders', fk: 'order_id', isMany: false },
  },
  customers: {
    customer_notes: { table: 'customer_notes', fk: 'customer_id', isMany: true },
    customer_loyalty: { table: 'customer_loyalty', fk: 'customer_id', isMany: false },
    loyalty_transactions: { table: 'loyalty_transactions', fk: 'customer_id', isMany: true },
  },
  journal_entries: {
    journal_entry_lines: { table: 'journal_entry_lines', fk: 'entry_id', isMany: true },
  },
  loans: {
    loan_installments: { table: 'loan_installments', fk: 'loan_id', isMany: true },
    loan_payments: { table: 'loan_payments', fk: 'loan_id', isMany: true },
  },
  expenses: {
    expense_payments: { table: 'expense_payments', fk: 'expense_id', isMany: true },
  },
};

// ---------------------------------------------------------------------------
// IPC bridge helpers
// ---------------------------------------------------------------------------

function ipcQuery(sql: string, params: unknown[] = []): Promise<DbResult> {
  return (window as any).drovo.db.query(sql, params);
}

function ipcRun(sql: string, params: unknown[] = []): Promise<DbResult> {
  return (window as any).drovo.db.run(sql, params);
}

// Convert JS booleans to SQLite integers (0/1).
// better-sqlite3 accepts booleans but some codepaths pass them as-is; normalise here.
function toSqliteValue(v: unknown): unknown {
  if (v === true) return 1;
  if (v === false) return 0;
  return v;
}

// ---------------------------------------------------------------------------
// Select-string parser
// ---------------------------------------------------------------------------

interface ParsedSelect {
  mainCols: string;        // columns for the primary table (e.g. "*" or "id, name")
  nested: Array<{
    alias: string;         // key used in the relation map, e.g. "customers"
    cols: string;          // columns to fetch from the related table
  }>;
}

function parseSelectString(select: string, _table: string): ParsedSelect {
  // We split on commas but need to respect parentheses nesting.
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const mainParts: string[] = [];
  const nested: ParsedSelect['nested'] = [];

  for (const part of parts) {
    const parenIdx = part.indexOf('(');
    if (parenIdx !== -1) {
      // Strip Supabase join modifiers: "orders!inner" → "orders", "orders!left" → "orders"
      const rawAlias = part.slice(0, parenIdx).trim();
      const alias = rawAlias.replace(/![a-z_]+$/, '');
      const cols = part.slice(parenIdx + 1, part.lastIndexOf(')')).trim();
      nested.push({ alias, cols });
    } else {
      mainParts.push(part);
    }
  }

  return {
    mainCols: mainParts.length === 0 ? '*' : mainParts.join(', '),
    nested,
  };
}

// ---------------------------------------------------------------------------
// SQL identifier quoting
// ---------------------------------------------------------------------------

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Filter clause builder
// ---------------------------------------------------------------------------

interface FilterClause {
  sql: string;
  params: unknown[];
}

type FilterOp =
  | { type: 'eq'; col: string; val: unknown }
  | { type: 'neq'; col: string; val: unknown }
  | { type: 'gt'; col: string; val: unknown }
  | { type: 'lt'; col: string; val: unknown }
  | { type: 'gte'; col: string; val: unknown }
  | { type: 'lte'; col: string; val: unknown }
  | { type: 'like'; col: string; val: unknown }
  | { type: 'ilike'; col: string; val: unknown }
  | { type: 'in'; col: string; vals: unknown[] }
  | { type: 'is'; col: string; val: null }
  | { type: 'not'; col: string; op: string; val: unknown }
  | { type: 'or'; filterString: string };

function buildFilters(filters: FilterOp[], baseParamIndex: number): FilterClause {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = baseParamIndex;

  for (const f of filters) {
    switch (f.type) {
      case 'eq': {
        // For boolean/flag columns (converted to 0 or 1), use COALESCE so that
        // imported rows with NULL values are treated as the schema default.
        // - eq(col, false) → COALESCE(col, 0) = 0  (NULL rows are treated as "not deleted")
        // - eq(col, true)  → COALESCE(col, 1) = 1  (NULL rows are treated as "active")
        const sqlVal = toSqliteValue(f.val);
        if (sqlVal === 0) {
          // NULL should be treated as 0 (e.g. is_deleted, is_draft)
          clauses.push(`COALESCE(${quoteIdent(f.col)}, 0) = ?${paramIdx++}`);
        } else if (sqlVal === 1) {
          // NULL should be treated as 1 for positive-default flags (e.g. is_active, show_in_quick_add)
          clauses.push(`COALESCE(${quoteIdent(f.col)}, 1) = ?${paramIdx++}`);
        } else {
          clauses.push(`${quoteIdent(f.col)} = ?${paramIdx++}`);
        }
        params.push(sqlVal);
        break;
      }
      case 'neq':
        clauses.push(`${quoteIdent(f.col)} != ?${paramIdx++}`);
        params.push(toSqliteValue(f.val));
        break;
      case 'gt':
        clauses.push(`${quoteIdent(f.col)} > ?${paramIdx++}`);
        params.push(toSqliteValue(f.val));
        break;
      case 'lt':
        clauses.push(`${quoteIdent(f.col)} < ?${paramIdx++}`);
        params.push(toSqliteValue(f.val));
        break;
      case 'gte': {
        const sqlVal = toSqliteValue(f.val);
        // Normalize date strings to YYYY-MM-DD prefix for format-independent comparison.
        // Supabase CSV exports timestamps as "2026-05-21 10:30:00+00" (space-separated, no T),
        // while bound strings use "2026-05-01T00:00:00+04:00". SQLite text comparison is
        // byte-by-byte, so mixing these formats produces wrong results at the boundary day.
        // SUBSTR both sides to 10 chars makes all formats compare correctly.
        if (typeof sqlVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sqlVal)) {
          clauses.push(`SUBSTR(COALESCE(${quoteIdent(f.col)}, '0000-00-00'), 1, 10) >= ?${paramIdx++}`);
          params.push(sqlVal.slice(0, 10));
        } else {
          clauses.push(`${quoteIdent(f.col)} >= ?${paramIdx++}`);
          params.push(sqlVal);
        }
        break;
      }
      case 'lte': {
        const sqlVal = toSqliteValue(f.val);
        if (typeof sqlVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sqlVal)) {
          clauses.push(`SUBSTR(COALESCE(${quoteIdent(f.col)}, '9999-99-99'), 1, 10) <= ?${paramIdx++}`);
          params.push(sqlVal.slice(0, 10));
        } else {
          clauses.push(`${quoteIdent(f.col)} <= ?${paramIdx++}`);
          params.push(sqlVal);
        }
        break;
      }
      case 'like':
        clauses.push(`${quoteIdent(f.col)} LIKE ?${paramIdx++}`);
        params.push(f.val);
        break;
      case 'ilike':
        // SQLite LIKE is case-insensitive for ASCII by default; use LIKE for ilike compat
        clauses.push(`${quoteIdent(f.col)} LIKE ?${paramIdx++}`);
        params.push(f.val);
        break;
      case 'in': {
        if (f.vals.length === 0) {
          clauses.push('1=0'); // IN () is always false
          break;
        }
        const placeholders = f.vals.map(() => `?${paramIdx++}`).join(', ');
        clauses.push(`${quoteIdent(f.col)} IN (${placeholders})`);
        params.push(...f.vals.map(toSqliteValue));
        break;
      }
      case 'is':
        clauses.push(`${quoteIdent(f.col)} IS NULL`);
        break;
      case 'not':
        if (f.op === 'is' && f.val === null) {
          clauses.push(`${quoteIdent(f.col)} IS NOT NULL`);
        } else {
          // Generic NOT fallback
          clauses.push(`NOT (${quoteIdent(f.col)} = ?${paramIdx++})`);
          params.push(toSqliteValue(f.val));
        }
        break;
      case 'or': {
        // Parse Supabase or-filter string: "col.op.value,col.op.value"
        const orClauses = parseOrString(f.filterString, paramIdx);
        clauses.push(`(${orClauses.sql})`);
        params.push(...orClauses.params);
        paramIdx += orClauses.params.length;
        break;
      }
    }
  }

  return {
    sql: clauses.length > 0 ? clauses.join(' AND ') : '',
    params,
  };
}

// Parse Supabase or-filter string like "full_name.ilike.%x%,phone_number.ilike.%x%"
function parseOrString(filterString: string, baseParamIndex: number): FilterClause {
  const parts = filterString.split(',').map((s) => s.trim());
  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = baseParamIndex;

  for (const part of parts) {
    // format: col.op.value  (value may contain dots)
    const dotIdx1 = part.indexOf('.');
    const dotIdx2 = part.indexOf('.', dotIdx1 + 1);
    if (dotIdx1 === -1 || dotIdx2 === -1) continue;

    const col = part.slice(0, dotIdx1);
    const op = part.slice(dotIdx1 + 1, dotIdx2);
    const val = part.slice(dotIdx2 + 1);

    switch (op) {
      case 'eq':
        clauses.push(`${quoteIdent(col)} = ?${paramIdx++}`);
        params.push(val);
        break;
      case 'neq':
        clauses.push(`${quoteIdent(col)} != ?${paramIdx++}`);
        params.push(val);
        break;
      case 'like':
        clauses.push(`${quoteIdent(col)} LIKE ?${paramIdx++}`);
        params.push(val);
        break;
      case 'ilike':
        clauses.push(`${quoteIdent(col)} LIKE ?${paramIdx++}`);
        params.push(val);
        break;
      case 'is':
        if (val === 'null') {
          clauses.push(`${quoteIdent(col)} IS NULL`);
        } else {
          clauses.push(`${quoteIdent(col)} IS ?${paramIdx++}`);
          params.push(val);
        }
        break;
      default:
        // Unknown op — skip to avoid SQL injection
        break;
    }
  }

  return { sql: clauses.join(' OR '), params };
}

// ---------------------------------------------------------------------------
// QueryBuilder
// ---------------------------------------------------------------------------

type BuilderMode = 'select' | 'insert' | 'update' | 'delete';

class QueryBuilder {
  private _table: string;
  private _mode: BuilderMode = 'select';
  private _selectStr: string = '*';
  private _filters: FilterOp[] = [];
  private _orderCol: string | null = null;
  private _orderAsc: boolean = true;
  private _limitVal: number | null = null;
  private _rangeFrom: number | null = null;
  private _rangeTo: number | null = null;
  private _insertPayload: Row | Row[] | null = null;
  private _updatePayload: Row | null = null;
  private _returnSelect: string | null = null; // select after insert/update

  constructor(table: string) {
    this._table = table;
  }

  // ---- Chain methods --------------------------------------------------------

  select(cols: string = '*'): this {
    if (this._mode === 'insert' || this._mode === 'update') {
      // .select() after insert/update means "return these columns"
      this._returnSelect = cols;
    } else {
      this._mode = 'select';
      this._selectStr = cols;
    }
    return this;
  }

  insert(payload: Row | Row[]): this {
    this._mode = 'insert';
    this._insertPayload = payload;
    return this;
  }

  update(values: Row): this {
    this._mode = 'update';
    this._updatePayload = values;
    return this;
  }

  delete(): this {
    this._mode = 'delete';
    return this;
  }

  eq(col: string, val: unknown): this {
    this._filters.push({ type: 'eq', col, val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this._filters.push({ type: 'neq', col, val });
    return this;
  }

  gt(col: string, val: unknown): this {
    this._filters.push({ type: 'gt', col, val });
    return this;
  }

  lt(col: string, val: unknown): this {
    this._filters.push({ type: 'lt', col, val });
    return this;
  }

  gte(col: string, val: unknown): this {
    this._filters.push({ type: 'gte', col, val });
    return this;
  }

  lte(col: string, val: unknown): this {
    this._filters.push({ type: 'lte', col, val });
    return this;
  }

  like(col: string, pattern: unknown): this {
    this._filters.push({ type: 'like', col, val: pattern });
    return this;
  }

  ilike(col: string, pattern: unknown): this {
    this._filters.push({ type: 'ilike', col, val: pattern });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this._filters.push({ type: 'in', col, vals });
    return this;
  }

  is(col: string, val: null): this {
    this._filters.push({ type: 'is', col, val });
    return this;
  }

  not(col: string, op: string, val: unknown): this {
    this._filters.push({ type: 'not', col, op, val });
    return this;
  }

  or(filterString: string): this {
    this._filters.push({ type: 'or', filterString });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this._orderCol = col;
    this._orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this._rangeFrom = from;
    this._rangeTo = to;
    return this;
  }

  // ---- Terminal methods -----------------------------------------------------

  async single(): Promise<{ data: Row | null; error: unknown }> {
    const result = await this._execute();
    if (result.error) return { data: null, error: result.error };
    const rows = result.data as Row[];
    if (rows.length === 0) {
      return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
    }
    if (rows.length > 1) {
      return { data: null, error: { message: 'Multiple rows returned', code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: unknown }> {
    const result = await this._execute();
    if (result.error) return { data: null, error: result.error };
    const rows = result.data as Row[];
    return { data: rows.length > 0 ? rows[0] : null, error: null };
  }

  // Make the builder thenable so `await builder` works
  then<TResult1 = { data: Row[] | null; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled as any, onrejected as any);
  }

  // ---- Internal execution ---------------------------------------------------

  private async _execute(): Promise<{ data: Row[] | null; error: unknown }> {
    try {
      switch (this._mode) {
        case 'select':
          return await this._execSelect();
        case 'insert':
          return await this._execInsert();
        case 'update':
          return await this._execUpdate();
        case 'delete':
          return await this._execDelete();
        default:
          return { data: null, error: { message: 'Unknown query mode' } };
      }
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // ---- SELECT ---------------------------------------------------------------

  private async _execSelect(): Promise<{ data: Row[] | null; error: unknown }> {
    const parsed = parseSelectString(this._selectStr, this._table);
    const { sql, params } = this._buildSelectSQL(parsed.mainCols);

    const result = await ipcQuery(sql, params);
    if (result.error) return { data: null, error: result.error };

    let rows = result.data as Row[];

    // Resolve nested relations
    if (parsed.nested.length > 0) {
      rows = await this._resolveNested(rows, parsed.nested);
    }

    return { data: rows, error: null };
  }

  private _buildSelectSQL(cols: string): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    let sql = `SELECT ${cols} FROM ${quoteIdent(this._table)}`;

    const { sql: whereSql, params: whereParams } = buildFilters(this._filters, 1);
    if (whereSql) {
      sql += ` WHERE ${whereSql}`;
      params.push(...whereParams);
    }

    if (this._orderCol) {
      sql += ` ORDER BY ${quoteIdent(this._orderCol)} ${this._orderAsc ? 'ASC' : 'DESC'}`;
    }

    if (this._rangeFrom !== null && this._rangeTo !== null) {
      const count = this._rangeTo - this._rangeFrom + 1;
      sql += ` LIMIT ${count} OFFSET ${this._rangeFrom}`;
    } else if (this._limitVal !== null) {
      sql += ` LIMIT ${this._limitVal}`;
    }

    return { sql, params };
  }

  private async _resolveNested(
    rows: Row[],
    nestedDefs: Array<{ alias: string; cols: string }>,
    parentTable?: string,
  ): Promise<Row[]> {
    if (rows.length === 0) return rows;

    const tableName = parentTable ?? this._table;
    const tableFKs = FOREIGN_KEYS[tableName] ?? {};

    for (const nested of nestedDefs) {
      const fkDef = tableFKs[nested.alias];
      if (!fkDef) {
        // Unknown relation — skip rather than crash
        continue;
      }

      // Parse nested cols for further sub-relations (recursive support)
      const parsedNested = parseSelectString(nested.cols, fkDef.table);

      if (fkDef.isMany) {
        // e.g. orders → order_items (order_id)
        // Collect parent PKs (assume "id" is primary key)
        const parentIds = rows
          .map((r) => r['id'])
          .filter((v) => v !== null && v !== undefined);

        if (parentIds.length === 0) {
          rows.forEach((r) => { r[nested.alias] = []; });
          continue;
        }

        const placeholders = parentIds.map((_, i) => `?${i + 1}`).join(', ');
        const colsStr = parsedNested.mainCols;
        const relSql =
          `SELECT ${colsStr} FROM ${quoteIdent(fkDef.table)} ` +
          `WHERE ${quoteIdent(fkDef.fk)} IN (${placeholders})`;

        const relResult = await ipcQuery(relSql, parentIds);
        let relRows = (relResult.error ? [] : (relResult.data as Row[]));

        // Recursively resolve sub-relations
        if (parsedNested.nested.length > 0) {
          relRows = await this._resolveNested(relRows, parsedNested.nested, fkDef.table);
        }

        // Group by FK value
        const grouped = new Map<unknown, Row[]>();
        for (const rr of relRows) {
          const key = rr[fkDef.fk];
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(rr);
        }

        for (const r of rows) {
          r[nested.alias] = grouped.get(r['id']) ?? [];
        }
      } else {
        // e.g. orders → customers (customer_id FK on orders side)
        // The FK lives on the parent row: orders.customer_id → customers.id
        const fkValues = rows
          .map((r) => r[fkDef.fk])
          .filter((v) => v !== null && v !== undefined);

        if (fkValues.length === 0) {
          rows.forEach((r) => { r[nested.alias] = null; });
          continue;
        }

        const uniqueFkValues = [...new Set(fkValues)];
        const placeholders = uniqueFkValues.map((_, i) => `?${i + 1}`).join(', ');
        const colsStr = parsedNested.mainCols;
        const relSql =
          `SELECT ${colsStr} FROM ${quoteIdent(fkDef.table)} ` +
          `WHERE "id" IN (${placeholders})`;

        const relResult = await ipcQuery(relSql, uniqueFkValues);
        let relRows = (relResult.error ? [] : (relResult.data as Row[]));

        // Recursively resolve sub-relations
        if (parsedNested.nested.length > 0) {
          relRows = await this._resolveNested(relRows, parsedNested.nested, fkDef.table);
        }

        const byId = new Map<unknown, Row>();
        for (const rr of relRows) {
          byId.set(rr['id'], rr);
        }

        for (const r of rows) {
          r[nested.alias] = byId.get(r[fkDef.fk]) ?? null;
        }
      }
    }

    return rows;
  }

  // ---- INSERT ---------------------------------------------------------------

  private async _execInsert(): Promise<{ data: Row[] | null; error: unknown }> {
    const payload = this._insertPayload!;
    const rows: Row[] = Array.isArray(payload) ? payload : [payload];

    if (rows.length === 0) return { data: [], error: null };

    const results: Row[] = [];

    for (const rowInput of rows) {
      // Clone so we don't mutate the caller's object
      const row: Row = { ...rowInput };

      // SQLite TEXT PRIMARY KEY has no auto-increment — generate a UUID when id is absent.
      // This mirrors Supabase's DEFAULT gen_random_uuid() behaviour.
      if (row['id'] === undefined || row['id'] === null) {
        row['id'] = crypto.randomUUID();
      }

      const cols = Object.keys(row);
      if (cols.length === 0) continue;

      const colsSql = cols.map(quoteIdent).join(', ');
      const placeholders = cols.map((_, i) => `?${i + 1}`).join(', ');
      const values = cols.map((c) => toSqliteValue(row[c]));

      const sql = `INSERT INTO ${quoteIdent(this._table)} (${colsSql}) VALUES (${placeholders})`;
      const runResult = await ipcRun(sql, values);
      if (runResult.error) return { data: null, error: runResult.error };

      // Fetch back the inserted row if .select() was chained.
      // Use the known UUID (not lastInsertRowid which is an integer rowid,
      // meaningless for TEXT PRIMARY KEY tables).
      if (this._returnSelect !== null) {
        const knownId = row['id'];
        const cols2 = this._returnSelect === '*' ? '*' : this._returnSelect;
        const fetchResult = await ipcQuery(
          `SELECT ${cols2} FROM ${quoteIdent(this._table)} WHERE "id" = ?1`,
          [knownId],
        );
        if (!fetchResult.error && (fetchResult.data as Row[]).length > 0) {
          results.push((fetchResult.data as Row[])[0]);
        } else {
          // Synthesise a minimal result so callers can at least read .id
          results.push({ id: knownId, ...row });
        }
      } else {
        results.push(row);
      }
    }

    return { data: results, error: null };
  }

  // ---- UPDATE ---------------------------------------------------------------

  private async _execUpdate(): Promise<{ data: Row[] | null; error: unknown }> {
    const values = this._updatePayload!;
    const cols = Object.keys(values);
    if (cols.length === 0) return { data: [], error: null };

    const setClauses = cols.map((c, i) => `${quoteIdent(c)} = ?${i + 1}`).join(', ');
    const setParams = cols.map((c) => toSqliteValue(values[c]));

    const { sql: whereSql, params: whereParams } = buildFilters(
      this._filters,
      cols.length + 1,
    );

    let sql = `UPDATE ${quoteIdent(this._table)} SET ${setClauses}`;
    if (whereSql) sql += ` WHERE ${whereSql}`;

    const allParams = [...setParams, ...whereParams];
    const runResult = await ipcRun(sql, allParams);
    if (runResult.error) return { data: null, error: runResult.error };

    // Fetch back updated rows if .select() was chained
    if (this._returnSelect !== null && this._filters.length > 0) {
      const cols2 = this._returnSelect === '*' ? '*' : this._returnSelect;
      const { sql: whereSql2, params: whereParams2 } = buildFilters(this._filters, 1);
      const fetchSql = `SELECT ${cols2} FROM ${quoteIdent(this._table)}${whereSql2 ? ` WHERE ${whereSql2}` : ''}`;
      const fetchResult = await ipcQuery(fetchSql, whereParams2);
      if (!fetchResult.error) {
        return { data: fetchResult.data as Row[], error: null };
      }
    }

    return { data: [], error: null };
  }

  // ---- DELETE ---------------------------------------------------------------

  private async _execDelete(): Promise<{ data: Row[] | null; error: unknown }> {
    const { sql: whereSql, params: whereParams } = buildFilters(this._filters, 1);

    let sql = `DELETE FROM ${quoteIdent(this._table)}`;
    if (whereSql) sql += ` WHERE ${whereSql}`;

    const runResult = await ipcRun(sql, whereParams);
    if (runResult.error) return { data: null, error: runResult.error };

    return { data: [], error: null };
  }
}

// ---------------------------------------------------------------------------
// Exported localDb object
// ---------------------------------------------------------------------------

export const localDb = {
  from: (table: string) => new QueryBuilder(table),

  // Auth stub — the desktop app uses PIN-based auth, not Supabase auth
  auth: {
    onAuthStateChange: (
      _callback: (event: string, session: null) => void,
    ): { data: { subscription: { unsubscribe: () => void } } } => {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },

    getSession: async (): Promise<{ data: { session: null } }> => {
      return { data: { session: null } };
    },

    signInWithPassword: async (
      _credentials: { email: string; password: string },
    ): Promise<{ data: null; error: { message: string } }> => {
      return { data: null, error: { message: 'Use PIN auth in desktop mode' } };
    },

    signOut: async (): Promise<void> => {
      // no-op in desktop mode
    },
  },
};
