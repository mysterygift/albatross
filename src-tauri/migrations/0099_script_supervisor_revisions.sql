-- SS10: carry tramlines and script notes onto a new script version, with a review list. Local SQLite only.
--
-- When a scene appears in a newer script version, its tramlines and notes are re-created on the new version's
-- elements (matched by scene and line text). The earlier rows stay on their version as history; carried_from_id
-- links the new row to the one it came from. Every earlier tramline or note gets exactly one script_revision_items
-- row per new version, so nothing is dropped without a record: 'unmatched' and 'moved' rows form the review list.

ALTER TABLE tramlines ADD COLUMN carried_from_id TEXT REFERENCES tramlines(id) ON DELETE SET NULL;
ALTER TABLE script_annotations ADD COLUMN carried_from_id TEXT REFERENCES script_annotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tramlines_carried_from_id ON tramlines(carried_from_id);
CREATE INDEX IF NOT EXISTS idx_script_annotations_carried_from_id ON script_annotations(carried_from_id);

CREATE TABLE IF NOT EXISTS script_revision_items (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  from_script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  to_script_version_id TEXT NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('tramline','annotation')),
  -- The tramline or note on the earlier version.
  item_id TEXT NOT NULL,
  -- carried: placed on unchanged lines. moved: placed, but its lines changed (check it).
  -- unmatched: could not be placed (re-line or dismiss). already_lined: the slate was already lined on the new version.
  outcome TEXT NOT NULL CHECK (outcome IN ('carried','moved','unmatched','already_lined')),
  -- The tramline or note created on the new version; null when unmatched or already lined.
  new_item_id TEXT,
  -- What changed, one note per line (shown in the review list).
  detail TEXT,
  -- Set when the script supervisor has looked at a moved or unmatched item.
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_script_revision_items_production_id ON script_revision_items(production_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_scene_to ON script_revision_items(scene_id, to_script_version_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_item ON script_revision_items(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_from ON script_revision_items(from_script_version_id);
CREATE INDEX IF NOT EXISTS idx_script_revision_items_to ON script_revision_items(to_script_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_script_revision_items_live
  ON script_revision_items(item_type, item_id, to_script_version_id) WHERE deleted_at IS NULL;
