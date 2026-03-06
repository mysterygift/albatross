-- Stage 1: Hierarchical Chart of Accounts for film/TV budgeting.
-- Only leaf accounts (is_postable = true) may receive budget line items and expenses.
-- Account codes stored as TEXT (e.g. '1000', '2513') for future flexibility.

CREATE TABLE IF NOT EXISTS budget_accounts (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_account_id TEXT REFERENCES budget_accounts(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_postable INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(production_id, code)
);

CREATE INDEX IF NOT EXISTS idx_budget_accounts_production_id ON budget_accounts(production_id);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_parent ON budget_accounts(parent_account_id);

-- Optional link to chart of accounts; category_id unchanged (non-destructive).
-- Note: budget_items.actual_cost is deprecated for actual calculations; actuals come from expenses.
ALTER TABLE budget_items ADD COLUMN account_id TEXT REFERENCES budget_accounts(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN account_id TEXT REFERENCES budget_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budget_items_account_id ON budget_items(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);
