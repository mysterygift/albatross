-- Equipment registry: per-item tracking, category, status, vendor/invoice linkage,
-- rental windows, replacement value. Replaces ambiguous cost; keeps vendor text for compatibility.

CREATE TABLE equipment_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rented',
  vendor TEXT,
  shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE SET NULL,
  notes TEXT,
  item_uuid TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'planned',
  department TEXT,
  vendor_id TEXT,
  invoice_id TEXT,
  rental_start_date TEXT,
  return_due_date TEXT,
  returned_at TEXT,
  replacement_value REAL,
  serial_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO equipment_new (
  id, production_id, name, source_type, vendor, shoot_day_id, notes,
  item_uuid, category, status, department, vendor_id, invoice_id,
  rental_start_date, return_due_date, returned_at, replacement_value, serial_number,
  created_at, updated_at, deleted_at
)
SELECT
  id, production_id, name, source_type, vendor, shoot_day_id, notes,
  id AS item_uuid,
  'other' AS category,
  'planned' AS status,
  NULL AS department,
  NULL AS vendor_id,
  NULL AS invoice_id,
  NULL AS rental_start_date,
  NULL AS return_due_date,
  NULL AS returned_at,
  cost AS replacement_value,
  NULL AS serial_number,
  created_at, updated_at, deleted_at
FROM equipment;

DROP TABLE equipment;
ALTER TABLE equipment_new RENAME TO equipment;

CREATE INDEX IF NOT EXISTS idx_equipment_production_id ON equipment(production_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_production_item_uuid ON equipment(production_id, item_uuid);
