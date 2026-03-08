-- Link production_tasks to vendor_invoices for invoice reminder tasks.
-- One active task per invoice (enforced by unique partial index).
-- ON DELETE SET NULL: if invoice were hard-deleted, task would be unlinked; we soft-delete both in app logic.

ALTER TABLE production_tasks ADD COLUMN vendor_invoice_id TEXT REFERENCES vendor_invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_tasks_vendor_invoice_id
  ON production_tasks(vendor_invoice_id) WHERE vendor_invoice_id IS NOT NULL;
