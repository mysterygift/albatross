-- Receipt proof for an expense (works without a vendor, for every transaction type).
-- The file itself is a `documents` row (entity_type = 'expense_receipt', entity_id = expense id);
-- this table carries the optional receipt metadata (date / amount / reference) keyed to that document.
-- Receipts have no invoice number, status or reminder task.

CREATE TABLE IF NOT EXISTS expense_receipts (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  receipt_date TEXT,
  amount REAL,
  reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense ON expense_receipts(expense_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_receipts_document ON expense_receipts(document_id);
