-- UAM2: project/production-level access control memberships.

CREATE TABLE IF NOT EXISTS project_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT ck_project_memberships_access_level
    CHECK (access_level IN ('viewer', 'editor', 'administrator'))
);

-- One active membership per user/project at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_memberships_unique_active
  ON project_memberships(production_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_memberships_user_lookup
  ON project_memberships(user_id, production_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_memberships_project_lookup
  ON project_memberships(production_id, user_id)
  WHERE revoked_at IS NULL;
