-- Typed classification for budget line items (mirrors typed expenses conceptually; separate tables).
-- Actuals remain from expenses.amount only; budget items stay estimates.

ALTER TABLE budget_items ADD COLUMN line_item_type TEXT;

CREATE TABLE IF NOT EXISTS budget_item_details (
  id TEXT PRIMARY KEY,
  budget_item_id TEXT NOT NULL UNIQUE REFERENCES budget_items(id) ON DELETE CASCADE,
  line_item_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_item_details_budget_item_id ON budget_item_details(budget_item_id);
