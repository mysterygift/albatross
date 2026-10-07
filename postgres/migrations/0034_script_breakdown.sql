-- Script breakdown elements and tags (SQLite 0104).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE breakdown_elements (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  manual_status TEXT NOT NULL DEFAULT 'needed',
  linked_entity_type TEXT,
  linked_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_breakdown_elements PRIMARY KEY (id),
  CONSTRAINT ck_breakdown_elements_1 CHECK (category IN (
    'cast','props','extras','costume','locations','lighting','foley_music','special_fx','stunts','animals_children','vehicles'
  )),
  CONSTRAINT ck_breakdown_elements_2 CHECK (manual_status IN ('needed','sourced')),
  CONSTRAINT ck_breakdown_elements_3 CHECK (linked_entity_type IS NULL OR linked_entity_type IN ('location','person','equipment','music_track')),
  CONSTRAINT fk_breakdown_elements_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE breakdown_tags (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  element_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  start_page_id UUID NOT NULL,
  start_offset INTEGER NOT NULL,
  end_page_id UUID NOT NULL,
  end_offset INTEGER NOT NULL,
  tagged_text TEXT NOT NULL,
  carried_from_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_breakdown_tags PRIMARY KEY (id),
  CONSTRAINT fk_breakdown_tags_1_carried_from_id FOREIGN KEY (carried_from_id) REFERENCES breakdown_tags(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_breakdown_tags_2_end_page_id FOREIGN KEY (end_page_id) REFERENCES script_pages(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_3_start_page_id FOREIGN KEY (start_page_id) REFERENCES script_pages(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_4_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_5_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_6_element_id FOREIGN KEY (element_id) REFERENCES breakdown_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_7_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_breakdown_elements_production_category ON breakdown_elements(production_id, category);
CREATE INDEX idx_breakdown_tags_carried_from_id ON breakdown_tags(carried_from_id);
CREATE INDEX idx_breakdown_tags_element_id ON breakdown_tags(element_id);
CREATE INDEX idx_breakdown_tags_version_scene ON breakdown_tags(script_version_id, scene_id);
CREATE INDEX idx_breakdown_tags_production_id ON breakdown_tags(production_id);
