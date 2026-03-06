-- Production totals: user-defined rollup totals for Cost Report (e.g. Above the line, Below the line). Reporting only.

CREATE TABLE IF NOT EXISTS production_totals (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS production_total_accounts (
  id TEXT PRIMARY KEY,
  production_total_id TEXT NOT NULL REFERENCES production_totals(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES budget_accounts(id) ON DELETE CASCADE,
  UNIQUE(production_total_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_production_totals_production ON production_totals(production_id);
CREATE INDEX IF NOT EXISTS idx_production_total_accounts_total ON production_total_accounts(production_total_id);
