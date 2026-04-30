-- UAM2 (SQLite): project-level access memberships.
-- Mirrors postgres/migrations/0004_project_memberships.sql with TEXT ids/timestamps.

CREATE TABLE IF NOT EXISTS project_memberships (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  CHECK (access_level IN ('viewer', 'editor', 'administrator'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_memberships_unique_active
  ON project_memberships(production_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_memberships_user_lookup
  ON project_memberships(user_id, production_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_memberships_project_lookup
  ON project_memberships(production_id, user_id)
  WHERE revoked_at IS NULL;
