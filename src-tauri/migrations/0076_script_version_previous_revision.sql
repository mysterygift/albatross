-- SB8: Script revision lineage — link new versions to their predecessor.
ALTER TABLE script_versions ADD COLUMN previous_script_version_id TEXT
  REFERENCES script_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_script_versions_previous
  ON script_versions(previous_script_version_id);
