-- SS1: Script Supervisor data model — slates (camera setups) and takes.
-- Local SQLite only (like SB1 script sections); not published to remote server.
-- Reuses existing shoot_days (stripboard), units, scenes and shots (shot list) rather than duplicating them.
-- Production children CASCADE from productions; optional refs use SET NULL (see 0004_fk_cascade_refactor.sql).

CREATE TABLE IF NOT EXISTS slates (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  -- Planned shot from the shot list this setup realises, when known.
  shot_id TEXT REFERENCES shots(id) ON DELETE SET NULL,
  -- UK slating: '' = main unit, 'X' = second unit, 'Y' = unsupervised / pick-up unit.
  slate_prefix TEXT NOT NULL DEFAULT '',
  slate_number INTEGER NOT NULL,
  shot_type TEXT CHECK (shot_type IS NULL OR shot_type IN ('master','single','multiple','insert','other')),
  -- Short shot description as written beside the tramline, e.g. 'MS', '2S', 'CU'.
  shot_code TEXT,
  description TEXT,
  camera TEXT,
  lens TEXT,
  stop TEXT,
  filter TEXT,
  sound_mode TEXT NOT NULL DEFAULT 'sync' CHECK (sound_mode IN ('sync','mute','wild_track')),
  int_ext TEXT,
  day_night TEXT,
  camera_roll TEXT,
  sound_roll TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_slates_production_id ON slates(production_id);
CREATE INDEX IF NOT EXISTS idx_slates_shoot_day_id ON slates(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_slates_unit_id ON slates(unit_id);
CREATE INDEX IF NOT EXISTS idx_slates_scene_id ON slates(scene_id);
CREATE INDEX IF NOT EXISTS idx_slates_shot_id ON slates(shot_id);
-- One live slate per number per unit series within a production; soft-deleted numbers may be reused.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slates_live_number
  ON slates(production_id, slate_prefix, slate_number) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS takes (
  id TEXT PRIMARY KEY,
  slate_id TEXT NOT NULL REFERENCES slates(id) ON DELETE CASCADE,
  take_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','print','hold','ng','incomplete')),
  ng_reason TEXT CHECK (ng_reason IS NULL OR ng_reason IN ('performance','camera','sound','focus','continuity','other')),
  duration_ms INTEGER,
  end_board INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_takes_slate_id ON takes(slate_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_takes_live_number
  ON takes(slate_id, take_number) WHERE deleted_at IS NULL;
