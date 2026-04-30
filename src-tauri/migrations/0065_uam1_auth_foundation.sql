-- UAM1 (SQLite): instance users + sessions for in-app sign-in / initial admin setup.
-- Mirrors postgres/migrations/0003_uam1_auth_foundation.sql with TEXT ids/timestamps.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at TEXT,
  CHECK (role IN ('user', 'admin')),
  CHECK (username = lower(username))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash_unique ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id_active ON sessions(user_id) WHERE revoked_at IS NULL;
