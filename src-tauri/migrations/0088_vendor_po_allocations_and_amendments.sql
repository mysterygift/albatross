-- PO matching: per-PO allocated amount on expense links (NULL = whole expense when it has a single PO)
-- and an audit trail of PO value amendments (vendor_purchase_orders.amount stays the CURRENT value).

ALTER TABLE vendor_purchase_order_expenses ADD COLUMN allocated_amount REAL;

CREATE TABLE IF NOT EXISTS vendor_purchase_order_amendments (
  id TEXT PRIMARY KEY,
  vendor_purchase_order_id TEXT NOT NULL REFERENCES vendor_purchase_orders(id) ON DELETE CASCADE,
  previous_amount REAL,
  new_amount REAL NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendor_po_amendments_po
  ON vendor_purchase_order_amendments(vendor_purchase_order_id);
