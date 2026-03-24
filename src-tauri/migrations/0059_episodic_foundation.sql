-- Episodic production foundation: irreversible production flag, episodes, shooting blocs.
-- Turning on episodic mode is irreversible in the app; this migration does NOT set is_episodic = 1 anywhere.
-- is_episodic defaults 0 for all existing rows (non-episodic); no synthetic episodes.

ALTER TABLE productions ADD COLUMN is_episodic INTEGER NOT NULL DEFAULT 0 CHECK (is_episodic IN (0, 1));

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_episodes_production_sort ON episodes(production_id, sort_order);

CREATE TABLE IF NOT EXISTS shooting_blocs (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_shooting_blocs_production ON shooting_blocs(production_id);
