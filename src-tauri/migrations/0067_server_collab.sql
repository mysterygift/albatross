-- Client-side server collaboration: connections, linked projects, publish jobs, outbox for sync.

CREATE TABLE IF NOT EXISTS server_connections (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  workspace_id TEXT,
  account_username TEXT NOT NULL,
  last_validated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS linked_projects (
  production_id TEXT PRIMARY KEY NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  remote_project_id TEXT NOT NULL,
  remote_project_url TEXT,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_synced_at TEXT,
  link_state TEXT NOT NULL DEFAULT 'linked',
  baseline_etag TEXT,
  CHECK (link_state IN ('unlinked', 'publishing', 'linked', 'offline', 'conflict', 'unlinking'))
);

CREATE INDEX IF NOT EXISTS idx_linked_projects_connection ON linked_projects(connection_id);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  progress_stage TEXT,
  progress_message TEXT,
  total_bytes INTEGER,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS server_outbox_pending (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT,
  expected_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_server_outbox_production ON server_outbox_pending(production_id, created_at);
