-- SS4: what the script supervisor marks about a scene's shooting progress. Local SQLite only.
-- Everything else (slates, takes, prints, last shot day, part-shot) is derived from slates/takes.
-- No row = derived status only (not shot / part shot).

CREATE TABLE IF NOT EXISTS script_supervisor_scene_progress (
  scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  -- 'complete' = scene finished (credited in full on completed_shoot_day_id); 'omitted' = dropped from the shoot.
  marked_status TEXT CHECK (marked_status IS NULL OR marked_status IN ('complete','omitted')),
  completed_shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE SET NULL,
  -- Script supervisor's estimate of pages shot so far for a part-shot scene, in eighths.
  credited_eighths INTEGER CHECK (credited_eighths IS NULL OR credited_eighths >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_script_supervisor_scene_progress_production_id
  ON script_supervisor_scene_progress(production_id);
CREATE INDEX IF NOT EXISTS idx_script_supervisor_scene_progress_completed_day
  ON script_supervisor_scene_progress(completed_shoot_day_id);
