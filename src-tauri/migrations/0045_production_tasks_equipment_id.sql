-- Link production_tasks to equipment for return reminder tasks.
-- One active task per equipment item (enforced by unique partial index).
-- ON DELETE SET NULL: if equipment were hard-deleted, task would be unlinked; we soft-delete both in app logic.

ALTER TABLE production_tasks ADD COLUMN equipment_id TEXT REFERENCES equipment(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_tasks_equipment_id
  ON production_tasks(equipment_id) WHERE equipment_id IS NOT NULL;
