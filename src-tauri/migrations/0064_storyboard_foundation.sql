-- Storyboard foundation (SB1): shot-linked image records and import metadata.
-- Images are file-path based (storage_key in AppData), not DB blobs.

CREATE TABLE IF NOT EXISTS storyboard_imports (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  source_filename TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('athena_pdf_import')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_storyboard_imports_production_id
  ON storyboard_imports(production_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_imports_scene_id
  ON storyboard_imports(scene_id);

CREATE TABLE IF NOT EXISTS storyboard_images (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'athena_pdf_import')),
  source_import_id TEXT REFERENCES storyboard_imports(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_storyboard_images_production_id
  ON storyboard_images(production_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_images_scene_id
  ON storyboard_images(scene_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_images_shot_id
  ON storyboard_images(shot_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_images_shot_sort
  ON storyboard_images(shot_id, sort_order, created_at);
