-- SS8: script annotations (line changes, ad-libs, notes for the editor) and continuity photos. Local SQLite only.

CREATE TABLE IF NOT EXISTS script_annotations (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES script_elements(id) ON DELETE CASCADE,
  -- The setup the note belongs to, when it is about specific takes (a line change on slate 217, say).
  slate_id TEXT REFERENCES slates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('line_change','ad_lib','cut','note','vfx','sfx','continuity')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_annotations_production_id ON script_annotations(production_id);
CREATE INDEX IF NOT EXISTS idx_script_annotations_element_id ON script_annotations(element_id);
CREATE INDEX IF NOT EXISTS idx_script_annotations_slate_id ON script_annotations(slate_id);
CREATE INDEX IF NOT EXISTS idx_script_annotations_script_version_id ON script_annotations(script_version_id);

-- Which takes a note applies to (none = the whole slate, or no slate at all).
CREATE TABLE IF NOT EXISTS script_annotation_takes (
  annotation_id TEXT NOT NULL REFERENCES script_annotations(id) ON DELETE CASCADE,
  take_id TEXT NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
  PRIMARY KEY (annotation_id, take_id)
);

CREATE INDEX IF NOT EXISTS idx_script_annotation_takes_take_id ON script_annotation_takes(take_id);

CREATE TABLE IF NOT EXISTS continuity_media (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  -- The stored file lives in documents (entity_type 'continuity_photo').
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  slate_id TEXT REFERENCES slates(id) ON DELETE SET NULL,
  take_id TEXT REFERENCES takes(id) ON DELETE SET NULL,
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  -- Comma-separated from: wardrobe, props, makeup, hair, set, other.
  tags TEXT,
  caption TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_continuity_media_production_id ON continuity_media(production_id);
CREATE INDEX IF NOT EXISTS idx_continuity_media_document_id ON continuity_media(document_id);
CREATE INDEX IF NOT EXISTS idx_continuity_media_slate_id ON continuity_media(slate_id);
CREATE INDEX IF NOT EXISTS idx_continuity_media_take_id ON continuity_media(take_id);
CREATE INDEX IF NOT EXISTS idx_continuity_media_scene_id ON continuity_media(scene_id);
