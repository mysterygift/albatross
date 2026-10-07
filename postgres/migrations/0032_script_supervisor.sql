-- Script supervisor: slates, takes, settings, scene progress, day logs, lining, annotations, continuity media, revisions (SQLite 0093-0099).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE production_script_supervisor_settings (
  production_id UUID,
  slating_system TEXT NOT NULL DEFAULT 'uk',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_script_supervisor_settings PRIMARY KEY (production_id),
  CONSTRAINT ck_production_script_supervisor_settings_1 CHECK (slating_system IN ('uk','us')),
  CONSTRAINT fk_production_script_supervisor_settings_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_elements (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  scene_id UUID,
  script_page_id UUID,
  sort_index NUMERIC NOT NULL,
  element_type TEXT NOT NULL,
  character_name TEXT,
  text TEXT NOT NULL,
  page_number TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_elements PRIMARY KEY (id),
  CONSTRAINT ck_script_elements_1 CHECK (element_type IN ('scene_heading','action','dialogue','transition')),
  CONSTRAINT fk_script_elements_1_script_page_id FOREIGN KEY (script_page_id) REFERENCES script_pages(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_elements_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_elements_3_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_elements_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_revision_items (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  from_script_version_id UUID NOT NULL,
  to_script_version_id UUID NOT NULL,
  item_type TEXT NOT NULL,
  item_id UUID NOT NULL,
  outcome TEXT NOT NULL,
  new_item_id UUID,
  detail TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_revision_items PRIMARY KEY (id),
  CONSTRAINT ck_script_revision_items_1 CHECK (item_type IN ('tramline','annotation','breakdown_tag')),
  CONSTRAINT ck_script_revision_items_2 CHECK (outcome IN ('carried','moved','unmatched','already_lined')),
  CONSTRAINT fk_script_revision_items_1_to_script_version_id FOREIGN KEY (to_script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_revision_items_2_from_script_version_id FOREIGN KEY (from_script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_revision_items_3_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_revision_items_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_supervisor_day_logs (
  shoot_day_id UUID,
  production_id UUID NOT NULL,
  call_time TEXT,
  first_shot_time TEXT,
  lunch_start_time TEXT,
  lunch_end_time TEXT,
  first_shot_after_lunch_time TEXT,
  camera_wrap_time TEXT,
  wrap_time TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_script_supervisor_day_logs PRIMARY KEY (shoot_day_id),
  CONSTRAINT fk_script_supervisor_day_logs_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_supervisor_day_logs_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_supervisor_scene_progress (
  scene_id UUID,
  production_id UUID NOT NULL,
  marked_status TEXT,
  completed_shoot_day_id UUID,
  credited_eighths INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  timed_seconds INTEGER,
  CONSTRAINT pk_script_supervisor_scene_progress PRIMARY KEY (scene_id),
  CONSTRAINT ck_script_supervisor_scene_progress_1 CHECK (marked_status IS NULL OR marked_status IN ('complete','omitted')),
  CONSTRAINT ck_script_supervisor_scene_progress_2 CHECK (credited_eighths IS NULL OR credited_eighths >= 0),
  CONSTRAINT ck_script_supervisor_scene_progress_3 CHECK (timed_seconds IS NULL OR timed_seconds >= 0),
  CONSTRAINT fk_script_supervisor_scene_progress_1_completed_shoot_day_id FOREIGN KEY (completed_shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_supervisor_scene_progress_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_supervisor_scene_progress_3_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE slates (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  unit_id UUID,
  scene_id UUID,
  shot_id UUID,
  slate_prefix TEXT NOT NULL DEFAULT '',
  slate_number INTEGER NOT NULL,
  shot_type TEXT,
  shot_code TEXT,
  description TEXT,
  camera TEXT,
  lens TEXT,
  stop TEXT,
  filter TEXT,
  sound_mode TEXT NOT NULL DEFAULT 'sync',
  int_ext TEXT,
  day_night TEXT,
  camera_roll TEXT,
  sound_roll TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  slating_system TEXT NOT NULL DEFAULT 'uk',
  CONSTRAINT pk_slates PRIMARY KEY (id),
  CONSTRAINT ck_slates_1 CHECK (shot_type IS NULL OR shot_type IN ('master','single','multiple','insert','other')),
  CONSTRAINT ck_slates_2 CHECK (sound_mode IN ('sync','mute','wild_track')),
  CONSTRAINT ck_slates_3 CHECK (slating_system IN ('uk','us')),
  CONSTRAINT fk_slates_1_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_slates_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_slates_3_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_slates_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_slates_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_annotations (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  element_id UUID NOT NULL,
  slate_id UUID,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  carried_from_id UUID,
  CONSTRAINT pk_script_annotations PRIMARY KEY (id),
  CONSTRAINT ck_script_annotations_1 CHECK (kind IN ('line_change','ad_lib','cut','note','vfx','sfx','continuity')),
  CONSTRAINT fk_script_annotations_1_carried_from_id FOREIGN KEY (carried_from_id) REFERENCES script_annotations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_annotations_2_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotations_3_element_id FOREIGN KEY (element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotations_4_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotations_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE takes (
  id UUID DEFAULT gen_random_uuid(),
  slate_id UUID NOT NULL,
  take_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ng_reason TEXT,
  duration_ms INTEGER,
  end_board INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_takes PRIMARY KEY (id),
  CONSTRAINT ck_takes_1 CHECK (status IN ('pending','print','hold','ng','incomplete')),
  CONSTRAINT ck_takes_2 CHECK (ng_reason IS NULL OR ng_reason IN ('performance','camera','sound','focus','continuity','other')),
  CONSTRAINT fk_takes_1_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE continuity_media (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  document_id UUID NOT NULL,
  slate_id UUID,
  take_id UUID,
  scene_id UUID,
  tags TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_continuity_media PRIMARY KEY (id),
  CONSTRAINT fk_continuity_media_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_continuity_media_2_take_id FOREIGN KEY (take_id) REFERENCES takes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_continuity_media_3_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_continuity_media_4_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_continuity_media_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_annotation_takes (
  annotation_id UUID NOT NULL,
  take_id UUID NOT NULL,
  CONSTRAINT pk_script_annotation_takes PRIMARY KEY (annotation_id, take_id),
  CONSTRAINT fk_script_annotation_takes_1_take_id FOREIGN KEY (take_id) REFERENCES takes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotation_takes_2_annotation_id FOREIGN KEY (annotation_id) REFERENCES script_annotations(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE tramlines (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  slate_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  camera TEXT NOT NULL DEFAULT '',
  start_element_id UUID NOT NULL,
  end_element_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  carried_from_id UUID,
  CONSTRAINT pk_tramlines PRIMARY KEY (id),
  CONSTRAINT fk_tramlines_1_carried_from_id FOREIGN KEY (carried_from_id) REFERENCES tramlines(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_tramlines_2_end_element_id FOREIGN KEY (end_element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_3_start_element_id FOREIGN KEY (start_element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_4_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_5_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_6_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE tramline_segments (
  id UUID DEFAULT gen_random_uuid(),
  tramline_id UUID NOT NULL,
  element_id UUID NOT NULL,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_tramline_segments PRIMARY KEY (id),
  CONSTRAINT ck_tramline_segments_1 CHECK (state IN ('off','not_covered')),
  CONSTRAINT fk_tramline_segments_1_element_id FOREIGN KEY (element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramline_segments_2_tramline_id FOREIGN KEY (tramline_id) REFERENCES tramlines(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_script_elements_script_page_id ON script_elements(script_page_id);
CREATE INDEX idx_script_elements_scene_id ON script_elements(scene_id);
CREATE INDEX idx_script_elements_version_sort ON script_elements(script_version_id, sort_index);
CREATE INDEX idx_script_elements_production_id ON script_elements(production_id);
CREATE UNIQUE INDEX idx_script_revision_items_live
  ON script_revision_items(item_type, item_id, to_script_version_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_script_revision_items_to ON script_revision_items(to_script_version_id);
CREATE INDEX idx_script_revision_items_from ON script_revision_items(from_script_version_id);
CREATE INDEX idx_script_revision_items_item ON script_revision_items(item_type, item_id);
CREATE INDEX idx_script_revision_items_scene_to ON script_revision_items(scene_id, to_script_version_id);
CREATE INDEX idx_script_revision_items_production_id ON script_revision_items(production_id);
CREATE INDEX idx_script_supervisor_day_logs_production_id
  ON script_supervisor_day_logs(production_id);
CREATE INDEX idx_script_supervisor_scene_progress_completed_day
  ON script_supervisor_scene_progress(completed_shoot_day_id);
CREATE INDEX idx_script_supervisor_scene_progress_production_id
  ON script_supervisor_scene_progress(production_id);
CREATE UNIQUE INDEX idx_slates_live_us_setup
  ON slates(scene_id, slate_number) WHERE deleted_at IS NULL AND slating_system = 'us';
CREATE UNIQUE INDEX idx_slates_live_number
  ON slates(production_id, slate_prefix, slate_number) WHERE deleted_at IS NULL AND slating_system = 'uk';
CREATE INDEX idx_slates_shot_id ON slates(shot_id);
CREATE INDEX idx_slates_scene_id ON slates(scene_id);
CREATE INDEX idx_slates_unit_id ON slates(unit_id);
CREATE INDEX idx_slates_shoot_day_id ON slates(shoot_day_id);
CREATE INDEX idx_slates_production_id ON slates(production_id);
CREATE INDEX idx_script_annotations_carried_from_id ON script_annotations(carried_from_id);
CREATE INDEX idx_script_annotations_script_version_id ON script_annotations(script_version_id);
CREATE INDEX idx_script_annotations_slate_id ON script_annotations(slate_id);
CREATE INDEX idx_script_annotations_element_id ON script_annotations(element_id);
CREATE INDEX idx_script_annotations_production_id ON script_annotations(production_id);
CREATE UNIQUE INDEX idx_takes_live_number
  ON takes(slate_id, take_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_takes_slate_id ON takes(slate_id);
CREATE INDEX idx_continuity_media_scene_id ON continuity_media(scene_id);
CREATE INDEX idx_continuity_media_take_id ON continuity_media(take_id);
CREATE INDEX idx_continuity_media_slate_id ON continuity_media(slate_id);
CREATE INDEX idx_continuity_media_document_id ON continuity_media(document_id);
CREATE INDEX idx_continuity_media_production_id ON continuity_media(production_id);
CREATE INDEX idx_script_annotation_takes_take_id ON script_annotation_takes(take_id);
CREATE INDEX idx_tramlines_carried_from_id ON tramlines(carried_from_id);
CREATE UNIQUE INDEX idx_tramlines_live_slate_camera
  ON tramlines(slate_id, script_version_id, camera) WHERE deleted_at IS NULL;
CREATE INDEX idx_tramlines_end_element_id ON tramlines(end_element_id);
CREATE INDEX idx_tramlines_start_element_id ON tramlines(start_element_id);
CREATE INDEX idx_tramlines_script_version_id ON tramlines(script_version_id);
CREATE INDEX idx_tramlines_slate_id ON tramlines(slate_id);
CREATE INDEX idx_tramlines_production_id ON tramlines(production_id);
CREATE INDEX idx_tramline_segments_element_id ON tramline_segments(element_id);
CREATE UNIQUE INDEX sqlite_autoindex_tramline_segments_2 ON tramline_segments(tramline_id, element_id);
