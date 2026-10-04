-- SS2: per-production slating system (UK default, US optional). Local SQLite only.
--
-- UK: consecutive slate numbers per unit series ('' main, 'X' second unit, 'Y' unsupervised).
-- US: scene number + setup letter (23, 23A, 23B… skipping I and O). For US slates, slate_number holds the
--     setup ordinal within the scene: 1 = scene number alone, 2 = A, 3 = B, …
-- Each slate records the system it was created under, so labels never change after the fact.

CREATE TABLE IF NOT EXISTS production_script_supervisor_settings (
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
  slating_system TEXT NOT NULL DEFAULT 'uk' CHECK (slating_system IN ('uk','us')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE slates ADD COLUMN slating_system TEXT NOT NULL DEFAULT 'uk' CHECK (slating_system IN ('uk','us'));

-- UK numbers are unique per production + series; US setups are unique per scene.
DROP INDEX IF EXISTS idx_slates_live_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_slates_live_number
  ON slates(production_id, slate_prefix, slate_number) WHERE deleted_at IS NULL AND slating_system = 'uk';
CREATE UNIQUE INDEX IF NOT EXISTS idx_slates_live_us_setup
  ON slates(scene_id, slate_number) WHERE deleted_at IS NULL AND slating_system = 'us';
