-- Link invoice to optional purchase order (one-to-one).
ALTER TABLE vendor_invoices ADD COLUMN po_id TEXT NULL REFERENCES vendor_purchase_orders(id);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_po_id ON vendor_invoices(po_id);
