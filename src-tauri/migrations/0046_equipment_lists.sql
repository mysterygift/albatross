-- Equipment lists and list items: production-scoped lists that reference registry equipment.
-- Checklist state (checked_out, checked_back_in) lives on list items only.

CREATE TABLE IF NOT EXISTS equipment_lists (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  department TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_equipment_lists_production_id ON equipment_lists(production_id);
CREATE INDEX IF NOT EXISTS idx_equipment_lists_shoot_day_id ON equipment_lists(shoot_day_id) WHERE shoot_day_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS equipment_list_items (
  id TEXT PRIMARY KEY,
  equipment_list_id TEXT NOT NULL REFERENCES equipment_lists(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  checked_out INTEGER NOT NULL DEFAULT 0,
  checked_back_in INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_list_items_list_id ON equipment_list_items(equipment_list_id);
CREATE INDEX IF NOT EXISTS idx_equipment_list_items_equipment_id ON equipment_list_items(equipment_id);
