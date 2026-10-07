-- Script sections and sides (SQLite 0075).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE script_versions (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  episode_id UUID,
  title TEXT,
  version_label TEXT,
  revision_colour TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_pages_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  previous_script_version_id UUID,
  CONSTRAINT pk_script_versions PRIMARY KEY (id),
  CONSTRAINT fk_script_versions_1_previous_script_version_id FOREIGN KEY (previous_script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_versions_2_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_versions_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_pages (
  id UUID DEFAULT gen_random_uuid(),
  script_version_id UUID NOT NULL,
  scene_id UUID,
  page_number TEXT,
  page_index INTEGER NOT NULL,
  content TEXT,
  eighths INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_pages PRIMARY KEY (id),
  CONSTRAINT fk_script_pages_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_pages_2_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_sections (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  episode_id UUID,
  label TEXT,
  section_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unplanned',
  notes TEXT,
  is_manual INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  ranges_user_edited INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT pk_script_sections PRIMARY KEY (id),
  CONSTRAINT ck_script_sections_1 CHECK (section_type IN ('dialogue','action','stunt','vfx','pickup','insert','custom')),
  CONSTRAINT ck_script_sections_2 CHECK (status IN ('unplanned','planned','scheduled','shot','omitted')),
  CONSTRAINT ck_script_sections_3 CHECK (ranges_user_edited IN (0, 1)),
  CONSTRAINT fk_script_sections_1_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_sections_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_sections_3_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_sections_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_section_characters (
  id UUID DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL,
  person_id UUID,
  character_name TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_section_characters PRIMARY KEY (id),
  CONSTRAINT fk_script_section_characters_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_section_characters_2_section_id FOREIGN KEY (section_id) REFERENCES script_sections(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_section_ranges (
  id UUID DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL,
  start_page TEXT,
  start_eighth INTEGER,
  end_page TEXT,
  end_eighth INTEGER,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_section_ranges PRIMARY KEY (id),
  CONSTRAINT fk_script_section_ranges_1_section_id FOREIGN KEY (section_id) REFERENCES script_sections(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shot_script_sections (
  id UUID DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL,
  script_section_id UUID NOT NULL,
  coverage_notes TEXT,
  sort_index NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_shot_script_sections PRIMARY KEY (id),
  CONSTRAINT fk_shot_script_sections_1_script_section_id FOREIGN KEY (script_section_id) REFERENCES script_sections(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shot_script_sections_2_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shoot_day_sides_exports (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  unit_id UUID,
  document_id UUID,
  script_version_id UUID,
  export_label TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_shoot_day_sides_exports PRIMARY KEY (id),
  CONSTRAINT fk_shoot_day_sides_exports_1_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_day_sides_exports_2_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_day_sides_exports_3_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_day_sides_exports_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shoot_day_sides_exports_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_script_versions_previous
  ON script_versions(previous_script_version_id);
CREATE INDEX idx_script_versions_episode_id ON script_versions(episode_id);
CREATE INDEX idx_script_versions_production_id ON script_versions(production_id);
CREATE INDEX idx_script_pages_scene_id ON script_pages(scene_id);
CREATE INDEX idx_script_pages_script_version_id ON script_pages(script_version_id);
CREATE INDEX idx_script_sections_episode_id ON script_sections(episode_id);
CREATE INDEX idx_script_sections_scene_id ON script_sections(scene_id);
CREATE INDEX idx_script_sections_script_version_id ON script_sections(script_version_id);
CREATE INDEX idx_script_sections_production_id ON script_sections(production_id);
CREATE INDEX idx_script_section_characters_person_id ON script_section_characters(person_id);
CREATE INDEX idx_script_section_characters_section_id ON script_section_characters(section_id);
CREATE INDEX idx_script_section_ranges_section_id ON script_section_ranges(section_id);
CREATE INDEX idx_shot_script_sections_script_section_id ON shot_script_sections(script_section_id);
CREATE INDEX idx_shot_script_sections_shot_id ON shot_script_sections(shot_id);
CREATE UNIQUE INDEX sqlite_autoindex_shot_script_sections_2 ON shot_script_sections(shot_id, script_section_id);
CREATE INDEX idx_shoot_day_sides_exports_script_version_id ON shoot_day_sides_exports(script_version_id);
CREATE INDEX idx_shoot_day_sides_exports_document_id ON shoot_day_sides_exports(document_id);
CREATE INDEX idx_shoot_day_sides_exports_unit_id ON shoot_day_sides_exports(unit_id);
CREATE INDEX idx_shoot_day_sides_exports_shoot_day_id ON shoot_day_sides_exports(shoot_day_id);
CREATE INDEX idx_shoot_day_sides_exports_production_id ON shoot_day_sides_exports(production_id);
