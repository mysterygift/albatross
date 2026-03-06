-- Stage 6: Vendors + typed expense transaction groundwork.
-- Additive migration; keeps legacy expenses.vendor text field for backward compatibility.

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  primary_contact_full_name TEXT,
  primary_contact_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendors_production_id ON vendors(production_id);
CREATE INDEX IF NOT EXISTS idx_vendors_company_name ON vendors(production_id, company_name);

-- Extend expenses in a backward-compatible way.
ALTER TABLE expenses ADD COLUMN transaction_type TEXT;
ALTER TABLE expenses ADD COLUMN vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_id ON expenses(vendor_id);

CREATE TABLE IF NOT EXISTS expense_transaction_details (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expense_transaction_details_expense_id ON expense_transaction_details(expense_id);
