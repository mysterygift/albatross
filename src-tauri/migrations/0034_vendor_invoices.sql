-- Vendor invoices: per-vendor invoice tracking (amount, tax, dates, status).
-- No PO, expense, or task linkage in this migration.

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  invoice_number TEXT NOT NULL,
  issue_date TEXT,
  due_date TEXT,
  amount REAL,
  tax REAL,
  currency_code TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'received', 'approved', 'paid', 'overdue')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_production_id ON vendor_invoices(production_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor_id ON vendor_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor_active ON vendor_invoices(vendor_id) WHERE deleted_at IS NULL;
