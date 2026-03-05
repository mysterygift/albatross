-- Allow budget_items.category_id to be NULL so new rows can use account_id only (chart of accounts).
-- Existing rows keep their category_id; new rows may set category_id NULL and account_id set.
CREATE TABLE budget_items_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES budget_categories(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES budget_accounts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  estimated_cost REAL NOT NULL DEFAULT 0,
  actual_cost REAL NOT NULL DEFAULT 0,
  vendor TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO budget_items_new SELECT id, production_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, created_at, updated_at, deleted_at FROM budget_items;
DROP TABLE budget_items;
ALTER TABLE budget_items_new RENAME TO budget_items;
CREATE INDEX IF NOT EXISTS idx_budget_items_production_id ON budget_items(production_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_category_id ON budget_items(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_account_id ON budget_items(account_id);
