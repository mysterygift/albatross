-- Vendor Purchase Orders: planned or approved spend before invoices.
-- No invoice or expense linkage in this migration.

CREATE TABLE IF NOT EXISTS vendor_purchase_orders (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  po_number TEXT NOT NULL,
  description TEXT,
  issue_date TEXT,
  due_date TEXT,
  amount REAL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'approved', 'closed', 'cancelled')),
  approval INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendor_purchase_orders_production_id
  ON vendor_purchase_orders(production_id);

CREATE INDEX IF NOT EXISTS idx_vendor_purchase_orders_vendor_id
  ON vendor_purchase_orders(vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_purchase_orders_vendor_active
  ON vendor_purchase_orders(vendor_id)
  WHERE deleted_at IS NULL;
