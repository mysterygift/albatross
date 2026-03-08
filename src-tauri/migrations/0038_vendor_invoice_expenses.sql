-- Link table: invoice ↔ expenses (one invoice, many expenses).
CREATE TABLE IF NOT EXISTS vendor_invoice_expenses (
  id TEXT PRIMARY KEY,
  vendor_invoice_id TEXT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(vendor_invoice_id, expense_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoice_expenses_invoice ON vendor_invoice_expenses(vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_expenses_expense ON vendor_invoice_expenses(expense_id);
