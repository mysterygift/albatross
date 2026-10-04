-- SS6: script elements (stable lining anchors) and tramlines. Local SQLite only.
--
-- script_elements: one row per block of a script version (scene heading, action paragraph, dialogue speech,
-- transition), derived from script_pages text in page order. Ids are stable for the life of the version;
-- a new script version gets new elements (tramlines are carried across in SS10).
--
-- tramlines: one coverage line per slate (per camera) over a contiguous run of elements, start to end.
-- tramline_segments: per-element overrides; an element inside the run with no segment row is on camera.

CREATE TABLE IF NOT EXISTS script_elements (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  scene_id TEXT REFERENCES scenes(id) ON DELETE CASCADE,
  script_page_id TEXT REFERENCES script_pages(id) ON DELETE SET NULL,
  -- Order within the script version.
  sort_index INTEGER NOT NULL,
  element_type TEXT NOT NULL CHECK (element_type IN ('scene_heading','action','dialogue','transition')),
  character_name TEXT,
  text TEXT NOT NULL,
  page_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_elements_production_id ON script_elements(production_id);
CREATE INDEX IF NOT EXISTS idx_script_elements_version_sort ON script_elements(script_version_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_script_elements_scene_id ON script_elements(scene_id);
CREATE INDEX IF NOT EXISTS idx_script_elements_script_page_id ON script_elements(script_page_id);

CREATE TABLE IF NOT EXISTS tramlines (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  slate_id TEXT NOT NULL REFERENCES slates(id) ON DELETE CASCADE,
  script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  -- Camera letter for multi-camera setups ('A', 'B'…); '' when single camera.
  camera TEXT NOT NULL DEFAULT '',
  start_element_id TEXT NOT NULL REFERENCES script_elements(id) ON DELETE CASCADE,
  end_element_id TEXT NOT NULL REFERENCES script_elements(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tramlines_production_id ON tramlines(production_id);
CREATE INDEX IF NOT EXISTS idx_tramlines_slate_id ON tramlines(slate_id);
CREATE INDEX IF NOT EXISTS idx_tramlines_script_version_id ON tramlines(script_version_id);
CREATE INDEX IF NOT EXISTS idx_tramlines_start_element_id ON tramlines(start_element_id);
CREATE INDEX IF NOT EXISTS idx_tramlines_end_element_id ON tramlines(end_element_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tramlines_live_slate_camera
  ON tramlines(slate_id, script_version_id, camera) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tramline_segments (
  id TEXT PRIMARY KEY,
  tramline_id TEXT NOT NULL REFERENCES tramlines(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES script_elements(id) ON DELETE CASCADE,
  -- 'off' = off camera (wavy line); 'not_covered' = a gap in the line.
  state TEXT NOT NULL CHECK (state IN ('off','not_covered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tramline_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_tramline_segments_element_id ON tramline_segments(element_id);
