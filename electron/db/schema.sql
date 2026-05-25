-- DROVO POS - SQLite Schema
-- Mirrors all PostgreSQL/Supabase tables (final migration state)
-- UUID → TEXT, TIMESTAMPTZ → TEXT (ISO 8601), JSONB → TEXT, NUMERIC → REAL, BOOLEAN → INTEGER

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                TEXT PRIMARY KEY,
  full_name         TEXT NOT NULL,
  phone_number      TEXT UNIQUE NOT NULL,
  customer_type     TEXT DEFAULT 'Regular' CHECK (customer_type IN ('Regular', 'VIP')),
  notes             TEXT DEFAULT '',
  created_at        TEXT,
  updated_at        TEXT,
  is_active         INTEGER DEFAULT 1,
  country_code      TEXT,
  full_phone_e164   TEXT,
  local_phone       TEXT
);

-- ─────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                           TEXT PRIMARY KEY,
  order_number                 TEXT UNIQUE NOT NULL,
  customer_id                  TEXT REFERENCES customers(id) ON DELETE SET NULL,
  order_date                   TEXT NOT NULL,
  delivery_date                TEXT,
  order_type                   TEXT DEFAULT 'regular',
  pickup_method                TEXT DEFAULT 'walk-in',
  current_status               TEXT DEFAULT 'received',
  payment_status               TEXT DEFAULT 'unpaid',
  subtotal                     REAL DEFAULT 0,
  discount                     REAL DEFAULT 0,
  urgent_fee                   REAL DEFAULT 0,
  tax                          REAL DEFAULT 0,
  total_amount                 REAL DEFAULT 0,
  paid_amount                  REAL DEFAULT 0,
  remaining_amount             REAL DEFAULT 0,
  general_notes                TEXT DEFAULT '',
  qr_value                     TEXT,
  employee_id                  TEXT DEFAULT '',
  created_at                   TEXT,
  updated_at                   TEXT,
  ready_pickup_whatsapp_sent   INTEGER DEFAULT 0,
  is_deleted                   INTEGER DEFAULT 0,
  is_draft                     INTEGER DEFAULT 0,
  deleted_at                   TEXT,
  loyalty_whatsapp_sent        INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────
-- ORDER ITEMS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type        TEXT DEFAULT '',
  service_type     TEXT DEFAULT '',
  quantity         INTEGER DEFAULT 1,
  unit_price       REAL DEFAULT 0,
  total_price      REAL DEFAULT 0,
  color            TEXT,
  brand            TEXT,
  condition_notes  TEXT,
  special_notes    TEXT,
  created_at       TEXT
);

-- ─────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method  TEXT DEFAULT 'cash',
  amount          REAL DEFAULT 0,
  payment_date    TEXT,
  notes           TEXT,
  created_at      TEXT
);

-- ─────────────────────────────────────────
-- ORDER STATUS HISTORY
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_at  TEXT,
  changed_by  TEXT,
  note        TEXT
);

-- ─────────────────────────────────────────
-- CUSTOMER NOTES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_notes (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note_text   TEXT NOT NULL,
  created_at  TEXT,
  created_by  TEXT
);

-- ─────────────────────────────────────────
-- INTERNAL ORDER NOTES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_order_notes (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  note_text   TEXT NOT NULL,
  created_at  TEXT,
  created_by  TEXT
);

-- ─────────────────────────────────────────
-- SERVICES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  is_active    INTEGER DEFAULT 1,
  created_at   TEXT,
  updated_at   TEXT
);

-- ─────────────────────────────────────────
-- ITEMS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id               TEXT PRIMARY KEY,
  item_name        TEXT NOT NULL,
  is_active        INTEGER DEFAULT 1,
  created_at       TEXT,
  updated_at       TEXT,
  item_name_ar     TEXT,
  image_url        TEXT,
  show_in_quick_add INTEGER DEFAULT 1,
  sort_order       INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────
