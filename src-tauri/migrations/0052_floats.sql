-- Petty cash float allocations (per budget line item + crew). Allocation only; no expense reconciliation in this stage.
CREATE TABLE floats (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  budget_item_id TEXT NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  issued_date TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_floats_production_id ON floats(production_id);
CREATE INDEX IF NOT EXISTS idx_floats_person_id ON floats(person_id);
CREATE INDEX IF NOT EXISTS idx_floats_budget_item_id ON floats(budget_item_id);
