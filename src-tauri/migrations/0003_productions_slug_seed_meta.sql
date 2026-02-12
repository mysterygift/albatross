-- productions.slug: stable identifier for productions (required for new rows, used by demo seed)
-- Backfill: existing rows get slug = 'prod-' || id so they remain unique; new productions get slug from name in app.
ALTER TABLE productions ADD COLUMN slug TEXT;

UPDATE productions SET slug = 'prod-' || id WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS productions_slug_unique ON productions(slug) WHERE deleted_at IS NULL;

-- seed_meta: store last_seeded_at, seed_version for DevTools
CREATE TABLE IF NOT EXISTS seed_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
