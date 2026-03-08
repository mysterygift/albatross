-- Link table: PO ↔ expenses (one PO, many expenses).
CREATE TABLE IF NOT EXISTS vendor_purchase_order_expenses (
  id TEXT PRIMARY KEY,
  vendor_purchase_order_id TEXT NOT NULL REFERENCES vendor_purchase_orders(id) ON DELETE CASCADE,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(vendor_purchase_order_id, expense_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_po_expenses_po ON vendor_purchase_order_expenses(vendor_purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_po_expenses_expense ON vendor_purchase_order_expenses(expense_id);
