-- Hide a global vendor from a specific production without deleting it everywhere.

CREATE TABLE IF NOT EXISTS vendor_production_exclusions (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(vendor_id, production_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_production_exclusions_production_id
  ON vendor_production_exclusions(production_id);
