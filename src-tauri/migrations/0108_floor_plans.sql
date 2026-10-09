-- Floor plans (experimental). Local SQLite only, like the overtime tables.
--
-- A floor plan is a drawing of a space at one location: rectangles, point-to-point shapes, text
-- labels and equipment in layout_json, with its scale, north and background placement (see
-- src/lib/floor-plans/model.ts). background_image is the background picture or map as a data URL,
-- kept apart so saving the drawing never resends it. A setup marks camera, cast and equipment
-- positions on a plan for one scene, or one shot of it (shot_id NULL = blocking for the whole scene).

CREATE TABLE IF NOT EXISTS floor_plans (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL DEFAULT '{"shapes":[]}',
  background_image TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_floor_plans_production_id ON floor_plans(production_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_location_id ON floor_plans(location_id);

CREATE TABLE IF NOT EXISTS floor_plan_setups (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  floor_plan_id TEXT NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  shot_id TEXT REFERENCES shots(id) ON DELETE CASCADE,
  markers_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_production_id ON floor_plan_setups(production_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_floor_plan_id ON floor_plan_setups(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_scene_id ON floor_plan_setups(scene_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_shot_id ON floor_plan_setups(shot_id);
