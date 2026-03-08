-- Shot-level cast participation (refinement layer; scene_cast remains scene-level source of truth).
-- DooD continues to derive work days from scene_cast; shot_cast is for future scheduling intelligence.
CREATE TABLE IF NOT EXISTS shot_cast (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(shot_id, person_id)
);
