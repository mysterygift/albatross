-- Cost report groups: presentation/reporting groups for accounts. Do not affect posting or totals.

CREATE TABLE IF NOT EXISTS cost_report_groups (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(production_id, name)
);

CREATE TABLE IF NOT EXISTS cost_report_group_accounts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES cost_report_groups(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES budget_accounts(id) ON DELETE CASCADE,
  UNIQUE(group_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_cost_report_groups_production ON cost_report_groups(production_id);
CREATE INDEX IF NOT EXISTS idx_cost_report_group_accounts_group ON cost_report_group_accounts(group_id);

-- Optional: unique code per production when code is not null (app validates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_report_groups_production_code
  ON cost_report_groups(production_id, code) WHERE code IS NOT NULL;
