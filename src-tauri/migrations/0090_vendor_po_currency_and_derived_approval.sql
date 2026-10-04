-- PO currency: nullable currency_code (NULL = production currency) and the exchange rate LOCKED on the PO
-- (1 unit of PO currency = exchange_rate production currency). NULL rate = same as production currency.
ALTER TABLE vendor_purchase_orders ADD COLUMN currency_code TEXT;
ALTER TABLE vendor_purchase_orders ADD COLUMN exchange_rate REAL;

-- `approval` is now derived from status (approved / closed => 1) and never user-set. POs that were
-- ticked "approved" but never moved on from draft / issued become status = approved.
UPDATE vendor_purchase_orders SET status = 'approved' WHERE approval = 1 AND status IN ('draft', 'issued');
UPDATE vendor_purchase_orders SET approval = CASE WHEN status IN ('approved', 'closed') THEN 1 ELSE 0 END;
