-- VAT reclaim rates per transaction type and reclaim recording on expenses.

CREATE TABLE IF NOT EXISTS vat_reclaim_rates (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  reclaim_percent REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(production_id, transaction_type)
);

CREATE INDEX IF NOT EXISTS idx_vat_reclaim_rates_production ON vat_reclaim_rates(production_id);

ALTER TABLE expenses ADD COLUMN vat_reclaimed_amount REAL;
ALTER TABLE expenses ADD COLUMN vat_reclaim_date TEXT;
ALTER TABLE expenses ADD COLUMN vat_reclaim_reference TEXT;