-- SERVICE PRICING
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_pricing (
  id                  TEXT PRIMARY KEY,
  item_type           TEXT NOT NULL,
  service_type        TEXT NOT NULL,
  price               REAL DEFAULT 0,
  currency            TEXT DEFAULT 'OMR',
  is_active           INTEGER DEFAULT 1,
  display_order       INTEGER DEFAULT 0,
  notes               TEXT,
  created_at          TEXT,
  updated_at          TEXT,
  service_id          TEXT REFERENCES services(id),
  item_id             TEXT REFERENCES items(id),
  is_default_service  INTEGER DEFAULT 0,
  urgent_price        REAL
);

-- ─────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                   TEXT PRIMARY KEY,
  description          TEXT NOT NULL,
  category             TEXT DEFAULT 'other',
  amount               REAL DEFAULT 0,
  expense_date         TEXT,
  payment_source       TEXT DEFAULT 'cash',
  is_recurring         INTEGER DEFAULT 0,
  recurring_period     TEXT,
  due_date             TEXT,
  created_at           TEXT,
  updated_at           TEXT,
  billing_day          INTEGER,
  next_run_date        TEXT,
  last_run_date        TEXT,
  expense_status       TEXT DEFAULT 'paid',
  is_auto_generated    INTEGER DEFAULT 0,
  parent_recurring_id  TEXT,
  income_category      TEXT DEFAULT 'other_opex',
  pl_line              TEXT DEFAULT 'sga_admin',
  cash_amount          REAL DEFAULT 0,
  bank_amount          REAL DEFAULT 0,
  paid_amount          REAL DEFAULT 0,
  remaining_amount     REAL DEFAULT 0
);

-- ─────────────────────────────────────────
-- EXPENSE PAYMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_payments (
  id             TEXT PRIMARY KEY,
  expense_id     TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  amount         REAL DEFAULT 0,
  payment_date   TEXT,
  payment_source TEXT DEFAULT 'cash',
  notes          TEXT,
  created_at     TEXT
);

-- ─────────────────────────────────────────
-- NOTIFICATION LOGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_logs (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL,
  recipient_phone     TEXT NOT NULL,
  message_type        TEXT NOT NULL,
  send_status         TEXT DEFAULT 'pending',
  error_message       TEXT,
  provider_message_id TEXT,
  provider_response   TEXT,
  channel             TEXT DEFAULT 'whatsapp',
  customer_id         TEXT,
  message_body        TEXT,
  created_at          TEXT,
  direction           TEXT DEFAULT 'outgoing',
  template_name       TEXT,
  template_language   TEXT,
  template_category   TEXT,
  event_type          TEXT,
  error_code          TEXT,
  delivered_at        TEXT,
  read_at             TEXT,
  failed_at           TEXT,
  estimated_cost      REAL DEFAULT 0,
  currency            TEXT DEFAULT 'OMR'
);

-- ─────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  full_name  TEXT DEFAULT '',
  phone      TEXT,
  is_active  INTEGER DEFAULT 1,
  pin_hash   TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- ─────────────────────────────────────────
-- USER ROLES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('admin', 'cashier'))
);

-- ─────────────────────────────────────────
-- LOYALTY SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_settings (
  id                    TEXT PRIMARY KEY,
  is_enabled            INTEGER DEFAULT 0,
  earn_points_rate      REAL DEFAULT 1,
  redeem_points_rate    REAL DEFAULT 0.01,
  points_validity_days  INTEGER,
  max_redemption_percent REAL DEFAULT 50,
  min_redeem_points     REAL DEFAULT 50,
  loyalty_start_date    TEXT,
  created_at            TEXT,
  updated_at            TEXT
);

-- ─────────────────────────────────────────
-- CUSTOMER LOYALTY
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_loyalty (
  id              TEXT PRIMARY KEY,
  customer_id     TEXT UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points_balance  REAL DEFAULT 0,
  total_earned    REAL DEFAULT 0,
  total_redeemed  REAL DEFAULT 0,
  created_at      TEXT,
  updated_at      TEXT
);

