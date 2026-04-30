-- UAM1: foundational users + session auth primitives.
-- Scope intentionally excludes project memberships/visibility and admin UI.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMPTZ,
  CONSTRAINT ck_users_role CHECK (role IN ('user', 'admin')),
  CONSTRAINT ck_users_username_normalized CHECK (username = lower(username))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash_unique ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id_active ON sessions(user_id) WHERE revoked_at IS NULL;
