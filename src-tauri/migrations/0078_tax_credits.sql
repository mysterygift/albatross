-- Tax credit schemes, expense allocations, and production budget feature toggles.

CREATE TABLE IF NOT EXISTS production_budget_features (
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
  tax_credits_enabled INTEGER NOT NULL DEFAULT 0,
  vat_tracking_enabled INTEGER NOT NULL DEFAULT 0,
  default_vat_rate_percent REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_credit_schemes (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  net_rate REAL NOT NULL,
  cap_percent REAL,
  min_qualifying_percent REAL,
  max_qualifying_amount REAL,
  max_core_budget REAL,
  is_vfx INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expense_tax_credit_allocations (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  tax_credit_scheme_id TEXT NOT NULL REFERENCES tax_credit_schemes(id) ON DELETE CASCADE,
  qualifying_amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_tax_credit_allocations_active_pair
  ON expense_tax_credit_allocations(expense_id, tax_credit_scheme_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tax_credit_schemes_production ON tax_credit_schemes(production_id);
CREATE INDEX IF NOT EXISTS idx_expense_tax_credit_allocations_expense ON expense_tax_credit_allocations(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_tax_credit_allocations_scheme ON expense_tax_credit_allocations(tax_credit_scheme_id);

ALTER TABLE expenses ADD COLUMN vat_rate_percent REAL;
