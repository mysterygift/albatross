-- Strip state: SCHEDULED (on a day), UNSCHEDULED (in Unscheduled panel), BONEYARD (discarded).
-- Allows moving strips off the board without deleting; only Boneyard strips can be permanently deleted.
-- shoot_day_id / shoot_day_unit_id become nullable for UNSCHEDULED and BONEYARD strips.

-- Add strip_status column (default SCHEDULED for existing rows)
ALTER TABLE stripboard_strips ADD COLUMN strip_status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (strip_status IN ('SCHEDULED', 'UNSCHEDULED', 'BONEYARD'));

-- Recreate table with nullable shoot_day_id and shoot_day_unit_id
CREATE TABLE stripboard_strips_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE CASCADE,
  shoot_day_unit_id TEXT REFERENCES shoot_day_units(id) ON DELETE SET NULL,
  strip_type TEXT NOT NULL,
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  estimated_minutes INTEGER,
  sort_index REAL NOT NULL DEFAULT 0,
  color_tag TEXT,
  strip_status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (strip_status IN ('SCHEDULED', 'UNSCHEDULED', 'BONEYARD')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO stripboard_strips_new (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at, deleted_at)
SELECT id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at, deleted_at FROM stripboard_strips;
DROP TABLE stripboard_strips;
ALTER TABLE stripboard_strips_new RENAME TO stripboard_strips;
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_production_id ON stripboard_strips(production_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_shoot_day_id ON stripboard_strips(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_scene_id ON stripboard_strips(scene_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_strip_status ON stripboard_strips(strip_status);
