-- Script Breakdown. Local SQLite only, like the other script tables.
--
-- breakdown_elements: one row per thing to source (a prop, a location, a cast member…), per production and
-- category. Tagging the same words in several scenes adds occurrences to one element. `manual_status` is the
-- sourced state for categories with no database to match against; `linked_entity_*` pins an element to a
-- row it was matched to (a location, a cast member, an equipment item or a music track).
--
-- breakdown_tags: one row per highlight in the script. Ranges use per-page character offsets into
-- script_pages.content, the same model as script_section_ranges (start on one page, end on the same or a
-- later page of the same scene). `tagged_text` is kept to carry the tag to later drafts.

CREATE TABLE IF NOT EXISTS breakdown_elements (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'cast','props','extras','costume','locations','lighting','foley_music','special_fx','stunts','animals_children','vehicles'
  )),
  name TEXT NOT NULL,
  notes TEXT,
  manual_status TEXT NOT NULL DEFAULT 'needed' CHECK (manual_status IN ('needed','sourced')),
  linked_entity_type TEXT CHECK (linked_entity_type IS NULL OR linked_entity_type IN ('location','person','equipment','music_track')),
  linked_entity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_breakdown_elements_production_category ON breakdown_elements(production_id, category);

CREATE TABLE IF NOT EXISTS breakdown_tags (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES breakdown_elements(id) ON DELETE CASCADE,
  script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  start_page_id TEXT NOT NULL REFERENCES script_pages(id) ON DELETE CASCADE,
  start_offset INTEGER NOT NULL,
  end_page_id TEXT NOT NULL REFERENCES script_pages(id) ON DELETE CASCADE,
  end_offset INTEGER NOT NULL,
  tagged_text TEXT NOT NULL,
  -- The tag on an earlier draft this one was carried from.
  carried_from_id TEXT REFERENCES breakdown_tags(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_breakdown_tags_production_id ON breakdown_tags(production_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_tags_version_scene ON breakdown_tags(script_version_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_tags_element_id ON breakdown_tags(element_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_tags_carried_from_id ON breakdown_tags(carried_from_id);

-- Revision review list: breakdown tags carried to a new draft are recorded alongside tramlines and notes.
-- SQLite cannot widen a CHECK in place, so the table is rebuilt (same columns and indexes).
PRAGMA foreign_keys = OFF;

CREATE TABLE script_revision_items_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  from_script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  to_script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('tramline','annotation','breakdown_tag')),
  -- The tramline, note or breakdown tag on the earlier version.
  item_id TEXT NOT NULL,
  -- carried: placed on unchanged lines. moved: placed, but its lines changed (check it).
  -- unmatched: could not be placed (re-line or dismiss). already_lined: the slate was already lined on the new version.
  outcome TEXT NOT NULL CHECK (outcome IN ('carried','moved','unmatched','already_lined')),
  -- The item created on the new version; null when unmatched or already lined.
  new_item_id TEXT,
  -- What changed, one note per line (shown in the review list).
  detail TEXT,
  -- Set when someone has looked at a moved or unmatched item.
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO script_revision_items_new (
  id, production_id, scene_id, from_script_version_id, to_script_version_id, item_type, item_id, outcome,
  new_item_id, detail, reviewed_at, created_at, updated_at, deleted_at
)
SELECT
  id, production_id, scene_id, from_script_version_id, to_script_version_id, item_type, item_id, outcome,
  new_item_id, detail, reviewed_at, created_at, updated_at, deleted_at
FROM script_revision_items;

DROP TABLE script_revision_items;
ALTER TABLE script_revision_items_new RENAME TO script_revision_items;

CREATE INDEX IF NOT EXISTS idx_script_revision_items_production_id ON script_revision_items(production_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_scene_to ON script_revision_items(scene_id, to_script_version_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_item ON script_revision_items(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_from ON script_revision_items(from_script_version_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_to ON script_revision_items(to_script_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_script_revision_items_live
  ON script_revision_items(item_type, item_id, to_script_version_id) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;
