-- Line item ↔ expense linking for reconciliation. Supports partial matching.
-- estimated_cost (budget_items) and amount (expenses) remain source of truth; links only record allocation.

CREATE TABLE IF NOT EXISTS budget_item_expense_links (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL,
  budget_item_id TEXT NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  matched_amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  CHECK (matched_amount > 0)
);

-- One active link per (budget_item_id, expense_id); multiple historical (deleted) rows allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_item_expense_links_active_pair
  ON budget_item_expense_links(budget_item_id, expense_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budget_item_expense_links_production_id ON budget_item_expense_links(production_id);
CREATE INDEX IF NOT EXISTS idx_budget_item_expense_links_budget_item_id ON budget_item_expense_links(budget_item_id);
CREATE INDEX IF NOT EXISTS idx_budget_item_expense_links_expense_id ON budget_item_expense_links(expense_id);
