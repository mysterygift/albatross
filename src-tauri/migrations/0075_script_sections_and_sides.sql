-- SB1: Script Sections & Sides Builder data model.
-- Adds script versions, pages, sections, section ranges, section characters,
-- shot<->section links, and shoot-day sides export records.
-- Production children CASCADE from productions; optional refs use SET NULL (see 0004_fk_cascade_refactor.sql).

CREATE TABLE IF NOT EXISTS script_versions (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  title TEXT,
  version_label TEXT,
  revision_colour TEXT,
  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_pages_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_versions_production_id ON script_versions(production_id);
CREATE INDEX IF NOT EXISTS idx_script_versions_episode_id ON script_versions(episode_id);

CREATE TABLE IF NOT EXISTS script_pages (
  id TEXT PRIMARY KEY,
  script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  page_number TEXT,
  page_index INTEGER NOT NULL,
  content TEXT,
  eighths INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_pages_script_version_id ON script_pages(script_version_id);
CREATE INDEX IF NOT EXISTS idx_script_pages_scene_id ON script_pages(scene_id);

CREATE TABLE IF NOT EXISTS script_sections (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  label TEXT,
  section_type TEXT NOT NULL CHECK (section_type IN ('dialogue','action','stunt','vfx','pickup','insert','custom')),
  status TEXT NOT NULL DEFAULT 'unplanned' CHECK (status IN ('unplanned','planned','scheduled','shot','omitted')),
  notes TEXT,
  is_manual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_sections_production_id ON script_sections(production_id);
CREATE INDEX IF NOT EXISTS idx_script_sections_script_version_id ON script_sections(script_version_id);
CREATE INDEX IF NOT EXISTS idx_script_sections_scene_id ON script_sections(scene_id);
CREATE INDEX IF NOT EXISTS idx_script_sections_episode_id ON script_sections(episode_id);

CREATE TABLE IF NOT EXISTS script_section_ranges (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES script_sections(id) ON DELETE CASCADE,
  start_page TEXT,
  start_eighth INTEGER,
  end_page TEXT,
  end_eighth INTEGER,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_section_ranges_section_id ON script_section_ranges(section_id);

CREATE TABLE IF NOT EXISTS script_section_characters (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES script_sections(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  character_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_section_characters_section_id ON script_section_characters(section_id);
CREATE INDEX IF NOT EXISTS idx_script_section_characters_person_id ON script_section_characters(person_id);

CREATE TABLE IF NOT EXISTS shot_script_sections (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  script_section_id TEXT NOT NULL REFERENCES script_sections(id) ON DELETE CASCADE,
  coverage_notes TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(shot_id, script_section_id)
);

CREATE INDEX IF NOT EXISTS idx_shot_script_sections_shot_id ON shot_script_sections(shot_id);
CREATE INDEX IF NOT EXISTS idx_shot_script_sections_script_section_id ON shot_script_sections(script_section_id);

CREATE TABLE IF NOT EXISTS shoot_day_sides_exports (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  script_version_id TEXT REFERENCES script_versions(id) ON DELETE SET NULL,
  export_label TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_shoot_day_sides_exports_production_id ON shoot_day_sides_exports(production_id);
CREATE INDEX IF NOT EXISTS idx_shoot_day_sides_exports_shoot_day_id ON shoot_day_sides_exports(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_shoot_day_sides_exports_unit_id ON shoot_day_sides_exports(unit_id);
CREATE INDEX IF NOT EXISTS idx_shoot_day_sides_exports_document_id ON shoot_day_sides_exports(document_id);
CREATE INDEX IF NOT EXISTS idx_shoot_day_sides_exports_script_version_id ON shoot_day_sides_exports(script_version_id);
