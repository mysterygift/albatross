-- Shot list: richer shot properties + equipment_terms for lens/support suggestions.

-- ========== equipment_terms (lookup for LENS, SUPPORT, etc.) ==========
CREATE TABLE IF NOT EXISTS equipment_terms (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(production_id, type, value)
);
CREATE INDEX IF NOT EXISTS idx_equipment_terms_production_type ON equipment_terms(production_id, type);

-- ========== shots: add new columns ==========
ALTER TABLE shots ADD COLUMN subject TEXT;
ALTER TABLE shots ADD COLUMN action_description TEXT;
ALTER TABLE shots ADD COLUMN shot_size TEXT;
ALTER TABLE shots ADD COLUMN support TEXT;
ALTER TABLE shots ADD COLUMN lens TEXT;
ALTER TABLE shots ADD COLUMN duration_seconds INTEGER;
ALTER TABLE shots ADD COLUMN camera_movement TEXT;
ALTER TABLE shots ADD COLUMN notes TEXT;
