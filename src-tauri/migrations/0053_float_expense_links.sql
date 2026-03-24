-- Float ↔ expense reconciliation (petty cash). Does not affect budget_item_expense_links or actuals.
CREATE TABLE float_expense_links (
  id TEXT PRIMARY KEY,
  float_id TEXT NOT NULL REFERENCES floats(id) ON DELETE CASCADE,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  matched_amount REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (matched_amount > 0)
);

-- At most one active link per (float, expense).
CREATE UNIQUE INDEX IF NOT EXISTS idx_float_expense_links_active_pair
  ON float_expense_links(float_id, expense_id) WHERE deleted_at IS NULL;

-- One expense may be linked to at most one float at a time (active rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_float_expense_links_active_expense
  ON float_expense_links(expense_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_float_expense_links_float_id ON float_expense_links(float_id);
CREATE INDEX IF NOT EXISTS idx_float_expense_links_expense_id ON float_expense_links(expense_id);
