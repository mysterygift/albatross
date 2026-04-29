-- Phase 6 performance indexes (evidence-driven from EXPLAIN ANALYZE on load-test operations).
-- Scene + shot listing path:
--   listScenesByProduction -> WHERE production_id=? AND deleted_at IS NULL ORDER BY scene_number
CREATE INDEX IF NOT EXISTS idx_scenes_production_scene_number_active
  ON scenes(production_id, scene_number)
  WHERE deleted_at IS NULL;

--   listShotsByScene -> WHERE scene_id=? AND deleted_at IS NULL ORDER BY shot_number
CREATE INDEX IF NOT EXISTS idx_shots_scene_shot_number_active
  ON shots(scene_id, shot_number)
  WHERE deleted_at IS NULL;

-- Stripboard board + day/unit ordering path:
--   listStripsByProduction/listStripsForDayUnit -> filters by production/status/day/unit and orders by sort_index
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_board_lookup_active
  ON stripboard_strips(production_id, strip_status, shoot_day_id, shoot_day_unit_id, sort_index)
  WHERE deleted_at IS NULL;
