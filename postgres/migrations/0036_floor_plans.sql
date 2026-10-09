-- Floor plans and their camera / actor setups (SQLite 0108).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB), same as baseline.sql.

CREATE TABLE floor_plans (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  location_id UUID NOT NULL,
  name TEXT NOT NULL,
  layout_json JSONB NOT NULL DEFAULT '{"shapes":[]}',
  background_image TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_floor_plans PRIMARY KEY (id),
  CONSTRAINT fk_floor_plans_1_location_id FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floor_plans_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE floor_plan_setups (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  floor_plan_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  shot_id UUID,
  markers_json JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_floor_plan_setups PRIMARY KEY (id),
  CONSTRAINT fk_floor_plan_setups_1_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floor_plan_setups_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floor_plan_setups_3_floor_plan_id FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floor_plan_setups_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_floor_plans_production_id ON floor_plans (production_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_location_id ON floor_plans (location_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_production_id ON floor_plan_setups (production_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_floor_plan_id ON floor_plan_setups (floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_scene_id ON floor_plan_setups (scene_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_setups_shot_id ON floor_plan_setups (shot_id);
