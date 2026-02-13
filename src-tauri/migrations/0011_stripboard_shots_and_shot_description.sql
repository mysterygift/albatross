-- Stripboard shot-based refactor: shots get shot_description; strips get shot_id and SHOT type.
-- Scheduled "scene" strips become "shot" strips (one strip = one shot). Scene identity derived via shot->scene.

-- 1) Shots: add Shot Description (under-title line on stripboard; distinct from subject/notes).
ALTER TABLE shots ADD COLUMN shot_description TEXT;

-- 2) Stripboard strips: add shot_id (nullable; for SHOT strips required in app logic).
ALTER TABLE stripboard_strips ADD COLUMN shot_id TEXT REFERENCES shots(id) ON DELETE SET NULL;

-- 3) Backfill: set shot_id from first shot (by shot_number) per scene for existing SCENE strips.
UPDATE stripboard_strips
SET shot_id = (
  SELECT s.id FROM shots s
  WHERE s.scene_id = stripboard_strips.scene_id AND s.deleted_at IS NULL
  ORDER BY s.shot_number LIMIT 1
)
WHERE strip_type = 'SCENE' AND scene_id IS NOT NULL;

-- 4) Recreate table with strip_type CHECK including 'SHOT'; migrate SCENE -> SHOT in data.
CREATE TABLE stripboard_strips_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE CASCADE,
  shoot_day_unit_id TEXT REFERENCES shoot_day_units(id) ON DELETE SET NULL,
  strip_type TEXT NOT NULL CHECK (strip_type IN ('SHOT','SCENE','MOVE','CALL','LUNCH','WRAP','NOTE')),
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  shot_id TEXT REFERENCES shots(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  estimated_minutes INTEGER,
  sort_index REAL NOT NULL DEFAULT 0,
  color_tag TEXT,
  strip_status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (strip_status IN ('SCHEDULED','UNSCHEDULED','BONEYARD')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO stripboard_strips_new (
  id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id,
  title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at, deleted_at
)
SELECT
  id, production_id, shoot_day_id, shoot_day_unit_id,
  CASE WHEN strip_type = 'SCENE' THEN 'SHOT' ELSE strip_type END,
  scene_id, shot_id,
  title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at, deleted_at
FROM stripboard_strips;
DROP TABLE stripboard_strips;
ALTER TABLE stripboard_strips_new RENAME TO stripboard_strips;
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_production_id ON stripboard_strips(production_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_shoot_day_id ON stripboard_strips(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_scene_id ON stripboard_strips(scene_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_strip_status ON stripboard_strips(strip_status);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_shot_id ON stripboard_strips(shot_id);