-- ─────────────────────────────────────────
-- LOYALTY TRANSACTIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id               TEXT PRIMARY KEY,
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  order_id         TEXT REFERENCES orders(id),
  points           REAL DEFAULT 0,
  type             TEXT DEFAULT 'earn',
  description      TEXT,
  expires_at       TEXT,
  remaining_points REAL DEFAULT 0,
  created_at       TEXT
);

-- ─────────────────────────────────────────
-- OPENING BALANCES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_balances (
  id           TEXT PRIMARY KEY,
  account_type TEXT NOT NULL,
  amount       REAL DEFAULT 0,
  as_of_date   TEXT,
  notes        TEXT,
  created_at   TEXT,
  updated_at   TEXT
);

-- ─────────────────────────────────────────
-- ACCOUNTING SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_settings (
  id                    TEXT PRIMARY KEY,
  accounting_start_date TEXT NOT NULL,
  created_at            TEXT,
  updated_at            TEXT
);

-- ─────────────────────────────────────────
-- CHART OF ACCOUNTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id                  TEXT PRIMARY KEY,
  code                TEXT UNIQUE NOT NULL,
  account_name        TEXT NOT NULL,
  account_type        TEXT NOT NULL,
  sub_type            TEXT DEFAULT '',
  normal_balance      TEXT NOT NULL,
  is_active           INTEGER DEFAULT 1,
  is_system           INTEGER DEFAULT 0,
  description         TEXT,
  classification_type TEXT,
  created_at          TEXT,
  updated_at          TEXT
);

-- ─────────────────────────────────────────
-- JOURNAL ENTRIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id          TEXT PRIMARY KEY,
  entry_date  TEXT NOT NULL,
  description TEXT DEFAULT '',
  source_type TEXT DEFAULT 'manual',
  source_id   TEXT,
  is_system   INTEGER DEFAULT 0,
  created_at  TEXT,
  updated_at  TEXT
);

-- ─────────────────────────────────────────
-- JOURNAL ENTRY LINES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                TEXT PRIMARY KEY,
  entry_id          TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  debit_account_id  TEXT REFERENCES chart_of_accounts(id),
  credit_account_id TEXT REFERENCES chart_of_accounts(id),
  amount            REAL NOT NULL,
  line_description  TEXT,
  created_at        TEXT
);

-- ─────────────────────────────────────────
-- FIXED ASSETS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                    TEXT PRIMARY KEY,
  asset_name            TEXT NOT NULL,
  category              TEXT DEFAULT 'equipment',
  purchase_date         TEXT NOT NULL,
  cost                  REAL DEFAULT 0,
  residual_value        REAL DEFAULT 0,
  useful_life_years     REAL DEFAULT 5,
  depreciation_method   TEXT DEFAULT 'straight-line',
  status                TEXT DEFAULT 'active',
  is_deleted            INTEGER DEFAULT 0,
  asset_account_code    TEXT DEFAULT '1500',
  contra_account_code   TEXT DEFAULT '1590',
  expense_account_code  TEXT DEFAULT '6200',
  funding_source        TEXT DEFAULT 'cash',
  invoice_url           TEXT,
  notes                 TEXT,
  created_at            TEXT,
  updated_at            TEXT
);

-- ─────────────────────────────────────────
-- DEPRECIATION ENTRIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS depreciation_entries (
  id               TEXT PRIMARY KEY,
  asset_id         TEXT NOT NULL REFERENCES fixed_assets(id),
  period_month     TEXT NOT NULL,
  amount           REAL DEFAULT 0,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_at       TEXT
);

