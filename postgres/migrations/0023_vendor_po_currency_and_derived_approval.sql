-- PO currency: nullable currency_code (NULL = production currency) and the exchange rate LOCKED on the PO
-- (1 unit of PO currency = exchange_rate production currency). NULL rate = same as production currency.
ALTER TABLE vendor_purchase_orders ADD COLUMN currency_code TEXT;
ALTER TABLE vendor_purchase_orders ADD COLUMN exchange_rate NUMERIC;

-- `approval` is now derived from status (approved / closed => TRUE) and never user-set. POs that were
-- ticked "approved" but never moved on from draft / issued become status = approved.
UPDATE vendor_purchase_orders SET status = 'approved' WHERE approval = TRUE AND status IN ('draft', 'issued');
UPDATE vendor_purchase_orders SET approval = (status IN ('approved', 'closed'));
