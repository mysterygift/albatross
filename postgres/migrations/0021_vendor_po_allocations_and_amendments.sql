-- PO matching: per-PO allocated amount on expense links (NULL = whole expense when it has a single PO)
-- and an audit trail of PO value amendments (vendor_purchase_orders.amount stays the CURRENT value).

ALTER TABLE vendor_purchase_order_expenses ADD COLUMN allocated_amount NUMERIC;

CREATE TABLE vendor_purchase_order_amendments (
  id UUID DEFAULT gen_random_uuid(),
  vendor_purchase_order_id UUID NOT NULL,
  previous_amount NUMERIC,
  new_amount NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_vendor_purchase_order_amendments PRIMARY KEY (id),
  CONSTRAINT fk_vendor_purchase_order_amendments_1_vendor_purchase_order_id FOREIGN KEY (vendor_purchase_order_id) REFERENCES vendor_purchase_orders(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_vendor_po_amendments_po ON vendor_purchase_order_amendments(vendor_purchase_order_id);