-- ─────────────────────────────────────────
-- LOANS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id                        TEXT PRIMARY KEY,
  loan_name                 TEXT NOT NULL,
  bank_name                 TEXT DEFAULT '',
  loan_type                 TEXT DEFAULT 'new' CHECK (loan_type IN ('new', 'existing')),
  principal                 REAL DEFAULT 0,
  original_principal        REAL DEFAULT 0,
  outstanding_balance       REAL DEFAULT 0,
  annual_interest_rate      REAL DEFAULT 0,
  term_months               INTEGER DEFAULT 12,
  payment_frequency         TEXT DEFAULT 'monthly',
  start_date                TEXT,
  first_disbursement_date   TEXT,
  next_payment_date         TEXT,
  installment_amount        REAL DEFAULT 0,
  status                    TEXT DEFAULT 'active',
  is_deleted                INTEGER DEFAULT 0,
  liability_account_code    TEXT DEFAULT '2100',
  disbursement_account_code TEXT DEFAULT '1010',
  interest_expense_code     TEXT DEFAULT '6300',
  notes                     TEXT,
  attachment_url            TEXT,
  created_at                TEXT,
  updated_at                TEXT
);

-- ─────────────────────────────────────────
-- LOAN INSTALLMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_installments (
  id                TEXT PRIMARY KEY,
  loan_id           TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_no    INTEGER NOT NULL,
  due_date          TEXT NOT NULL,
  principal_amount  REAL DEFAULT 0,
  interest_amount   REAL DEFAULT 0,
  total_amount      REAL DEFAULT 0,
  paid_amount       REAL DEFAULT 0,
  remaining_balance REAL DEFAULT 0,
  is_paid           INTEGER DEFAULT 0,
  created_at        TEXT
);

-- ─────────────────────────────────────────
-- LOAN PAYMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_payments (
  id               TEXT PRIMARY KEY,
  loan_id          TEXT NOT NULL REFERENCES loans(id),
  installment_id   TEXT REFERENCES loan_installments(id),
  amount           REAL DEFAULT 0,
  principal_portion REAL DEFAULT 0,
  interest_portion REAL DEFAULT 0,
  payment_date     TEXT,
  payment_source   TEXT DEFAULT 'cash',
  notes            TEXT,
  created_at       TEXT
);

-- ─────────────────────────────────────────
-- PAYMENT CORRECTIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_corrections (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL,
  original_payment_id TEXT,
  old_amount          REAL,
  new_amount          REAL,
  old_method          TEXT,
  new_method          TEXT,
  old_payment_date    TEXT,
  new_payment_date    TEXT,
  changed_by          TEXT,
  reason              TEXT,
  created_at          TEXT
);

-- ─────────────────────────────────────────
-- CASH TRANSFERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_transfers (
  id            TEXT PRIMARY KEY,
  from_account  TEXT NOT NULL,
  to_account    TEXT NOT NULL,
  amount        REAL NOT NULL,
  transfer_date TEXT,
  notes         TEXT,
  created_by    TEXT,
  created_at    TEXT
);

-- ─────────────────────────────────────────
-- BUSINESS SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_settings (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  business_name    TEXT DEFAULT 'مغسلتي',
  business_name_en TEXT DEFAULT 'My Laundry',
  address          TEXT DEFAULT '',
  phone            TEXT DEFAULT '',
  tax_number       TEXT DEFAULT '',
  logo_url         TEXT,
  currency         TEXT DEFAULT 'OMR',
  language         TEXT DEFAULT 'ar',
  thermal_header   TEXT DEFAULT '',
  thermal_footer   TEXT DEFAULT '',
  default_printer  TEXT DEFAULT '',
  receipt_size     TEXT DEFAULT '80mm',
  created_at       TEXT,
  updated_at       TEXT
);

