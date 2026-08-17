-- Durable client-side state for the sync-v2 replication protocol.
--
-- These tables intentionally coexist with linked_projects, outbox, and
-- server_outbox_pending while the beta collaboration paths are retired.

CREATE TABLE IF NOT EXISTS sync_client_identity (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_project_state (
  production_id TEXT PRIMARY KEY NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES server_connections(id) ON DELETE SET NULL,
  server_project_id TEXT,
  mode TEXT NOT NULL DEFAULT 'local_only',
  epoch TEXT,
  applied_cursor INTEGER NOT NULL DEFAULT 0,
  head_cursor INTEGER NOT NULL DEFAULT 0,
  protocol_version TEXT,
  schema_version INTEGER,
  registry_hash TEXT,
  credential_ref TEXT,
  rebootstrap_reason TEXT,
  last_sync_started_at TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (mode IN (
    'local_only',
    'enabling',
    'collaborative',
    'offline',
    'paused',
    'conflicts',
    'disabling',
    'needs_rebootstrap'
  )),
  CHECK (applied_cursor >= 0),
  CHECK (head_cursor >= 0),
  CHECK (head_cursor >= applied_cursor)
);

CREATE INDEX IF NOT EXISTS idx_sync_project_state_connection
  ON sync_project_state(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_project_state_mode
  ON sync_project_state(mode);

-- A one-row transactional assertion used by pull application. A stale cursor,
-- epoch change, or concurrently removed project state writes -1 and trips the
-- CHECK before any domain rows are changed.
CREATE TABLE IF NOT EXISTS sync_apply_guard (
  production_id TEXT PRIMARY KEY NOT NULL REFERENCES sync_project_state(production_id) ON DELETE CASCADE,
  guarded_cursor INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (guarded_cursor >= 0)
);

CREATE TABLE IF NOT EXISTS sync_mutation_batches (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES sync_client_identity(id) ON DELETE RESTRICT,
  local_sequence INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  base_epoch TEXT NOT NULL,
  base_cursor INTEGER NOT NULL,
  protocol_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  registry_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  request_hash TEXT,
  accepted_cursor INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (local_sequence >= 0),
  CHECK (length(base_epoch) > 0),
  CHECK (base_cursor >= 0),
  CHECK (length(protocol_version) > 0),
  CHECK (schema_version > 0),
  CHECK (length(registry_hash) > 0),
  CHECK (state IN ('pending', 'in_flight', 'blocked', 'accepted', 'failed')),
  CHECK (attempt_count >= 0),
  CHECK (accepted_cursor IS NULL OR accepted_cursor >= 0),
  UNIQUE (production_id, local_sequence)
);

CREATE INDEX IF NOT EXISTS idx_sync_mutation_batches_ready
  ON sync_mutation_batches(production_id, state, next_attempt_at, local_sequence);
CREATE INDEX IF NOT EXISTS idx_sync_mutation_batches_client
  ON sync_mutation_batches(client_id, created_at);

CREATE TABLE IF NOT EXISTS sync_mutations (
  batch_id TEXT NOT NULL REFERENCES sync_mutation_batches(id) ON DELETE CASCADE,
  operation_index INTEGER NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  base_server_version INTEGER,
  base_values_json TEXT,
  patch_json TEXT,
  full_row_json TEXT,
  local_result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (batch_id, operation_index),
  CHECK (operation_index >= 0),
  CHECK (operation IN ('create', 'patch', 'delete')),
  CHECK (base_server_version IS NULL OR base_server_version > 0),
  CHECK (base_values_json IS NULL OR json_valid(base_values_json)),
  CHECK (patch_json IS NULL OR json_valid(patch_json)),
  CHECK (full_row_json IS NULL OR json_valid(full_row_json)),
  CHECK (local_result_json IS NULL OR json_valid(local_result_json)),
  CHECK (
    (operation = 'create' AND base_server_version IS NULL AND base_values_json IS NULL AND patch_json IS NULL AND full_row_json IS NOT NULL)
    OR
    (operation = 'patch' AND base_server_version > 0 AND base_values_json IS NOT NULL AND patch_json IS NOT NULL AND full_row_json IS NULL)
    OR
    (operation = 'delete' AND base_server_version > 0 AND base_values_json IS NOT NULL AND patch_json IS NULL AND full_row_json IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sync_mutations_entity
  ON sync_mutations(entity_table, entity_id);

CREATE TABLE IF NOT EXISTS sync_row_state (
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  applied_cursor INTEGER NOT NULL,
  is_tombstone INTEGER NOT NULL DEFAULT 0,
  row_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (production_id, entity_table, entity_id),
  CHECK (server_version > 0),
  CHECK (applied_cursor >= 0),
  CHECK (is_tombstone IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_sync_row_state_cursor
  ON sync_row_state(production_id, applied_cursor);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  operation_index INTEGER NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  base_snapshot_json TEXT,
  local_snapshot_json TEXT,
  server_snapshot_json TEXT,
  changed_fields_json TEXT,
  server_version INTEGER,
  server_cursor INTEGER,
  state TEXT NOT NULL DEFAULT 'unresolved',
  resolution_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (batch_id, operation_index)
    REFERENCES sync_mutations(batch_id, operation_index) ON DELETE CASCADE,
  CHECK (conflict_type IN ('same_field', 'update_delete', 'delete_update', 'dependent_row')),
  CHECK (state IN ('unresolved', 'resolved', 'discarded')),
  CHECK (server_version IS NULL OR server_version >= 0),
  CHECK (server_cursor IS NULL OR server_cursor >= 0),
  CHECK (base_snapshot_json IS NULL OR json_valid(base_snapshot_json)),
  CHECK (local_snapshot_json IS NULL OR json_valid(local_snapshot_json)),
  CHECK (server_snapshot_json IS NULL OR json_valid(server_snapshot_json)),
  CHECK (changed_fields_json IS NULL OR json_valid(changed_fields_json)),
  CHECK (resolution_json IS NULL OR json_valid(resolution_json))
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_production_state
  ON sync_conflicts(production_id, state, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity
  ON sync_conflicts(production_id, entity_table, entity_id, state);