-- ─────────────────────────────────────────
-- MIGRATIONS TRACKER
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- ═════════════════════════════════════════
-- INDEXES
-- ═════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_orders_customer_id    ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_current_status ON orders(current_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number   ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted     ON orders(is_deleted);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id     ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date         ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_je_date               ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_jel_entry             ON journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_customer   ON loyalty_transactions(customer_id);

-- ═════════════════════════════════════════
-- UPDATE TRIGGERS (updated_at)
-- ═════════════════════════════════════════

CREATE TRIGGER IF NOT EXISTS trg_customers_updated
  AFTER UPDATE ON customers
  FOR EACH ROW
  BEGIN
    UPDATE customers SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_orders_updated
  AFTER UPDATE ON orders
  FOR EACH ROW
  BEGIN
    UPDATE orders SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_services_updated
  AFTER UPDATE ON services
  FOR EACH ROW
  BEGIN
    UPDATE services SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_items_updated
  AFTER UPDATE ON items
  FOR EACH ROW
  BEGIN
    UPDATE items SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_service_pricing_updated
  AFTER UPDATE ON service_pricing
  FOR EACH ROW
  BEGIN
    UPDATE service_pricing SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_updated
  AFTER UPDATE ON expenses
  FOR EACH ROW
  BEGIN
    UPDATE expenses SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_profiles_updated
  AFTER UPDATE ON profiles
  FOR EACH ROW
  BEGIN
    UPDATE profiles SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_loyalty_settings_updated
  AFTER UPDATE ON loyalty_settings
  FOR EACH ROW
  BEGIN
    UPDATE loyalty_settings SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_customer_loyalty_updated
  AFTER UPDATE ON customer_loyalty
  FOR EACH ROW
  BEGIN
    UPDATE customer_loyalty SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_accounting_settings_updated
  AFTER UPDATE ON accounting_settings
  FOR EACH ROW
  BEGIN
    UPDATE accounting_settings SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_chart_of_accounts_updated
  AFTER UPDATE ON chart_of_accounts
  FOR EACH ROW
  BEGIN
    UPDATE chart_of_accounts SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_journal_entries_updated
  AFTER UPDATE ON journal_entries
  FOR EACH ROW
  BEGIN
    UPDATE journal_entries SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_fixed_assets_updated
  AFTER UPDATE ON fixed_assets
  FOR EACH ROW
  BEGIN
    UPDATE fixed_assets SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_loans_updated
  AFTER UPDATE ON loans
  FOR EACH ROW
  BEGIN
    UPDATE loans SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_opening_balances_updated
  AFTER UPDATE ON opening_balances
  FOR EACH ROW
  BEGIN
    UPDATE opening_balances SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_business_settings_updated
  AFTER UPDATE ON business_settings
  FOR EACH ROW
  BEGIN
    UPDATE business_settings SET updated_at = DATETIME('now') WHERE id = NEW.id;
  END;

-- ═════════════════════════════════════════
-- VIEWS
-- ═════════════════════════════════════════

CREATE VIEW IF NOT EXISTS account_balances AS
SELECT
  coa.*,
  COALESCE(
    (SELECT SUM(jel.amount) FROM journal_entry_lines jel WHERE jel.debit_account_id = coa.id),
    0
  ) AS total_debits,
  COALESCE(
    (SELECT SUM(jel.amount) FROM journal_entry_lines jel WHERE jel.credit_account_id = coa.id),
    0
  ) AS total_credits,
  CASE coa.normal_balance
    WHEN 'debit' THEN
      COALESCE((SELECT SUM(jel.amount) FROM journal_entry_lines jel WHERE jel.debit_account_id = coa.id), 0) -
      COALESCE((SELECT SUM(jel.amount) FROM journal_entry_lines jel WHERE jel.credit_account_id = coa.id), 0)
    ELSE
      COALESCE((SELECT SUM(jel.amount) FROM journal_entry_lines jel WHERE jel.credit_account_id = coa.id), 0) -
      COALESCE((SELECT SUM(jel.amount) FROM journal_entry_lines jel WHERE jel.debit_account_id = coa.id), 0)
  END AS balance
FROM chart_of_accounts coa
WHERE coa.is_active = 1;
